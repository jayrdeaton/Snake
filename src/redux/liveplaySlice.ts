import { createSettingsSlice } from '@rific/core'

// Deliberately its own slice, blacklisted from redux-persist in store.ts, rather than a field on
// gameSlice alongside deferBottomEdgeGestures — every other field there is a persisted user
// preference/record, and this is the opposite: transient per-round state that must never survive a
// rehydrate. A crash/force-quit mid-round leaving this stuck `true` in storage would re-enable Edge
// Guard (see Providers.tsx's EdgeGuardBridge) the instant the app cold-launches back to the title
// screen, well before any game screen remounts to correct it — the exact bug this split avoids.
//
// Built on @rific/core's createSettingsSlice (already a real, direct dependency — see
// package.json) rather than a hand-rolled createSlice: one field, one setter is exactly that
// factory's default shape, the same one hapticSlice/soundSlice/scrollViewSlice/themeSlice already
// use for their own single- and multi-field settings. `initialize` comes along for free and is
// unused here — harmless, not worth a fieldSetters override to suppress.
export type LiveplaySliceState = {
  // Whether /game currently has a round actually in progress (phase === 'playing'), not merely
  // "the /game screen is mounted" (which also covers onboarding/gameOver). Written by game.tsx as
  // phase changes, and reset to false on that screen's own unmount so leaving mid-round by any
  // path (not just the in-app back button) can't leave this stuck true either.
  activelyPlaying: boolean
}

const { actions, reducer } = createSettingsSlice<LiveplaySliceState>('liveplay', {
  initialState: { activelyPlaying: false }
})

export const liveplayActions = actions
export default reducer
