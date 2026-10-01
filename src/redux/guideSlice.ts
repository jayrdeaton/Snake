import { createGuideSlice } from '@tastic/hud/guide'

import { GUIDE_VERSION } from '@/constants/guide'

// Thin binding over @tastic/hud/guide's createGuideSlice factory: the persisted "which version of the
// how-to-play flow has this player finished or skipped" flag. A fresh install starts at 0 (the guide
// auto-shows on Home); a player who already had the app before this slice existed is stamped with
// GUIDE_VERSION on their first rehydrate, so an over-the-air update never greets them with a "how to
// play" screen (see the factory's own doc for how it tells the two apart). Mounted under `guide` in
// store.ts (that key is what the REHYDRATE payload is read from) and left at the factory's default
// persistKey ('root'), which is store.ts's persistConfig key.
const slice = createGuideSlice({ currentVersion: GUIDE_VERSION })

// The AsyncStorage keys shipped builds wrote outside the redux-persist root store, for store.ts's
// createReturningPlayerMigrate: no root store but any of these present means a returning player, not
// a fresh install. The root store dates from the initial commit (a833168, 2026-08-31, already at
// otaVersion 2), and no Snake update in this repo's history predates it, so there is no pre-redux
// build to read keys from. These two are what the last shipped update (20cebd3, otaVersion 5) wrote:
// @tastic/achievements' useAchievements with namespace 'snake' (hooks/useGameStats.tsx) stores
// `${namespace}.stats` and `${namespace}.achievements`. Literals on purpose, not today's constants: a
// historical record that must not change if today's code renames something. Nothing today writes
// either key before PersistGate opens (GameStatsProvider mounts inside it), so a fresh install can't
// already have one when the migrate runs.
export const LEGACY_STORAGE_KEYS: readonly string[] = ['snake.stats', 'snake.achievements']

export const guideActions = slice.actions
export const selectGuideVersionSeen = slice.selectVersionSeen
export default slice.reducer
