import { useToast } from '@rific/toaster'
import { UpdateDialog as SharedUpdateDialog } from '@tastic/hud'

// Thin bridge onto the fleet-shared @tastic/hud UpdateDialog, which owns the useUpdater() instance,
// the manifest/confirm bridging, and the themed ConfirmDialog rendering this app used to have no
// equivalent of at all (previously just a bare useUpdater() call in _layout.tsx, with no UI). Kept
// as its own named export (rather than importing SharedUpdateDialog directly in _layout.tsx) purely
// so this app's own onError -> toast wiring has one place to live. Same shape as BoxHockey's,
// Pong's, AirHockey's, and Solitaire's own src/components/UpdateDialog.tsx.
export function UpdateDialog() {
  const { error } = useToast()
  return <SharedUpdateDialog onError={(message) => error('Update check failed', message)} />
}
