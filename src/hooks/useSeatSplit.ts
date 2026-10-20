import { type OrientationMode, useOrientationState } from '@tastic/core'
import { Platform } from 'react-native'

// How 2 Player's two seats split the screen: which halves TouchInputLayer's zones, the countdown's
// tinted zones, the walls and the power-up badges each seat owns. On a phone it's always
// face-to-face, snake 1 in the bottom half and snake 2 in the top half, however the phone is held,
// the same split the loadout's 2 Player panels are pinned to, so each player keeps the same half of
// the phone from the loadout into the match. The OS is portrait-locked there, so following a
// landscape tilt used to split the phone lengthwise (left/right of the portrait frame), which the
// loadout can't show. Web follows the window's shape (a wide window splits left/right), where the
// loadout follows it too. Only placement: text and glyph rotation still read useOrientationState.
export interface SeatSplit {
  orientationMode: OrientationMode
  p1OnRight: boolean
}

export function useSeatSplit(): SeatSplit {
  const { orientationMode, p1OnRight } = useOrientationState()
  return Platform.OS === 'web' ? { orientationMode, p1OnRight } : { orientationMode: 'faceToFace', p1OnRight: true }
}
