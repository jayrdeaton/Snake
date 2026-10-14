import { OrientationProvider, RotationAwareStatusBar } from '@tastic/core'
import { act, render } from '@testing-library/react-native'
import * as SplashScreen from 'expo-splash-screen'

import RootLayout from '../../app/_layout'
import { UpdateDialog } from '../../components/UpdateDialog'
import { DEFAULT_SETTINGS, settingsActions } from '../../redux/settingsSlice'
import { store } from '../../redux/store'

jest.mock('expo-router', () => ({
  Stack: Object.assign((props: any) => props.children, { Screen: () => null })
}))

// Providers itself is stripped down to just a real ReduxProvider - this suite is testing
// RootLayout's own structure (SplashScreen calls, mounting UpdateDialog, the orientation lock
// wiring), not Providers' internals (see components/Providers.test.tsx for that). A real Provider
// is needed here now that ProfilesProvider (a RootLayout descendant, but outside Providers itself)
// reads/dispatches Redux
// state via useSelector/useDispatch - the real `store` is fine to use as-is: no native module is
// available under Jest, so ProfilesProvider's own shared-store reconciliation resolves against its
// empty local fallback, not any real I/O.
jest.mock('../../components/Providers', () => {
  const { Provider: MockReduxProvider } = require('react-redux')
  const { store: mockStore } = require('../../redux/store')
  return {
    Providers: (props: any) => <MockReduxProvider store={mockStore}>{props.children}</MockReduxProvider>
  }
})

// UpdateDialog (@/components/UpdateDialog) is the fleet-shared @tastic/hud UpdateDialog's
// onError -> toast bridge - it owns its own useUpdater() instance internally now, so RootLayout no
// longer calls useUpdater() directly (it used to, before this app converged onto @tastic/hud's
// UpdateDialog - see _layout.tsx's own comment on why). This just confirms RootLayout still mounts
// it, without pulling in its own real @tastic/hud/@rific/toaster dependency chain.
jest.mock('../../components/UpdateDialog', () => ({
  UpdateDialog: jest.fn(() => null)
}))

const mockUpdateDialog = UpdateDialog as jest.Mock

// Only OrientationProvider and RotationAwareStatusBar are stubbed (the rest of @tastic/core stays
// real), so the wiring RootLayout hands them can be read straight off their props: Lock Orientation
// is app-wide (freezeWhileLocked), restored from Redux together with its locked angle, and whatever
// the provider reports through onLockChange lands back in Redux.
jest.mock('@tastic/core', () => ({
  ...jest.requireActual('@tastic/core'),
  OrientationProvider: jest.fn((props: any) => props.children),
  RotationAwareStatusBar: jest.fn(() => null)
}))

const mockOrientationProvider = OrientationProvider as unknown as jest.Mock
const mockRotationAwareStatusBar = RotationAwareStatusBar as unknown as jest.Mock
const latestOrientationProps = () => mockOrientationProvider.mock.calls[mockOrientationProvider.mock.calls.length - 1][0]

// The mocked Providers above hands every render the one real `store`, so each test starts from the
// default lock state rather than whatever the previous one dispatched. lockedRotation is cleared
// explicitly: `initialize` merges, and DEFAULT_SETTINGS has no lockedRotation to merge over it.
afterEach(() => {
  store.dispatch(settingsActions.initialize({ ...DEFAULT_SETTINGS, lockedRotation: undefined }))
  mockOrientationProvider.mockClear()
  mockRotationAwareStatusBar.mockClear()
})

describe('RootLayout', () => {
  it('calls SplashScreen.preventAutoHideAsync on module load', () => {
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalled()
  })

  it('calls SplashScreen.setOptions with fade animation on module load', () => {
    expect(SplashScreen.setOptions).toHaveBeenCalledWith({ fade: true, duration: 400 })
  })

  it('renders without crashing', async () => {
    await expect(render(<RootLayout />)).resolves.toBeDefined()
  })

  it('renders UpdateDialog', async () => {
    await render(<RootLayout />)
    expect(mockUpdateDialog).toHaveBeenCalled()
  })
})

describe('RootLayout orientation lock wiring', () => {
  it('freezes the shared reading app-wide, starting unlocked with no angle by default', async () => {
    await render(<RootLayout />)
    const props = latestOrientationProps()
    expect(props.freezeWhileLocked).toBe(true)
    expect(props.deviceMotion).toBeDefined()
    expect(props.lockInitialValue).toEqual({ locked: false, rotation: undefined })
  })

  // What makes a locked relaunch open in the locked orientation instead of portrait.
  it('restores a persisted lock together with its locked angle', async () => {
    store.dispatch(settingsActions.initialize({ lockOrientation: true, lockedRotation: 90 }))
    await render(<RootLayout />)
    expect(latestOrientationProps().lockInitialValue).toEqual({ locked: true, rotation: 90 })
  })

  it('persists what onLockChange reports: the angle on lock, cleared on unlock', async () => {
    await render(<RootLayout />)

    await act(async () => {
      latestOrientationProps().onLockChange({ locked: true, rotation: -90 })
    })
    expect(store.getState().settings.lockOrientation).toBe(true)
    expect(store.getState().settings.lockedRotation).toBe(-90)
    expect(latestOrientationProps().lockInitialValue).toEqual({ locked: true, rotation: -90 })

    await act(async () => {
      latestOrientationProps().onLockChange({ locked: false, rotation: undefined })
    })
    expect(store.getState().settings.lockOrientation).toBe(false)
    expect(store.getState().settings.lockedRotation).toBeUndefined()
  })

  it('renders RotationAwareStatusBar with no per-call-site lock', async () => {
    await render(<RootLayout />)
    expect(mockRotationAwareStatusBar).toHaveBeenCalled()
    expect(mockRotationAwareStatusBar.mock.calls[0][0]).toEqual({})
  })
})
