import { resolveSwipeDirection } from '@tastic/input'

import { Direction } from '@/types'

// Below this drag distance (px), a gesture release is treated as a tap/jitter rather than a
// deliberate flick-to-turn.
export const MIN_SWIPE_DISTANCE = 24

// How far a finger/pointer may drift and still count as a tap-to-activate, rather than the start
// of a drag — kept alongside MIN_SWIPE_DISTANCE for parity with LightCycles' turnIntent.ts (see
// that file for the full rationale), though Snake has no tap-to-activate gesture at all (no
// held-item/activate action — see TouchInputLayer.tsx, whose zones are bare Gesture.Pan), so this
// constant currently has no consumer here.
export const TAP_MAX_DISTANCE = 18

export interface ResolveTurnIntentParams {
  translationX: number
  translationY: number
}

// The one shared entry point every input source (touch today, potentially keyboard later) should
// route through. Snake, unlike LightCycles, has exactly one shared, unrotated board and never puts
// a second seat's view of it through any flip: there's only one physical coordinate space, ever,
// for every mode (solo, vs CPU, 2 player) and every snake. LightCycles' own version of this
// function reaches the same conclusion for its face-to-face far player — a raw swipe direction and
// the raw direction the game piece should move are the same physical event, because the board
// itself is never rotated per seat — but keeps player/orientationMode in its signature regardless,
// for a hypothetical future accommodation. Snake drops both outright: there is exactly one shared
// unrotated coordinate space here, no per-player flip is ever needed, and the board is never
// rotated, full stop. Also marked 'worklet' (via resolveSwipeDirection) so native's UI-thread
// gesture callback can call it directly.
export function resolveTurnIntent({ translationX, translationY }: ResolveTurnIntentParams): Direction | null {
  'worklet'
  return resolveSwipeDirection({ x: translationX, y: translationY }, MIN_SWIPE_DISTANCE)
}
