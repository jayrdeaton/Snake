// Renders the shared, unrotated board for every mode (Solo / Vs CPU / 2 Player) — see the plan's
// "Rendering (SnakeBoard.tsx)" section. ONE Canvas, drawn once, containing every alive snake in the
// same coordinate space (never duplicated/rotated per player — that idea was superseded; only small
// HUD/dialog decoration rotates per seat, via @tastic/split-screen elsewhere, never the board
// itself, matching how LightCycles' own face-to-face arena already works).
//
// Each snake's body renders as a smooth, undulating centerline (steps 1-5 below) rather than rigid
// grid blocks, with a scale-like alternating belly stripe (step 6), a crisp head marker unaffected
// by the undulation (step 7), a pulsing food dot (step 8), and a brief whole-board flash on game
// over (step 9) — deliberately NOT LightCycles' trail-glide/sever/death-explosion system, which is
// tuned for a permanent multi-player trail Snake doesn't have (see the plan's own note on this).
import { getBlendedColor, getContrastColor, useAutoPaperTheme } from '@rific/auto-paper'
import { Canvas, Circle, Path, Rect, Skia, type SkPath } from '@shopify/react-native-skia'
import { useEffect, useMemo, useRef } from 'react'
import { StyleSheet } from 'react-native'
import { Easing, type SharedValue, useDerivedValue, useFrameCallback, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'

import { GridCell, GridSize, SnakeEntity, SnakeGameState } from '@/types'
import { cellToPixel } from '@/utils/grid'

export interface SnakeBoardProps {
  snakes: SnakeEntity[]
  food: GridCell
  phase: SnakeGameState['phase']
  cellPx: number
  grid: GridSize
}

function cellCenter(cell: GridCell, cellPx: number) {
  const { x, y } = cellToPixel(cell, cellPx)
  return { x: x + cellPx / 2, y: y + cellPx / 2 }
}

type Point = { x: number; y: number }

// A densified centerline sample — step 1/2's output. `nx`/`ny` is the unit perpendicular to the
// local tangent at this sample (used by the wave offset below), `dist` is this sample's cumulative
// arc length from the tail (index 0), used both for the head-relative amplitude ramp and to place
// the belly stripe's dash boundaries.
interface Sample extends Point {
  nx: number
  ny: number
  dist: number
}

// Roughly how far apart (in px) densified samples land along each body segment — dense enough that
// the sine wave below (see WAVE_WAVELENGTH_CELLS) has plenty of resolution to read as a smooth
// curve rather than a faceted polyline.
const SAMPLE_SPACING_PX = 4
// Amplitude of the undulation, as a fraction of one cell.
const WAVE_AMPLITUDE_RATIO = 0.2
// Roughly one full sine cycle per this many cells of body.
const WAVE_WAVELENGTH_CELLS = 3
// The amplitude ramps from 0 (right at the head) up to full over this many cells behind it, so the
// head itself always reads crisp regardless of how the body undulates.
const WAVE_RAMP_CELLS = 3
// Radians/second the shared phase value advances — independent of the discrete grid tick, so the
// slither reads as continuous motion even though the underlying grid steps discretely.
const WAVE_SPEED = 2.4
// Belly stripe dash length, as a fraction of one cell.
const BELLY_DASH_RATIO = 0.55

// Step 1/2 — map a snake's body (grid cells, oldest-first) to densified pixel-center samples with
// cumulative arc length and a local tangent/perpendicular at each. Plain JS (not a worklet): this
// only needs to re-run when the body itself changes (once per grid tick), not every animation
// frame — the per-frame work is entirely in offsetSamplesForWave below, which just reads this
// array's fixed geometry and applies a phase-driven sine offset to it.
function buildCenterlineSamples(body: GridCell[], cellPx: number): Sample[] {
  if (body.length === 0) return []
  const centers = body.map((cell) => cellCenter(cell, cellPx))

  // Step 1: densify every segment with linearly-interpolated extra points roughly every
  // SAMPLE_SPACING_PX apart. Body cells are always exactly one grid-step apart (Snake has no
  // portal-style non-adjacent jumps the way LightCycles does), so a plain lerp per segment is
  // always geometrically correct here.
  const raw: Point[] = [centers[0]]
  for (let i = 1; i < centers.length; i++) {
    const a = centers[i - 1]
    const b = centers[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const segLen = Math.hypot(dx, dy)
    const steps = Math.max(1, Math.round(segLen / SAMPLE_SPACING_PX))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      raw.push({ x: a.x + dx * t, y: a.y + dy * t })
    }
  }

  // Step 2: cumulative arc length + local tangent/perpendicular (central difference, falling back
  // to a forward/backward difference at the two ends).
  const samples: Sample[] = new Array(raw.length)
  let cumulative = 0
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) cumulative += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y)
    const prev = raw[Math.max(0, i - 1)]
    const next = raw[Math.min(raw.length - 1, i + 1)]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const tlen = Math.hypot(tx, ty) || 1
    // Perpendicular = tangent rotated 90 degrees. Which of the two perpendicular directions this
    // picks doesn't matter — the sine below swings symmetrically through both.
    samples[i] = { x: raw[i].x, y: raw[i].y, nx: -ty / tlen, ny: tx / tlen, dist: cumulative }
  }
  return samples
}

