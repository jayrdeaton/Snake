// Renders the shared, unrotated board for every mode (Solo / Vs CPU / 2 Player) — see the plan's
// "Rendering (SnakeBoard.tsx)" section. ONE Canvas, drawn once, containing every alive snake in the
// same coordinate space (never duplicated/rotated per player — that idea was superseded; only small
// HUD/dialog decoration rotates per seat, via @tastic/core elsewhere, never the board itself,
// matching how LightCycles' own face-to-face arena already works).
//
// Each snake's body renders as a smooth, undulating centerline (steps 1-5 below) rather than rigid
// grid blocks, with a thin theme-tertiary centerline accent traced down its back (step 6), a
// triangular head unaffected by the undulation — with eyes, a nested accent badge in that same raw
// tertiary color, and an occasional tongue flick (step 7) — a pulsing food dot (step 8), and a brief
// whole-board flash on game over (step 9) — deliberately NOT LightCycles' trail-glide/sever/death-
// explosion system, which
// is tuned for a permanent multi-player trail Snake doesn't have (see the plan's own note on this).
// On death, a snake's own eyes swap to an X and its body/head fade out tail-to-head over
// snakeDeathFadeMs (see fadeFactorForDist, and constants/snake.ts) — a lighter-weight, Snake-specific
// take on "crash then animate out" than LightCycles' own explosion+wipe, gating game.tsx's
// GameOverDialog until the slowest dying snake's fade finishes.
import { getColorRoles, useAutoPaperTheme } from '@rific/auto-paper'
import { Canvas, Circle, Group, Path, Rect, Skia, type SkPath } from '@shopify/react-native-skia'
import { type OrientationMode, useOrientationState } from '@tastic/core'
import { cellToPixel } from '@tastic/grid'
import { ObstacleRect } from '@tastic/sprites/shapes'
import { Fragment, useEffect, useMemo, useRef } from 'react'
import { StyleSheet } from 'react-native'
import { Easing, type SharedValue, useDerivedValue, useFrameCallback, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'

import { SNAKE_DEATH_FADE_BAND_CELLS, SNAKE_POWERUP_EFFECT_COLORS, SNAKE_POWERUP_PICKUP_RADIUS_RATIO, snakeDeathFadeMs } from '@/constants/snake'
import { Direction, GridCell, GridSize, SnakeEntity, SnakeGameState, SnakeId, SnakePortal, SnakePowerupPickup, SnakeTunnel } from '@/types'

export interface SnakeBoardProps {
  snakes: SnakeEntity[]
  food: GridCell
  // Static per-round board features from the selected arena (see utils/arenas.ts) — all three
  // default-empty-shaped ('open' produces none of them), so every one of these props is always
  // present and safe to render unconditionally.
  obstacles: GridCell[]
  portals: SnakePortal[]
  tunnels: SnakeTunnel[]
  // Board-wide live powerup pickups (see types/index.ts's SnakePowerupPickup) — empty whenever
  // powerups are off this round.
  pickups: SnakePowerupPickup[]
  phase: SnakeGameState['phase']
  cellPx: number
  grid: GridSize
  // Drives every snake's between-tick glide (see SnakeBody) — `tick` resets to 0 on a fresh round
  // so retry snaps instead of gliding across the board, `tickIntervalMs` is the glide's duration.
  tick: number
  tickIntervalMs: number
  // Per-round GameSliceState.wrapEdges — see Walls' own comment on what this hides and why.
  wrapEdges: boolean
  // game.tsx's own OUTER phase ('onboarding' | 'playing' | 'gameOver'), not the `phase` prop above
  // (SnakeGameState['phase'], the engine's narrower 'playing' | 'roundOver' — see useSnakeState.ts's
  // own header comment on why Snake's engine has no 'onboarding' concept of its own at all, unlike
  // LightCycles': there, the analogous board reads 'onboarding' straight off state.phase, no second
  // signal needed). Only ever used to hide Walls during it — see that component's own comment.
  onboarding: boolean
}

// Same role LightCycles' GameBoard.tsx gives its identically-named constant — no reason for this
// board's own boundary stroke to read any thicker or thinner than that one does.
const WALL_STROKE_WIDTH = 1.5

function cellCenter(cell: GridCell, cellPx: number) {
  const { x, y } = cellToPixel(cell, cellPx)
  return { x: x + cellPx / 2, y: y + cellPx / 2 }
}

type Point = { x: number; y: number }

// A densified centerline sample — step 1/2's output. `nx`/`ny` is the unit perpendicular to the
// local tangent at this sample (used by the wave offset below), `dist` is this sample's cumulative
// arc length from the tail (index 0), used both for the head-relative amplitude ramp and the body's
// own width taper.
interface Sample extends Point {
  nx: number
  ny: number
  dist: number
  // True when this sample is the first point of a new, visually disconnected piece — i.e. the raw
  // point before it is NOT really grid-adjacent, because a wrapEdges crossing sits between them.
  // buildGlideBody's own wrap-snap only stops the HEAD from gliding across a wrap the instant it
  // happens; the resulting seam then stays put in the settled body array for many ticks afterward
  // as the snake keeps moving (until its tail finally passes it). This flag is what stops
  // buildBodySegments from drawing a straight line across THAT — moveTo-ing past the gap instead of
  // lineTo-ing through it.
  seam: boolean
}

// The most cells a snake's head can legitimately advance in one tick — see snakeEngine.ts's
// stepsForSnake and types/index.ts's SnakeSpeedEffect (multiplier: 0 | 2): a boosted (Sidewind/
// Frenzy) snake covers 2 cells per tick, everything else covers 1. Duplicated here as a plain
// constant rather than importing stepsForSnake itself — several functions below are 'worklet's, and
// calling a non-worklet function from one throws on native (see interpolatedCenters' own comment on
// cellCenter for the same gotcha). Any single-tick head jump bigger than this can only be a
// wrapEdges crossing, never a real move — buildGlideBody/headingAngle/buildCenterlineSamples all
// compare against this (not a bare `1`) so a boosted snake's genuine 2-cell step still glides/turns
// smoothly instead of being mistaken for a wrap.
const MAX_STEPS_PER_TICK = 2

// A raw centerline segment longer than this (see buildCenterlineSamples) can only be a wrapEdges
// seam — never a legitimate step, even a boosted one: MAX_STEPS_PER_TICK is the real cap, and this
// leaves a full cell of margin above it so the cutoff is never in doubt.
const MAX_LEGIT_SEGMENT_CELLS = MAX_STEPS_PER_TICK + 1

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
// The body's own width profile — see bodyHalfWidthAt. Fixed-length (cell-count, not
// length-fraction) taper zones at each end, both narrowing toward a plateau at BODY_MAX_HALF_WIDTH
// in between: the neck tapers down to a non-zero minimum (still a visible tube feeding the head),
// the tail tapers all the way to zero (a genuine point). Because the taper zones are a FIXED
// absolute length rather than a fraction of the snake's own length, a short snake (barely longer
// than the two zones combined) never reaches the plateau at all — the whole body reads as one
// smooth thin-thick-thin spindle, like a stubby little hatchling, while a long snake gets a proper
// long, evenly-thick "adult" torso between two tapered ends.
const BODY_MAX_HALF_WIDTH_RATIO = 0.29
const NECK_MIN_HALF_WIDTH_RATIO = 0.16
const NECK_TAPER_LENGTH_CELLS = 2.2
const TAIL_TAPER_LENGTH_CELLS = 5
const BODY_OUTLINE_THICKNESS_RATIO = 0.08

// Step 1/2 — map a snake's already pixel-centered, tick-interpolated body samples (see
// interpolateBody below) to densified samples with cumulative arc length and a local
// tangent/perpendicular at each. A worklet, called fresh every animation frame from inside
// SnakeBody's `paths` useDerivedValue — unlike a fixed grid body, the interpolated centers below
// move continuously between ticks (see interpolateBody's own comment), so this can no longer be
// memoized to once-per-tick the way it used to be.
function buildCenterlineSamples(centers: Point[], cellPx: number): Sample[] {
  'worklet'
  if (centers.length === 0) return []
  const maxLegitSegLen = MAX_LEGIT_SEGMENT_CELLS * cellPx

  // Step 1: densify every segment with linearly-interpolated extra points roughly every
  // SAMPLE_SPACING_PX apart. Body cells are always exactly one grid-step apart UNLESS a wrapEdges
  // seam sits between them (Snake has no portal-style non-adjacent jumps the way LightCycles does
  // otherwise), so a plain lerp per segment is geometrically correct everywhere except there — a
  // seam has nothing sensible to interpolate (the two ends are on opposite sides of the board), so
  // `b` is pushed straight through as its own disconnected point instead of lerping across the gap.
  const raw: Point[] = [centers[0]]
  const rawSeam: boolean[] = [false]
  for (let i = 1; i < centers.length; i++) {
    const a = centers[i - 1]
    const b = centers[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const segLen = Math.hypot(dx, dy)
    if (segLen > maxLegitSegLen) {
      raw.push(b)
      rawSeam.push(true)
      continue
    }
    const steps = Math.max(1, Math.round(segLen / SAMPLE_SPACING_PX))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      raw.push({ x: a.x + dx * t, y: a.y + dy * t })
      rawSeam.push(false)
    }
  }

  // Step 2: cumulative arc length + local tangent/perpendicular (central difference, falling back
  // to a forward/backward difference at the two ends, and at either side of a seam — reading across
  // one would compute a tangent pointing clear across the board, the same failure mode a raw lineTo
  // would have).
  const samples: Sample[] = new Array(raw.length)
  let cumulative = 0
  for (let i = 0; i < raw.length; i++) {
    // A seam's true pixel gap is the wrap distance itself — substituting one cell's worth instead
    // keeps the taper/wave/fade math below (all purely dist-based) proportional to the body's
    // actual cell count rather than one huge jump dominating the total.
    if (i > 0) cumulative += rawSeam[i] ? cellPx : Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y)
    const hasPrev = i > 0 && !rawSeam[i]
    const hasNext = i < raw.length - 1 && !rawSeam[i + 1]
    const prev = hasPrev ? raw[i - 1] : raw[i]
    const next = hasNext ? raw[i + 1] : raw[i]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const tlen = Math.hypot(tx, ty) || 1
    // Perpendicular = tangent rotated 90 degrees. Which of the two perpendicular directions this
    // picks doesn't matter — the sine below swings symmetrically through both.
    samples[i] = { x: raw[i].x, y: raw[i].y, nx: -ty / tlen, ny: tx / tlen, dist: cumulative, seam: rawSeam[i] }
  }
  return samples
}

