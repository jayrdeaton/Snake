import { getFixedZoneRotation, getOpposingZoneRotation, type OrientationState } from '@tastic/core'

import type { SeatToastSpot } from '@/components/SeatToasters'
import type { SeatSplit } from '@/hooks/useSeatSplit'
import type { SnakeId } from '@/types'

/** Where each 2 Player seat's unlock toasts go (SeatToasters): the half of the screen that's theirs, `split` being useSeatSplit's (the halves
 * TouchInputLayer and the countdown use: on a phone always bottom and top, however it's held; on the web by the window's shape), turned the
 * way they read it, from the live hold (`orientation`, as OnboardingOverlay turns its zones). Side by side, each player's stack stays on
 * their own half, so three toasts for one and one for the other are two stacks, one on each side (Jay, 2026-10-20). */
export function seatToastSpots(split: SeatSplit, orientation: Pick<OrientationState, 'orientationMode' | 'p1OnRight' | 'upsideDown'>): Record<SnakeId, SeatToastSpot> {
  const rotation = getFixedZoneRotation(orientation.orientationMode, orientation.p1OnRight, orientation.upsideDown)
  // A browser window wider than tall: side by side at one screen, both upright, each on their own side.
  if (split.orientationMode === 'sideBySide') return split.p1OnRight ? { 1: { rotation, zone: 'right' }, 2: { rotation, zone: 'left' } } : { 1: { rotation, zone: 'left' }, 2: { rotation, zone: 'right' } }
  // Snake 1's half is the bottom, snake 2's the top: face to face, snake 2 turned across the table; in a landscape hold, side by side, both
  // turned the same quarter (see @tastic/core's getOpposingZoneRotation).
  return { 1: { rotation, zone: 'bottom' }, 2: { rotation: getOpposingZoneRotation(rotation), zone: 'top' } }
}
