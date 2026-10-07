import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { REHYDRATE } from 'redux-persist'

import type { SnakeId } from '@/types'
import { SNAKE_COLORS } from '@/utils/snakeEngine'

// /loadout's per-seat color memory. Not a setting: the player's settings live in settingsSlice.ts.
// The other @tastic games keep this same memory in a seatColors slice (@tastic/profile's
// createSeatColorsSlice); Snake hasn't moved to it yet.
export type GameSliceState = {
  // /loadout's own last-picked color per human seat, remembered only for whichever round that seat
  // was a guest (no profile selected) — a profile-selected seat's color always comes live from the
  // profile itself instead (see /loadout's own focus effect), never from here.
  lastGuestColor: Record<SnakeId, string>
  // Same idea as lastGuestColor, but for seat 2's CPU slot in Vs CPU — kept separate so a CPU
  // opponent's last color and a human guest's last color don't fight over one remembered value
  // (seat 1 is never CPU — see game.tsx's own spawn convention).
  lastCpuColor: string
  // A manual recolor/clash-swap landing on a seat that currently has a profile selected — null
  // means "no override, track the profile's own saved color live." Cleared only when that seat's
  // own selection genuinely changes (see loadout.tsx's handleP1ProfileSelect/handleP2ProfileSelect),
  // never by merely leaving and returning to /loadout — persisted here (unlike the transient
  // in-memory ref this used to be) so it survives a focus regain or a full relaunch the same way
  // lastGuestColor/lastCpuColor already do.
  profileOverride: Record<SnakeId, string | null>
}

export const defaultGameState: GameSliceState = {
  lastGuestColor: { 1: SNAKE_COLORS[1], 2: SNAKE_COLORS[2] },
  lastCpuColor: SNAKE_COLORS[2],
  profileOverride: { 1: null, 2: null }
}

const slice = createSlice({
  name: 'game',
  initialState: defaultGameState,
  reducers: {
    setLastGuestColor: (state, action: PayloadAction<{ seat: SnakeId; color: string }>) => ({
      ...state,
      lastGuestColor: { ...state.lastGuestColor, [action.payload.seat]: action.payload.color }
    }),
    setLastCpuColor: (state, action: PayloadAction<string>) => ({ ...state, lastCpuColor: action.payload }),
    setProfileOverride: (state, action: PayloadAction<{ seat: SnakeId; color: string | null }>) => ({
      ...state,
      profileOverride: { ...state.profileOverride, [action.payload.seat]: action.payload.color }
    }),
    resetGameState: () => defaultGameState
  },
  // redux-persist's own autoMergeLevel1 (store.ts's persistConfig has no stateReconciler override,
  // so this is the default) replaces this whole slice's state with whatever got persisted: it is
  // NOT merged field by field against defaultGameState (see its own "skips substate if already
  // modified" comment, which is what lets this extraReducer's own return value pre-empt that
  // wholesale replacement instead of being clobbered by it). Without this, anyone whose last
  // persisted session predates a field being added here (profileOverride landed after this slice's
  // very first shape) would rehydrate with that field genuinely `undefined`, not defaultGameState's
  // own value, crashing anything that assumes the type it's declared as. settingsSlice.ts gets the
  // same backfill built in from @rific/core's createSettingsSlice.
  extraReducers: (builder) => {
    builder.addCase(REHYDRATE, (state, action: { type: typeof REHYDRATE; payload?: { game?: Partial<GameSliceState> } }) => ({ ...defaultGameState, ...state, ...action.payload?.game }))
  }
})

export const gameActions = slice.actions
export default slice.reducer
