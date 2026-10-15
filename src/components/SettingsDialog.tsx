import { useUpdateErrorToast } from '@rific/toaster'
import type { ViewRotation } from '@tastic/core'
import { BaseSettingsDialog } from '@tastic/hud'
import { useGuide } from '@tastic/hud/guide'

import { release } from '@/constants/release'
import { useSettings } from '@/hooks/useSettings'

export interface SettingsDialogProps {
  visible: boolean
  onDismiss: () => void
  // Live physical-hold rotation (see @tastic/core's useRotation). BaseSettingsDialog lays the sheet
  // out in its own frame turned by this (see @tastic/hud's RotatedFrame), so it reads right-side-up
  // and fits the short edge however the phone is held. Defaults to 0 for a call site that doesn't
  // track one.
  rotation?: ViewRotation
  // Shows the "How to Play" row that replays the intro. Off by default: the in-game (/game) dialog
  // leaves it out, since it's reachable during the 3-2-1 countdown (which stops while Settings is
  // open and restarts from 3 when it closes) and a full-screen guide doesn't belong over a match.
  // Home and /loadout, where nothing is running, turn it on.
  showHowToPlay?: boolean
}

// Thin adapter over @tastic/hud's shared settings shell: Snake's own lock orientation/edge guard
// flags (both in Settings, read and written through useSettings()) plug straight into the shared
// props. Everything else (sound, haptics, appearance, update checking) is identical across every
// app using BaseSettingsDialog and lives
// entirely inside that package now - this dialog no longer has any app-specific children of its
// own: Wrap Edges moved to loadout.tsx's own LoadoutSharedControls row, and the CPU-difficulty
// picker that used to duplicate it here moved to a per-seat picker on the same screen, matching
// BoxHockey's/AirHockey's/LightCycles' identical cross-app convention of keeping per-round board
// options out of the Settings dialog entirely. Keeps this file's own external props unchanged aside from the
// rotation addition below (mirroring LightCycles' own SettingsDialog exactly), so none of its three
// call sites (index.tsx, loadout.tsx, game.tsx) needed to change shape beyond threading rotation
// through - this dialog renders as a centered Portal modal with no per-player zone of its own (see
// the prop's own comment above), so the far seat in a rotating match now sees it rotated to match
// instead of always upright relative to the device's fixed physical frame.
export function SettingsDialog({ visible, onDismiss, rotation = 0, showHowToPlay = false }: SettingsDialogProps) {
  const { settings, setSettings } = useSettings()
  const onUpdateError = useUpdateErrorToast()
  const { open: openGuide } = useGuide()

  return <BaseSettingsDialog visible={visible} onDismiss={onDismiss} rotation={rotation} version={release.otaVersion} lockOrientation={settings.lockOrientation} onLockOrientationChange={(value) => setSettings({ lockOrientation: value })} deferBottomEdgeGestures={settings.deferBottomEdgeGestures} onDeferBottomEdgeGestures={(value) => setSettings({ deferBottomEdgeGestures: value })} keepAwake={settings.keepAwake} onKeepAwakeChange={(value) => setSettings({ keepAwake: value })} onUpdateError={onUpdateError} onShowHowToPlay={showHowToPlay ? openGuide : undefined} />
}
