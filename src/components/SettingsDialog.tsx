import { useUpdateErrorToast } from '@rific/toaster'
import type { ViewRotation } from '@tastic/core'
import { BaseSettingsDialog } from '@tastic/hud'
import { useGuide } from '@tastic/hud/guide'
import { useDispatch, useSelector } from 'react-redux'

import { release } from '@/constants/release'
import { gameActions } from '@/redux/gameSlice'
import { RootState } from '@/redux/store'

export interface SettingsDialogProps {
  visible: boolean
  onDismiss: () => void
  // Live physical-hold rotation (see @tastic/core's getViewRotation) — this is a centered,
  // app-wide modal with no per-player zone to match (unlike OnboardingOverlay/RoundOverDialog), so
  // it just rotates its own content in place; defaults to 0 for call sites that don't have a live
  // orientation signal handy (there's nothing else for it to stay consistent with).
  rotation?: ViewRotation
  // Shows the "How to Play" row that replays the intro. Off by default: the in-game (/game) dialog
  // leaves it out, since it's reachable during the 3-2-1 countdown (which keeps running behind it)
  // and a full-screen guide doesn't belong over a match. Home and /loadout, where nothing is
  // running, turn it on.
  showHowToPlay?: boolean
}

// Thin adapter over @tastic/hud's shared settings shell — Snake's own lock orientation/edge guard
// flags (both persisted in gameSlice, unlike LightCycles' AsyncStorage-backed GameSettings — see
// gameSlice.ts's own comment) plug straight into the shared props. Everything else (sound, haptics,
// appearance, update checking) is identical across every app using BaseSettingsDialog and lives
// entirely inside that package now — this dialog no longer has any app-specific children of its
// own: Wrap Edges moved to loadout.tsx's own LoadoutSharedControls row, and the CPU-difficulty
// picker that used to duplicate it here moved to a per-seat picker on the same screen, matching
// BoxHockey's/AirHockey's/LightCycles' identical cross-app convention of keeping per-round board
// options out of Settings entirely. Keeps this file's own external props unchanged aside from the
// rotation addition below (mirroring LightCycles' own SettingsDialog exactly), so none of its three
// call sites (index.tsx, loadout.tsx, game.tsx) needed to change shape beyond threading rotation
// through — this dialog renders as a centered Portal modal with no per-player zone of its own (see
// the prop's own comment above), so the far seat in a rotating match now sees it rotated to match
// instead of always upright relative to the device's fixed physical frame.
export function SettingsDialog({ visible, onDismiss, rotation = 0, showHowToPlay = false }: SettingsDialogProps) {
  const dispatch = useDispatch()
  const lockOrientation = useSelector((state: RootState) => state.game.lockOrientation)
  const deferBottomEdgeGestures = useSelector((state: RootState) => state.game.deferBottomEdgeGestures)
  const onUpdateError = useUpdateErrorToast()
  const { open: openGuide } = useGuide()

  return <BaseSettingsDialog visible={visible} onDismiss={onDismiss} rotation={rotation} version={release.otaVersion} lockOrientation={lockOrientation} onLockOrientationChange={(value) => dispatch(gameActions.setLockOrientation(value))} deferBottomEdgeGestures={deferBottomEdgeGestures} onDeferBottomEdgeGestures={(value) => dispatch(gameActions.setDeferBottomEdgeGestures(value))} onUpdateError={onUpdateError} onShowHowToPlay={showHowToPlay ? openGuide : undefined} />
}
