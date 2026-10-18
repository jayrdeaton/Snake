import { createSeatColorsSlice, type SeatColorsState as SeatColorsStateGeneric } from '@tastic/profile'

import type { SnakeId } from '@/types'
import { SNAKE_COLORS } from '@/utils/snakeEngine'

// The loadout's per-seat color memory: a thin binding over @tastic/profile's createSeatColorsSlice
// (see its doc for each field: a guest seat's last color, the CPU seat's last color, and each
// profile's own color pick in Snake, kept by profile id). Not a setting: the player's settings live
// in settingsSlice.ts.
export type SeatColorsState = SeatColorsStateGeneric<SnakeId>

export const defaultSeatColorsState: SeatColorsState = {
  lastGuestColor: { 1: SNAKE_COLORS[1], 2: SNAKE_COLORS[2] },
  lastCpuColor: SNAKE_COLORS[2],
  profileColors: {}
}

const { actions, reducer } = createSeatColorsSlice<SnakeId>('snake', defaultSeatColorsState)

export const seatColorsActions = actions
export default reducer