// Step 3 — offset each sample perpendicular to its tangent by amplitude * sin(phase + dist *
// frequency), ramping amplitude from 0 at the head up to full over the first few cells behind it.
// A standalone 'worklet' function (rather than an inline arrow) since it's called from inside
// useDerivedValue callbacks below — see LightCycles' GameBoard.tsx's partialTrailPath for the same
// precedent/reasoning in this codebase family.
function offsetSamplesForWave(samples: Sample[], phase: number, frequency: number, amplitude: number, rampLength: number): Point[] {
  'worklet'
  if (samples.length === 0) return []
  const total = samples[samples.length - 1].dist
  const points: Point[] = new Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    const distFromHead = total - s.dist
    const ramp = rampLength > 0 ? Math.min(1, Math.max(0, distFromHead / rampLength)) : 1
    const offset = amplitude * ramp * Math.sin(phase + s.dist * frequency)
    points[i] = { x: s.x + s.nx * offset, y: s.y + s.ny * offset }
  }
  return points
}

// Step 5 — a Skia Path through the (already offset) sample points: moveTo the first, lineTo every
// subsequent one.
function buildStrokePath(points: Point[]): SkPath {
  'worklet'
  const path = Skia.Path.Make()
  if (points.length === 0) return path
  path.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) path.lineTo(points[i].x, points[i].y)
  return path
}

// Step 6 — the belly stripe: two Skia Paths (one per alternating color) built from the same offset
// sample points, split into short dashes by `samples`' own cumulative arc length. Since `dist` only
// ever increases walking tail-to-head, each dash is exactly one contiguous run of samples, so a
// single pass with a `dashIndex` bucket per sample is enough — no separate segmentation pass needed.
function buildBellyStripePaths(points: Point[], samples: Sample[], dashLength: number): { white: SkPath; tertiary: SkPath } {
  'worklet'
  const white = Skia.Path.Make()
  const tertiary = Skia.Path.Make()
  if (points.length === 0 || dashLength <= 0) return { white, tertiary }
  let prevDashIndex = -1
  for (let i = 0; i < points.length; i++) {
    const dashIndex = Math.floor(samples[i].dist / dashLength)
    const target = dashIndex % 2 === 0 ? white : tertiary
    if (dashIndex !== prevDashIndex) target.moveTo(points[i].x, points[i].y)
    else target.lineTo(points[i].x, points[i].y)
    prevDashIndex = dashIndex
  }
  return { white, tertiary }
}

