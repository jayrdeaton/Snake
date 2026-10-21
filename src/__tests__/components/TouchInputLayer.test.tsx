import { render } from '@testing-library/react-native'

import TouchInputLayer from '@/components/TouchInputLayer'
import { MIN_SWIPE_DISTANCE, TAP_MAX_DISTANCE } from '@/utils/turnIntent'

// A recording stand-in for RNGH's gesture builders: every chained call is kept, so the test can
// read how TouchInputLayer configured its Tap and call the Tap's own onEnd the way RNGH would.
interface MockGesture {
  kind: string
  calls: Record<string, unknown[]>
}
const mockGestures: MockGesture[] = []
function mockBuilder(kind: string) {
  const gesture: MockGesture & Record<string, unknown> = { kind, calls: {} }
  for (const method of ['maxPointers', 'minDistance', 'maxDistance', 'hitSlop', 'enabled', 'onStart', 'onUpdate', 'onEnd']) {
    gesture[method] = (...args: unknown[]) => {
      gesture.calls[method] = args
      return gesture
    }
  }
  mockGestures.push(gesture)
  return gesture
}

jest.mock('react-native-gesture-handler', () => ({
  Gesture: { Pan: () => mockBuilder('pan'), Tap: () => mockBuilder('tap'), Simultaneous: (...gestures: unknown[]) => ({ gestures }) },
  GestureDetector: ({ children }: { children?: React.ReactNode }) => children
}))

jest.mock('@/hooks/useSnakeSounds', () => ({ useSnakeSounds: () => ({ playTurn: jest.fn() }) }))

jest.mock('@rific/feedback-press', () => ({ useVibration: () => ({ selection: jest.fn() }) }))

jest.mock('@tastic/core', () => ({ useOrientationState: () => ({ orientationMode: 'faceToFace', p1OnRight: false, upsideDown: false }) }))

function latestTap(): MockGesture {
  const taps = mockGestures.filter((g) => g.kind === 'tap')
  return taps[taps.length - 1]
}

// Regression coverage for F063: the Tap had no maxDistance, so RNGH never failed it on movement, and
// a quick swipe released inside the Tap's time limit spent the held powerup mid-turn.
describe('TouchInputLayer tap-to-activate', () => {
  beforeEach(() => {
    mockGestures.length = 0
  })

  async function renderLayer(onActivate: jest.Mock) {
    await render(<TouchInputLayer mode='solo' enabled onTurn={jest.fn()} onActivate={onActivate} controlInverted={{ 1: false, 2: false }} currentDirections={{ 1: 'up', 2: 'up' }} />)
  }

  it('fails the tap once a finger drifts past TAP_MAX_DISTANCE, with hitSlop like the pan', async () => {
    await renderLayer(jest.fn())
    expect(latestTap().calls.maxDistance).toEqual([TAP_MAX_DISTANCE])
    expect(latestTap().calls.hitSlop).toEqual([{}])
  })

  it('activates only for a tap RNGH reports as successful', async () => {
    const onActivate = jest.fn()
    await renderLayer(onActivate)
    const onEnd = latestTap().calls.onEnd[0] as (event: unknown, success: boolean) => void

    onEnd({}, false)
    expect(onActivate).not.toHaveBeenCalled()

    onEnd({}, true)
    expect(onActivate).toHaveBeenCalledWith(1)
  })

  it('keeps TAP_MAX_DISTANCE below the swipe threshold, so a tap and a swipe never overlap', () => {
    expect(TAP_MAX_DISTANCE).toBeLessThan(MIN_SWIPE_DISTANCE)
  })
})

// A touchscreen browser (a Surface in 2 Player) read two players' touches as a pinch and zoomed the
// page, pushing the board's bottom wall off screen while the snake kept going toward it. The tests
// run without a DOM, so a stand-in document.body.style is enough to read what the layer sets.
describe('TouchInputLayer browser touch gestures', () => {
  const { Platform } = jest.requireActual<typeof import('react-native')>('react-native')
  const originalOS = Platform.OS
  const globals = globalThis as unknown as { document?: { body: { style: Record<string, string> } } }
  let style: Record<string, string>

  beforeEach(() => {
    style = { touchAction: 'pan-y', overscrollBehavior: '' }
    globals.document = { body: { style } }
  })

  afterEach(() => {
    Platform.OS = originalOS
    delete globals.document
  })

  async function renderLayer() {
    return render(<TouchInputLayer mode='dual' enabled={false} onTurn={jest.fn()} onActivate={jest.fn()} controlInverted={{ 1: false, 2: false }} currentDirections={{ 1: 'up', 2: 'up' }} />)
  }

  it('turns off pinch-zoom and pan on web while mounted, even between rounds, and restores them on unmount', async () => {
    Platform.OS = 'web'
    const { unmount } = await renderLayer()
    expect(style.touchAction).toBe('none')
    expect(style.overscrollBehavior).toBe('none')
    await unmount()
    expect(style.touchAction).toBe('pan-y')
    expect(style.overscrollBehavior).toBe('')
  })

  it('leaves the page alone on native', async () => {
    await renderLayer()
    expect(style.touchAction).toBe('pan-y')
  })
})
