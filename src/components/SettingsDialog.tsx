import { useToast } from '@rific/toaster'
import { BaseSettingsDialog } from '@tastic/hud'
import { useDispatch, useSelector } from 'react-redux'

import { release } from '@/constants/release'
import { gameActions } from '@/redux/gameSlice'
import { RootState } from '@/redux/store'

export interface SettingsDialogProps {
  visible: boolean
  onDismiss: () => void
}

// Thin adapter over @tastic/hud's shared settings shell — Snake's own lock orientation/edge guard
// flags (both persisted in gameSlice, unlike LightCycles' AsyncStorage-backed GameSettings — see
// gameSlice.ts's own comment) plug straight into the shared props. Everything else (sound, haptics,
// appearance, update checking) is identical across every app using BaseSettingsDialog and lives
// entirely inside that package now — this dialog no longer has any app-specific children of its
// own: Wrap Edges moved to loadout.tsx's own LoadoutSharedControls row, and the CPU-difficulty
// picker that used to duplicate it here moved to a per-seat picker on the same screen, matching
// BoxHockey's/AirHockey's/LightCycles' identical cross-app convention of keeping per-round board
// options out of Settings entirely. Keeps this file's own external props unchanged so neither of
// its two call sites (index.tsx, loadout.tsx) needed to change — Snake's dialog never supported a
// rotation prop, unlike LightCycles', so this adapter doesn't add one either.
export function SettingsDialog({ visible, onDismiss }: SettingsDialogProps) {
  const dispatch = useDispatch()
  const lockOrientation = useSelector((state: RootState) => state.game.lockOrientation)
  const deferBottomEdgeGestures = useSelector((state: RootState) => state.game.deferBottomEdgeGestures)
  const { error } = useToast()

  return <BaseSettingsDialog visible={visible} onDismiss={onDismiss} version={release.otaVersion} lockOrientation={lockOrientation} onLockOrientationChange={(value) => dispatch(gameActions.setLockOrientation(value))} deferBottomEdgeGestures={deferBottomEdgeGestures} onDeferBottomEdgeGestures={(value) => dispatch(gameActions.setDeferBottomEdgeGestures(value))} onUpdateError={(message) => error('Update check failed', message)} />
}
