import AsyncStorage from '@react-native-async-storage/async-storage'
import { combineReducers, configureStore, type Middleware } from '@reduxjs/toolkit'
import { createThemeReducer, getThirdColor } from '@rific/auto-paper'
import { defaultSoundSettings, hapticReducer, soundReducer, type SoundSettings } from '@rific/feedback-press'
import { scrollViewReducer } from '@rific/scroll-view'
import { profilesReducer } from '@tastic/profile'
import { FLUSH, PAUSE, PERSIST, persistReducer, persistStore, PURGE, REGISTER, REHYDRATE } from 'redux-persist'

import { SNAKE_COLORS } from '@/utils/snakeEngine'

import game from './gameSlice'
import liveplay from './liveplaySlice'
import profileSelection from './profileSelectionSlice'
import settings from './settingsSlice'

const hasError = (action: unknown): action is { error?: unknown } => typeof action === 'object' && action !== null && 'error' in action && Boolean(action.error)

const errorMiddleware: Middleware = () => (next) => (action) => {
  if (!hasError(action)) return next(action)
  return action
}

// @rific/feedback-press's own soundReducer defaults `enabled` to true unconditionally (that
// default isn't published with the dev-only override yet). Wrap it so a fresh install with no
// persisted preference (redux-persist finds nothing in AsyncStorage for the `sound` key) defaults
// muted in dev/simulator builds so Claude/local testing doesn't blast audio; production builds
// still default to sound on. All actual action handling still delegates to the package's reducer.
const initialSoundSettings: SoundSettings = { ...defaultSoundSettings, enabled: !__DEV__ }
const appSoundReducer = (state: SoundSettings = initialSoundSettings, action: { type: string }): SoundSettings => soundReducer(state, action)

// Explicit primary/secondary triad (rather than a single seed expanded via harmony) so the app's
// green/yellow identity is pinned exactly instead of drifting with whatever hue math a harmony
// offset would produce. Primary/secondary ARE player 1/player 2's own default colors (SNAKE_COLORS,
// see snakeEngine.ts) rather than independently-chosen hexes, so the app theme and the default snake
// colors can never drift apart. Tertiary is still derived, not picked, via getThirdColor: the hue
// maximally distant from both primary and secondary (see @rific/auto-paper's README "Explicit triad"
// section).
const themeReducer = createThemeReducer({
  color: { primary: SNAKE_COLORS[1], secondary: SNAKE_COLORS[2], tertiary: getThirdColor(SNAKE_COLORS[1], SNAKE_COLORS[2]) }
})

const rootReducer = combineReducers({
  theme: themeReducer,
  scrollView: scrollViewReducer,
  haptic: hapticReducer,
  sound: appSoundReducer,
  settings,
  game,
  // Transient per-round state, deliberately kept out of gameSlice — see liveplaySlice.ts's own doc
  // for why, and persistConfig's blacklist below for how.
  liveplay,
  // The shared App Group roster (see @tastic/profile's resolveInitialProfiles/
  // useSharedProfilesSync, wired in hooks/useProfiles.tsx) is layered on top of this as a separate
  // sync target — this slice persisting normally via redux-persist, same as every other key here,
  // is what gives it local-fallback behavior for the platforms/builds where the shared store isn't
  // available, with no separate hand-rolled AsyncStorage path needed for that case.
  profiles: profilesReducer,
  profileSelection
})

const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  // liveplay is the one slice that must never survive a rehydrate — see its own doc comment.
  // Every other slice here is a genuine persisted preference/record.
  blacklist: ['liveplay']
}

const persistedReducer = persistReducer(persistConfig, rootReducer)

export const store = configureStore({
  middleware: (getDefaultMiddleware) => {
    const defaultMiddleware = getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER]
      }
    })
    return defaultMiddleware.concat(errorMiddleware)
  },
  reducer: persistedReducer
})

export const persistor = persistStore(store)
export type RootState = ReturnType<typeof rootReducer>
export type AppDispatch = typeof store.dispatch