// Step 4 — a single Reanimated shared value, advanced every frame via useFrameCallback
// (independent of the discrete grid tick), shared by every snake's wave and by the food dot's
// pulse. One driver for the whole board rather than one per snake/glyph — cheaper, and keeps every
// undulation/pulse visibly in sync with the same clock.
function useContinuousPhase(): SharedValue<number> {
  const phase = useSharedValue(0)
  useFrameCallback((frameInfo) => {
    'worklet'
    const dtSeconds = (frameInfo.timeSincePreviousFrame ?? 16.67) / 1000
    phase.value += dtSeconds * WAVE_SPEED
  })
  return phase
}

interface SnakeBodyProps {
  snake: SnakeEntity
  cellPx: number
  phase: SharedValue<number>
  tertiaryColor: string
}

function SnakeBody({ snake, cellPx, phase, tertiaryColor }: SnakeBodyProps) {
  const samples = useMemo(() => buildCenterlineSamples(snake.body, cellPx), [snake.body, cellPx])
  const frequency = (2 * Math.PI) / (WAVE_WAVELENGTH_CELLS * cellPx)
  const amplitude = WAVE_AMPLITUDE_RATIO * cellPx
  const rampLength = WAVE_RAMP_CELLS * cellPx
  const dashLength = BELLY_DASH_RATIO * cellPx
  // A small fixed per-snake phase offset (id-based, not random) so two snakes on the same board
  // don't undulate in perfect lockstep — purely cosmetic variety, not called for by the plan but
  // harmless and cheap since it's just an additive constant on the shared driver.
  const phaseOffset = (snake.id - 1) * 1.3

  // Computed once per render (recreated whenever `samples` changes, i.e. once per grid tick) and
  // re-evaluated every frame via `phase.value` — same "closure captures the latest plain JS value,
  // reactivity comes from the shared value read inside" pattern GameBoard.tsx's own edgeStart/
  // tailEdgeStart derived values already use in this codebase family.
  const paths = useDerivedValue(() => {
    const points = offsetSamplesForWave(samples, phase.value + phaseOffset, frequency, amplitude, rampLength)
    const body = buildStrokePath(points)
    const belly = buildBellyStripePaths(points, samples, dashLength)
    return { body, white: belly.white, tertiary: belly.tertiary }
  })
  const bodyPath = useDerivedValue(() => paths.value.body)
  const whiteBellyPath = useDerivedValue(() => paths.value.white)
  const tertiaryBellyPath = useDerivedValue(() => paths.value.tertiary)

  // Step 7 — the head marker: a separate, brighter-filled circle at the exact, un-offset head cell
  // center (never touched by the wave offset above), drawn on top so it stays legible regardless of
  // how the body behind it undulates. "Brighter" = the snake's own color blended toward white via
  // auto-paper's own getBlendedColor, rather than a flat white circle unrelated to the snake's color.
  const headCell = snake.body[snake.body.length - 1]
  const headCenter = cellCenter(headCell, cellPx)
  const headRadius = cellPx * 0.5
  const headFillColor = useMemo(() => getBlendedColor('#FFFFFF', snake.color, 0.4), [snake.color])

  const bodyStrokeWidth = cellPx * 0.7
  const bellyStrokeWidth = cellPx * 0.22
  const bodyOpacity = snake.alive ? 1 : 0.35
  const bellyOpacity = snake.alive ? 0.9 : 0.25

  return (
    <>
      <Path path={bodyPath} style='stroke' strokeWidth={bodyStrokeWidth} strokeCap='round' strokeJoin='round' color={snake.color} opacity={bodyOpacity} />
      {/* Belly stripe — alternating white/theme-tertiary dashes running down the back, drawn on top
      of the body stroke so the pattern reads as scales rather than being buried under it. */}
      <Path path={whiteBellyPath} style='stroke' strokeWidth={bellyStrokeWidth} strokeCap='round' strokeJoin='round' color='#FFFFFF' opacity={bellyOpacity} />
      <Path path={tertiaryBellyPath} style='stroke' strokeWidth={bellyStrokeWidth} strokeCap='round' strokeJoin='round' color={tertiaryColor} opacity={bellyOpacity} />
      {snake.alive && (
        <>
          <Circle cx={headCenter.x} cy={headCenter.y} r={headRadius} color={headFillColor} />
          <Circle cx={headCenter.x} cy={headCenter.y} r={headRadius} style='stroke' strokeWidth={1.5} color={getContrastColor(snake.color)} />
        </>
      )}
    </>
  )
}

