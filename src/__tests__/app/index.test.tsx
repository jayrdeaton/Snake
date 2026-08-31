import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render } from '@testing-library/react-native'
import { router } from 'expo-router'
import { Provider as ReduxProvider } from 'react-redux'

import Index from '../../app/index'
import gameReducer, { defaultGameState, type GameSliceState } from '../../redux/gameSlice'

// index.tsx is now the real home screen (title, per-mode high scores, mode buttons, CPU
// difficulty picker, settings gear) rather than Expo-Starter's original `(tabs)` redirect stub,
// so this only mocks expo-router's `router.push` (the one piece of the module the screen
// actually calls) instead of the old `Redirect` shim.
jest.mock('expo-router', () => ({
  router: { push: jest.fn() }
}))

const mockRouterPush = router.push as jest.Mock

const makeStore = (gameState: GameSliceState = defaultGameState) =>
  configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: gameState }
  })

const renderIndex = (gameState?: GameSliceState) => render(<ReduxProvider store={makeStore(gameState)}>{<Index />}</ReduxProvider>)

beforeEach(() => {
  mockRouterPush.mockClear()
})

describe('app/index', () => {
  it('renders without crashing', async () => {
    await expect(renderIndex()).resolves.toBeDefined()
  })

  it('renders the per-mode high scores from Redux state', async () => {
    const { getByText } = await renderIndex({ ...defaultGameState, highScore: { solo: 12, vsCpu: 7, twoPlayer: 3 } })
    expect(getByText('12')).toBeTruthy()
    expect(getByText('7')).toBeTruthy()
    expect(getByText('3')).toBeTruthy()
  })

  it('navigates to /game with mode "solo" when Solo is pressed', async () => {
    const { getAllByText } = await renderIndex()
    fireEvent.press(getAllByText('Solo')[1])
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/game', params: { mode: 'solo' } })
  })

  it('navigates to /loadout with mode "twoPlayer" when 2 Player is pressed', async () => {
    const { getAllByText } = await renderIndex()
    fireEvent.press(getAllByText('2 Player')[1])
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/loadout', params: { mode: 'twoPlayer' } })
  })

  it('opens the CPU difficulty picker on Vs CPU without navigating yet', async () => {
    const { getAllByText, getByText } = await renderIndex()
    await fireEvent.press(getAllByText('Vs CPU')[1])
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(getByText('Easy')).toBeTruthy()
    expect(getByText('Normal')).toBeTruthy()
    expect(getByText('Hard')).toBeTruthy()
  })

  it('dispatches the chosen CPU difficulty and navigates to /loadout with mode "vsCpu"', async () => {
    const { getAllByText, getByText } = await renderIndex()
    await fireEvent.press(getAllByText('Vs CPU')[1])
    await fireEvent.press(getByText('Hard'))
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/loadout', params: { mode: 'vsCpu' } })
  })
})
