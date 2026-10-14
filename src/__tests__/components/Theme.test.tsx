import { configureStore } from '@reduxjs/toolkit'
import { act, render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Provider as ReduxProvider } from 'react-redux'

import { Theme } from '../../components/Theme'
import settingsReducer from '../../redux/settingsSlice'
import { markSplashReady, useSplashReady } from '../../utils/splashGate'

jest.mock('../../utils/splashGate', () => ({
  markSplashReady: jest.fn(),
  // A real (not mocked) useSplashReady would need a real createGate instance behind it.
  // Theme's own 'fonts' gate is driven by useFonts, which mockUseFonts below resolves synchronously,
  // so there's nothing useful this fake would add beyond not throwing when Theme calls it.
  useSplashReady: jest.fn()
}))

// Resolved by default, like the shared src/__mocks__/expo-font.ts; the font-gate tests below override
// it to a failed or still-pending load.
const mockUseFonts = jest.fn<[boolean, Error | null], []>()
jest.mock('expo-font', () => ({ useFonts: () => mockUseFonts() }))

// Keep provider spy in module scope so the factory closure can reference it.
const mockProviderCalls: unknown[] = []
jest.mock('@rific/auto-paper', () => ({
  Provider: (props: any) => {
    mockProviderCalls.push(props)
    return props.children
  },
  themeActions: { initialize: (payload: unknown) => ({ payload, type: 'theme/initialize' }) },
  // Real useThemeBridgeProps just repackages its own argument into the same shape it's given -
  // matching that here keeps this suite asserting on Provider's actual received props (initialValue/
  // onChange/onReady) without needing to know the bridge hook's own internals.
  useThemeBridgeProps: (p: any) => p
}))

const mockMarkSplashReady = markSplashReady as jest.Mock
const mockUseSplashReady = useSplashReady as jest.Mock

const makeStore = (themeState: { appearance: 'light' | 'dark' | 'system'; color: string } = { appearance: 'light', color: '#4caf50' }) =>
  configureStore({
    reducer: {
      settings: settingsReducer,
      theme: (state = themeState) => state
    }
  })

beforeEach(() => {
  jest.clearAllMocks()
  mockProviderCalls.length = 0
  mockUseFonts.mockReturnValue([true, null])
})

describe('Theme', () => {
  it('renders children', async () => {
    const { getByText } = await render(
      <ReduxProvider store={makeStore()}>
        <Theme>
          <Text>hello world</Text>
        </Theme>
      </ReduxProvider>
    )
    expect(getByText('hello world')).toBeTruthy()
  })

  it('passes appearance from Redux state to auto-paper Provider', async () => {
    await render(
      <ReduxProvider store={makeStore({ appearance: 'dark', color: '#4caf50' })}>
        <Theme>
          <Text>child</Text>
        </Theme>
      </ReduxProvider>
    )
    expect(mockProviderCalls.length).toBeGreaterThan(0)
    expect(mockProviderCalls[0]).toEqual(expect.objectContaining({ initialValue: expect.objectContaining({ appearance: 'dark' }) }))
  })

  it('passes color from Redux state to auto-paper Provider', async () => {
    await render(
      <ReduxProvider store={makeStore({ appearance: 'light', color: '#ff0000' })}>
        <Theme>
          <Text>child</Text>
        </Theme>
      </ReduxProvider>
    )
    expect(mockProviderCalls.length).toBeGreaterThan(0)
    expect(mockProviderCalls[0]).toEqual(expect.objectContaining({ initialValue: expect.objectContaining({ color: '#ff0000' }) }))
  })

  it('passes an onReady callback to auto-paper Provider', async () => {
    await render(
      <ReduxProvider store={makeStore()}>
        <Theme>
          <Text>child</Text>
        </Theme>
      </ReduxProvider>
    )
    expect(mockProviderCalls.length).toBeGreaterThan(0)
    const props = mockProviderCalls[0] as any
    expect(typeof props.onReady).toBe('function')
  })

  it("marks the 'theme' splash gate ready when onReady fires", async () => {
    await render(
      <ReduxProvider store={makeStore()}>
        <Theme>
          <Text>child</Text>
        </Theme>
      </ReduxProvider>
    )
    const props = mockProviderCalls[0] as any
    await act(async () => {
      props.onReady()
    })
    expect(mockMarkSplashReady).toHaveBeenCalledWith('theme')
  })

  // mockUseFonts resolves synchronously to [true, null] by default. See Theme.tsx's own comment for
  // why every react-native-paper icon in this app depends on that exact font.
  it("marks the 'fonts' splash gate ready once the icon font resolves", async () => {
    await render(
      <ReduxProvider store={makeStore()}>
        <Theme>
          <Text>child</Text>
        </Theme>
      </ReduxProvider>
    )
    expect(mockUseSplashReady).toHaveBeenCalledWith('fonts', true)
  })

  // A rejected load leaves useFonts' `loaded` false forever, so gating on it alone would never lift
  // the splash.
  it("marks the 'fonts' splash gate ready when the font load fails", async () => {
    mockUseFonts.mockReturnValue([false, new Error('font failed')])
    await render(
      <ReduxProvider store={makeStore()}>
        <Theme>
          <Text>child</Text>
        </Theme>
      </ReduxProvider>
    )
    expect(mockUseSplashReady).toHaveBeenCalledWith('fonts', true)
    expect(mockUseSplashReady).not.toHaveBeenCalledWith('fonts', false)
  })

  it("keeps the 'fonts' splash gate closed while the font is still loading", async () => {
    mockUseFonts.mockReturnValue([false, null])
    await render(
      <ReduxProvider store={makeStore()}>
        <Theme>
          <Text>child</Text>
        </Theme>
      </ReduxProvider>
    )
    expect(mockUseSplashReady).toHaveBeenCalledWith('fonts', false)
    expect(mockUseSplashReady).not.toHaveBeenCalledWith('fonts', true)
  })
})