// Step 0 (glide) — the engine advances `snake.body` in whole-cell jumps once per
// SNAKE_TICK_INTERVAL_MS (see useSnakeState.ts's rAF loop); rendering that directly, as this board
// used to, made the whole snake visibly teleport a full cell every tick instead of reading as
// continuous motion.
//
// Interpolating each same-index cell independently (prevBody[i] -> currBody[i]) was the first cut
// at this and reads fine on a straight stretch, but at a turn it draws a straight chord between two
// unrelated points on either side of the bend — visibly cutting the corner instead of following the
// actual right-angle path. The fix, generalized from LightCycles' GameBoard.tsx's own head/tail
// glide (see its partialTrailPath): treat the body as a fixed-length rope sliding along its own
// unchanged path — the head extends from its old cell toward the new one, the tail retracts from
// its old cell toward the next one *by the exact same fraction*, and every interior point (any
// corner strictly between them) never moves at all. A corner can only ever be cut if some vertex
// that should stay put is instead lerped toward an unrelated target — this never moves one.
// A raw single-axis delta (new cell minus old cell, e.g. newHead.x - oldHead.x), corrected for a
// wrapEdges crossing on that axis. wrapEdges can land the new head non-adjacent to where it just
// was (e.g. the last column wrapping to the first) — `raw` would then be a huge, whole-board-
// spanning number instead of the genuine +-1 (or +-2, boosted) step that actually happened.
// Compared against MAX_STEPS_PER_TICK, not a bare `1`, so a boosted snake's own legitimate 2-cell
// step is left untouched. Correcting it back to the real small step (rather than the previous
// approach of just snapping the whole tick's glide to its settled, no-motion shape) is what lets
// buildGlideBody/headingAngle glide THROUGH a wrap exactly like any other step — see buildGlideBody
// and SnakeBody's own wrapEcho for how the result (now legitimately just outside [0, size)) gets
// rendered as a body sliding off one edge while a translated echo enters the other.
function unwrapDelta(raw: number, size: number): number {
  'worklet'
  if (Math.abs(raw) <= MAX_STEPS_PER_TICK) return raw
  return raw > 0 ? raw - size : raw + size
}

function buildGlideBody(prevBody: GridCell[], currBody: GridCell[], progress: number, grid: GridSize): GridCell[] {
  'worklet'
  const n = prevBody.length
  const oldHead = prevBody[n - 1]
  const newHead = currBody[currBody.length - 1]
  const dx = unwrapDelta(newHead.x - oldHead.x, grid.cols)
  const dy = unwrapDelta(newHead.y - oldHead.y, grid.rows)
  const glidingHead = { x: oldHead.x + dx * progress, y: oldHead.y + dy * progress }

  // Growing (ate food, see snakeEngine.ts's `[...s.body, nextCell]`) keeps the whole old body
  // exactly as it was, unchanged — only the new head segment extends out of it, growing from
  // oldHead's own (already-included, fixed) position — so there's no tail to retract at all.
  if (currBody.length > n) return [...prevBody, glidingHead]
  // A body too short to have a distinct tail segment (never happens in practice — SNAKE_START_LENGTH
  // is well above this — but cheap to fall back on safely) has nothing to retract either.
  if (n < 2) return [glidingHead]

  // A normal move: the tail retracts from its own old cell toward the next one by the same fraction
  // the head extends by, so the body's total length never changes mid-glide. oldHead is kept as its
  // own explicit, unmoving point here — mirroring afterTail's role on the other end — rather than
  // handing its slot straight to glidingHead. Omitting it was the corner-cutting bug: as glidingHead
  // moves away from oldHead over the glide, connecting the last interior point directly to it draws
  // a chord straight across oldHead's own position instead of visiting it — cutting exactly the
  // corner that matters most, the one just being turned through on this very tick. Two turns landing
  // on back-to-back ticks made this obvious: the second turn's corner (this tick's oldHead) never
  // rendered as a real vertex at all, just a diagonal shortcut past it.
  const tail = prevBody[0]
  const afterTail = prevBody[1]
  const glidingTail = { x: tail.x + (afterTail.x - tail.x) * progress, y: tail.y + (afterTail.y - tail.y) * progress }
  return [glidingTail, ...prevBody.slice(1, n - 1), oldHead, glidingHead]
}

// The head's own facing angle (radians, atan2 convention), used by the triangular head/eyes/tongue
// below. Smoothly interpolated across the exact same glide window buildGlideBody uses, rather than
// snapping the instant a turn commits — turning the head instantly while the body behind it is still
// gliding through the bend would look disconnected from its own neck. Deliberately computed from
// the real, always-adjacent grid cells (the cell before the old head, the old head, the new head)
// rather than from the glide's own interpolated centers: those two are momentarily coincident right
// at progress=0 (see buildGlideBody's oldHead/glidingHead), which would make an angle computed from
// their difference briefly undefined.
const DIRECTION_ANGLE: Record<Direction, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }

function normalizeAngleDelta(delta: number): number {
  'worklet'
  // Wraps to (-PI, PI] so interpolating always turns the short way — always exactly +-PI/2 here in
  // practice, never the long way around, since a snake can never reverse into itself.
  let d = delta % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d < -Math.PI) d += 2 * Math.PI
  return d
}

function headingAngle(prevBody: GridCell[], currBody: GridCell[], progress: number, direction: Direction, grid: GridSize): number {
  'worklet'
  const n = prevBody.length
  const oldHead = prevBody[n - 1]
  const newHead = currBody[currBody.length - 1]
  // unwrapDelta (see buildGlideBody's own identical correction) turns a wrap crossing back into
  // the genuine +-1/+-2 step it actually was, so a turn-while-wrapping (e.g. turning to walk off
  // the top edge, wrapping to the bottom) still gets the same smooth interpolated turn below as
  // any other turn, instead of snapping the head's facing instantly.
  const dx = unwrapDelta(newHead.x - oldHead.x, grid.cols)
  const dy = unwrapDelta(newHead.y - oldHead.y, grid.rows)
  // A fresh spawn or an unchanged (dead) body has oldHead === newHead, a zero vector atan2 can't
  // resolve — the engine's own already-resolved `direction` is exactly this tick's real heading
  // regardless, so fall back to it.
  if (dx === 0 && dy === 0) return DIRECTION_ANGLE[direction]
  const newAngle = Math.atan2(dy, dx)
  if (n < 2) return newAngle
  const beforeOldHead = prevBody[n - 2]
  const oldAngle = Math.atan2(oldHead.y - beforeOldHead.y, oldHead.x - beforeOldHead.x)
  return oldAngle + normalizeAngleDelta(newAngle - oldAngle) * progress
}

