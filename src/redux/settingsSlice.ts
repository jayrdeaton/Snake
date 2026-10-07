import { createSettingsSlice } from '@rific/core'

import type { Settings } from '@/types'

// The persisted settings: a Redux slice like every other persisted value in this app, read and
// written only through hooks/useSettings.ts. Built on @rific/core's createSettingsSlice: `initialize`
// in 'merge' mode is the single write path (setSettings' partial patch), and its REHYDRATE handling
// fills any field added after a player's settings were saved from DEFAULT_SETTINGS, so no
// validation or migration is needed.
export const DEFAULT_SETTINGS: Settings = {
  wrapEdges: false,
  fullScreen: false,
  cpuDifficulty: null,
  lockOrientation: false,
  deferBottomEdgeGestures: false,
  // Asymmetric defaults (not both 'mouse') so two seats sharing one desktop's keyboard/mouse don't
  // start out colliding, mirroring LightCycles' own asymmetric {1:'wasd',2:'arrows'} default.
  controlScheme: { 1: 'mouse', 2: 'wasd' },
  speedTier: 'normal',
  arenaVariant: 'open',
  enabledPowerups: [],
  gridSizeTier: 'medium'
}

const { actions, reducer } = createSettingsSlice<Settings, 'merge', never>('settings', {
  initialState: DEFAULT_SETTINGS,
  initializeMode: 'merge',
  fieldSetters: []
})

export const settingsActions = actions
export default reducer
