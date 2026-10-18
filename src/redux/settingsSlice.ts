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
  // Two key schemes, the same as LightCycles: WASD for player 1 (the left half of a wide desktop
  // window) and the arrows for player 2 (the right half). Not 'mouse': mouse drag steers every seat
  // whatever its scheme (TouchInputLayer is always on), so a 'mouse' seat only loses its keys.
  controlScheme: { 1: 'wasd', 2: 'arrows' },
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
