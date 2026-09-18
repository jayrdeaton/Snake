import { render } from '@testing-library/react-native'
import * as SplashScreen from 'expo-splash-screen'

import RootLayout from '../../app/_layout'
import { UpdateDialog } from '../../components/UpdateDialog'

jest.mock('expo-router', () => ({
  Stack: Object.assign((props: any) => props.children, { Screen: () => null })
}))

// Providers itself is stripped down to just a real ReduxProvider — this suite is testing
// RootLayout's own structure (SplashScreen calls, mounting UpdateDialog), not Providers'
// internals (see components/Providers.test.tsx for that). A real Provider is needed here now that
// ProfilesProvider (a RootLayout descendant, but outside Providers itself) reads/dispatches Redux
// state via useSelector/useDispatch — the real `store` is fine to use as-is: no native module is
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
