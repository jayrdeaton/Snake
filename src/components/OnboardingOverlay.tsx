import { useAutoPaperTheme } from '@rific/auto-paper'
import { getFixedZoneRotation, getOpposingZoneRotation, useOrientationState } from '@tastic/core'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { ONBOARDING_COUNTDOWN_STEP_MS, ONBOARDING_FADE_MS, ONBOARDING_GO_HOLD_MS } from '@/constants/snake'
import { useSnakeSounds } from '@/hooks/useSnakeSounds'
import { SnakeId } from '@/types'

export interface OnboardingOverlayProps {
  onComplete: () => void
  // Drives the single-zone-vs-split decision below — NOT snakes.length. Vs CPU has two snakes on
  // the board but only one human ever watching/reading this overlay, so it gets the same one,
  // untinted-toward-a-second-seat full-board zone Solo does; only 2 Player (humanPlayers.length===2)
  // actually needs a real second person's own half, complete with that half's own 180°-flipped
  // digit so it reads right-side-up from THEIR physical side of the device. Mirrors LightCycles'
  // OnboardingOverlay's identical humanPlayers-gated branch exactly (see that file's own comment) —
  // Snake's own earlier port of this file had collapsed the distinction into a 'solo'|'dual' mode
  // derived from snake COUNT instead of human count, which is what let Vs CPU wrongly inherit the
  // two-real-people split treatment.
  humanPlayers: SnakeId[]
  // snake1 is always required — every mode has at least one (human) snake. snake2 is present
  // whenever a second snake exists on the board at all (Vs CPU's CPU included, even though its
  // color only actually gets used below when humanPlayers.length is 2 — i.e. Vs CPU's own CPU-
  // colored zone is simply never rendered, matching the single-zone branch not needing it).
  colors: { snake1: string; snake2?: string }
}

const COUNTDOWN_STAGES = ['3', '2', '1', 'GO!']

