import { render } from '@testing-library/react-native'
import { Text } from 'react-native'

import { Providers } from '../../components/Providers'

const mockHapticProviderCalls: unknown[] = []
jest.mock('@rific/auto-paper', () => ({
  Provider: (props: any) => props.children,
  themeActions: { initialize: (payload: unknown) => ({ payload, type: 'theme/initialize' }) },
  themeReducer: (state = { appearance: 'auto', blur: true, color: '#4caf50', harmony: 'split-complementary' }) => state,
  createThemeReducer:
    (initialState: unknown) =>
    (state = { appearance: 'system', blur: true, harmony: 'split-complementary', ...(initialState as object) }) =>
      state,
  getThirdColor: () => '#6122c8',
  // Real useThemeBridgeProps just repackages its own argument into the same shape it's given.
  useThemeBridgeProps: (p: any) => p
}))

jest.mock('@rific/feedback-press', () => ({
  hapticActions: { initialize: (payload: unknown) => ({ payload, type: 'haptic/initialize' }) },
  soundActions: { initialize: (payload: unknown) => ({ payload, type: 'sound/initialize' }) },
  FeedbackPressProvider: (props: any) => {
    mockHapticProviderCalls.push(props)
    return props.children
  },
  hapticReducer: (state = { vibrate: true }) => state,
  soundReducer: (state = { enabled: true }) => state,
  // The real hook is a pure passthrough/memoize over its own arg (see @rific/feedback-press' own
  // useFeedbackBridgeProps) — an identity function reproduces that here, so Providers.tsx's
  // `<FeedbackPressProvider {...bridgeProps}>` still receives initialValue/soundInitialValue
  // unchanged, exactly as it did before Providers.tsx called this hook.
  useFeedbackBridgeProps: (props: any) => props
}))

jest.mock('@rific/toaster', () => ({
  Toaster: () => null,
  ToastProvider: (props: any) => props.children
}))

jest.mock('../../utils/splashGate', () => ({
  markSplashReady: jest.fn(),
  useSplashReady: jest.fn()
}))

beforeEach(() => {
  mockHapticProviderCalls.length = 0
})

describe('Providers', () => {
  it('renders without crashing', async () => {
    await expect(
      render(
        <Providers>
          <Text>test</Text>
        </Providers>
      )
    ).resolves.toBeDefined()
  })

  it('renders children', async () => {
    const { getByText } = await render(
      <Providers>
        <Text>app content</Text>
      </Providers>
    )
    expect(getByText('app content')).toBeTruthy()
  })

  it('passes vibrate=true (default) to FeedbackPressProvider', async () => {
    await render(
      <Providers>
        <Text>child</Text>
      </Providers>
    )
    expect(mockHapticProviderCalls.length).toBeGreaterThan(0)
    expect(mockHapticProviderCalls[0]).toEqual(expect.objectContaining({ initialValue: expect.objectContaining({ vibrate: true }) }))
  })

  it('passes enabled=false (dev default, no stored preference) sound settings to FeedbackPressProvider', async () => {
    // store.ts defaults a never-persisted sound preference to !__DEV__, which is false in this
    // Jest/dev environment, so local/Claude test runs stay muted; production defaults to true.
    await render(
      <Providers>
        <Text>child</Text>
      </Providers>
    )
    expect(mockHapticProviderCalls.length).toBeGreaterThan(0)
    expect(mockHapticProviderCalls[0]).toEqual(expect.objectContaining({ soundInitialValue: expect.objectContaining({ enabled: false }) }))
  })
})
