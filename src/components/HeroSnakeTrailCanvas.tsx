// The home screen's forever-looping snake, chasing itself around the "SNAKE" wordmark. Mechanism
// ported from LightCycles' HeroTitleTrails.tsx (a Skia Path measured once via
// Skia.ContourMeasureIter, traced forever by a Reanimated `t` shared value via
// contour.getPosTan(t * length)) — but skinned with Snake's own actual in-game look: the real
// head silhouette (see SnakeBoardCanvas.tsx's buildHeadPath — same ratios, ported rather than
// imported since the two components have no shared module for it), its nested-smaller-copy
// accent, the same vivid-outline/muted-container double-layer fill the body uses, a thin
// centerline accent continuing SnakeBoardCanvas.tsx's own belly-stripe motif (traced as a single
// unbroken line here rather than that file's dashes — see TRAIL_ACCENT_OPACITY's own comment for
// why), solid (not theme-contrast) black eyes, a tapered neck/tail, an undulating slither, and an
// occasional tongue flick — the same
// five things SnakeBoardCanvas.tsx's own body/head rendering does, adapted from that file's
// discrete grid-cell model onto this loop's continuous parametric contour: rather than densifying
// grid-cell centers and central-differencing a tangent at each (buildCenterlineSamples), this
// samples the contour directly via getPosTan, which hands back an exact position AND unit tangent
// at any arc-length distance for free — no densification or differencing needed.
import { getColorRoles } from '@rific/auto-paper'
import { Canvas, Circle, Path, type SkContourMeasure, Skia, type SkPath, vec } from '@shopify/react-native-skia'
import { useEffect, useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { Easing, type SharedValue, useAnimatedReaction, useDerivedValue, useFrameCallback, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'

import { HERO_CANVAS_PAD, HERO_TRAIL_CORNER_RADIUS, HERO_TRAIL_MARGIN_BOTTOM, HERO_TRAIL_MARGIN_SIDE, HERO_TRAIL_MARGIN_TOP, WordBox } from './heroSnakeGeometry'

export interface HeroSnakeTrailProps {
  box: WordBox
  color: string
  // The theme's own surface color (SnakeBoardCanvas.tsx's identical surfaceColor prop, same role) —
  // NOT index.tsx's literal black/white `bg`: that reads as the correct "what's really behind this"
  // color for a body glued to the page, but it's too extreme an anchor for a container-tint blend
  // (see getColorRoles) — in dark mode it's literal #000000, so a 15%-toward-it blend crushes to a
  // near-invisible smudge instead of the recognizable dark tint the same blend produces against the
  // theme's own softer dark surface. HeroTitle.tsx passes colors.surface here for exactly this reason.
  surfaceColor: string
  // Feeds both the centerline accent line and the head's own accent badge, both used raw (no
  // container tint) — the same theme.tertiary role SnakeBoardCanvas.tsx's own centerline accent/head
  // accent use, so the one bit of "in-game" color this loop shows beyond its own vivid hue still
  // traces back to the real palette.
  tertiaryColor: string
  active: boolean
  // Delays the loop's own clock to start exactly when it becomes visible (HeroTitle fades this
  // whole layer in well after mount). Without this, the clock — and the "grows from nothing" first
  // lap below — would run its course invisibly before anyone ever sees it start.
  startDelayMs: number
}

const TRAIL_STROKE_WIDTH = 6
// SnakeBoardCanvas's own head-to-body proportions: there, a fully grown head's own unit is cellPx,
// while the body's own max WIDTH (not half-width) is 2 * BODY_MAX_HALF_WIDTH_RATIO(0.29) * cellPx =
// 0.58 * cellPx — so the head reads 1/0.58 times wider than the body's own plateau. Applying that
// same ratio here, against TRAIL_STROKE_WIDTH standing in for "the body's own max width," is what
// makes the head read at the same proportions relative to the body as the real in-game snake.
const HEAD_UNIT = TRAIL_STROKE_WIDTH / 0.58
// The vivid outline layer is TRAIL_STROKE_WIDTH (at the body's widest); the muted container-fill
// layer drawn on top of it is this much narrower per side — same BODY_OUTLINE_THICKNESS_RATIO
// SnakeBoardCanvas.tsx uses against cellPx, applied here against HEAD_UNIT instead — leaving the
// same thin ring of vivid color showing around the fill that the real body has, at every point
// along the taper (see trailHalfWidthAt below), not just at the plateau width.
const BODY_OUTLINE_THICKNESS_RATIO = 0.08
const EYE_RADIUS = HEAD_UNIT * 0.11
const EYE_COLOR = '#000000'
// A settled (non-animating) loop reads at a dimmed opacity, same role STATIC_TRAIL_OPACITY plays
// in HeroTitleTrails.
const STATIC_OPACITY = 0.5
// Trail length as a fraction of the loop's own measured perimeter — long enough to read as a body,
// short enough that the loop is never fully covered (so the "growing in" first lap is visible).
const TRAIL_LENGTH_FRACTION = 0.3
const LAP_DURATION_MS = 4200

// Body taper — SnakeBoardCanvas.tsx's own bodyHalfWidthAt, ported onto this loop's own HEAD_UNIT
// (its "cellPx" equivalent) rather than a grid cell size: the neck tapers down to a non-zero
// minimum (still a visible tube feeding the head), the tail tapers all the way to a point. Same
// ratios as that file so the two read as the same "species" of snake, just scaled to this loop's
// own fixed plateau width rather than a board's variable cellPx.
const TRAIL_MAX_HALF_WIDTH = TRAIL_STROKE_WIDTH / 2
const TRAIL_NECK_MIN_HALF_WIDTH = TRAIL_MAX_HALF_WIDTH * (0.16 / 0.29) // SnakeBoardCanvas's NECK_MIN_HALF_WIDTH_RATIO / BODY_MAX_HALF_WIDTH_RATIO
const TRAIL_NECK_TAPER_LENGTH = 2.2 * HEAD_UNIT // SnakeBoardCanvas's NECK_TAPER_LENGTH_CELLS
const TRAIL_TAIL_TAPER_LENGTH = 5 * HEAD_UNIT // SnakeBoardCanvas's TAIL_TAPER_LENGTH_CELLS
// Dense enough near each taper zone that the width step between adjacent segments stays small (see
// SnakeBoardCanvas's own TAIL_SEGMENT_COUNT/NECK_SEGMENT_COUNT comment) — lower counts than that
// file's own since this loop's visible trail is much shorter than a real board-spanning body.
const TRAIL_TAIL_SEGMENT_COUNT = 14
const TRAIL_NECK_SEGMENT_COUNT = 8
const TRAIL_BODY_SEGMENT_COUNT = TRAIL_TAIL_SEGMENT_COUNT + 1 + TRAIL_NECK_SEGMENT_COUNT

// Centerline accent — unlike SnakeBoardCanvas.tsx's own dashed belly stripe, this loop's body is
// thin enough (TRAIL_STROKE_WIDTH's whole plateau is a few px) that little dashes would read as
// noise rather than scales, so it's a single unbroken stroke traced the same way the fill is.
// Same 0.9 the in-game belly stripe reads at against the body's own fully-alive opacity — this
// loop has no death-fade equivalent to combine it with, so it's just a flat constant here.
const TRAIL_ACCENT_OPACITY = 0.9

// Slither — SnakeBoardCanvas.tsx's own offsetSamplesForWave, same ratios/cell-counts (renamed
// "units" here since there's no grid cell, just HEAD_UNIT playing the same role).
const SAMPLE_SPACING_PX = 4 // SnakeBoardCanvas's own SAMPLE_SPACING_PX
const WAVE_AMPLITUDE = 0.2 * HEAD_UNIT // SnakeBoardCanvas's WAVE_AMPLITUDE_RATIO
const WAVE_WAVELENGTH_UNITS = 3 // SnakeBoardCanvas's WAVE_WAVELENGTH_CELLS
const WAVE_FREQUENCY = (2 * Math.PI) / (WAVE_WAVELENGTH_UNITS * HEAD_UNIT)
const WAVE_RAMP_LENGTH = 3 * HEAD_UNIT // SnakeBoardCanvas's WAVE_RAMP_CELLS

// Tongue flick — SnakeBoardCanvas.tsx's own buildTonguePath and per-snake flick-timer effect,
// ported as-is (same ratios/timings, against HEAD_UNIT instead of cellPx).
const TONGUE_LENGTH_RATIO = 0.36
const TONGUE_FORK_LENGTH_RATIO = 0.13
const TONGUE_FORK_SPREAD_RAD = 0.45
const TONGUE_WIDTH_RATIO = 0.05
const TONGUE_COLOR = '#FF4D6D'
// Randomized within a range (rather than a fixed period) so the flick reads as an idle tic rather
// than a metronome — same values as SnakeBoardCanvas's own TONGUE_FLICK_MIN_MS/MAX_MS.
const TONGUE_FLICK_MIN_MS = 2200
const TONGUE_FLICK_MAX_MS = 4200
const TONGUE_OUT_MS = 130
const TONGUE_HOLD_MS = 90
const TONGUE_BACK_MS = 170

// Head shape/eye ratios relative to HEAD_UNIT — the exact same silhouette as SnakeBoardCanvas's own
// buildHeadPath (its HEAD_NOSE_DIST_RATIO/HEAD_BACK_DIST_RATIO/HEAD_HALF_WIDTH_RATIO/control-point
// ratios, relative to cellPx there), ported by value rather than by import since the two components
// share no module for it. See that file's own comment on where these numbers come from — extracted
// from the app-icon artwork's SVG path data, not derived analytically.
const HEAD_NOSE_DIST_RATIO = 0.74
const HEAD_BACK_DIST_RATIO = 0.37
const HEAD_HALF_WIDTH_RATIO = 0.6058
const HEAD_NOSE_CP_SIDE_RATIO = 0.2019
const HEAD_QUARTER_CP_FORWARD_RATIO = 0.185
const HEAD_QUARTER_CP_SIDE_RATIO = 0.7067
const HEAD_THREEQ_CP_FORWARD_RATIO = 0.555
const HEAD_THREEQ_CP_SIDE_RATIO = 0.5048
const HEAD_ACCENT_SCALE_RATIO = 0.5
const EYE_FORWARD_RATIO = 0 // roughly level with the head's own center — matches SnakeBoardCanvas's own EYE_FORWARD_RATIO
const EYE_SIDE_RATIO = 0.3

type Point = { x: number; y: number }

// A densified contour sample — see sampleContourWindow. `nx`/`ny` is the unit perpendicular to the
// contour's own tangent at this point (used by the wave offset below), `dist` is this sample's
// cumulative arc length from the tail (index 0) of the currently visible window(s), used both for
// the head-relative wave-amplitude ramp and the taper.
interface Sample extends Point {
  nx: number
  ny: number
  dist: number
}

interface TrailPathSegment {
  path: SkPath
  width: number
}

// Built with addRRect rather than LightCycles' hand-rolled moveTo/lineTo box — a real snake has no
// sharp corners, so there's no reason to avoid Skia's own rounded-rect primitive the way
// HeroTitleTrails.tsx deliberately does (see that file's own comment on matching the grid-based
// game trail's sharp turns, which has no equivalent here).
function loopPath(box: WordBox) {
  const rect = Skia.XYWHRect(box.x + HERO_CANVAS_PAD - HERO_TRAIL_MARGIN_SIDE, box.y + HERO_CANVAS_PAD - HERO_TRAIL_MARGIN_TOP, box.width + HERO_TRAIL_MARGIN_SIDE * 2, box.height + HERO_TRAIL_MARGIN_TOP + HERO_TRAIL_MARGIN_BOTTOM)
  const path = Skia.Path.Make()
  path.addRRect(Skia.RRectXY(rect, HERO_TRAIL_CORNER_RADIUS, HERO_TRAIL_CORNER_RADIUS))
  return path
}

// A point `forward` along `angle` from (cx, cy), offset `side` further along the perpendicular —
// same building block SnakeBoardCanvas.tsx's projectFromHead uses for its own head/eyes/tongue.
function projectFromHead(cx: number, cy: number, angle: number, forward: number, side: number): Point {
  'worklet'
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  return { x: cx + ux * forward - uy * side, y: cy + uy * forward + ux * side }
}

// The same rounded, softly tapered wedge SnakeBoardCanvas.tsx's own buildHeadPath traces — three
// cubic curves rather than a plain triangle, with the nose's own control points sitting beside it
// (not ahead of it) so the tip reads as a soft snout rather than a sharp point. `unit` is HEAD_UNIT
// for the head itself, or HEAD_UNIT * HEAD_ACCENT_SCALE_RATIO for the smaller nested accent copy.
function buildHeadPath(cx: number, cy: number, angle: number, unit: number) {
  'worklet'
  const nose = projectFromHead(cx, cy, angle, HEAD_NOSE_DIST_RATIO * unit, 0)
  const noseCpOut = projectFromHead(cx, cy, angle, HEAD_NOSE_DIST_RATIO * unit, HEAD_NOSE_CP_SIDE_RATIO * unit)
  const noseCpIn = projectFromHead(cx, cy, angle, HEAD_NOSE_DIST_RATIO * unit, -HEAD_NOSE_CP_SIDE_RATIO * unit)

  const backLeft = projectFromHead(cx, cy, angle, -HEAD_BACK_DIST_RATIO * unit, HEAD_HALF_WIDTH_RATIO * unit)
  const backLeftCpIn = projectFromHead(cx, cy, angle, -HEAD_QUARTER_CP_FORWARD_RATIO * unit, HEAD_QUARTER_CP_SIDE_RATIO * unit)
  const backLeftCpOut = projectFromHead(cx, cy, angle, -HEAD_THREEQ_CP_FORWARD_RATIO * unit, HEAD_THREEQ_CP_SIDE_RATIO * unit)

  const backRight = projectFromHead(cx, cy, angle, -HEAD_BACK_DIST_RATIO * unit, -HEAD_HALF_WIDTH_RATIO * unit)
  const backRightCpIn = projectFromHead(cx, cy, angle, -HEAD_THREEQ_CP_FORWARD_RATIO * unit, -HEAD_THREEQ_CP_SIDE_RATIO * unit)
  const backRightCpOut = projectFromHead(cx, cy, angle, -HEAD_QUARTER_CP_FORWARD_RATIO * unit, -HEAD_QUARTER_CP_SIDE_RATIO * unit)

  const path = Skia.Path.Make()
  path.moveTo(nose.x, nose.y)
  path.cubicTo(noseCpOut.x, noseCpOut.y, backLeftCpIn.x, backLeftCpIn.y, backLeft.x, backLeft.y)
  path.cubicTo(backLeftCpOut.x, backLeftCpOut.y, backRightCpIn.x, backRightCpIn.y, backRight.x, backRight.y)
  path.cubicTo(backRightCpOut.x, backRightCpOut.y, noseCpIn.x, noseCpIn.y, nose.x, nose.y)
  path.close()
  return path
}

// The tongue: a line from the nose that extends and forks as `progress` goes 0->1 (flicked out) and
// reverses coming back down to 0 — ported from SnakeBoardCanvas.tsx's own buildTonguePath as-is
// (against `unit` = HEAD_UNIT here rather than cellPx). Two short strokes from a shared tip, rather
// than one stroke that splits, since SkPath has no native "fork" primitive.
function buildTonguePath(cx: number, cy: number, angle: number, unit: number, progress: number): SkPath {
  'worklet'
  const path = Skia.Path.Make()
  if (progress <= 0) return path
  const nose = projectFromHead(cx, cy, angle, HEAD_NOSE_DIST_RATIO * unit, 0)
  const tip = projectFromHead(cx, cy, angle, HEAD_NOSE_DIST_RATIO * unit + TONGUE_LENGTH_RATIO * unit * progress, 0)
  const forkLen = TONGUE_FORK_LENGTH_RATIO * unit * progress
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

// Densifies one [fromFrac, toFrac] window of the loop's own contour (always increasing — the
// wraparound across the 0/1 seam is handled by the caller passing two windows, tail-window first —
// see HeroSnakeTrailBody's own startA/endA/startB/endB) into arc-length-uniform samples, appending
// them to `out` and returning the cumulative distance to hand to the next window. Unlike
// SnakeBoardCanvas's buildCenterlineSamples (which has to densify discrete grid-cell centers, then
// central-difference a tangent at each), the contour is already a continuous curve — getPosTan
// hands back an exact position AND unit tangent at any arc-length distance directly, no
// densify-then-differentiate needed. Skips resampling the very first point of every window after
// the first (`out.length > 0`), since that point is exactly the previous window's own last point —
// same physical location on the closed contour (frac 1 and frac 0 are the seam) — so appending both
// would leave a redundant, zero-length vertex right at the tail/head join.
function sampleContourWindow(contour: SkContourMeasure, length: number, fromFrac: number, toFrac: number, distOffset: number, out: Sample[]): number {
  'worklet'
  const spanFrac = toFrac - fromFrac
  if (spanFrac <= 0) return distOffset
  const spanPx = spanFrac * length
  const steps = Math.max(1, Math.round(spanPx / SAMPLE_SPACING_PX))
  const startI = out.length === 0 ? 0 : 1
  for (let i = startI; i <= steps; i++) {
    const frac = fromFrac + (i / steps) * spanFrac
    const wrapped = ((frac % 1) + 1) % 1
    const [pos, tan] = contour.getPosTan(wrapped * length)
    out.push({ x: pos.x, y: pos.y, nx: -tan.y, ny: tan.x, dist: distOffset + (i / steps) * spanPx })
  }
  return distOffset + spanPx
}

// The body's own half-width at a given arc-length position from the tail — SnakeBoardCanvas.tsx's
// own bodyHalfWidthAt, ported onto this file's fixed TRAIL_MAX_HALF_WIDTH plateau instead of a
// cellPx-scaled one. See that function's own comment for why the neck/tail ramps are computed
// independently then combined by Math.min — that's what makes a still-growing (short) trail's two
// taper zones merge into one smooth spindle instead of overlapping. `isOutline` picks between the
// outer, full vivid-color profile and the inner, container-color one drawn on top of it.
function trailHalfWidthAt(dist: number, total: number, isOutline: boolean): number {
  'worklet'
  const distFromHead = total - dist
  const neckT = Math.min(1, Math.max(0, distFromHead / TRAIL_NECK_TAPER_LENGTH))
  const neckWidth = TRAIL_NECK_MIN_HALF_WIDTH + (TRAIL_MAX_HALF_WIDTH - TRAIL_NECK_MIN_HALF_WIDTH) * neckT
  const tailT = Math.min(1, Math.max(0, dist / TRAIL_TAIL_TAPER_LENGTH))
  const tailWidth = TRAIL_MAX_HALF_WIDTH * tailT
  const outlineHalf = Math.min(neckWidth, tailWidth)
  if (isOutline) return outlineHalf
  return Math.max(0, outlineHalf - BODY_OUTLINE_THICKNESS_RATIO * HEAD_UNIT)
}

function emptyTrailSegments(count: number): TrailPathSegment[] {
  'worklet'
  const result: TrailPathSegment[] = []
  for (let i = 0; i < count; i++) result.push({ path: Skia.Path.Make(), width: 0 })
  return result
}

// The arc-length boundary between each of TRAIL_BODY_SEGMENT_COUNT segments — SnakeBoardCanvas's
// own segmentBreakpoints, ported directly (see that function's own comment on the tailZoneEnd/
// neckZoneStart clamping, which is what lets a short/still-growing trail's two taper zones collapse
// the plateau to nothing rather than overlapping into an invalid range).
function trailSegmentBreakpoints(total: number): number[] {
  'worklet'
  const tailZoneEnd = Math.min(TRAIL_TAIL_TAPER_LENGTH, total)
  const neckZoneStart = Math.max(total - TRAIL_NECK_TAPER_LENGTH, tailZoneEnd)
  const breaks: number[] = [0]
  for (let i = 1; i <= TRAIL_TAIL_SEGMENT_COUNT; i++) breaks.push((i / TRAIL_TAIL_SEGMENT_COUNT) * tailZoneEnd)
  breaks.push(neckZoneStart)
  for (let i = 1; i <= TRAIL_NECK_SEGMENT_COUNT; i++) breaks.push(neckZoneStart + (i / TRAIL_NECK_SEGMENT_COUNT) * (total - neckZoneStart))
  return breaks
}

// The body: chopped into TRAIL_BODY_SEGMENT_COUNT constant-width stroke segments rather than one
// variable-width shape — SnakeBoardCanvas.tsx's own buildBodySegments, ported directly (see that
// function's own comment for why: a stroke gets Skia's native round joins/caps for free, a filled
// variable-width ribbon doesn't, on this project's pinned CanvasKit build).
function buildTrailBodySegments(points: Point[], samples: Sample[], isOutline: boolean): TrailPathSegment[] {
  'worklet'
  const n = points.length
  if (n === 0) return emptyTrailSegments(TRAIL_BODY_SEGMENT_COUNT)
  const total = samples[n - 1].dist
  const breaks = trailSegmentBreakpoints(total)
  const segments: TrailPathSegment[] = []
  for (let seg = 0; seg < TRAIL_BODY_SEGMENT_COUNT; seg++) {
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
    for (let i = startIdx + 1; i <= endIdx; i++) path.lineTo(points[i].x, points[i].y)
    const midDist = (fromDist + toDist) / 2
    const hw = trailHalfWidthAt(midDist, total, isOutline)
    segments.push({ path, width: hw * 2 })
  }
  return segments
}

// How wide the centerline accent reads relative to the body's own current FILL width at that same
// point — a fraction (rather than a fixed pixel width) so it scales down through the neck/tail
// taper zones the same way the body itself does, instead of poking out past its own edge there.
const TRAIL_ACCENT_WIDTH_FRACTION = 0.2

const TRAIL_BODY_SEGMENT_INDICES = Array.from({ length: TRAIL_BODY_SEGMENT_COUNT }, (_, i) => i)

// Renders segmentsSV[index] as its own constant-width stroke — see buildTrailBodySegments's own
// comment for why the body is split into a fixed number of these rather than one variable-width
// shape. A genuine component (not a bare .map() callback calling hooks directly) so its two
// useDerivedValue calls are unconditional and stable across renders per React's own rules of hooks
// — mirrors SnakeBoardCanvas.tsx's own BodySegment, minus the death-fade opacity this loop has no
// equivalent state for.
interface TrailSegmentProps {
  segmentsSV: SharedValue<TrailPathSegment[]>
  index: number
  color: string
  // Only the centerline accent passes these — the outline/fill body layers leave them unset and
  // render at their own segment's own full width and stay fully opaque, same as before either prop
  // existed. widthScale lets the accent reuse the fill layer's own segmentsSV (same paths, already
  // correctly tapered) at a thinner stroke width instead of needing its own duplicate segment build.
  opacity?: number
  widthScale?: number
}

function TrailSegment({ segmentsSV, index, color, opacity, widthScale }: TrailSegmentProps) {
  const path = useDerivedValue(() => segmentsSV.value[index].path)
  const width = useDerivedValue(() => segmentsSV.value[index].width * (widthScale ?? 1))
  return <Path path={path} style='stroke' strokeWidth={width} strokeCap='round' strokeJoin='round' color={color} opacity={opacity} />
}

// Unwrapped drawing primitives (no <Canvas> of its own) — same role SnakeBoardCanvas.tsx's own
// (unexported) SnakeBody plays inside its exported, Canvas-wrapped SnakeBoard.
function HeroSnakeTrailBody({ box, color, surfaceColor, tertiaryColor, active, startDelayMs }: HeroSnakeTrailProps) {
  // Keyed on box's own fields, not its identity — onLayout hands back a fresh object every fire
  // even when the measured values haven't actually changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const path = useMemo(() => loopPath(box), [box.x, box.y, box.width, box.height])

  const { contour, length } = useMemo(() => {
    const c = Skia.ContourMeasureIter(path, true, 1).next()
    return { contour: c, length: c ? c.length() : 0 }
  }, [path])

  const trailLengthPx = length * TRAIL_LENGTH_FRACTION
  const segmentFraction = length > 0 ? trailLengthPx / length : 0

  const t = useSharedValue(0)
  // False for the very first lap only — see HeroTitleTrails.tsx's identical hasLapped for the full
  // reasoning: without it, the loop would appear to already have a full-length body the instant it
  // mounts, before the head has moved at all.
  const hasLapped = useSharedValue(false)
  useEffect(() => {
    if (!active) {
      t.value = 0
      return
    }
    t.value = withDelay(startDelayMs, withRepeat(withTiming(1, { duration: LAP_DURATION_MS, easing: Easing.linear }), -1, false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  useAnimatedReaction(
    () => ({ t: t.value, active }),
    (current, previous) => {
      if (!current.active) {
        hasLapped.value = false
        return
      }
      if (previous !== null && current.t < previous.t) hasLapped.value = true
    }
  )

  // The trailing body as two [start, end] fraction windows on the same base path, so it can
  // straddle the 0/1 seam without negative fractions — see HeroTitleTrails.tsx's identical
  // startA/endA/startB/endB for the full reasoning. Also what buildTrailSamples below densifies
  // into actual points — tail window (B, if any) first, then head window (A).
  const startA = useDerivedValue(() => (t.value >= segmentFraction ? t.value - segmentFraction : 0))
  const endA = useDerivedValue(() => t.value)
  const startB = useDerivedValue(() => (hasLapped.value && t.value < segmentFraction ? 1 - (segmentFraction - t.value) : 0))
  const endB = useDerivedValue(() => (hasLapped.value && t.value < segmentFraction ? 1 : 0))

  const headPos = useDerivedValue(() => {
    if (!contour) return vec(box.x + HERO_CANVAS_PAD, box.y + HERO_CANVAS_PAD)
    const [pos] = contour.getPosTan(t.value * length)
    return vec(pos.x, pos.y)
  })
  const headAngle = useDerivedValue(() => {
    if (!contour) return 0
    const [, tan] = contour.getPosTan(t.value * length)
    return Math.atan2(tan.y, tan.x)
  })
  const headPath = useDerivedValue(() => buildHeadPath(headPos.value.x, headPos.value.y, headAngle.value, HEAD_UNIT))
  const headAccentPath = useDerivedValue(() => buildHeadPath(headPos.value.x, headPos.value.y, headAngle.value, HEAD_UNIT * HEAD_ACCENT_SCALE_RATIO))
  const eyeLeft = useDerivedValue(() => projectFromHead(headPos.value.x, headPos.value.y, headAngle.value, EYE_FORWARD_RATIO * HEAD_UNIT, EYE_SIDE_RATIO * HEAD_UNIT))
  const eyeRight = useDerivedValue(() => projectFromHead(headPos.value.x, headPos.value.y, headAngle.value, EYE_FORWARD_RATIO * HEAD_UNIT, -EYE_SIDE_RATIO * HEAD_UNIT))
  const eyeLeftX = useDerivedValue(() => eyeLeft.value.x)
  const eyeLeftY = useDerivedValue(() => eyeLeft.value.y)
  const eyeRightX = useDerivedValue(() => eyeRight.value.x)
  const eyeRightY = useDerivedValue(() => eyeRight.value.y)

  // The slither's own clock — paced to the loop's actual forward travel speed (one wave cycle per
  // WAVE_WAVELENGTH_UNITS of travel), same intent as SnakeBoardCanvas's own per-snake
  // wavePhaseScale — but driven directly at that speed rather than rescaled from a shared driver,
  // since this loop (unlike the real board) has no food-pulse or other clock to share one with.
  const forwardUnitsPerSecond = length > 0 ? length / HEAD_UNIT / (LAP_DURATION_MS / 1000) : 0
  const waveSpeed = (2 * Math.PI * forwardUnitsPerSecond) / WAVE_WAVELENGTH_UNITS
  const waveSpeedSV = useSharedValue(waveSpeed)
  useEffect(() => {
    waveSpeedSV.value = waveSpeed
  }, [waveSpeed, waveSpeedSV])
  const phase = useSharedValue(0)
  useFrameCallback((frameInfo) => {
    'worklet'
    const dtSeconds = (frameInfo.timeSincePreviousFrame ?? 16.67) / 1000
    phase.value += dtSeconds * waveSpeedSV.value
  })

  // The tapered, undulating body — samples the loop's own visible tail-to-head window(s) (see
  // sampleContourWindow), offsets each sample perpendicular by the slither wave (ramped to 0 right
  // at the head, same as SnakeBoardCanvas's own offsetSamplesForWave, so the neck always reads
  // crisp regardless of how the body behind it undulates), then re-chops the result into
  // TRAIL_BODY_SEGMENT_COUNT constant-width sub-strokes whose own width tapers via
  // trailHalfWidthAt. Re-evaluated every frame off phase.value (the wave) and t.value/hasLapped.value
  // (the window) alike.
  const trailPaths = useDerivedValue(() => {
    if (!contour) {
      return {
        outlineSegments: emptyTrailSegments(TRAIL_BODY_SEGMENT_COUNT),
        fillSegments: emptyTrailSegments(TRAIL_BODY_SEGMENT_COUNT)
      }
    }
    const samples: Sample[] = []
    const afterB = sampleContourWindow(contour, length, startB.value, endB.value, 0, samples)
    sampleContourWindow(contour, length, startA.value, endA.value, afterB, samples)
    const n = samples.length
    const total = n > 0 ? samples[n - 1].dist : 0
    const points: Point[] = new Array(n)
    for (let i = 0; i < n; i++) {
      const s = samples[i]
      const distFromHead = total - s.dist
      const ramp = WAVE_RAMP_LENGTH > 0 ? Math.min(1, Math.max(0, distFromHead / WAVE_RAMP_LENGTH)) : 1
      const offset = WAVE_AMPLITUDE * ramp * Math.sin(phase.value + s.dist * WAVE_FREQUENCY)
      points[i] = { x: s.x + s.nx * offset, y: s.y + s.ny * offset }
    }
    return {
      outlineSegments: buildTrailBodySegments(points, samples, true),
      fillSegments: buildTrailBodySegments(points, samples, false)
    }
  })
  const outlineSegmentsSV = useDerivedValue(() => trailPaths.value.outlineSegments)
  const fillSegmentsSV = useDerivedValue(() => trailPaths.value.fillSegments)

  // The occasional tongue flick — SnakeBoardCanvas.tsx's own per-snake JS-thread timer, ported
  // as-is but gated on `active` rather than snake.alive (this loop has no death state). Stops
  // rescheduling the moment the loop goes inactive.
  const tongueProgress = useSharedValue(0)
  useEffect(() => {
    if (!active) return undefined
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
  }, [active, tongueProgress])
  const tonguePath = useDerivedValue(() => buildTonguePath(headPos.value.x, headPos.value.y, headAngle.value, HEAD_UNIT, tongueProgress.value))

  // The body's own fill: auto-paper's standard "container" tint, same role bodyFillColor plays in
  // SnakeBoardCanvas.tsx — the vivid color blended just 15% into whatever this loop is actually
  // drawn over, rather than a fixed lighter-white blend.
  const bodyFillColor = useMemo(() => getColorRoles(color, surfaceColor).container, [color, surfaceColor])

  if (!active) {
    return <Path path={path} style='stroke' strokeWidth={TRAIL_STROKE_WIDTH} strokeCap='round' strokeJoin='round' color={color} opacity={STATIC_OPACITY} />
  }

  return (
    <>
      {TRAIL_BODY_SEGMENT_INDICES.map((i) => (
        <TrailSegment key={`outline-${i}`} segmentsSV={outlineSegmentsSV} index={i} color={color} />
      ))}
      {TRAIL_BODY_SEGMENT_INDICES.map((i) => (
        <TrailSegment key={`fill-${i}`} segmentsSV={fillSegmentsSV} index={i} color={bodyFillColor} />
      ))}
      {/* Centerline accent — a thin theme-tertiary line traced right over the fill layer's own
      already-tapered, already-undulating paths (just narrower), same z-order SnakeBoardCanvas.tsx's
      own belly stripe uses relative to the body fill. */}
      {TRAIL_BODY_SEGMENT_INDICES.map((i) => (
        <TrailSegment key={`accent-${i}`} segmentsSV={fillSegmentsSV} index={i} color={tertiaryColor} opacity={TRAIL_ACCENT_OPACITY} widthScale={TRAIL_ACCENT_WIDTH_FRACTION} />
      ))}

      <Path path={headPath} color={color} />
      <Path path={headAccentPath} color={tertiaryColor} />
      <Circle cx={eyeLeftX} cy={eyeLeftY} r={EYE_RADIUS} color={EYE_COLOR} />
      <Circle cx={eyeRightX} cy={eyeRightY} r={EYE_RADIUS} color={EYE_COLOR} />
      {/* Tongue drawn last so it sits on top of the head's own fill/outline with no seam — matches
      SnakeBoardCanvas.tsx's own z-order comment on this exact point. */}
      <Path path={tonguePath} style='stroke' strokeWidth={TONGUE_WIDTH_RATIO * HEAD_UNIT} strokeCap='round' color={TONGUE_COLOR} />
    </>
  )
}

export function HeroSnakeTrail(props: HeroSnakeTrailProps) {
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <HeroSnakeTrailBody {...props} />
    </Canvas>
  )
}
