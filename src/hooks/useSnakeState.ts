import { useCallback, useEffect, useRef, useState } from 'react'

import { SNAKE_SPEED_TIER_INTERVAL_MS } from '@/constants/snake'
import { Direction, GamePhase, GridSize, SnakeId, SnakeRoundSettings } from '@/types'
import { applyCpuSnakePowerupActivation, applyCpuSnakeTurn, CpuDifficulty } from '@/utils/snakeAi'
import { applySnakePowerupActivation, applySnakeTurnIntent, createInitialSnakeState, tickSnake } from '@/utils/snakeEngine'

// The three ways to play (see the plan's Context section) — lives here rather than in
// types/index.ts since it's a screen/hook-layer routing concern, not part of the pure engine's own
// vocabulary (SnakeGameState/SnakeEntity have no notion of "mode" at all — see snakeEngine.ts's own
// comment on why SnakeEntity deliberately carries no "is this CPU-controlled" field). Same
// precedent as TouchInputLayer.tsx defining its own TouchInputMode locally rather than reaching
// into types/index.ts for it.
export type SnakeMode = 'solo' | 'vsCpu' | 'twoPlayer'

// Solo is the one true no-rival mode (a single simulated snake); Vs CPU and 2 Player both need a
// second simulated snake on the board — a bot in one case, a second human in the other — so they
// share the exact same 2-snake createInitialSnakeState/tickSnake shape and differ only in *who*
// drives snake 2's turns (see the CPU splice below, and the module-level comment on `turn`).
function snakeCountForMode(mode: SnakeMode): 1 | 2 {
  return mode === 'solo' ? 1 : 2
}

// By convention the CPU always occupies snake id 2 (the far seat) — matches LightCycles'
// `CPU_PLAYER: Player = 2` and snakeAi.ts's own module comment.
const CPU_SNAKE_ID: SnakeId = 2

