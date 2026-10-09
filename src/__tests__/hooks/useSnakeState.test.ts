import { act, renderHook } from '@testing-library/react-native'

import { SNAKE_SPEED_TIER_INTERVAL_MS } from '@/constants/snake'
import { useSnakeState } from '@/hooks/useSnakeState'
import { SnakeRoundSettings } from '@/types'

const GRID = { cols: 30, rows: 30 }
const SETTINGS: SnakeRoundSettings = { wrapEdges: true, speedTier: 'normal', arenaVariant: 'open', enabledPowerups: [] }
const INTERVAL = SNAKE_SPEED_TIER_INTERVAL_MS.normal

// Regression coverage for F084/F085: the tick loop used to run whenever the round was 'playing',
// with no way to hold it, so the snakes kept moving behind an open dialog or a backgrounded app.
describe('useSnakeState paused', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  async function startRound(paused: boolean) {
    const rendered = await renderHook(({ paused: p }: { paused: boolean }) => useSnakeState(GRID, 'solo', SETTINGS, 'normal', undefined, 1, undefined, p), { initialProps: { paused } })
    await act(async () => {
      rendered.result.current.beginPlaying()
    })
    return rendered
  }

  async function advance(ms: number) {
    await act(async () => {
      jest.advanceTimersByTime(ms)
    })
  }

  it('ticks while playing and not paused', async () => {
    const { result } = await startRound(false)
    await advance(INTERVAL * 5)
    expect(result.current.state.tick).toBeGreaterThan(0)
  })

  it('holds the round still while paused, and resumes on unpause', async () => {
    const { result, rerender } = await startRound(true)
    await advance(INTERVAL * 5)
    expect(result.current.state.tick).toBe(0)

    await act(async () => {
      rerender({ paused: false })
    })
    await advance(INTERVAL * 5)
    expect(result.current.state.tick).toBeGreaterThan(0)
  })

  it('stops ticking when a pause lands mid-round', async () => {
    const { result, rerender } = await startRound(false)
    await advance(INTERVAL * 5)
    const tickAtPause = result.current.state.tick
    expect(tickAtPause).toBeGreaterThan(0)

    await act(async () => {
      rerender({ paused: true })
    })
    await advance(INTERVAL * 5)
    expect(result.current.state.tick).toBe(tickAtPause)
  })
})
