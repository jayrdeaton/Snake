import { useVibration } from '@rific/feedback-press'
import { useOrientationState } from '@tastic/core'
import { applyControlInversion, isEffectiveTurn } from '@tastic/input'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS, SharedValue, useSharedValue } from 'react-native-reanimated'

import { useSnakeSounds } from '@/hooks/useSnakeSounds'
import { Direction, SnakeId } from '@/types'
import { resolveTurnIntent } from '@/utils/turnIntent'

export type TouchInputMode = 'solo' | 'dual'

export interface TouchInputLayerProps {
  mode: TouchInputMode
  enabled: boolean
  onTurn: (snakeId: SnakeId, direction: Direction) => void
  // Fires on a stationary tap (composed alongside the pan below, not a separate zone — see
  // makeSnakeGesture's own comment). Always safe to wire regardless of whether powerups are even
  // enabled this round: activate() itself no-ops when the snake holds nothing (see
  // snakeEngine.ts's applySnakePowerupActivation).
  onActivate: (snakeId: SnakeId) => void
  // Whether each seat's own controls are currently Mesmerized (see types/index.ts's
  // SnakeControlEffect) — a mesmerized seat's resolved swipe direction is inverted before onTurn
  // ever sees it, mirroring LightCycles' identical TouchInputLayer prop. Read through latestRef
  // (see below), never a gesture dependency, so a mid-touch mesmerize landing or expiring can
  // never force RNGH to tear down and re-attach an in-progress gesture's native recognizer.
  controlInverted: Record<SnakeId, boolean>
  // Each snake's current (committed) heading, straight from game state — used to gate the turn
  // sound/haptic on isEffectiveTurn, so continuing straight or reversing 180° (both of which
  // applySnakeTurnIntent silently no-ops in snakeEngine.ts) doesn't fire feedback for a turn that
  // never actually happens. Mirrors LightCycles' identical TouchInputLayer prop exactly.
  currentDirections: Record<SnakeId, Direction>
}

