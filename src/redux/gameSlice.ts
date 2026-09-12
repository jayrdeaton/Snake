import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { REHYDRATE } from 'redux-persist'

import type { ControlScheme, SnakeArenaVariant, SnakeGridSizeTier, SnakeId, SnakePowerupType, SnakeSpeedTier } from '@/types'
import { SNAKE_COLORS } from '@/utils/snakeEngine'

export type CpuDifficulty = 'easy' | 'normal' | 'hard'

export type GameSliceState = {
  highScore: {
    solo: number
    vsCpu: number
    twoPlayer: number
  }
  wrapEdges: boolean
  // Caps the board's own width via @tastic/core's computeContentBounds (see game.tsx and
  // constants/snake.ts's MAX_BOARD_CONTENT_WIDTH) on a wide desktop-web window, AND keeps the board
  // within the device's safe area (useSafeAreaInsets — notch/status bar, home indicator) — mirrors
  // LightCycles' "Full Screen"/extendIntoSafeArea toggle in both spirit and scope. false (the
  // default) caps at MAX_BOARD_CONTENT_WIDTH with centered gutters on either side AND insets the
  // board within the safe area; true uses the full raw window, ignoring both, same as every build
  // of this app before this field existed. Deliberately excluded from loadout.tsx's "Randomize"
  // shuffle even though its own toggle lives in the same LoadoutSharedControls row as wrapEdges —
  // see that handler's own comment for why.
  fullScreen: boolean
  // null means "no real difficulty has ever been picked yet" — the default computer player is no
  // computer player at all (Solo), not Normal. Distinct from loadout.tsx's own 'none' (a per-round
  // "skip the CPU this time" choice that's deliberately never persisted, see its own comment): once
  // a real Easy/Normal/Hard pick lands here via setCpuDifficulty, it stays non-null forever after,
  // same "remember my real preference" convention lastGuestColor/lastCpuColor use for player colors.
  cpuDifficulty: CpuDifficulty | null
  // Mirrors LightCycles' GameSettings.lockOrientation (see useOrientationState's own
  // param), relevant again now that Vs CPU/2 Player use the real @tastic/core accelerometer
  // orientation system. LightCycles persists its whole settings object to AsyncStorage separately
  // from Redux (see its gameSettingsValidation.ts) because it predates this app's Redux-first
  // settings setup; Snake already centralizes every other persisted preference (wrapEdges,
  // cpuDifficulty) in this same slice, so adding it here — rather than a parallel local-state/prop
  // scheme just for this one flag — keeps exactly one persisted-settings home instead of two.
  lockOrientation: boolean
  // iOS-only. Off by default — deliberately opt-in rather than always-on, so it only kicks in for
  // someone who's actually hit the problem and gone looking for a fix, instead of every player
  // eating a "swipe twice to go home" surprise from day one. Mirrored into native UserDefaults (see
  // Providers.tsx's EdgeGuardBridge) for plugins/withDeferBottomEdgeGestures.js's swizzled
  // preferredScreenEdgesDeferringSystemGestures to read at runtime. Lives here rather than a
  // separate settings object, same reasoning as lockOrientation immediately above: this app already
  // centralizes every persisted preference in this one slice instead of opening a second, parallel
  // persisted-settings mechanism just for one flag (see LightCycles' own GameSettings.
  // deferBottomEdgeGestures for the non-Redux version of the same idea).
  deferBottomEdgeGestures: boolean
  // /loadout's own last-picked color per human seat, remembered only for whichever round that seat
  // was a guest (no profile selected) — a profile-selected seat's color always comes live from the
  // profile itself instead (see /loadout's own focus effect), never from here.
  lastGuestColor: Record<SnakeId, string>
  // Same idea as lastGuestColor, but for seat 2's CPU slot in Vs CPU — kept separate so a CPU
  // opponent's last color and a human guest's last color don't fight over one remembered value
  // (seat 1 is never CPU — see game.tsx's own spawn convention).
  lastCpuColor: string
  // /loadout's own per-seat control-scheme picker (web only — see PlayerSetupPanel's showControlScheme).
  // Persisted here rather than on Profile (unlike LightCycles' Profile.keyScheme) since Snake's
  // Profile is the shared @tastic/profile package's own type as-is (see useProfiles.tsx's own
  // comment: "no per-seat extension field here either") — extending it would mean forking a type
  // shared with every other @tastic game, so a seat's scheme instead just remembers per-seat like
  // lastGuestColor does, independent of whichever profile (if any) is selected there. Defaults keep
  // the two seats on different values (mirroring LightCycles' own asymmetric {1:'wasd',2:'arrows'}
  // default) since seat 1 and seat 2 can share one desktop's keyboard/mouse — see PlayerSetupPanel's
  // otherControlScheme/takenValue wiring, which keeps them that way once /loadout is reachable.
  controlScheme: Record<SnakeId, ControlScheme>
  // Per-round tick speed — mirrors LightCycles' SpeedTier (see constants/snake.ts's
  // SNAKE_SPEED_TIER_INTERVAL_MS). Lives here, not a separate settings object, same "one persisted-
  // settings home" reasoning as lockOrientation/deferBottomEdgeGestures above.
  speedTier: SnakeSpeedTier
  // Per-round static obstacle layout — mirrors LightCycles' ArenaVariant (see utils/arenas.ts).
  arenaVariant: SnakeArenaVariant
  // Which powerup types can spawn this round — not a separate on/off flag: "powerups off" is just
  // an empty array (see snakeEngine.ts's createInitialSnakeState, which only ever spawns from this
  // list), so a single multi-select control covers both at once. Empty by default — powerups are
  // an opt-in variant, not a default-on behavior change for existing players.
  enabledPowerups: SnakePowerupType[]
  // Per-round cell pixel size — mirrors LightCycles' GridSizeTier (see constants/snake.ts's
  // SNAKE_CELL_PX). Lives here, not a separate settings object, same "one persisted-settings home"
  // reasoning as speedTier/arenaVariant above.
  gridSizeTier: SnakeGridSizeTier
}

