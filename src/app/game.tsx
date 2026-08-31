import { useAutoPaperTheme } from '@rific/auto-paper'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useDispatch, useSelector } from 'react-redux'

import { GameOverDialog, type GameOverOutcome } from '@/components/GameOverDialog'
import OnboardingOverlay from '@/components/OnboardingOverlay'
import { SnakeBoard } from '@/components/SnakeBoard'
import TouchInputLayer, { TouchInputMode } from '@/components/TouchInputLayer'
import { SNAKE_CELL_PX } from '@/constants/snake'
import { SnakeMode, useSnakeState } from '@/hooks/useSnakeState'
import { gameActions } from '@/redux/gameSlice'
import type { RootState } from '@/redux/store'
import { Direction, GamePhase, SnakeId } from '@/types'
import { computeGridSize } from '@/utils/grid'

export default function GameScreen() {
  const params = useLocalSearchParams<{ mode?: string | string[]; p1Color?: string | string[]; p2Color?: string | string[] }>()
  // Safe fallback to solo — a direct deep-link, a stale/incoming param shape, or a missing param
  // never crashes into an unknown mode, it just plays the simplest one.
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode
  const mode: SnakeMode = rawMode === 'vsCpu' || rawMode === 'twoPlayer' ? rawMode : 'solo'

  // Only ever present coming from /loadout (Vs CPU/2 Player) — Solo skips that screen entirely and
  // falls through to createInitialSnakeState's own SNAKE_COLORS defaults (see useSnakeState.ts).
  const rawP1Color = Array.isArray(params.p1Color) ? params.p1Color[0] : params.p1Color
  const rawP2Color = Array.isArray(params.p2Color) ? params.p2Color[0] : params.p2Color
  const colors = useMemo(() => (rawP1Color || rawP2Color ? { 1: rawP1Color, 2: rawP2Color } : undefined), [rawP1Color, rawP2Color])

  const { width, height } = useWindowDimensions()
  const grid = useMemo(() => computeGridSize(width, height, SNAKE_CELL_PX), [width, height])

  const wrapEdges = useSelector((state: RootState) => state.game.wrapEdges)
  const cpuDifficulty = useSelector((state: RootState) => state.game.cpuDifficulty)
  const highScores = useSelector((state: RootState) => state.game.highScore)
  const dispatch = useDispatch()

  const { state, turn, beginPlaying, retry } = useSnakeState(grid, mode, wrapEdges, cpuDifficulty, colors)

  // useSnakeState's own outer phase (onboarding -> playing -> gameOver — see that hook's own
  // extensive comment on why this is a different, hook-layer phase from the pure engine's inner
  // state.phase) isn't part of what the hook returns; only state/turn/beginPlaying/retry/
  // tickIntervalMs are. Mirrored here instead: `localPhase` tracks exactly the same
  // onboarding<->playing transition the hook's own internal `phaseIntent` does, since both only
  // ever flip via the same two call sites (beginPlaying / retry) this screen already owns calling.
  // `state.phase` flipping to 'roundOver' (the engine's own one-way transition, driven by
  // tickSnake) still drives the rest exactly the way it does inside the hook.
  const [localPhase, setLocalPhase] = useState<'onboarding' | 'playing'>('onboarding')
  const phase: GamePhase = state.phase === 'roundOver' ? 'gameOver' : localPhase

  const handleBeginPlaying = useCallback(() => {
    beginPlaying()
    setLocalPhase('playing')
  }, [beginPlaying])

  const handleRetry = useCallback(() => {
    retry()
    setLocalPhase('onboarding')
  }, [retry])

  const handleHome = useCallback(() => {
    router.replace('/')
  }, [])

  // Vs CPU: only the near/bottom zone (snake 1, the human) is ever wired to actually turn a
  // snake here — the far/top zone still renders (TouchInputLayer's 'dual' mode always mounts both
  // GestureDetectors, since it has no notion of which game mode is active) but any turn it
  // reports is dropped, since the CPU splice inside useSnakeState already drives snake 2's
  // pendingDirection every tick; wiring the far zone to `turn(2, ...)` too would have human input
  // and the CPU fighting over the same seat. 2 Player forwards both zones as-is. Solo only ever
  // receives snakeId 1 in the first place (TouchInputLayer's 'solo' mode has just one zone). See
  // useSnakeState.ts's own module comment for the full responsibility split this mirrors.
  const handleTurn = useCallback(
    (snakeId: SnakeId, direction: Direction) => {
      if (mode === 'vsCpu' && snakeId !== 1) return
      turn(snakeId, direction)
    },
    [mode, turn]
  )

  const touchMode: TouchInputMode = mode === 'solo' ? 'solo' : 'dual'

  // Snake 1 is always the human in every mode (solo's only snake, or Vs CPU's human seat); snake
  // 2 is the CPU in Vs CPU or the second human in 2 Player. See snakeEngine.ts's own spawn
  // convention and snakeAi.ts's CPU_SNAKE_ID for why seat 2 is always the non-primary one.
  const humanScore = state.snakes[0]?.score ?? 0
  const opponentScore = state.snakes[1]?.score
  // What actually gets persisted as "the" high score for this mode: Solo/Vs CPU track snake 1's
  // own score only (a strong CPU run in Vs CPU shouldn't inflate "your" high score); 2 Player
  // tracks whichever of the two human seats actually scored higher this round, since both are
  // equally "you" on a shared local device.
  const recordedScore = useMemo(() => (mode === 'twoPlayer' ? Math.max(humanScore, opponentScore ?? 0) : humanScore), [mode, humanScore, opponentScore])

  // GameOverDialog wants a win/loss/draw framing from snake 1's own perspective ('YOU'/'OPPONENT'
  // in its own copy — see that file's header comment on why there's no per-seat split even in
  // 2 Player), not the engine's own {type,winnerId} RoundOutcome shape. Solo has no outcome at
  // all (undefined renders the plain score framing instead).
  const gameOverOutcome: GameOverOutcome | undefined = useMemo(() => {
    if (mode === 'solo' || !state.outcome) return undefined
    if (state.outcome.type === 'draw') return 'draw'
    return state.outcome.winnerId === 1 ? 'win' : 'loss'
  }, [mode, state.outcome])

  // Records the per-mode high score exactly once per round, on the onboarding/playing ->
  // gameOver transition. hasRecordedRef (not just the phase check alone) guards against a second
  // dispatch from an unrelated re-render while still in 'gameOver'; it resets the instant the
  // round leaves 'gameOver' (via handleRetry above) so the next round's own transition can fire
  // again. isNewHighScore is captured once at that same instant (compared against the pre-dispatch
  // `highScores[mode]`) rather than derived live every render, so it can't flip from true to false
  // the moment the dispatch below actually lands.
  const hasRecordedRef = useRef(false)
  const [isNewHighScore, setIsNewHighScore] = useState(false)

  useEffect(() => {
    if (phase !== 'gameOver') {
      hasRecordedRef.current = false
      return
    }
    if (hasRecordedRef.current) return
    hasRecordedRef.current = true

    setIsNewHighScore(recordedScore > highScores[mode])
    dispatch(gameActions.setHighScore({ mode, score: recordedScore }))
  }, [phase, mode, recordedScore, highScores, dispatch])

  const { dark } = useAutoPaperTheme()
  const bg = dark ? '#000000' : '#FFFFFF'

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <SnakeBoard snakes={state.snakes} food={state.food} phase={state.phase} cellPx={SNAKE_CELL_PX} grid={state.grid} />
      <TouchInputLayer mode={touchMode} enabled={phase === 'playing'} onTurn={handleTurn} />

      {phase === 'onboarding' && <OnboardingOverlay onComplete={handleBeginPlaying} mode={touchMode} colors={touchMode === 'dual' && state.snakes[0] && state.snakes[1] ? { snake1: state.snakes[0].color, snake2: state.snakes[1].color } : undefined} />}

      {phase === 'gameOver' && <GameOverDialog score={humanScore} highScore={Math.max(highScores[mode], recordedScore)} isNewHighScore={isNewHighScore} onRetry={handleRetry} onHome={handleHome} outcome={gameOverOutcome} opponentScore={mode !== 'solo' ? opponentScore : undefined} />}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 }
})
