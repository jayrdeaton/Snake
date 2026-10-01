import { useAutoPaperTheme } from '@rific/auto-paper'
import { StyleSheet, View } from 'react-native'
import { Icon } from 'react-native-paper'

// Snake-specific illustrations for the how-to-play cards (see constants/guideSteps.tsx). The generic
// ones (SwipeHint, including its pointer='mouse' drag, DirectionKeysHint, SeatDiagram and
// SeatDevicesHint) live in @tastic/hud/guide; this only makes sense for this game. Plain Views and
// react-native-paper Icons: no Skia, so it costs nothing to mount over the Home screen. Its color
// comes from the live theme (primary = P1), so it always matches the color player 1 has picked.

// A snake doubling back into its own body: "snakes, even your own, are deadly" in one picture, and
// the one crash every mode can have (Solo has no second snake to hit).
export function GuideSnakeCrash() {
  const { colors } = useAutoPaperTheme()
  const body = { backgroundColor: colors.primary }

  return (
    <View accessible accessibilityLabel='A snake crashing into its own body' style={styles.stage}>
      <View style={[styles.segment, styles.segmentTop, body]} />
      <View style={[styles.segment, styles.segmentRight, body]} />
      <View style={[styles.segment, styles.segmentBottom, body]} />
      <View style={[styles.segment, styles.segmentUp, body]} />
      <View style={[styles.head, body]} />
      <View style={styles.crash}>
        <Icon source='close-thick' size={26} color={colors.error} />
      </View>
    </View>
  )
}

// Snake-body thickness in the crash picture, and the head's diameter.
const BODY = 10
const HEAD = 16

const styles = StyleSheet.create({
  crash: {
    left: 52,
    position: 'absolute',
    top: 21
  },
  // Centered on the upward segment's leading end, pointing at the top segment it's about to hit.
  head: {
    borderRadius: HEAD / 2,
    height: HEAD,
    left: 57,
    position: 'absolute',
    top: 42,
    width: HEAD
  },
  // Tail at the top-left, running right, down, back left, then up into its own top segment.
  segment: {
    borderRadius: BODY / 2,
    position: 'absolute'
  },
  segmentBottom: {
    height: BODY,
    left: 60,
    top: 78,
    width: 72
  },
  segmentRight: {
    height: 68,
    left: 122,
    top: 20,
    width: BODY
  },
  segmentTop: {
    height: BODY,
    left: 16,
    top: 20,
    width: 116
  },
  segmentUp: {
    height: 38,
    left: 60,
    top: 50,
    width: BODY
  },
  stage: {
    height: 108,
    width: 156
  }
})
