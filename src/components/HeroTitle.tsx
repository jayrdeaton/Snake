// The home screen's animated "SNAKE" wordmark — letters stagger in (via @tastic/hud's shared
// StaggeredWord, ported from LightCycles' AnimatedHeroTitle.tsx), then a forever-looping snake
// (HeroSnakeTrail) fades in once they've mostly settled. See HeroSnakeTrailCanvas.tsx for the loop
// itself.
import { useAutoPaperTheme } from '@rific/auto-paper'
import { getStaggeredWordDuration, StaggeredWord } from '@tastic/hud'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'

import { HERO_CANVAS_PAD, WordBox } from './heroSnakeGeometry'
import { HeroSnakeTrail } from './HeroSnakeTrail'

const WORD = 'SNAKE'

// The loop starts looping the instant it mounts (see HeroSnakeTrail) but stays hidden behind this
// shared fade until the letters are most of the way settled — one "power on" beat once the
// wordmark has mostly landed, rather than motion competing with letters still flying in. Same
// formula/proportions as LightCycles' AnimatedHeroTitle.tsx.
const TOTAL_STAGGER_MS = getStaggeredWordDuration(WORD.length)
const TRAIL_FADE_DELAY_MS = Math.round(TOTAL_STAGGER_MS * 0.7)
const TRAIL_FADE_DURATION_MS = 280

export interface HeroTitleProps {
  // The letters themselves — the screen's own high-contrast fg color.
  letterColor: string
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

  return (
    <View style={styles.wrapper}>
      <StaggeredWord word={WORD} startIndex={0} color={letterColor} fontFamily={fonts.displayLarge.fontFamily} fontSize={fonts.displayLarge.fontSize} lineHeight={fonts.displayLarge.lineHeight} reducedMotion={reducedMotion} onLayout={(e) => setBox(e.nativeEvent.layout)} />

      {box && (
        <Animated.View pointerEvents='none' style={[styles.canvas, trailStyle]}>
          <HeroSnakeTrail box={box} color={colors.primary} surfaceColor={colors.surface} tertiaryColor={colors.tertiary} active={!reducedMotion} startDelayMs={TRAIL_FADE_DELAY_MS} />
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
  wrapper: {}
})
