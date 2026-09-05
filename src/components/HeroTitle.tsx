// The home screen's animated "SNAKE" wordmark — letters stagger in (ported from LightCycles'
// AnimatedHeroTitle.tsx), then a forever-looping snake (HeroSnakeTrail) fades in once they've
// mostly settled. See HeroSnakeTrailCanvas.tsx for the loop itself.
import { useAutoPaperTheme } from '@rific/auto-paper'
import { useEffect, useState } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'

import { SNAKE_COLORS } from '@/utils/snakeEngine'

import { HERO_CANVAS_PAD, WordBox } from './heroSnakeGeometry'
import { HeroSnakeTrail } from './HeroSnakeTrail'

const WORD = 'SNAKE'

const STAGGER_MS = 45
const LETTER_DURATION_MS = 320
// The loop starts looping the instant it mounts (see HeroSnakeTrail) but stays hidden behind this
// shared fade until the letters are most of the way settled — one "power on" beat once the
// wordmark has mostly landed, rather than motion competing with letters still flying in. Same
// formula/proportions as LightCycles' AnimatedHeroTitle.tsx.
const TOTAL_STAGGER_MS = (WORD.length - 1) * STAGGER_MS + LETTER_DURATION_MS
const TRAIL_FADE_DELAY_MS = Math.round(TOTAL_STAGGER_MS * 0.7)
const TRAIL_FADE_DURATION_MS = 280

export interface HeroTitleProps {
  // The letters themselves — the screen's own high-contrast fg color.
  letterColor: string
}

function AnimatedLetter({ char, index, color, reducedMotion, fontFamily, fontSize, lineHeight }: { char: string; index: number; color: string; reducedMotion: boolean; fontFamily: string; fontSize: number; lineHeight: number }) {
  const progress = useSharedValue(reducedMotion ? 1 : 0)

  useEffect(() => {
    if (reducedMotion) return
    progress.value = withDelay(index * STAGGER_MS, withTiming(1, { duration: LETTER_DURATION_MS, easing: Easing.out(Easing.back(1.5)) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion])

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }, { scale: 0.85 + progress.value * 0.15 }]
  }))

  return (
    <Animated.Text allowFontScaling={false} style={[styles.letter, { color, fontFamily, fontSize, lineHeight }, style]}>
      {char}
    </Animated.Text>
  )
}

export function HeroTitle({ letterColor }: HeroTitleProps) {
  const { fonts, colors } = useAutoPaperTheme()
  const reducedMotion = useReducedMotion()
  const [box, setBox] = useState<WordBox | null>(null)

  const trailOpacity = useSharedValue(reducedMotion ? 1 : 0)
  useEffect(() => {
    if (reducedMotion) return
    trailOpacity.value = withDelay(TRAIL_FADE_DELAY_MS, withTiming(1, { duration: TRAIL_FADE_DURATION_MS }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion])
  const trailStyle = useAnimatedStyle(() => ({ opacity: trailOpacity.value }))

  const onLayout = (e: LayoutChangeEvent) => setBox(e.nativeEvent.layout)

  return (
    <View style={styles.wrapper}>
      <View style={styles.row} onLayout={onLayout}>
        {WORD.split('').map((char, i) => (
          <AnimatedLetter key={i} char={char} index={i} color={letterColor} reducedMotion={reducedMotion} fontFamily={fonts.displayLarge.fontFamily} fontSize={fonts.displayLarge.fontSize} lineHeight={fonts.displayLarge.lineHeight} />
        ))}
      </View>

      {box && (
        <Animated.View pointerEvents='none' style={[styles.canvas, trailStyle]}>
          <HeroSnakeTrail box={box} color={SNAKE_COLORS[1]} surfaceColor={colors.surface} tertiaryColor={colors.tertiary} active={!reducedMotion} startDelayMs={TRAIL_FADE_DELAY_MS} />
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  canvas: {
    bottom: -HERO_CANVAS_PAD,
    left: -HERO_CANVAS_PAD,
    position: 'absolute',
    right: -HERO_CANVAS_PAD,
    top: -HERO_CANVAS_PAD
  },
  letter: {
    fontWeight: 'bold'
  },
  row: {
    flexDirection: 'row'
  },
  wrapper: {}
})
