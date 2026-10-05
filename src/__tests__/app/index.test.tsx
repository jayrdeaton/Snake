import { configureStore } from '@reduxjs/toolkit'
import { ToastProvider } from '@rific/toaster'
import { fireEvent, render } from '@testing-library/react-native'
import { router } from 'expo-router'
import { Provider as ReduxProvider } from 'react-redux'

import Index from '../../app/index'
import gameReducer, { defaultGameState, type GameSliceState } from '../../redux/gameSlice'

// index.tsx is the real home screen (animated hero title, 1 Player/2 Player buttons, settings
// gear). HeroTitle's own letter/loop animation is Skia/Reanimated-heavy and has no testable
// behavior relevant to index.tsx's own logic, so it's mocked to a trivial stand-in here — same
// narrow, test-file-local override convention as +not-found.test.tsx's own expo-router mock.
jest.mock('@/components/HeroTitle', () => ({ HeroTitle: () => null }))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() }
}))

const mockRouterPush = router.push as jest.Mock

const makeStore = (gameState: GameSliceState = defaultGameState) =>
  configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: gameState }
  })

// Wrapped in ToastProvider (not the full Providers stack - see that component's own doc) because
// index.tsx always renders SettingsDialog (just toggling its internal Dialog's own `visible`, not
// unmounting it), and SettingsDialog now calls useToast() for the Check for Updates row's
// onUpdateError - which throws without a ToastProvider ancestor, settings panel open or not.
const renderIndex = (gameState?: GameSliceState) =>
  render(
    <ReduxProvider store={makeStore(gameState)}>
      <ToastProvider>{<Index />}</ToastProvider>
    </ReduxProvider>
  )

beforeEach(() => {
  mockRouterPush.mockClear()
})

describe('app/index', () => {
  it('renders without crashing', async () => {
    await expect(renderIndex()).resolves.toBeDefined()
  })

  it('renders exactly the 1 Player / 2 Player buttons, with no stats', async () => {
    const { getByText, queryByText } = await renderIndex()
    expect(getByText('1 Player')).toBeTruthy()
    expect(getByText('2 Player')).toBeTruthy()
    // No per-mode high-score stats on this screen — those live on the achievements screen instead.
    expect(queryByText('12')).toBeNull()
    expect(queryByText('Vs CPU')).toBeNull()
  })

  it('navigates to /loadout with mode "onePlayer" when 1 Player is pressed', async () => {
    const { getByText } = await renderIndex()
    fireEvent.press(getByText('1 Player'))
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/loadout', params: { mode: 'onePlayer' } })
  })

  it('navigates to /loadout with mode "twoPlayer" when 2 Player is pressed', async () => {
    const { getByText } = await renderIndex()
    fireEvent.press(getByText('2 Player'))
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/loadout', params: { mode: 'twoPlayer' } })
  })
})
