import { useBackgroundPause } from '@tastic/core'
import { act, renderHook } from '@testing-library/react-native'
import { AppState } from 'react-native'

import { SNAKE_SPEED_TIER_INTERVAL_MS } from '@/constants/snake'
import { useSnakeState } from '@/hooks/useSnakeState'
import { GridSize, SnakeRoundSettings } from '@/types'

import { emitAppState } from '../testUtils/appState'

const INTERVAL = SNAKE_SPEED_TIER_INTERVAL_MS.normal
// Wrapping edges on a roomy board: a lone snake heading straight up never crashes in a few seconds.
const ROOMY: RoundProps['board'] = { grid: { cols: 30, rows: 30 }, settings: { wrapEdges: true, speedTier: 'normal', arenaVariant: 'open', enabledPowerups: [] } }
// Solid edges on a small board: the snake runs into the top wall within a few ticks.
const CRASH: RoundProps['board'] = { grid: { cols: 10, rows: 10 }, settings: { wrapEdges: false, speedTier: 'normal', arenaVariant: 'open', enabledPowerups: [] } }

interface RoundProps {
  board: { grid: GridSize; settings: SnakeRoundSettings }
  settingsOpen: boolean
  confirmVisible: boolean
}

// GameScreen's pause wiring in miniature: the same useBackgroundPause getter and `paused` fold,
// feeding the real useSnakeState. The engine's 'roundOver' is the screen's 'gameOver' phase.
function useRound({ board, settingsOpen, confirmVisible }: RoundProps) {
  const { backgroundPaused, resume } = useBackgroundPause(() => state.phase !== 'roundOver' && !settingsOpen && !confirmVisible)
  const paused = settingsOpen || confirmVisible || backgroundPaused
  const round = useSnakeState(board.grid, 'solo', board.settings, 'normal', undefined, 1, undefined, paused)
  const { state } = round
  return { ...round, backgroundPaused, resume }
}

async function startRound(props: Partial<RoundProps> = {}) {
  const rendered = await renderHook(useRound, { initialProps: { board: ROOMY, settingsOpen: false, confirmVisible: false, ...props } })
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

beforeEach(() => {
  jest.mocked(AppState.addEventListener).mockClear()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('pausing when the app leaves the foreground mid-match', () => {
  it('freezes the snake, keeps it frozen after the app comes back, and picks the round up on Resume', async () => {
    const { result } = await startRound()
    await advance(INTERVAL * 5)

    await act(async () => emitAppState('background'))
    expect(result.current.backgroundPaused).toBe(true)
    const tickAtPause = result.current.state.tick
    expect(tickAtPause).toBeGreaterThan(0)
    await advance(INTERVAL * 20)
    // Coming back doesn't lift the pause: the Paused dialog waits for Resume.
    await act(async () => emitAppState('active'))
    await advance(INTERVAL * 20)
    expect(result.current.backgroundPaused).toBe(true)
    expect(result.current.state.phase).toBe('playing')
    expect(result.current.state.tick).toBe(tickAtPause)

    await act(async () => result.current.resume())
    expect(result.current.backgroundPaused).toBe(false)
    await advance(INTERVAL * 5)
    expect(result.current.state.tick).toBeGreaterThan(tickAtPause)
  })

  it('latches during the countdown too', async () => {
    const { result } = await renderHook(useRound, { initialProps: { board: ROOMY, settingsOpen: false, confirmVisible: false } })
    expect(result.current.state.tick).toBe(0)

    await act(async () => emitAppState('inactive'))
    expect(result.current.backgroundPaused).toBe(true)
  })

  it('does not latch once the round is over', async () => {
    const { result } = await startRound({ board: CRASH })
    await advance(INTERVAL * 20)
    expect(result.current.state.phase).toBe('roundOver')

    await act(async () => emitAppState('background'))
    expect(result.current.backgroundPaused).toBe(false)
  })

  it('leaves the pause to Settings or Quit Match? while either is already open', async () => {
    const { result, rerender } = await startRound({ settingsOpen: true })
    await act(async () => emitAppState('background'))
    expect(result.current.backgroundPaused).toBe(false)

    await rerender({ board: ROOMY, settingsOpen: false, confirmVisible: true })
    await act(async () => emitAppState('background'))
    expect(result.current.backgroundPaused).toBe(false)
  })
})