export const defaultGameState: GameSliceState = {
  highScore: { solo: 0, vsCpu: 0, twoPlayer: 0 },
  wrapEdges: false,
  fullScreen: false,
  cpuDifficulty: null,
  lockOrientation: false,
  deferBottomEdgeGestures: false,
  lastGuestColor: { 1: SNAKE_COLORS[1], 2: SNAKE_COLORS[2] },
  lastCpuColor: SNAKE_COLORS[2],
  controlScheme: { 1: 'mouse', 2: 'wasd' },
  speedTier: 'normal',
  arenaVariant: 'open',
  enabledPowerups: [],
  gridSizeTier: 'medium'
}

const slice = createSlice({
  name: 'game',
  initialState: defaultGameState,
  reducers: {
    setHighScore: (state, action: PayloadAction<{ mode: keyof GameSliceState['highScore']; score: number }>) => ({
      ...state,
      highScore: {
        ...state.highScore,
        [action.payload.mode]: Math.max(state.highScore[action.payload.mode], action.payload.score)
      }
    }),
    setWrapEdges: (state, action: PayloadAction<boolean>) => ({ ...state, wrapEdges: action.payload }),
    setFullScreen: (state, action: PayloadAction<boolean>) => ({ ...state, fullScreen: action.payload }),
    setCpuDifficulty: (state, action: PayloadAction<CpuDifficulty>) => ({ ...state, cpuDifficulty: action.payload }),
    setLockOrientation: (state, action: PayloadAction<boolean>) => ({ ...state, lockOrientation: action.payload }),
    setDeferBottomEdgeGestures: (state, action: PayloadAction<boolean>) => ({ ...state, deferBottomEdgeGestures: action.payload }),
    setLastGuestColor: (state, action: PayloadAction<{ seat: SnakeId; color: string }>) => ({
      ...state,
      lastGuestColor: { ...state.lastGuestColor, [action.payload.seat]: action.payload.color }
    }),
    setLastCpuColor: (state, action: PayloadAction<string>) => ({ ...state, lastCpuColor: action.payload }),
    setControlScheme: (state, action: PayloadAction<{ seat: SnakeId; scheme: ControlScheme }>) => ({
      ...state,
      controlScheme: { ...state.controlScheme, [action.payload.seat]: action.payload.scheme }
    }),
    setSpeedTier: (state, action: PayloadAction<SnakeSpeedTier>) => ({ ...state, speedTier: action.payload }),
    setArenaVariant: (state, action: PayloadAction<SnakeArenaVariant>) => ({ ...state, arenaVariant: action.payload }),
    setEnabledPowerups: (state, action: PayloadAction<SnakePowerupType[]>) => ({ ...state, enabledPowerups: action.payload }),
    setGridSizeTier: (state, action: PayloadAction<SnakeGridSizeTier>) => ({ ...state, gridSizeTier: action.payload }),
    // Scoped to just the high-score record — unlike resetGameState below, this doesn't touch
    // wrapEdges/fullScreen/cpuDifficulty/lockOrientation/deferBottomEdgeGestures/lastGuestColor/
    // lastCpuColor/controlScheme/speedTier/arenaVariant/enabledPowerups/gridSizeTier, since
    // achievements.tsx's own "Reset All Stats" action should only erase tracked stats, not silently
    // revert every other persisted preference along with them.
    resetHighScore: (state) => ({ ...state, highScore: defaultGameState.highScore }),
    resetGameState: () => defaultGameState
  },
  // redux-persist's own autoMergeLevel1 (store.ts's persistConfig has no stateReconciler override,
  // so this is the default) replaces this whole slice's state with whatever got persisted, field by
  // field is NOT merged against defaultGameState — see its own "skips substate if already modified"
  // comment, which is what lets this extraReducer's own return value pre-empt that wholesale
  // replacement instead of being clobbered by it. Without this, anyone whose last persisted session
  // predates a field being added here (enabledPowerups, controlScheme, speedTier, arenaVariant,
  // lockOrientation, deferBottomEdgeGestures, gridSizeTier all landed after this slice's very first
  // shape) would rehydrate with that field genuinely `undefined` — not defaultGameState's own value —
  // the first time this code runs against their existing AsyncStorage data, crashing anything that
  // assumes the type it's declared as (e.g. loadout.tsx's `enabledPowerups.length`).
  extraReducers: (builder) => {
    builder.addCase(REHYDRATE, (state, action: { type: typeof REHYDRATE; payload?: { game?: Partial<GameSliceState> } }) => ({ ...defaultGameState, ...state, ...action.payload?.game }))
  }
})

export const gameActions = slice.actions
export default slice.reducer
