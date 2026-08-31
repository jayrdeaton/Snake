import { getFixedZoneRotation, getOpposingZoneRotation, useAccelerometerOrientation } from '@tastic/split-screen'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

import { ONBOARDING_COUNTDOWN_STEP_MS, ONBOARDING_FADE_MS, ONBOARDING_GO_HOLD_MS } from '@/constants/snake'
import { useSnakeSounds } from '@/hooks/useSnakeSounds'

export interface OnboardingOverlayProps {
  onComplete: () => void
  // Optional per-seat awareness for the two-rival modes (Vs CPU / 2 Player). Omitting this (or
  // passing 'solo') renders one full-board centered countdown — an acceptable v1 on its own (see
  // this file's header comment) — while 'dual' + `colors` splits into the same near/bottom
  // (face-to-face) or left/right (side-by-side) zones TouchInputLayer.tsx already establishes for
  // input, each tinted in that snake's own color, so the countdown zones never disagree with where
  // a swipe will actually register.
  mode?: 'solo' | 'dual'
  colors?: { snake1: string; snake2: string }
}

const COUNTDOWN_STAGES = ['3', '2', '1', 'GO!']

// A temporary UI layer over the board — not part of the Skia canvas (see SnakeBoard.tsx's own
// header comment). Ported from LightCycles' OnboardingOverlay.tsx: a "3, 2, 1, GO!" countdown that
// fades out and calls onComplete. Dropped relative to that version, per the build brief: round-
// history pips (no match-series/rematch concept in Snake) are gone entirely, and per-player zone
// ROTATION is simplified to just the opposing seat's own 180°/±90° flip (via
// getFixedZoneRotation/getOpposingZoneRotation) rather than threading a live `rotation` prop in
// from the screen — this overlay has no dialog-style content of its own to keep consistent with
// anything else, unlike SettingsDialog. Per-seat zone TINTING (`mode`/`colors` below) is kept
// as an opt-in, since a simple single centered countdown is also an acceptable v1 (see this
// module's own JSDoc on OnboardingOverlayProps).
export default function OnboardingOverlay({ onComplete, mode = 'solo', colors }: OnboardingOverlayProps) {
  const opacity = useSharedValue(1)
  const [stageIndex, setStageIndex] = useState(0)
  const { orientationMode, p1OnRight, upsideDown } = useAccelerometerOrientation()

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

  if (mode === 'solo' || !colors) {
    return (
      <Animated.View style={[StyleSheet.absoluteFill, styles.zoneFull, animatedStyle]} pointerEvents='none'>
        <Text style={styles.countdown}>{countdown}</Text>
      </Animated.View>
    )
  }

  // Mirrors TouchInputLayer.tsx's own zone split exactly (face-to-face: near/bottom = snake 1,
  // far/top = snake 2; side-by-side: whichever seat useAccelerometerOrientation says is on the
  // right gets the right zone), so the countdown zones never disagree with where a swipe actually
  // registers.
  const isFaceToFace = orientationMode === 'faceToFace'
  const snake1Zone = isFaceToFace ? styles.zoneBottom : p1OnRight ? styles.zoneRight : styles.zoneLeft
  const snake2Zone = isFaceToFace ? styles.zoneTop : p1OnRight ? styles.zoneLeft : styles.zoneRight
  const snake1Rotation = getFixedZoneRotation(orientationMode, p1OnRight, upsideDown)
  const snake2Rotation = getOpposingZoneRotation(snake1Rotation)

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]} pointerEvents='none'>
      <View style={[styles.zone, snake1Zone, { borderColor: colors.snake1, backgroundColor: `${colors.snake1}22` }]}>
        <Text style={[styles.countdown, snake1Rotation % 360 !== 0 && { transform: [{ rotate: `${snake1Rotation}deg` }] }]}>{countdown}</Text>
      </View>
      <View style={[styles.zone, snake2Zone, { borderColor: colors.snake2, backgroundColor: `${colors.snake2}22` }]}>
        <Text style={[styles.countdown, snake2Rotation % 360 !== 0 && { transform: [{ rotate: `${snake2Rotation}deg` }] }]}>{countdown}</Text>
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
  zoneFull: { alignItems: 'center', justifyContent: 'center' },
  zoneLeft: { bottom: 0, left: 0, right: '50%', top: 0 },
  zoneRight: { bottom: 0, left: '50%', right: 0, top: 0 },
  zoneTop: { bottom: '50%', left: 0, right: 0, top: 0 }
})