// Two independent single-finger Pan gestures in dual mode, each on its OWN View (sized/positioned
// to its own half — see snake1ZoneStyle/snake2ZoneStyle below) rather than one shared View split via
// `hitSlop`. Direct port of LightCycles' TouchInputLayer.tsx's own reasoning: two touches landing in
// the same native touch-event batch (a genuine simultaneous two-player swipe) can race on which
// single shared recognizer claims which pointer and lose one or both turns; two separate native
// views/recognizers have nothing left to race, since each only ever sees the pointer that landed on
// it. The board underneath still stays one undivided render — only touch handling is zoned.
export default function TouchInputLayer({ mode, enabled, onTurn, onActivate, controlInverted, currentDirections }: TouchInputLayerProps) {
  const solo = mode === 'solo'
  const { orientationMode, p1OnRight } = useOrientationState()

  const { playTurn } = useSnakeSounds()
  const { selection } = useVibration()

  // Everything handleTurn/handleActivate need, kept in a ref rather than closed over directly, so
  // those two callbacks — and therefore makeSnakeGesture and the Gesture objects it builds below —
  // can stay referentially stable across renders, exactly mirroring LightCycles' identical
  // TouchInputLayer.tsx latestRef: RNGH tears down and re-attaches its native recognizer on every
  // new gesture object handed to GestureDetector, and a touch that starts mid-rebuild loses its
  // recognizer state entirely. currentDirections in particular is a fresh object every single game
  // tick (see game.tsx), so closing over it directly meant rebuilding every Gesture.Pan()/
  // Gesture.Tap() several times a second during play.
  const latestRef = useRef({ onTurn, onActivate, controlInverted, currentDirections, playTurn, selection })
  useEffect(() => {
    latestRef.current = { onTurn, onActivate, controlInverted, currentDirections, playTurn, selection }
  })

  const handleTurn = useCallback((snakeId: SnakeId, direction: Direction) => {
    const { onTurn, controlInverted, currentDirections, playTurn, selection } = latestRef.current
    const invertedDirection = applyControlInversion(direction, controlInverted[snakeId])
    onTurn(snakeId, invertedDirection)
    if (isEffectiveTurn(invertedDirection, currentDirections[snakeId])) {
      playTurn()
      selection()
    }
  }, [])

  const handleActivate = useCallback((snakeId: SnakeId) => {
    const { onActivate } = latestRef.current
    onActivate(snakeId)
  }, [])

  // Per-snake drag state, read/written from the UI-thread gesture worklets below (never touched
  // from JS) so a whole continuous touch can be tracked without bouncing through React state.
  // `base` is the translation (relative to the gesture's own onStart) at which the *current*
  // segment began; `lastDirection` is the most recent direction recognized within this touch.
  const snake1Base = useSharedValue({ x: 0, y: 0 })
  const snake2Base = useSharedValue({ x: 0, y: 0 })
  const snake1LastDirection = useSharedValue<Direction | null>(null)
  const snake2LastDirection = useSharedValue<Direction | null>(null)

  // Resolves a turn continuously during the drag (onUpdate) instead of once at release, so a
  // player can chain several turns within one continuous touch without lifting their finger — see
  // LightCycles' TouchInputLayer.tsx's makePlayerGesture for the full rationale. Composed with a
  // Gesture.Tap for powerup activation (a stationary tap, not a drag) via Gesture.Simultaneous, so
  // both recognizers share the exact same zone rather than needing a separate hit-target — the
  // `.hitSlop({})` on the pan below is the exact workaround LightCycles' own TouchInputLayer.tsx
  // needs to make that composition register at all, and it was already here before Tap ever needed
  // it.
  const makeSnakeGesture = useCallback(
    (snakeId: SnakeId, base: SharedValue<{ x: number; y: number }>, lastDirection: SharedValue<Direction | null>) => {
      const pan = Gesture.Pan()
        .maxPointers(1)
        .minDistance(0)
        .hitSlop({})
        .enabled(enabled)
        .onStart(() => {
          base.value = { x: 0, y: 0 }
          lastDirection.value = null
        })
        .onUpdate((e) => {
          const direction = resolveTurnIntent({
            translationX: e.translationX - base.value.x,
            translationY: e.translationY - base.value.y
          })
          if (!direction) return
          base.value = { x: e.translationX, y: e.translationY }
          if (direction !== lastDirection.value) {
            lastDirection.value = direction
            runOnJS(handleTurn)(snakeId, direction)
          }
        })

      const tap = Gesture.Tap()
        .enabled(enabled)
        .onEnd(() => runOnJS(handleActivate)(snakeId))

      return Gesture.Simultaneous(pan, tap)
    },
    [enabled, handleTurn, handleActivate]
  )

  const soloGesture = useMemo(() => (solo ? makeSnakeGesture(1, snake1Base, snake1LastDirection) : null), [solo, makeSnakeGesture]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/refs -- snake1Base/snake1LastDirection are stable SharedValue refs (like useRef), not reactive state; SharedValue.value is only ever read inside worklet/event callbacks, never synchronously during render
  const snake1Gesture = useMemo(() => (solo ? null : makeSnakeGesture(1, snake1Base, snake1LastDirection)), [solo, makeSnakeGesture]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/refs -- snake1Base/snake1LastDirection are stable SharedValue refs, not reactive state
  const snake2Gesture = useMemo(() => (solo ? null : makeSnakeGesture(2, snake2Base, snake2LastDirection)), [solo, makeSnakeGesture]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/refs -- snake2Base/snake2LastDirection are stable SharedValue refs, not reactive state

  if (solo) {
    return (
      <GestureDetector gesture={soloGesture!}>
        {/* collapsable={false}: without a prop that makes it stand out, RN's view-flattening
        optimization merges this plain View into its parent, and GestureDetector's ref then attaches
        to nothing — the gesture silently never receives a single touch. */}
        <View collapsable={false} style={StyleSheet.absoluteFill} />
      </GestureDetector>
    )
  }

  // Face-to-face: top/bottom split (snake 1 = near/bottom zone, since snake 1 is assumed to be the
  // device's owner and the near zone faces them; snake 2 = far/top zone). Side-by-side: whichever
  // seat is on the right (see useOrientationState) gets the right zone. Used as-is for both
  // Vs CPU (only the near/bottom zone is actually listened to by the caller — there's no second
  // human — though this component doesn't need to know that, it just always renders both zones) and
  // 2 Player (both zones are live).
  const isFaceToFace = orientationMode === 'faceToFace'
  const snake1ZoneStyle = isFaceToFace ? styles.zoneBottom : p1OnRight ? styles.zoneRight : styles.zoneLeft
  const snake2ZoneStyle = isFaceToFace ? styles.zoneTop : p1OnRight ? styles.zoneLeft : styles.zoneRight

  return (
    <View style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={snake1Gesture!}>
        <View collapsable={false} style={[styles.zone, snake1ZoneStyle]} />
      </GestureDetector>
      <GestureDetector gesture={snake2Gesture!}>
        <View collapsable={false} style={[styles.zone, snake2ZoneStyle]} />
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  zone: { position: 'absolute' },
  zoneBottom: { bottom: 0, left: 0, right: 0, top: '50%' },
  zoneLeft: { bottom: 0, left: 0, right: '50%', top: 0 },
  zoneRight: { bottom: 0, left: '50%', right: 0, top: 0 },
  zoneTop: { bottom: '50%', left: 0, right: 0, top: 0 }
})