// Step 3 — offset each sample perpendicular to its tangent by amplitude * sin(phase + dist *
// frequency), ramping amplitude from 0 at the head up to full over the first few cells behind it.
// A standalone 'worklet' function (rather than an inline arrow) since it's called from inside
// useDerivedValue callbacks below — see LightCycles' GameBoard.tsx's partialTrailPath for the same
// precedent/reasoning in this codebase family. `total` is the reference the head-relative ramp
// measures from — the body's own true arc length normally, but see `paths`' own `referenceTotal`
// for why a growing snake passes something else instead (a sample past it just reads as "beyond
// the head," clamping its ramp to 0 — no separate growing-branch logic needed here).
function offsetSamplesForWave(samples: Sample[], phase: number, frequency: number, amplitude: number, rampLength: number, total: number): Point[] {
  'worklet'
  if (samples.length === 0) return []
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

// The body's own half-width at a given arc-length position — shared by buildBodySegments below AND
// the centerline accent (a thinner stroke over the same segments, see SnakeBody's own accentWidth),
// so the accent is geometrically guaranteed to never poke out past the body's own edge, in the
// taper zones or anywhere else, rather than maintaining the taper math twice and risking the two
// drifting apart.
//
// The neck ramp (0 right at the head, 1 once NECK_TAPER_LENGTH_CELLS away from it) and the tail
// ramp (0 right at the tail tip, 1 once TAIL_TAPER_LENGTH_CELLS away from it) are each computed
// independently from their own end, then combined by taking whichever is currently more restrictive
// (Math.min) — that's what makes a short snake's two taper zones smoothly merge into one spindle
// instead of the neck's own far-end value leaking into a region that's also close to the tail.
// `isOutline` picks between the two nested profiles the double-stroke trick needs (see SnakeBody's
// own outlineSegmentsSV/fillSegmentsSV): the outer, full vivid-color segments, or the inner,
// container-color ones drawn on top of them, BODY_OUTLINE_THICKNESS_RATIO narrower everywhere.
function bodyHalfWidthAt(dist: number, total: number, cellPx: number, isOutline: boolean): number {
  'worklet'
  const maxHalf = BODY_MAX_HALF_WIDTH_RATIO * cellPx
  const neckHalf = NECK_MIN_HALF_WIDTH_RATIO * cellPx
  const neckTaper = NECK_TAPER_LENGTH_CELLS * cellPx
  const tailTaper = TAIL_TAPER_LENGTH_CELLS * cellPx
  const distFromHead = total - dist
  const neckT = Math.min(1, Math.max(0, distFromHead / neckTaper))
  const neckWidth = neckHalf + (maxHalf - neckHalf) * neckT
  const tailT = Math.min(1, Math.max(0, dist / tailTaper))
  const tailWidth = maxHalf * tailT
  const outlineHalf = Math.min(neckWidth, tailWidth)
  if (isOutline) return outlineHalf
  return Math.max(0, outlineHalf - BODY_OUTLINE_THICKNESS_RATIO * cellPx)
}

// Step 5 — the body: rendered as several constant-width STROKE segments rather than one variable-
// width filled shape. A manually-built filled ribbon (offsetting each sample point perpendicular by
// its own half-width) was the first cut at a varying width, but it has no reliable way to round its
// own sharp-turn corners on this platform — see the long version of this story below. A stroke, by
// contrast, gets its round joins/caps from Skia's own native stroker, the exact same one this board
// already trusted for the constant-width body before the taper existed. So: chop the body into a
// fixed number of short constant-width sub-strokes instead of one continuously-varying shape, each
// width sampled from bodyHalfWidthAt at that segment's own midpoint. Adjacent segments share their
// boundary point (see buildBodySegments) so there's no visible gap, and each one gets its own
// correct round joins/caps for free.
//
// (The abandoned approach, for the record: adding a filled circle at every sample — sized to that
// sample's own half-width — to round away a turn's outer notch and inner pinch, the same thing a
// round stroke join does internally. Skia still antialiases every sub-path's own edge independently
// within one SkPath, though, so wherever a circle's boundary fell *inside* the already-filled
// ribbon — most of every circle, at this sample density — that edge rendered as a faint seam
// anyway: a regular beaded/coiled texture down the whole body, not a smooth tube. The fix for THAT
// is recomputing the path into genuinely non-overlapping contours — `path.simplify()` /
// `Skia.Path.Simplify()` exist for exactly this — but both route to CanvasKit's own
// `makeSimplified()` under the hood on web, which this project's pinned CanvasKit build doesn't
// actually implement (confirmed live: `path.makeSimplified is not a function`), and `path.op()`
// (a manual union) routes to the equally-missing `makeCombined()`. Bailed out to the segmented-
// stroke approach above instead, which never needs either.)
//
// TAIL_SEGMENT_COUNT/NECK_SEGMENT_COUNT segments densely cover the two (fixed-length, see
// bodyHalfWidthAt) taper zones, where the width is actively changing and resolution matters, plus
// exactly one segment for the constant-width plateau between them, however long it is — a long
// snake's plateau doesn't need to be finely chopped, since its width never changes along the way.
// High enough that the width step between adjacent segments stays small enough to read as a
// continuous taper rather than a stack of distinct-width sections — a first cut at 8/4 was visibly
// segmented, especially near the tail's own (now quite long) taper zone. Segments are cheap (a
// short stroke each, and React never re-renders them — see BodySegment's own comment), so there's
// no real cost to erring high here.
const TAIL_SEGMENT_COUNT = 24
const NECK_SEGMENT_COUNT = 10
const BODY_SEGMENT_COUNT = TAIL_SEGMENT_COUNT + 1 + NECK_SEGMENT_COUNT

interface PathSegment {
  path: SkPath
  width: number
  // This segment's own midpoint arc length from the tail (index 0 of the centerline) — the death
  // fade's tail-to-head sweep (see fadeFactorForDist) reads this to decide when this segment's own
  // opacity crosses from 1 to 0.
  dist: number
}

function emptySegments(count: number): PathSegment[] {
  'worklet'
  const result: PathSegment[] = []
  for (let i = 0; i < count; i++) result.push({ path: Skia.Path.Make(), width: 0, dist: 0 })
  return result
}

// The arc-length boundary between each of BODY_SEGMENT_COUNT segments: TAIL_SEGMENT_COUNT equal
// sub-ranges of [0, tailZoneEnd], one plateau range [tailZoneEnd, neckZoneStart], then
// NECK_SEGMENT_COUNT equal sub-ranges of [neckZoneStart, total]. Clamping neckZoneStart to be at
// least tailZoneEnd (rather than letting it go negative-length past it) is what makes a short
// "baby" snake's two taper zones collapse the plateau to nothing and directly abut, rather than
// overlapping into an invalid range — bodyHalfWidthAt already handles the resulting width profile
// correctly either way (see its own Math.min of the two ramps), this just keeps the segment
// boundaries themselves sane.
function segmentBreakpoints(total: number, cellPx: number): number[] {
  'worklet'
  const tailTaper = TAIL_TAPER_LENGTH_CELLS * cellPx
  const neckTaper = NECK_TAPER_LENGTH_CELLS * cellPx
  const tailZoneEnd = Math.min(tailTaper, total)
  const neckZoneStart = Math.max(total - neckTaper, tailZoneEnd)
  const breaks: number[] = [0]
  for (let i = 1; i <= TAIL_SEGMENT_COUNT; i++) breaks.push((i / TAIL_SEGMENT_COUNT) * tailZoneEnd)
  breaks.push(neckZoneStart)
  for (let i = 1; i <= NECK_SEGMENT_COUNT; i++) breaks.push(neckZoneStart + (i / NECK_SEGMENT_COUNT) * (total - neckZoneStart))
  return breaks
}

// `total` is the reference arc length these BODY_SEGMENT_COUNT segments are chopped over — the
// body's own true length normally, but see `paths`' own `referenceTotal` for why a growing snake
// freezes this at the pre-growth length instead: any live sample past it (the newly-growing bit)
// is simply left uncovered by every segment here, on purpose — buildGrowthStubSegment below is
// what draws that leftover piece.
function buildBodySegments(points: Point[], samples: Sample[], cellPx: number, isOutline: boolean, total: number): PathSegment[] {
  'worklet'
  const n = points.length
  if (n === 0) return emptySegments(BODY_SEGMENT_COUNT)
  const breaks = segmentBreakpoints(total, cellPx)
  const segments: PathSegment[] = []
  for (let seg = 0; seg < BODY_SEGMENT_COUNT; seg++) {
    const fromDist = breaks[seg]
    const toDist = breaks[seg + 1]
    // The last sample at-or-before fromDist, and the first sample at-or-after toDist — adjacent
    // segments share that boundary sample, so consecutive strokes always touch with no gap.
    let startIdx = 0
    while (startIdx < n - 1 && samples[startIdx + 1].dist <= fromDist) startIdx++
    let endIdx = n - 1
    while (endIdx > 0 && samples[endIdx - 1].dist >= toDist) endIdx--
    const path = Skia.Path.Make()
    path.moveTo(points[startIdx].x, points[startIdx].y)
    // A seam sample (see Sample.seam) starts a brand new, disconnected piece — moveTo to it instead
    // of lineTo-ing through it, or a wrapEdges crossing sitting anywhere in this segment's span
    // would draw a straight line clear across the board between the two edges it's bridging.
    for (let i = startIdx + 1; i <= endIdx; i++) {
      if (samples[i].seam) path.moveTo(points[i].x, points[i].y)
      else path.lineTo(points[i].x, points[i].y)
    }
    const midDist = (fromDist + toDist) / 2
    const hw = bodyHalfWidthAt(midDist, total, cellPx, isOutline)
    segments.push({ path, width: hw * 2, dist: midDist })
  }
  return segments
}

// Step 5b — the one bit buildBodySegments' own frozen `total` deliberately leaves uncovered while
// growing: whatever live samples sit past the pre-growth reference length, i.e. the newly-growing
// piece of neck stretching out toward the live head. Rendered at ONE constant width (the neck's
// own minimum — bodyHalfWidthAt evaluated exactly at the boundary, where distFromHead is 0) rather
// than a taper of its own, so it reads as a fresh stub still being formed rather than an already-
// established, already-tapered length of body — and with no wave offset, already implied for free
// by offsetSamplesForWave's own ramp clamping to 0 for any sample past that same reference. Not
// growing (referenceTotal === the samples' own true total) collapses this to a single moveTo with
// no lineTo after it — Skia draws nothing for that, so the stub is simply invisible outside a
// growth tick, no separate on/off flag needed.
function buildGrowthStubSegment(points: Point[], samples: Sample[], cellPx: number, isOutline: boolean, referenceTotal: number): PathSegment {
  'worklet'
  const n = points.length
  if (n === 0) return { path: Skia.Path.Make(), width: 0, dist: referenceTotal }
  let startIdx = 0
  while (startIdx < n - 1 && samples[startIdx + 1].dist <= referenceTotal) startIdx++
  const path = Skia.Path.Make()
  path.moveTo(points[startIdx].x, points[startIdx].y)
  for (let i = startIdx + 1; i < n; i++) {
    if (samples[i].seam) path.moveTo(points[i].x, points[i].y)
    else path.lineTo(points[i].x, points[i].y)
  }
  const hw = bodyHalfWidthAt(referenceTotal, referenceTotal, cellPx, isOutline)
  return { path, width: hw * 2, dist: referenceTotal }
}

// How wide the centerline accent reads relative to the body's own current FILL width at that same
// point — a fraction rather than a fixed pixel width, so it scales down through the neck/tail taper
// zones the same way the body itself does, instead of poking out past its own edge there. Same
// value as HeroSnakeTrailCanvas.tsx's own TRAIL_ACCENT_WIDTH_FRACTION, so the two read as the same
// thickness of line.
const BELLY_ACCENT_WIDTH_FRACTION = 0.2
// Same 0.9 the accent read at before it was a plain dashed stripe — a hair short of the body's own
// fully-alive opacity, same role HeroSnakeTrailCanvas.tsx's own TRAIL_ACCENT_OPACITY plays.
const BELLY_ACCENT_OPACITY = 0.9

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

// Head shape/decoration ratios — all relative to cellPx, same convention as the wave/belly ratios
// above.
const HEAD_NOSE_DIST_RATIO = 0.74 // nose tip, ahead of the head center
const HEAD_BACK_DIST_RATIO = 0.37 // back vertices, behind the head center
const HEAD_HALF_WIDTH_RATIO = 0.6058 // back vertices' spread either side of center — wider than the
// body's own plateau half-width (BODY_MAX_HALF_WIDTH_RATIO = 0.29) so the head visibly flares out
// from the neck, the way a real snake's head does.
// The four control-point ratios below trace the same rounded wedge as the app-icon artwork (see
// buildHeadPath) — extracted from its SVG path data rather than derived analytically, then
// normalized so the nose distance lands on the existing HEAD_NOSE_DIST_RATIO (everything else,
// eyes/tongue/accent, already anchors off that ratio, so this keeps the nose tip where they expect
// it). The nose's own two control points sit at the *same* forward distance as the nose itself —
// only offset sideways — which is what makes the tip read as a soft, rounded snout rather than a
// sharp point.
const HEAD_NOSE_CP_SIDE_RATIO = 0.2019
const HEAD_QUARTER_CP_FORWARD_RATIO = 0.185
const HEAD_QUARTER_CP_SIDE_RATIO = 0.7067
const HEAD_THREEQ_CP_FORWARD_RATIO = 0.555
const HEAD_THREEQ_CP_SIDE_RATIO = 0.5048
const EYE_FORWARD_RATIO = 0 // roughly level with the head's own center, rather than out near the nose
const EYE_SIDE_RATIO = 0.3
const EYE_RADIUS_RATIO = 0.11
const EYE_COLOR = '#000000'
// A ring around each live eye, in the snake's own color — same identity color the body/head
// already use, just tracing the pupil's own edge.
const EYE_OUTLINE_STROKE_WIDTH_RATIO = 0.065
// A dead snake's eyes swap from the two circles above to an X at each eye's own center — the arm
// half-length and stroke width, both relative to cellPx like every other head dimension.
const EYE_X_ARM_RATIO = 0.11
const EYE_X_STROKE_WIDTH_RATIO = 0.045
const HEAD_ACCENT_SCALE_RATIO = 0.5 // the head's own silhouette, scaled down — see buildHeadAccentPath
const TONGUE_LENGTH_RATIO = 0.36
const TONGUE_FORK_LENGTH_RATIO = 0.13
const TONGUE_FORK_SPREAD_RAD = 0.45
const TONGUE_WIDTH_RATIO = 0.05
const TONGUE_COLOR = '#FF4D6D'
// Occasional flick timing — randomized within a range (rather than a fixed period) so two snakes on
// the same board don't flick in lockstep, and it reads as an idle tic rather than a metronome. A
// one-off event like this gets its own per-snake JS-thread timer (see SnakeBody's own effect) rather
// than riding the shared, continuously-cycling `phase` clock the wave/pulse use.
const TONGUE_FLICK_MIN_MS = 2200
const TONGUE_FLICK_MAX_MS = 4200
const TONGUE_OUT_MS = 130
const TONGUE_HOLD_MS = 90
const TONGUE_BACK_MS = 170

// The head's own size, as a fraction of full size, at spawn — ramping linearly up to 1 (full size)
// over the first HEAD_GROWTH_APPLES eaten, then holding there — the same "baby, then grown" beat
// the body's own length-relative taper zones already give a fresh spawn (see bodyHalfWidthAt), just
// tied to score/apples eaten instead of the snake's current length. Scales every head-relative
// dimension uniformly (see SnakeBody's own headScale) rather than the body, which already reads
// small on a short snake purely from its own taper.
const HEAD_START_SCALE = 0.5
const HEAD_GROWTH_APPLES = 6
const HEAD_GROWTH_ANIM_MS = 260

function headScaleForScore(score: number): number {
  const t = Math.min(1, score / HEAD_GROWTH_APPLES)
  return HEAD_START_SCALE + (1 - HEAD_START_SCALE) * t
}

// A point `forward` along the heading direction from (cx, cy), offset `side` further along the
// perpendicular — the one shared building block every head/eye/tongue point below is made of.
function projectFromHead(cx: number, cy: number, angle: number, forward: number, side: number): Point {
  'worklet'
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  return { x: cx + ux * forward - uy * side, y: cy + uy * forward + ux * side }
}

// The head itself: a rounded, softly tapered wedge (nose forward, flat-ish back) facing `angle`,
// replacing the old direction-less circle marker — and, as of the ratios above, tracing the exact
// silhouette from the app-icon artwork rather than a straight-edged triangle with rounded corners.
// Three cubic curves (nose->backLeft->backRight->nose) instead of lines-plus-corner-rounding, since
// that's what the icon shape actually is: the nose's own control points sit beside it rather than
// ahead of it, so the tip arrives/leaves side-on — a soft, rounded snout instead of a sharp point.
function buildHeadPath(cx: number, cy: number, angle: number, cellPx: number): SkPath {
  'worklet'
  const nose = projectFromHead(cx, cy, angle, HEAD_NOSE_DIST_RATIO * cellPx, 0)
  const noseCpOut = projectFromHead(cx, cy, angle, HEAD_NOSE_DIST_RATIO * cellPx, HEAD_NOSE_CP_SIDE_RATIO * cellPx)
  const noseCpIn = projectFromHead(cx, cy, angle, HEAD_NOSE_DIST_RATIO * cellPx, -HEAD_NOSE_CP_SIDE_RATIO * cellPx)

  const backLeft = projectFromHead(cx, cy, angle, -HEAD_BACK_DIST_RATIO * cellPx, HEAD_HALF_WIDTH_RATIO * cellPx)
  const backLeftCpIn = projectFromHead(cx, cy, angle, -HEAD_QUARTER_CP_FORWARD_RATIO * cellPx, HEAD_QUARTER_CP_SIDE_RATIO * cellPx)
  const backLeftCpOut = projectFromHead(cx, cy, angle, -HEAD_THREEQ_CP_FORWARD_RATIO * cellPx, HEAD_THREEQ_CP_SIDE_RATIO * cellPx)

  const backRight = projectFromHead(cx, cy, angle, -HEAD_BACK_DIST_RATIO * cellPx, -HEAD_HALF_WIDTH_RATIO * cellPx)
  const backRightCpIn = projectFromHead(cx, cy, angle, -HEAD_THREEQ_CP_FORWARD_RATIO * cellPx, -HEAD_THREEQ_CP_SIDE_RATIO * cellPx)
  const backRightCpOut = projectFromHead(cx, cy, angle, -HEAD_QUARTER_CP_FORWARD_RATIO * cellPx, -HEAD_QUARTER_CP_SIDE_RATIO * cellPx)

  const path = Skia.Path.Make()
  path.moveTo(nose.x, nose.y)
  path.cubicTo(noseCpOut.x, noseCpOut.y, backLeftCpIn.x, backLeftCpIn.y, backLeft.x, backLeft.y)
  path.cubicTo(backLeftCpOut.x, backLeftCpOut.y, backRightCpIn.x, backRightCpIn.y, backRight.x, backRight.y)
  path.cubicTo(backRightCpOut.x, backRightCpOut.y, noseCpIn.x, noseCpIn.y, nose.x, nose.y)
  path.close()
  return path
}

// The head's own silhouette again, just smaller — a nested badge continuing the icon's shape
// language onto itself, rather than a straight centerline dash unrelated to the head's own outline.
function buildHeadAccentPath(cx: number, cy: number, angle: number, cellPx: number): SkPath {
  'worklet'
  return buildHeadPath(cx, cy, angle, cellPx * HEAD_ACCENT_SCALE_RATIO)
}

// A dead snake's eyes: an X centered at each eye position (see SnakeBody's own eyeCenters) instead
// of the two solid circles drawn while alive. Both eyes drawn into one shared path — arms angled
// +-45 degrees off `angle` (the head's own heading), following the same rotate-with-heading
// convention every other head-relative decoration (accent, tongue) already uses, rather than a
// fixed screen-aligned X.
function buildDeadEyesPath(leftX: number, leftY: number, rightX: number, rightY: number, angle: number, armLen: number): SkPath {
  'worklet'
  const path = Skia.Path.Make()
  const centers: [number, number][] = [
    [leftX, leftY],
    [rightX, rightY]
  ]
  for (let i = 0; i < centers.length; i++) {
    const [cx, cy] = centers[i]
    const a = projectFromHead(cx, cy, angle + Math.PI / 4, armLen, 0)
    const b = projectFromHead(cx, cy, angle + Math.PI / 4, -armLen, 0)
    path.moveTo(a.x, a.y)
    path.lineTo(b.x, b.y)
    const c = projectFromHead(cx, cy, angle - Math.PI / 4, armLen, 0)
    const d = projectFromHead(cx, cy, angle - Math.PI / 4, -armLen, 0)
    path.moveTo(c.x, c.y)
    path.lineTo(d.x, d.y)
  }
  return path
}

// The tongue: a line from the nose that extends and forks as `progress` goes 0->1 (flicked out) and
// reverses coming back down to 0 — see SnakeBody's own per-snake flick timer. Two short strokes
// from a shared tip, rather than one stroke that splits, since SkPath has no native "fork"
// primitive and this is simpler than one V-shaped polyline sharing a vertex.
function buildTonguePath(cx: number, cy: number, angle: number, cellPx: number, progress: number): SkPath {
  'worklet'
  const path = Skia.Path.Make()
  if (progress <= 0) return path
  const nose = projectFromHead(cx, cy, angle, HEAD_NOSE_DIST_RATIO * cellPx, 0)
  const tip = projectFromHead(cx, cy, angle, HEAD_NOSE_DIST_RATIO * cellPx + TONGUE_LENGTH_RATIO * cellPx * progress, 0)
  const forkLen = TONGUE_FORK_LENGTH_RATIO * cellPx * progress
  const forkA = projectFromHead(tip.x, tip.y, angle + TONGUE_FORK_SPREAD_RAD, forkLen, 0)
  const forkB = projectFromHead(tip.x, tip.y, angle - TONGUE_FORK_SPREAD_RAD, forkLen, 0)
  path.moveTo(nose.x, nose.y)
  path.lineTo(tip.x, tip.y)
  path.moveTo(tip.x, tip.y)
  path.lineTo(forkA.x, forkA.y)
  path.moveTo(tip.x, tip.y)
  path.lineTo(forkB.x, forkB.y)
  return path
}

// The death fade's tail-to-head sweep: `progress` (0->1, see SnakeBody's own deathProgress) is a
// "wipe front" advancing from the tail (dist=0) to the head (dist=total). A point at `dist` is
// still fully opaque while the front hasn't reached it yet, transitions through `bandPx` worth of
// arc length as the front crosses it (a soft edge, rather than every segment popping off at once),
// and is fully transparent once the front has passed. `progress <= 0` (the common, alive case)
// short-circuits to fully opaque without the rest of the math — notably avoiding dist=0 (the very
// tail tip) reading as already-transparent at progress=0, which the general formula alone would do.
function fadeFactorForDist(dist: number, total: number, progress: number, bandPx: number): number {
  'worklet'
  if (progress <= 0) return 1
  const front = progress * total
  return Math.min(1, Math.max(0, (dist - front) / bandPx))
}

// Renders segmentsSV[index] as its own constant-width stroke — see buildBodySegments's own comment
// for why the body is split into a fixed number of these rather than one variable-width shape. A
// genuine component (not a bare .map() callback calling hooks directly) so its useDerivedValue calls
// are unconditional and stable across renders per React's own rules of hooks — index/segmentsSV
// never change once mounted, so this itself never needs to re-render at all; only its derived
// values update, purely on the UI thread. `baseOpacity` is this segment's own fully-alive opacity;
// `deathProgress`/`totalDist`/`bandPx` feed fadeFactorForDist above so a dead snake's segments fade
// out in tail-to-head order rather than all at once. `widthScale` (default 1) lets the centerline
// accent reuse the fill layer's own segmentsSV (same paths, already correctly tapered) at a thinner
// stroke width instead of needing its own duplicate segment build — see BELLY_ACCENT_WIDTH_FRACTION.
interface BodySegmentProps {
  segmentsSV: SharedValue<PathSegment[]>
  index: number
  color: string
  baseOpacity: number
  deathProgress: SharedValue<number>
  totalDist: SharedValue<number>
  bandPx: number
  widthScale?: number
}

function BodySegment({ segmentsSV, index, color, baseOpacity, deathProgress, totalDist, bandPx, widthScale }: BodySegmentProps) {
  const path = useDerivedValue(() => segmentsSV.value[index].path)
  const width = useDerivedValue(() => segmentsSV.value[index].width * (widthScale ?? 1))
  const opacity = useDerivedValue(() => baseOpacity * fadeFactorForDist(segmentsSV.value[index].dist, totalDist.value, deathProgress.value, bandPx))
  return <Path path={path} style='stroke' strokeWidth={width} strokeCap='round' strokeJoin='round' color={color} opacity={opacity} />
}

// Fixed-length index list to .map() BodySegment instances from — a stable array reference (a module
// constant, never recreated) so React never sees it as "new" and needlessly remounts anything.
const BODY_SEGMENT_INDICES = Array.from({ length: BODY_SEGMENT_COUNT }, (_, i) => i)

interface SnakeBodyProps {
  snake: SnakeEntity
  cellPx: number
  phase: SharedValue<number>
  tertiaryColor: string
  // The theme's own surface color — the "background" half of the body's own container-tint blend
  // (see bodyFillColor below), same role auto-paper's getColorRoles gives it everywhere else.
  surfaceColor: string
  // The engine's own tick counter and fixed tick duration — both needed purely to drive the glide
  // below (see bodyProgress); nothing else in this component cares which tick it is.
  tick: number
  tickIntervalMs: number
  // Needed only for unwrapDelta (see buildGlideBody/headingAngle/wrapEcho) to know how far past an
  // edge a wrapEdges crossing's raw delta needs correcting back by — not used for anything else
  // here, since every other measurement in this component is already purely pixel/cellPx-based.
  grid: GridSize
}

function SnakeBody({ snake, cellPx, phase, tertiaryColor, surfaceColor, tick, tickIntervalMs, grid }: SnakeBodyProps) {
  const frequency = (2 * Math.PI) / (WAVE_WAVELENGTH_CELLS * cellPx)
  // A dead snake's body no longer undulates — its amplitude stays exactly what a live snake's is
  // (see wavePhase below, which freezes the PHASE instead) so the corpse holds its last-committed
  // S-curve while it fades, rather than either still gently slithering in place (an unfrozen phase)
  // or instantly snapping flat to the raw centerline (a zeroed amplitude — the bug this replaced:
  // the body visibly lost its wave and went ramrod straight the instant the snake died).
  const amplitude = WAVE_AMPLITUDE_RATIO * cellPx
  const rampLength = WAVE_RAMP_CELLS * cellPx
  const deathFadeBandPx = SNAKE_DEATH_FADE_BAND_CELLS * cellPx
  // A small fixed per-snake phase offset (id-based, not random) so two snakes on the same board
  // don't undulate in perfect lockstep — purely cosmetic variety, not called for by the plan but
  // harmless and cheap since it's just an additive constant on the shared driver.
  const phaseOffset = (snake.id - 1) * 1.3

  // The glide: prevBodySV/currBodySV bracket the body's last two tick positions, and bodyProgress
  // animates 0->1 across exactly one tick's duration, linearly (matching the tick loop's own fixed
  // cadence — see constants/snake.ts's "no speed ramp" comment). All three only ever move together,
  // inside the effect below, keyed on `tick` rather than `snake.body` itself so a dead snake (whose
  // body reference stops changing, but whose id keeps ticking alongside a still-alive rival) still
  // settles cleanly rather than being left mid-glide.
  const prevBodySV = useSharedValue<GridCell[]>(snake.body)
  const currBodySV = useSharedValue<GridCell[]>(snake.body)
  const bodyProgress = useSharedValue(1)
  // Mirrors currBodySV.value one commit behind, as a plain ref rather than a second shared value
  // — wrapEcho below needs this exact value at render time (see its own comment), and reading a
  // SharedValue's `.value` synchronously during render is what trips Reanimated's own strict-mode
  // "Reading from `value` during component render" advisory. A plain ref gets a related but purely
  // static warning of its own (eslint-plugin-react-hooks' react-hooks/refs — see wrapEcho's own
  // comment for why that one's suppressed rather than designed around): unlike the Reanimated
  // advisory, which is a genuine runtime UI/JS-thread hazard with no safe opt-out, that rule's
  // general "a ref can change between render attempts" concern doesn't apply to a ref that's only
  // ever written post-commit, inside the tick effect below — kept in lockstep with currBodySV.value
  // at both of that effect's assignment points.
  const lastCommittedBodyRef = useRef(snake.body)

  // The death fade: 0 while alive (or not yet started), animating to 1 once over
  // snakeDeathFadeMs(bodyLength) the instant `alive` flips false — see fadeFactorForDist's own
  // comment for how this drives every segment's tail-to-head opacity. deathAnimStartedRef guards
  // against retriggering the animation on an unrelated re-render once it's already begun (mirrors
  // GameOverFlash's own prevPhaseRef pattern, and LightCycles' identical per-entity death effect).
  const deathProgress = useSharedValue(0)
  const deathAnimStartedRef = useRef(false)
  // The wave's own raw phase input, snapshotted the instant this snake dies — see wavePhase below
  // (inside `paths`), which reads this instead of the live, still-advancing `phase` shared value
  // once dead. Freezing the PHASE (not the amplitude — see `amplitude`'s own comment above) is what
  // lets a corpse hold its last-committed S-curve.
  const deathPhaseSV = useSharedValue(0)

  useEffect(() => {
    if (snake.alive || deathAnimStartedRef.current) return
    deathAnimStartedRef.current = true
    deathPhaseSV.value = phase.value
    deathProgress.value = withTiming(1, { duration: snakeDeathFadeMs(snake.body.length), easing: Easing.linear })
  }, [snake.alive, snake.body.length, deathProgress, phase, deathPhaseSV])

  useEffect(() => {
    if (tick === 0) {
      // A fresh round (retry) reuses this same snake id/component instance rather than remounting
      // it — without this branch, the very next real tick would try to glide clear across the
      // board from wherever last round's body ended up to the new spawn point.
      prevBodySV.value = snake.body
      currBodySV.value = snake.body
      lastCommittedBodyRef.current = snake.body
      bodyProgress.value = 1
      // deathProgress is a stable Reanimated SharedValue ref (like bodyProgress above), not
      // reactive state — same false-positive category TouchInputLayer.tsx's own SharedValue
      // mutations already disable react-hooks/refs for. Resetting it here on retry is what lets a
      // reused snake id/component instance fade again on its next death, instead of staying stuck
      // at progress=1 from the previous round.
      // eslint-disable-next-line react-hooks/immutability -- SharedValue.value mutation, not reactive state; see comment above
      deathProgress.value = 0
      // eslint-disable-next-line react-hooks/immutability -- SharedValue.value mutation, not reactive state; see comment above
      deathPhaseSV.value = 0
      deathAnimStartedRef.current = false
      return
    }
    // A dead snake's body is the exact same array every subsequent tick (tickSnake passes it
    // through untouched) — every OTHER snake's tick still bumps this effect's own `tick` dependency,
    // so without this check a dead snake would restart a pointless (and, worse, wrong — see
    // buildGlideBody's tail-retraction branch, which assumes any non-growing change is a real move)
    // glide every tick for the rest of the round.
    if (snake.body === currBodySV.value) return
    prevBodySV.value = currBodySV.value
    currBodySV.value = snake.body
    lastCommittedBodyRef.current = snake.body
    bodyProgress.value = 0
    bodyProgress.value = withTiming(1, { duration: tickIntervalMs, easing: Easing.linear })
  }, [tick, tickIntervalMs, snake.body, prevBodySV, currBodySV, bodyProgress, deathProgress, deathPhaseSV])

  // Non-null for exactly the one render where a new, just-arrived `snake.body` is a wrapEdges
  // crossing (the same comparison buildGlideBody's own unwrapDelta makes internally, done here in
  // plain JS instead) — the pixel offset an extra, fully-duplicate copy of this snake needs so it
  // reads as sliding in from the OPPOSITE edge while the primary copy (now legitimately drawn
  // slightly outside the canvas for that tick's glide — see unwrapDelta) slides off this one, the
  // classic Asteroids/Pac-Man wraparound look instead of the old snap. A plain computed value
  // rather than state-in-an-effect (which a first cut at this used, and which
  // react-hooks/set-state-in-effect rightly flagged): SnakeBody only ever re-renders when `snake`
  // itself changes (once per tick, from Redux), and lastCommittedBodyRef.current at render time
  // still holds whatever the PREVIOUS tick's effect committed — the tick effect above hasn't run
  // yet for THIS render — so comparing the two here already reads exactly "this tick's move," with
  // no need to stash it in state first. Reads that plain ref rather than currBodySV.value itself —
  // Reanimated's own strict-mode logger flags any `.value` read made synchronously during render,
  // and this computation runs directly in the render body (not inside a worklet or
  // useDerivedValue), so it would otherwise qualify even though the value read is identical either
  // way. Naturally null again on the very next render once the head is no longer jumping (the
  // ordinary case), so the echo is OMITTED from the tree entirely (not just hidden) outside the one
  // tick it's actually needed for.
  const wrapEcho = ((): { dx: number; dy: number } | null => {
    // lastCommittedBodyRef is only ever written post-commit, inside the tick effect above — every
    // render attempt for a given commit observes the same stable value, so the "a ref can change
    // between render attempts" hazard react-hooks/refs otherwise guards against doesn't apply here
    // (see the ref's own declaration comment for why it exists instead of reading currBodySV.value
    // directly).
    // eslint-disable-next-line react-hooks/refs -- ref is only mutated post-commit, safe to read here; see comment above
    if (tick === 0 || snake.body === lastCommittedBodyRef.current) return null
    // eslint-disable-next-line react-hooks/refs -- ref is only mutated post-commit, safe to read here; see comment above
    const oldHead = lastCommittedBodyRef.current[lastCommittedBodyRef.current.length - 1]
    const newHead = snake.body[snake.body.length - 1]
    // eslint-disable-next-line react-hooks/refs -- oldHead is derived from the ref read above, same false positive
    const rawDx = newHead.x - oldHead.x
    // eslint-disable-next-line react-hooks/refs -- oldHead is derived from the ref read above, same false positive
    const rawDy = newHead.y - oldHead.y
    // Sign comes from the UNWRAPPED delta (the real step direction), not the raw one — a wrap's
    // raw delta always swings to the opposite extreme of the actual step (e.g. a genuine +1
    // rightward step reads as a huge -19 raw delta on a 20-wide grid), so building the echo's
    // offset straight off the raw sign would shift it the wrong way entirely.
    if (Math.abs(rawDx) > MAX_STEPS_PER_TICK) return { dx: -Math.sign(unwrapDelta(rawDx, grid.cols)) * grid.cols * cellPx, dy: 0 }
    if (Math.abs(rawDy) > MAX_STEPS_PER_TICK) return { dx: 0, dy: -Math.sign(unwrapDelta(rawDy, grid.rows)) * grid.rows * cellPx }
    return null
  })()

  // Ties the wave's own temporal speed to the snake's actual forward pace rather than the fixed,
  // independent WAVE_SPEED constant useContinuousPhase's driver runs at (that constant is tuned for
  // the food dot's own slow ambient pulse instead — see FoodDot). Scaled so the pattern completes
  // exactly one cycle for every WAVE_WAVELENGTH_CELLS the snake travels — i.e. the same pace the
  // snake is visibly advancing at, not drifting slower/faster underneath it. Multiplying the shared
  // driver rather than replacing it keeps both perfectly correlated off the one clock, no separate
  // timer to desync.
  const forwardCellsPerSecond = 1000 / tickIntervalMs
  const bodyWaveSpeed = (2 * Math.PI * forwardCellsPerSecond) / WAVE_WAVELENGTH_CELLS
  const wavePhaseScale = bodyWaveSpeed / WAVE_SPEED

  // Re-evaluated every frame off bodyProgress.value — the one shared source both `paths` (the
  // undulating body/belly) and the head marker below derive their positions from, so the two never
  // drift apart mid-glide. Inlines cellCenter's own pixel math rather than calling it directly —
  // that helper isn't a 'worklet', so calling it from here would work by accident on web (no real
  // UI-thread boundary there) but throw on native, where worklets can't call plain JS functions.
  const interpolatedCenters = useDerivedValue(() => {
    const floatBody = buildGlideBody(prevBodySV.value, currBodySV.value, bodyProgress.value, grid)
    return floatBody.map((cell) => ({ x: cell.x * cellPx + cellPx / 2, y: cell.y * cellPx + cellPx / 2 }))
  })

  const paths = useDerivedValue(() => {
    const centers = interpolatedCenters.value
    const sampleSet = buildCenterlineSamples(centers, cellPx)
    // Alive: ride the live, still-advancing `phase` shared value like every other snake's wave.
    // Dead: hold at deathPhaseSV's own snapshot instead — otherwise the phase (which keeps
    // advancing for the whole board regardless of any one snake's state) would keep sliding the
    // sine underneath a corpse's now-static centers, reading as it gently slithering in place.
    const wavePhase = (snake.alive ? phase.value : deathPhaseSV.value) * wavePhaseScale + phaseOffset
    const total = sampleSet.length > 0 ? sampleSet[sampleSet.length - 1].dist : 0
    // Growing (see buildGlideBody's own growing branch) keeps every existing point fixed in place,
    // but `total` itself still climbs continuously over the whole tick as the new head segment
    // extends out — and since the neck taper + wave ramp are both measured *from the head*
    // (distFromHead = total - dist), every point within reach of either recomputes against that
    // climbing total the whole time, even though it never actually moved: a fixed point one cell
    // behind the head widens by roughly 40% over a single growth tick, and the wave ramp shifts
    // with it — the established body visibly "reconfiguring" the instant its length changes,
    // worse the more a turn happens to sit in the reflowing stretch. Freezing the reference these
    // two measure against at the PRE-growth body's own length — exactly (N-1)*cellPx, since grid
    // steps are always exactly one cell apart, wrapEdges seams included (see buildCenterlineSamples'
    // own seam handling) — keeps the established body looking exactly as it did the instant before
    // eating; only the newly-growing bit (now past that frozen reference) reads as a bare, wave-
    // less neck stub (see buildGrowthStubSegment) until it's folded into the settled body on the
    // NEXT tick, when this all recomputes fresh against the new, longer total. Matches the classic
    // "grows at the neck, body doesn't reflow" look rather than the whole taper rescaling live.
    const isGrowing = currBodySV.value.length > prevBodySV.value.length
    const referenceTotal = isGrowing ? (prevBodySV.value.length - 1) * cellPx : total
    const points = offsetSamplesForWave(sampleSet, wavePhase, frequency, amplitude, rampLength, referenceTotal)
    const outlineSegments = buildBodySegments(points, sampleSet, cellPx, true, referenceTotal)
    const fillSegments = buildBodySegments(points, sampleSet, cellPx, false, referenceTotal)
    const outlineStub = buildGrowthStubSegment(points, sampleSet, cellPx, true, referenceTotal)
    const fillStub = buildGrowthStubSegment(points, sampleSet, cellPx, false, referenceTotal)
    return { outlineSegments, fillSegments, outlineStub, fillStub, total }
  })
  const outlineSegmentsSV = useDerivedValue(() => paths.value.outlineSegments)
  const fillSegmentsSV = useDerivedValue(() => paths.value.fillSegments)
  const outlineStubSV = useDerivedValue(() => [paths.value.outlineStub])
  const fillStubSV = useDerivedValue(() => [paths.value.fillStub])
  // The body's own total arc length (tail to head) this frame — the death fade's tail-to-head sweep
  // (see fadeFactorForDist) needs this both per-segment (via BodySegment's own totalDist prop) and
  // once more for the head/eyes below, which sit at exactly `dist = total`.
  const totalDistSV = useDerivedValue(() => paths.value.total)

  // Step 7 — the head: a triangle facing headAngle (see that function's own comment), unaffected by
  // the wave offset above, drawn on top so it stays legible regardless of how the body behind it
  // undulates. Filled with the snake's own full, vivid color — unblended, unlike the body's own
  // muted fill below — so the head reads as the "business end" rather than blending into the body.
  const headX = useDerivedValue(() => interpolatedCenters.value[interpolatedCenters.value.length - 1].x)
  const headY = useDerivedValue(() => interpolatedCenters.value[interpolatedCenters.value.length - 1].y)
  const headAngle = useDerivedValue(() => headingAngle(prevBodySV.value, currBodySV.value, bodyProgress.value, snake.direction, grid))

  // The head's own size — starts at HEAD_START_SCALE and animates up to full size (1) over the
  // first HEAD_GROWTH_APPLES points scored, then holds — see headScaleForScore's own comment. A
  // slight overshoot easing (Easing.back) on the way up reads as a little satisfied "growth pop"
  // each time it bumps up a notch, rather than a flat linear resize.
  const headScale = useSharedValue(headScaleForScore(snake.score))
  useEffect(() => {
    headScale.value = withTiming(headScaleForScore(snake.score), { duration: HEAD_GROWTH_ANIM_MS, easing: Easing.out(Easing.back(1.5)) })
  }, [snake.score, headScale])

  const headPath = useDerivedValue(() => buildHeadPath(headX.value, headY.value, headAngle.value, cellPx * headScale.value))
  const headAccentPath = useDerivedValue(() => buildHeadAccentPath(headX.value, headY.value, headAngle.value, cellPx * headScale.value))
  // The head sits at exactly `dist = total` on the centerline — mathematically the very last point
  // the tail-to-head sweep reaches, so feeding fadeFactorForDist(total, total, ...) here fades the
  // head (and its eyes) out right as the rest of the body finishes disappearing, rather than the
  // instant `alive` flips as it used to.
  const headOpacity = useDerivedValue(() => fadeFactorForDist(totalDistSV.value, totalDistSV.value, deathProgress.value, deathFadeBandPx))
  const headAccentOpacity = useDerivedValue(() => 0.9 * headOpacity.value)
  // The body's own fill: auto-paper's standard "container" tint (mostly the theme's own surface
  // color, with just a hint of the snake's hue mixed in — see getColorRoles, the same helper the
  // rest of this app's own tonal-container UI already uses) rather than the snake's full color.
  // Paired with a thin full-color outline drawn just underneath it (see bodyOutlineWidth/
  // bodyFillWidth below) so the vivid color reads as an accent ring around a soft body rather than
  // covering it entirely — the same vivid/muted split the head/body pairing above uses.
  const bodyFillColor = useMemo(() => getColorRoles(snake.color, surfaceColor).container, [snake.color, surfaceColor])

  // Eyes: two small dots forward of center, offset either side of the heading — see
  // projectFromHead's own `side` param, which already handles the left/right split.
  const eyeCenters = useDerivedValue(() => {
    const headCellPx = cellPx * headScale.value
    return {
      left: projectFromHead(headX.value, headY.value, headAngle.value, EYE_FORWARD_RATIO * headCellPx, EYE_SIDE_RATIO * headCellPx),
      right: projectFromHead(headX.value, headY.value, headAngle.value, EYE_FORWARD_RATIO * headCellPx, -EYE_SIDE_RATIO * headCellPx)
    }
  })
  const eyeLeftX = useDerivedValue(() => eyeCenters.value.left.x)
  const eyeLeftY = useDerivedValue(() => eyeCenters.value.left.y)
  const eyeRightX = useDerivedValue(() => eyeCenters.value.right.x)
  const eyeRightY = useDerivedValue(() => eyeCenters.value.right.y)
  // A dead snake's eyes swap to an X at each of the same eyeCenters positions — see
  // buildDeadEyesPath's own comment.
  const deadEyesPath = useDerivedValue(() => buildDeadEyesPath(eyeCenters.value.left.x, eyeCenters.value.left.y, eyeCenters.value.right.x, eyeCenters.value.right.y, headAngle.value, EYE_X_ARM_RATIO * cellPx * headScale.value))
  const eyeXStrokeWidth = useDerivedValue(() => EYE_X_STROKE_WIDTH_RATIO * cellPx * headScale.value)

  // The occasional tongue flick — a per-snake JS-thread timer (not the shared, continuously-cycling
  // `phase` driver every other animation on this board rides) since it's a one-off event with its
  // own randomized cadence rather than a continuous cycle. Stops rescheduling the moment the snake
  // dies (a dead snake never flicks again — the cleanup below also cancels any flick already queued
  // up for the instant this snake's `alive` flips).
  const tongueProgress = useSharedValue(0)
  useEffect(() => {
    if (!snake.alive) return undefined
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>
    const scheduleFlick = () => {
      const delay = TONGUE_FLICK_MIN_MS + Math.random() * (TONGUE_FLICK_MAX_MS - TONGUE_FLICK_MIN_MS)
      timeoutId = setTimeout(() => {
        if (cancelled) return
        tongueProgress.value = withSequence(withTiming(1, { duration: TONGUE_OUT_MS, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: TONGUE_HOLD_MS }), withTiming(0, { duration: TONGUE_BACK_MS, easing: Easing.in(Easing.quad) }))
        scheduleFlick()
      }, delay)
    }
    scheduleFlick()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [snake.alive, tongueProgress])
  const tonguePath = useDerivedValue(() => buildTonguePath(headX.value, headY.value, headAngle.value, cellPx * headScale.value, tongueProgress.value))

  // All three read headScale.value every frame too, alongside the shapes above — otherwise the
  // stroke widths would snap straight to their final size instead of animating in step with the
  // path they're drawn on.
  const eyeRadius = useDerivedValue(() => EYE_RADIUS_RATIO * cellPx * headScale.value)
  const eyeOutlineWidth = useDerivedValue(() => EYE_OUTLINE_STROKE_WIDTH_RATIO * cellPx * headScale.value)
  const tongueWidth = useDerivedValue(() => TONGUE_WIDTH_RATIO * cellPx * headScale.value)
  // Fully-alive opacity for the body layer — the death fade itself (see BodySegment's own opacity
  // derivation) now carries the entire dead-state visual, so this is no longer a snake.alive-gated
  // dim/bright pair the way it used to be.
  const bodyBaseOpacity = 1

  // Head-effect tell rings — up to three independent, concentric stroked circles (one per
  // PlayerEffects axis: speed/control/shield), keyed on `snake.effects` itself rather than
  // animated via a worklet the way the head shape is: effects only ever change once per whole
  // tick (a JS-thread state update), never mid-frame, so a plain render-time read is exactly as
  // responsive here as a shared value would be, with far less machinery. Colored per the specific
  // type driving each axis (see SNAKE_POWERUP_EFFECT_COLORS' own comment on why Sidewind and
  // Frenzy — same 2x multiplier, opposite "who benefits" framing — need visually distinct
  // colors, not just one generic "boosted" ring) so a player can tell "I did this to myself" from
  // "my opponent did this to me" at a glance, same as the held-item HUD badge does once collected.
  const speedRingColor = snake.effects.speed ? SNAKE_POWERUP_EFFECT_COLORS[snake.effects.speed.type] : null
  const controlRingColor = snake.effects.control ? SNAKE_POWERUP_EFFECT_COLORS[snake.effects.control.type] : null
  const shieldRingColor = snake.effects.shield ? SNAKE_POWERUP_EFFECT_COLORS.scales : null
  const speedRingRadius = useDerivedValue(() => cellPx * headScale.value * 0.95)
  const controlRingRadius = useDerivedValue(() => cellPx * headScale.value * 1.15)
  const shieldRingRadius = useDerivedValue(() => cellPx * headScale.value * 1.35)

  // Everything this snake draws, as one reusable element tree — rendered once normally, and a
  // second time (unchanged, just translated) inside the wrapEcho Group below during the one tick
  // a wrapEdges crossing is animating through. Rendering the exact same elements twice like this is
  // safe: each occurrence sits under its own parent (this fragment vs. the Group), so the `key`s
  // inside only need to stay unique within THEIR OWN copy, not globally.
  const bodyContent = (
    <>
      {/* Body — BODY_SEGMENT_COUNT constant-width stroke segments per layer (see buildBodySegments),
      not one variable-width shape: the wider, vivid outline layer drawn first, then the narrower
      container-fill layer on top of it, leaving a thin ring of the outline color showing around the
      fill everywhere along the body's own varying width. */}
      {BODY_SEGMENT_INDICES.map((i) => (
        <BodySegment key={`outline-${i}`} segmentsSV={outlineSegmentsSV} index={i} color={snake.color} baseOpacity={bodyBaseOpacity} deathProgress={deathProgress} totalDist={totalDistSV} bandPx={deathFadeBandPx} />
      ))}
      {BODY_SEGMENT_INDICES.map((i) => (
        <BodySegment key={`fill-${i}`} segmentsSV={fillSegmentsSV} index={i} color={bodyFillColor} baseOpacity={bodyBaseOpacity} deathProgress={deathProgress} totalDist={totalDistSV} bandPx={deathFadeBandPx} />
      ))}
      {/* Step 5b — the growth stub (see buildGrowthStubSegment): empty, and so invisible, outside a
      growth tick. Drawn right after the main layers it shares a color/width convention with. */}
      <BodySegment segmentsSV={outlineStubSV} index={0} color={snake.color} baseOpacity={bodyBaseOpacity} deathProgress={deathProgress} totalDist={totalDistSV} bandPx={deathFadeBandPx} />
      <BodySegment segmentsSV={fillStubSV} index={0} color={bodyFillColor} baseOpacity={bodyBaseOpacity} deathProgress={deathProgress} totalDist={totalDistSV} bandPx={deathFadeBandPx} />
      {/* Step 6 — centerline accent: a thin theme-tertiary line traced right over the fill layer's
      own already-tapered, already-undulating segments (just narrower, see
      BELLY_ACCENT_WIDTH_FRACTION), rather than a second duplicate segment build — same technique
      HeroSnakeTrailCanvas.tsx's own centerline accent uses. */}
      {BODY_SEGMENT_INDICES.map((i) => (
        <BodySegment key={`accent-${i}`} segmentsSV={fillSegmentsSV} index={i} color={tertiaryColor} baseOpacity={BELLY_ACCENT_OPACITY} deathProgress={deathProgress} totalDist={totalDistSV} bandPx={deathFadeBandPx} widthScale={BELLY_ACCENT_WIDTH_FRACTION} />
      ))}
      <BodySegment segmentsSV={fillStubSV} index={0} color={tertiaryColor} baseOpacity={BELLY_ACCENT_OPACITY} deathProgress={deathProgress} totalDist={totalDistSV} bandPx={deathFadeBandPx} widthScale={BELLY_ACCENT_WIDTH_FRACTION} />
      {/* The head/eyes/accent used to vanish the instant snake.alive went false — now they stay
      drawn and fade via headOpacity (see that derivation's own comment: the head sits at the very
      end of the tail-to-head sweep, so it's the last thing to disappear, right as the fade
      completes). Eyes swap from the two live circles to buildDeadEyesPath's X the instant the
      snake dies, riding the same headOpacity fade out. The tongue is the one exception — gated
      strictly on snake.alive, so it vanishes instantly on death rather than fading. */}
      <Path path={headPath} color={snake.color} opacity={headOpacity} />
      <Path path={headAccentPath} color={tertiaryColor} opacity={headAccentOpacity} />
      {snake.alive ? (
        <>
          <Circle cx={eyeLeftX} cy={eyeLeftY} r={eyeRadius} color={EYE_COLOR} />
          <Circle cx={eyeLeftX} cy={eyeLeftY} r={eyeRadius} style='stroke' strokeWidth={eyeOutlineWidth} color={snake.color} />
          <Circle cx={eyeRightX} cy={eyeRightY} r={eyeRadius} color={EYE_COLOR} />
          <Circle cx={eyeRightX} cy={eyeRightY} r={eyeRadius} style='stroke' strokeWidth={eyeOutlineWidth} color={snake.color} />
        </>
      ) : (
        <Path path={deadEyesPath} style='stroke' strokeWidth={eyeXStrokeWidth} strokeCap='round' color={EYE_COLOR} opacity={headOpacity} />
      )}
      {/* Tongue drawn last so it sits on top of the head's own fill/outline (and the body,
      drawn even earlier) with no seam — a lower z-order let the outline ring cut a visible gap
      right where the tongue meets the nose. */}
      {snake.alive && <Path path={tonguePath} style='stroke' strokeWidth={tongueWidth} strokeCap='round' color={TONGUE_COLOR} />}
      {/* Effect tell rings drawn last of all, on top of everything else about this snake, so an
      active effect is never visually buried under the head/tongue. Each is independent — a snake
      can be, say, both Frenzied and Scaled at once, and both rings show simultaneously. */}
      {speedRingColor && <Circle cx={headX} cy={headY} r={speedRingRadius} style='stroke' strokeWidth={2} color={speedRingColor} opacity={headOpacity} />}
      {controlRingColor && <Circle cx={headX} cy={headY} r={controlRingRadius} style='stroke' strokeWidth={2} color={controlRingColor} opacity={headOpacity} />}
      {shieldRingColor && <Circle cx={headX} cy={headY} r={shieldRingRadius} style='stroke' strokeWidth={2} color={shieldRingColor} opacity={headOpacity} />}
    </>
  )

  // wrapEcho (see its own declaration above) is only ever non-null for the single tick a wrapEdges
  // crossing is animating through — buildGlideBody's own unwrapDelta already lets the primary copy
  // above glide legitimately just outside [0, grid.cols/rows) instead of snapping, so the canvas
  // (sized to exactly grid.cols*cellPx by grid.rows*cellPx — see game.tsx's designWidth/designHeight)
  // already clips that overhang into a natural "sliding off the edge" look on its own. This second,
  // translated copy is what completes the illusion: shifted by one whole grid dimension, it's the
  // same snake re-drawn on the OPPOSITE side, so the same overhanging bit that got clipped off the
  // primary copy is exactly what's now poking INTO the canvas here — the classic wraparound-screen
  // "exits one edge, enters the other" look, not the old instant snap. Every other, non-wrapping
  // tick this stays unmounted entirely (not just hidden), so there's no ongoing cost to it.
  if (!wrapEcho) return bodyContent
  return (
    <>
      {bodyContent}
      <Group transform={[{ translateX: wrapEcho.dx }, { translateY: wrapEcho.dy }]}>{bodyContent}</Group>
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

// Ported from LightCycles' identical wallPath — each snake "owns" the half of the perimeter behind
// its own zone, the same top/bottom or left/right split TouchInputLayer.tsx already uses for input
// zones (and OnboardingOverlay.tsx for its own player-zone overlay) — so the wall reads as which
// snake crashes into which edge, not just an arbitrary boundary. Drawn at the grid's own pixel size
// (cols/rows * cellPx), not the container's — see computeGridSize's flooring, and now
// MAX_BOARD_CONTENT_WIDTH's own gutter, both of which can leave a container larger than a whole
// number of cells — the outline has to hug the real crash boundary, not the container's.
function wallPath(grid: GridSize, cellPx: number, orientationMode: OrientationMode, p1OnRight: boolean, snakeId: SnakeId): SkPath {
  const width = grid.cols * cellPx
  const height = grid.rows * cellPx
  const path = Skia.Path.Make()

  if (orientationMode === 'faceToFace') {
    // Snake 2 is the "far" (top) zone, snake 1 the "near" (bottom) zone — same convention
    // TouchInputLayer's own snake1ZoneStyle/snake2ZoneStyle use.
    const midY = height / 2
    if (snakeId === 2) {
      path.moveTo(0, midY)
      path.lineTo(0, 0)
      path.lineTo(width, 0)
      path.lineTo(width, midY)
    } else {
      path.moveTo(0, midY)
      path.lineTo(0, height)
      path.lineTo(width, height)
      path.lineTo(width, midY)
    }
    return path
  }

  // Side-by-side: whichever snake is currently on the right gets the right zone — see
  // useOrientationState for which physical rotation direction puts snake 1 there, and
  // TouchInputLayer.tsx's identical split.
  const onRight = snakeId === 1 ? p1OnRight : !p1OnRight
  const midX = width / 2
  if (!onRight) {
    path.moveTo(midX, 0)
    path.lineTo(0, 0)
    path.lineTo(0, height)
    path.lineTo(midX, height)
  } else {
    path.moveTo(midX, 0)
    path.lineTo(width, 0)
    path.lineTo(width, height)
    path.lineTo(midX, height)
  }
  return path
}

// Marks the grid's own actual pixel bounds — without this, there's no way to see where a fatal edge
// actually is until you've already crashed into it. Two-snake modes split the outline by physical
// zone via wallPath above, each half in that snake's own snake.color — mirroring LightCycles'
// identical Walls (down to "whose wall is whose" being visible at a glance), just sourced from each
// snake's own identity color instead of the theme's primary/secondary roles: unlike LightCycles
// (whose two "player colors" ARE literally themeColors.primary/secondary, see game.tsx there —
// there's no separate identity system to prefer instead), Snake already colors everything else
// about a snake — body and head — by its own snake.color, so the wall matches that
// existing convention rather than introducing a theme-role-based exception just for itself. Solo has
// no second snake to split against, so it's just the one snake's own color around the whole
// perimeter — same "this is your wall" reading, there's just only one snake for it to belong to.
// Hidden entirely under wrapEdges, same reasoning as LightCycles — an edge that wraps instead of
// killing isn't a wall, so there's nothing true left for an outline to mark. Also hidden during
// onboarding, same reasoning and same outcome as LightCycles' identical check, just sourced
// differently — see SnakeBoardProps' own comment on why `onboarding` has to be a separate prop here
// instead of reading straight off `phase`: the boundary marker is only meaningful once a round is
// actually live, and it visually clutters the countdown's own player-zone overlay
// (OnboardingOverlay.tsx).
function Walls({ snakes, grid, cellPx, wrapEdges, onboarding }: { snakes: SnakeEntity[]; grid: GridSize; cellPx: number; wrapEdges: boolean; onboarding: boolean }) {
  // Live, not frozen — unlike LightCycles' board (always fixed 'faceToFace', see that app's own
  // GameScreen comment on why), Snake's genuinely supports side-by-side too and already re-renders
  // this subtree live on every tilt sample via TouchInputLayer's own identical subscription (see
  // that file's own header comment), so reading it here again doesn't introduce any new re-render
  // cost this board wasn't already paying.
  const { orientationMode, p1OnRight } = useOrientationState()
  if (wrapEdges || onboarding) return null

  const snake1 = snakes.find((s) => s.id === 1)
  const snake2 = snakes.find((s) => s.id === 2)
  if (!snake1) return null

  if (!snake2) {
    return <Rect x={0} y={0} width={grid.cols * cellPx} height={grid.rows * cellPx} style='stroke' strokeWidth={WALL_STROKE_WIDTH} color={snake1.color} />
  }

  return (
    <>
      <Path path={wallPath(grid, cellPx, orientationMode, p1OnRight, 1)} style='stroke' strokeWidth={WALL_STROKE_WIDTH} color={snake1.color} />
      <Path path={wallPath(grid, cellPx, orientationMode, p1OnRight, 2)} style='stroke' strokeWidth={WALL_STROKE_WIDTH} color={snake2.color} />
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

// Obstacles — a static filled block per cell (see utils/arenas.ts's buildArenaObstacles), the
// 'pillars'/'gauntlet' arena variants' only visual. Purely static, unlike every other board feature
// here — these never move or change for the life of a round, so there's nothing to animate. Renders
// via @tastic/sprites' shared ObstacleRect (reconciled from BoxHockey/AirHockey's plain-fill Rect and
// LightCycles' own fill-plus-stroke GameBoard.tsx ObstacleCell) — Snake passes no strokeColor, so this
// renders exactly the same single opaque Rect at 0.85 opacity Snake always has, no outline added.
function Obstacles({ obstacles, cellPx, color }: { obstacles: GridCell[]; cellPx: number; color: string }) {
  return (
    <>
      {obstacles.map((cell) => {
        const { x, y } = cellToPixel(cell, cellPx)
        return <ObstacleRect key={`${x},${y}`} x={x} y={y} width={cellPx} height={cellPx} color={color} opacity={0.85} />
      })}
    </>
  )
}

// Portals — a stroked ring at each mouth of every pair (see utils/arenas.ts's buildArenaPortals and
// types/index.ts's SnakePortal), both ends of a pair sharing one color so the linkage reads
// visually even with no line literally connecting them across the board.
const PORTAL_RING_RADIUS_RATIO = 0.38

function Portals({ portals, cellPx, color }: { portals: SnakePortal[]; cellPx: number; color: string }) {
  return (
    <>
      {portals.map(({ a, b }, i) => {
        const centerA = cellCenter(a, cellPx)
        const centerB = cellCenter(b, cellPx)
        const radius = cellPx * PORTAL_RING_RADIUS_RATIO
        return (
          <Fragment key={i}>
            <Circle cx={centerA.x} cy={centerA.y} r={radius} style='stroke' strokeWidth={2} color={color} />
            <Circle cx={centerB.x} cy={centerB.y} r={radius} style='stroke' strokeWidth={2} color={color} />
          </Fragment>
        )
      })}
    </>
  )
}

// Tunnels — Snake's own adapted 'underpass' arena (see types/index.ts's SnakeTunnel comment for how
// its collision semantics differ from LightCycles'): a translucent corridor highlight along the
// whole run, plus a ring at each mouth so a player can see where to enter. Always a single straight
// run along Snake's one split axis in practice (see utils/arenas.ts's buildTunnel), so unlike
// LightCycles' own tunnel rendering, no horizontal/vertical branch is needed here.
const TUNNEL_RUNWAY_WIDTH_RATIO = 0.5
const TUNNEL_MOUTH_RADIUS_RATIO = 0.35

function Tunnels({ tunnels, cellPx, color }: { tunnels: SnakeTunnel[]; cellPx: number; color: string }) {
  return (
    <>
      {tunnels.map((tunnel, i) => {
        if (tunnel.cells.length === 0) return null
        const first = tunnel.cells[0]
        const last = tunnel.cells[tunnel.cells.length - 1]
        const topCell = first.y <= last.y ? first : last
        const topLeft = cellToPixel(topCell, cellPx)
        const mouthA = cellCenter(first, cellPx)
        const mouthB = cellCenter(last, cellPx)
        const runwayWidth = cellPx * TUNNEL_RUNWAY_WIDTH_RATIO
        const runwayHeight = Math.abs(last.y - first.y) * cellPx + cellPx
        return (
          <Fragment key={i}>
            <Rect x={topLeft.x + (cellPx - runwayWidth) / 2} y={topLeft.y} width={runwayWidth} height={runwayHeight} color={color} opacity={0.25} />
            <Circle cx={mouthA.x} cy={mouthA.y} r={cellPx * TUNNEL_MOUTH_RADIUS_RATIO} style='stroke' strokeWidth={2} color={color} />
            <Circle cx={mouthB.x} cy={mouthB.y} r={cellPx * TUNNEL_MOUTH_RADIUS_RATIO} style='stroke' strokeWidth={2} color={color} />
          </Fragment>
        )
      })}
    </>
  )
}

// Pickups — styled after FoodDot above (the same shared `phase` pulse driver, the same filled-core-
// plus-stroked-outline shape) for visual consistency with the rest of this board, rather than
// LightCycles' own separate spawn-fade+pulse system, which has no equivalent driver here. Every
// live pickup renders identically regardless of type — mystery-box style, matching
// SnakePowerupPickup's own comment — the type is only ever revealed once collected, in the
// holder's own HUD badge (see SnakePowerupHud.tsx).
interface PickupGlyphProps {
  pickup: SnakePowerupPickup
  cellPx: number
  phase: SharedValue<number>
  color: string
}

function PickupGlyph({ pickup, cellPx, phase, color }: PickupGlyphProps) {
  const center = cellCenter(pickup.cell, cellPx)
  const baseRadius = cellPx * SNAKE_POWERUP_PICKUP_RADIUS_RATIO
  const radius = useDerivedValue(() => baseRadius * (1 + 0.18 * Math.sin(phase.value * 2.1)))
  const strokeOpacity = useDerivedValue(() => 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(phase.value * 2.1)))

  return (
    <>
      <Circle cx={center.x} cy={center.y} r={radius} color={color} />
      <Circle cx={center.x} cy={center.y} r={radius} style='stroke' strokeWidth={1.5} color='#FFFFFF' opacity={strokeOpacity} />
    </>
  )
}

function Pickups({ pickups, cellPx, phase, color }: { pickups: SnakePowerupPickup[]; cellPx: number; phase: SharedValue<number>; color: string }) {
  return (
    <>
      {pickups.map((pickup) => (
        <PickupGlyph key={pickup.id} pickup={pickup} cellPx={cellPx} phase={phase} color={color} />
      ))}
    </>
  )
}

// The board's own accent color for food — theme primary/secondary are now live P1/P2 seat colors
// (see loadout.tsx's own theme-bridge effect), so food reads through tertiary instead: the same
// third color, maximally distinct from both seats', that every snake's own centerline accent below
// already uses (see SnakeBody) — a neutral role, not either player's own. Obstacles/tunnels share
// the theme's outline role (a neutral, structural tone — distinguished from each other by shape, not
// color); portals and pickups each get their own distinct accent (secondaryContainer, secondary) so
// all four board features stay visually distinguishable from one another and from food/snakes.
// First-pass color choices — verify visually against the app's actual light/dark palettes.
export function SnakeBoard({ snakes, food, obstacles, portals, tunnels, pickups, phase, cellPx, grid, tick, tickIntervalMs, wrapEdges, onboarding }: SnakeBoardProps) {
  const { colors } = useAutoPaperTheme()
  const phaseDriver = useContinuousPhase()

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Walls snakes={snakes} grid={grid} cellPx={cellPx} wrapEdges={wrapEdges} onboarding={onboarding} />
      <Obstacles obstacles={obstacles} cellPx={cellPx} color={colors.outline} />
      <Tunnels tunnels={tunnels} cellPx={cellPx} color={colors.outline} />
      <Portals portals={portals} cellPx={cellPx} color={colors.secondaryContainer} />
      <FoodDot food={food} cellPx={cellPx} phase={phaseDriver} color={colors.tertiary} />
      <Pickups pickups={pickups} cellPx={cellPx} phase={phaseDriver} color={colors.secondary} />
      {snakes.map((snake) => (
        <SnakeBody key={snake.id} snake={snake} cellPx={cellPx} phase={phaseDriver} tertiaryColor={colors.tertiary} surfaceColor={colors.surface} tick={tick} tickIntervalMs={tickIntervalMs} grid={grid} />
      ))}
      <GameOverFlash phase={phase} grid={grid} cellPx={cellPx} />
    </Canvas>
  )
}