// A temporary UI layer over the board — not part of the Skia canvas (see SnakeBoard.tsx's own
// header comment). Ported from LightCycles' OnboardingOverlay.tsx: a "3, 2, 1, GO!" countdown that
// fades out and calls onComplete. Dropped relative to that version, per the build brief: round-
// history pips (no match-series/rematch concept in Snake) are gone entirely, and per-player zone
// ROTATION is simplified to just the opposing seat's own 180°/±90° flip (via
// getFixedZoneRotation/getOpposingZoneRotation) rather than threading a live `rotation` prop in
// from the screen — this overlay has no dialog-style content of its own to keep consistent with
// anything else, unlike SettingsDialog.
export default function OnboardingOverlay({ onComplete, humanPlayers, colors }: OnboardingOverlayProps) {
  const { fonts } = useAutoPaperTheme()
  const opacity = useSharedValue(1)
  const [stageIndex, setStageIndex] = useState(0)
  const { orientationMode, p1OnRight, upsideDown } = useOrientationState()

  const { playCountdownTick, playCountdownGo } = useSnakeSounds()
  const soundRef = useRef({ playCountdownTick, playCountdownGo })
  useEffect(() => {
    soundRef.current = { playCountdownTick, playCountdownGo }
  }, [playCountdownTick, playCountdownGo])

  // Fires alongside every digit change, including the initial "3" on mount — kept as its own
  // effect (rather than folded into the mount-only timer effect below) so the countdown's own
  // scheduling stays untouched by which sound happens to play for a given stage.
  useEffect(() => {
    const isGo = stageIndex === COUNTDOWN_STAGES.length - 1
    if (isGo) soundRef.current.playCountdownGo()
    else soundRef.current.playCountdownTick()
  }, [stageIndex])

  useEffect(() => {
    const digitTimers = COUNTDOWN_STAGES.slice(1).map((_, i) => setTimeout(() => setStageIndex(i + 1), ONBOARDING_COUNTDOWN_STEP_MS * (i + 1)))
    const fadeTimer = setTimeout(
      () => {
        opacity.value = withTiming(0, { duration: ONBOARDING_FADE_MS }, (finished) => {
          if (finished) runOnJS(onComplete)()
        })
      },
      ONBOARDING_COUNTDOWN_STEP_MS * 3 + ONBOARDING_GO_HOLD_MS
    )
    return () => {
      digitTimers.forEach(clearTimeout)
      clearTimeout(fadeTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  const countdown = COUNTDOWN_STAGES[stageIndex]

  // Solo AND Vs CPU both land here — see humanPlayers' own doc above for why snake count isn't
  // what gates this. Tinted in the lone human's own color (snake1 — see types/index.ts's own
  // "snake 1 is always the human" convention) rather than left plain, so this zone reads
  // consistently with the two-zone case below instead of looking like a different, simpler mode.
  if (humanPlayers.length === 1) {
    return (
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]} pointerEvents='none'>
        <View style={[styles.zone, styles.zoneFull, { borderColor: colors.snake1, backgroundColor: `${colors.snake1}22` }]}>
          <Text style={[styles.countdown, { fontFamily: fonts.displayLarge.fontFamily }]}>{countdown}</Text>
        </View>
      </Animated.View>
    )
  }

  // Only reachable with humanPlayers.length === 2 (2 Player — the only mode with a second human at
  // all), which always has a real second snake on the board too — colors.snake2 is only typed
  // optional because the single-zone branch above never needs it, not because it can actually be
  // missing here. Guards anyway rather than a non-null assertion, in case that invariant ever
  // drifts.
  if (!colors.snake2) return null

  // Mirrors TouchInputLayer.tsx's own zone split exactly (face-to-face: near/bottom = snake 1,
  // far/top = snake 2; side-by-side: whichever seat useOrientationState says is on the right gets
  // the right zone), so the countdown zones never disagree with where a swipe actually registers.
  const isFaceToFace = orientationMode === 'faceToFace'
  const snake1Zone = isFaceToFace ? styles.zoneBottom : p1OnRight ? styles.zoneRight : styles.zoneLeft
  const snake2Zone = isFaceToFace ? styles.zoneTop : p1OnRight ? styles.zoneLeft : styles.zoneRight
  const snake1Rotation = getFixedZoneRotation(orientationMode, p1OnRight, upsideDown)
  const snake2Rotation = getOpposingZoneRotation(snake1Rotation)

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]} pointerEvents='none'>
      <View style={[styles.zone, snake1Zone, { borderColor: colors.snake1, backgroundColor: `${colors.snake1}22` }]}>
        <Text style={[styles.countdown, { fontFamily: fonts.displayLarge.fontFamily }, snake1Rotation % 360 !== 0 && { transform: [{ rotate: `${snake1Rotation}deg` }] }]}>{countdown}</Text>
      </View>
      <View style={[styles.zone, snake2Zone, { borderColor: colors.snake2, backgroundColor: `${colors.snake2}22` }]}>
        <Text style={[styles.countdown, { fontFamily: fonts.displayLarge.fontFamily }, snake2Rotation % 360 !== 0 && { transform: [{ rotate: `${snake2Rotation}deg` }] }]}>{countdown}</Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  countdown: {
    color: '#FFFFFF',
    fontSize: 72,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 8
  },
  zone: {
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 3,
    justifyContent: 'center',
    position: 'absolute'
  },
  zoneBottom: { bottom: 0, left: 0, right: 0, top: '50%' },
  // alignItems/justifyContent (centering the countdown digit) already come from `zone` itself —
  // this only needs to add the four edge insets `zone`'s own bare `position: 'absolute'` doesn't
  // supply on its own, same as zoneBottom/zoneLeft/zoneRight/zoneTop each do for their own quarter/
  // half of the screen. Previously missing these, which silently shrank the single-zone case (see
  // OnboardingOverlayProps' own humanPlayers doc) down to its content's own natural size instead of
  // filling the screen — never caught before because the old solo-only render path applied
  // StyleSheet.absoluteFill directly to the outer Animated.View instead of routing through `zone`.
  zoneFull: { bottom: 0, left: 0, right: 0, top: 0 },
  zoneLeft: { bottom: 0, left: 0, right: '50%', top: 0 },
  zoneRight: { bottom: 0, left: '50%', right: 0, top: 0 },
  zoneTop: { bottom: '50%', left: 0, right: 0, top: 0 }
})