// Wraps snakeEngine.ts's own SnakeGameState with an outer phase LightCycles' analogous
// useGameState.ts doesn't need (LightCycles' own GameState starts life already 'playing' with no
// separate pre-round wrapper at the hook layer — its onboarding countdown is purely a screen-level
// overlay gating input, not a phase this hook tracks). Snake's engine ALSO starts `phase: 'playing'`
// the instant createInitialSnakeState runs (see that function), but the tick loop below must not
// start advancing the round until the screen's own onboarding countdown finishes — hence a second,
// outer phase (GamePhase, from types/index.ts): 'onboarding' (pre-round countdown) → 'playing'
// (beginPlaying called, tick loop runs) → 'gameOver' (the engine's own phase flipped to
// 'roundOver'; tick loop torn down again). The engine's inner `phase` and this outer one are
// deliberately two different fields tracked in two different places — see SnakeGameState's own
// comment in types/index.ts for why the engine itself has no idea an "onboarding" concept exists.
// cellPx/safeAreaInsetsPx default to 1/all-zero (no margin) — see createInitialSnakeState's own
// comment for why: this hook's caller (GameScreen) is what decides whether safeAreaInsetsPx is
// actually the device's real insets or zeroed out (see that screen's own fullScreen branch).
export function useSnakeState(grid: GridSize, mode: SnakeMode, settings: SnakeRoundSettings, cpuDifficulty: CpuDifficulty, colors?: Partial<Record<SnakeId, string>>, cellPx: number = 1, safeAreaInsetsPx: { top: number; right: number; bottom: number; left: number } = { top: 0, right: 0, bottom: 0, left: 0 }) {
  const snakeCount = snakeCountForMode(mode)

  const [state, setState] = useState(() => createInitialSnakeState(grid, snakeCount, settings, colors, Math.random, cellPx, safeAreaInsetsPx))

  // Only the two transitions this hook actually decides on its own — 'onboarding' (beginPlaying
  // not yet called) vs 'playing' (it has). Whether the outer phase has further moved on to
  // 'gameOver' is derived below, not stored here, specifically so that transition never needs its
  // own effect+setState pair (which would fire one render after the state update that causes it,
  // and is exactly the "cascading render" shape React's own effect guidance warns against — see
  // https://react.dev/learn/you-might-not-need-an-effect). Deriving it instead means `phase` reacts
  // to `state.phase` flipping to 'roundOver' in the very same render, no extra render involved.
  const [phaseIntent, setPhaseIntent] = useState<Exclude<GamePhase, 'gameOver'>>('onboarding')

  // The engine flipping its OWN phase to 'roundOver' (set inside tickSnake — see its own outcome
  // resolution) is what ends a round; this derivation just projects that one-way transition into
  // the outer phase the rest of this hook (and the screen) actually watches, so a game-over dialog
  // keyed off `phase` doesn't also need to know about the engine's inner phase field. Never derives
  // the other direction — the outer phase only ever leaves 'gameOver' via `retry` creating a brand
  // new state (which resets `phaseIntent` to 'onboarding', and `state.phase` back to 'playing'
  // along with it).
  const phase: GamePhase = state.phase === 'roundOver' ? 'gameOver' : phaseIntent

  // Turn intent goes through applySnakeTurnIntent unconditionally, regardless of which mode is
  // active or who "should" be controlling `snakeId` — this hook does not gate `turn` by seat. The
  // engine's own applySnakeTurnIntent already no-ops on an unknown/dead snake or outside 'playing',
  // so calling it for a seat nobody is actually driving this mode is always safe, just pointless.
  //
  // Responsibility split (deliberately NOT enforced here): the SCREEN layer decides which
  // TouchInputLayer zones are even wired to invoke this function in the first place —
  //   - Solo: only zone 1 exists at all (TouchInputLayer's `solo` mode) — there is no snake 2 to
  //     misdirect even if something tried.
  //   - Vs CPU: only the near/bottom zone is wired to call `turn(1, ...)`. The far/top zone is
  //     never invoked for input in this mode (see TouchInputLayer's two-zone branch) because the
  //     CPU splice below drives snake 2's pendingDirection directly, every tick, via
  //     applyCpuSnakeTurn — a screen that mistakenly wired the far zone to call `turn(2, ...)` in
  //     Vs CPU would have human input and the CPU fighting over the same seat's pendingDirection.
  //   - 2 Player: both zones call `turn` with their own seat's id (1 and 2) — no CPU splice runs in
  //     this mode, so there's no controller to contend with.
  // In short: `turn` is a dumb, always-available choke point; *wiring* is what makes a given seat
  // human-controlled, CPU-controlled, or unreachable in a given mode, and that wiring lives in the
  // screen/TouchInputLayer layer, not here. `activate` below shares this exact same shape.
  const turn = useCallback((snakeId: SnakeId, direction: Direction) => {
    setState((s) => applySnakeTurnIntent(s, snakeId, direction))
  }, [])

  // Human powerup activation (tap/activate-key — see TouchInputLayer.tsx/KeyboardInputLayer.tsx) —
  // same dumb, always-available choke point as `turn` above, and the same "wiring, not this
  // function, decides who can reach it" responsibility split.
  const activate = useCallback((snakeId: SnakeId) => {
    setState((s) => applySnakePowerupActivation(s, snakeId))
  }, [])

  const beginPlaying = useCallback(() => {
    setPhaseIntent((p) => (p === 'onboarding' ? 'playing' : p))
  }, [])

  const retry = useCallback(() => {
    setState(createInitialSnakeState(grid, snakeCount, settings, colors, Math.random, cellPx, safeAreaInsetsPx))
    setPhaseIntent('onboarding')
  }, [grid, snakeCount, settings, colors, cellPx, safeAreaInsetsPx])

  // ─── Tick loop ──────────────────────────────────────────────────────────
  // Same rAF variable-tick-rate loop structure as LightCycles' useGameState.ts: runs only while the
  // (outer) phase is 'playing', torn down the instant it leaves — whether that's forward into
  // 'gameOver' (round ended) or backward into 'onboarding' (retry). lastTickRef is reset fresh every
  // time the effect (re)starts, exactly like LightCycles' lastTickRef/elapsedRef reset on mount, so
  // a fresh round never fires its first tick early against a stale timestamp from a previous round.
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number | null>(null)

  const tickIntervalMs = SNAKE_SPEED_TIER_INTERVAL_MS[settings.speedTier]
  const hasPowerups = settings.enabledPowerups.length > 0

  useEffect(() => {
    if (phase !== 'playing') return

    let active = true
    lastTickRef.current = null

    const loop = (timestamp: number) => {
      if (!active) return
      if (lastTickRef.current === null) lastTickRef.current = timestamp

      const dt = timestamp - lastTickRef.current

      if (dt >= tickIntervalMs) {
        lastTickRef.current = timestamp
        setState((s) => {
          // Mirrors LightCycles' useGameState.ts inline CPU-turn-injection splice exactly: for
          // vsCpu, the CPU's activation decision (if any powerups are even enabled) is made and
          // applied FIRST, immediately before its move for THIS tick is decided and queued — same
          // cadence a human's queued tap-then-swipe would land at, so the bot's activation, its
          // move, and the tick that consumes them all commit together. Every other mode (solo,
          // twoPlayer) has no CPU seat, so it's just a plain tickSnake call.
          if (mode === 'vsCpu') {
            const afterActivation = hasPowerups ? applyCpuSnakePowerupActivation(s, CPU_SNAKE_ID, cpuDifficulty, Math.random) : s
            return tickSnake(applyCpuSnakeTurn(afterActivation, CPU_SNAKE_ID, cpuDifficulty, Math.random), Math.random)
          }
          return tickSnake(s, Math.random)
        })
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      active = false
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [phase, mode, cpuDifficulty, tickIntervalMs, hasPowerups])

  return { state, turn, activate, beginPlaying, retry, tickIntervalMs }
}
