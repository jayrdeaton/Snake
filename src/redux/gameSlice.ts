import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type CpuDifficulty = 'easy' | 'normal' | 'hard'

export type GameSliceState = {
  highScore: {
    solo: number
    vsCpu: number
    twoPlayer: number
  }
  wrapEdges: boolean
  cpuDifficulty: CpuDifficulty
  // Mirrors LightCycles' GameSettings.lockOrientation (see useAccelerometerOrientation's own
  // param), relevant again now that Vs CPU/2 Player use the real @tastic/split-screen accelerometer
  // orientation system. LightCycles persists its whole settings object to AsyncStorage separately
  // from Redux (see its gameSettingsValidation.ts) because it predates this app's Redux-first
  // settings setup; Snake already centralizes every other persisted preference (wrapEdges,
  // cpuDifficulty) in this same slice, so adding it here — rather than a parallel local-state/prop
  // scheme just for this one flag — keeps exactly one persisted-settings home instead of two.
  lockOrientation: boolean
}

export const defaultGameState: GameSliceState = {
  highScore: { solo: 0, vsCpu: 0, twoPlayer: 0 },
  wrapEdges: false,
  cpuDifficulty: 'normal',
  lockOrientation: false
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
    setCpuDifficulty: (state, action: PayloadAction<CpuDifficulty>) => ({ ...state, cpuDifficulty: action.payload }),
    setLockOrientation: (state, action: PayloadAction<boolean>) => ({ ...state, lockOrientation: action.payload }),
    resetGameState: () => defaultGameState
  }
})

export const gameActions = slice.actions
export default slice.reducer