// Step 8 — food: a single pulsing dot, styled after LightCycles' GameBoard.tsx's PowerupGlyph
// (spawn-fade + pulse) as a visual-language reference only — a filled core plus a stroked outline,
// both driven off one shared animation value — not its trail-glide/sever/death-explosion machinery,
// which has no equivalent here. Reuses the same continuous `phase` driver as the snakes' own
// undulation (rather than a second withRepeat loop) so the radius is a literal sine of that shared
// clock, per the plan's "sine pulse" wording, and so the whole board animates off one driver.
interface FoodDotProps {
  food: GridCell
  cellPx: number
  phase: SharedValue<number>
  color: string
}

function FoodDot({ food, cellPx, phase, color }: FoodDotProps) {
  const center = cellCenter(food, cellPx)
  const baseRadius = cellPx * 0.32
  const radius = useDerivedValue(() => baseRadius * (1 + 0.22 * Math.sin(phase.value * 1.6)))
  const strokeOpacity = useDerivedValue(() => 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(phase.value * 1.6)))

  return (
    <>
      <Circle cx={center.x} cy={center.y} r={radius} color={color} />
      <Circle cx={center.x} cy={center.y} r={radius} style='stroke' strokeWidth={1.5} color='#FFFFFF' opacity={strokeOpacity} />
    </>
  )
}

// Step 9 — game-over flash: a brief whole-board opacity pulse the instant `phase` transitions to
// 'roundOver', explicitly simple (a single Rect covering the grid, opacity driven by one shared
// value) rather than LightCycles' multi-shard per-player death-explosion system, which is tuned for
// a permanent trail Snake doesn't have.
interface GameOverFlashProps {
  phase: SnakeGameState['phase']
  grid: GridSize
  cellPx: number
}

function GameOverFlash({ phase, grid, cellPx }: GameOverFlashProps) {
  const flash = useSharedValue(0)
  const prevPhaseRef = useRef(phase)

  useEffect(() => {
    if (phase === 'roundOver' && prevPhaseRef.current !== 'roundOver') {
      flash.value = withSequence(withTiming(0.55, { duration: 90, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }))
    }
    prevPhaseRef.current = phase
  }, [phase, flash])

  const opacity = useDerivedValue(() => flash.value)

  return <Rect x={0} y={0} width={grid.cols * cellPx} height={grid.rows * cellPx} color='#FFFFFF' opacity={opacity} />
}

// The board's own accent color for food — distinct from either snake's own color, same role
// LightCycles' GameBoard.tsx gives its `pickupColor` prop (there, the app theme's tertiary; here,
// the theme's primary reads as the more natural "accent" role since tertiary is already spoken for
// by every snake's belly stripe — see SnakeBody above).
export function SnakeBoard({ snakes, food, phase, cellPx, grid }: SnakeBoardProps) {
  const { colors } = useAutoPaperTheme()
  const phaseDriver = useContinuousPhase()

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <FoodDot food={food} cellPx={cellPx} phase={phaseDriver} color={colors.primary} />
      {snakes.map((snake) => (
        <SnakeBody key={snake.id} snake={snake} cellPx={cellPx} phase={phaseDriver} tertiaryColor={colors.tertiary} />
      ))}
      <GameOverFlash phase={phase} grid={grid} cellPx={cellPx} />
    </Canvas>
  )
}
