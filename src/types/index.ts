// Fresh types for Snake's own engine — deliberately NOT shared with LightCycles. LightCycles'
// types are shaped around exactly-two-players-always (Record<Player, PlayerState>) and a trail
// that only ever grows, never shrinks; Snake genuinely has 1-or-2 simulated participants and a
// body that's a fixed-identity chain of cells (grow on eating, otherwise constant length), so it
// gets its own SnakeEntity/SnakeGameState shape rather than reusing GameState/PlayerState as-is.

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface GridCell {
  x: number
  y: number
}

export interface GridSize {
  cols: number
  rows: number
}

// 1 = near/bottom spawn, 2 = far/top spawn — meaningful only when two snakes share the board (Vs
// CPU, 2 Player). A solo round is simply the one entry in a length-1 SnakeGameState.snakes.
export type SnakeId = 1 | 2

export interface SnakeEntity {
  id: SnakeId
  // Ordered cells the snake currently occupies, oldest first — body[body.length - 1] is the head,
  // body[0] is the current tail. snakeEngine.ts's tickSnake relies on this exact convention for its
  // cross-snake tail-vacate rule (see its own comment).
  body: GridCell[]
  direction: Direction
  // A turn queued by input but not yet applied — consumed (and cleared) on the next tick, so a
  // swipe/CPU decision landing between ticks isn't dropped and can't apply more than one turn per
  // tick. Same role as LightCycles' PlayerState.pendingDirection.
  pendingDirection: Direction | null
  alive: boolean
  score: number
  color: string
  // The cell this snake actually attempted to move into on the tick it died — set once, in
  // tickSnake's death branch, and never touched again after. Populated for every death cause (wall,
  // self, other-snake body, head-to-head), including an out-of-bounds wall death whose true
  // destination has no `body` slot to land in — same role as LightCycles' PlayerState.crashCell.
  // Null while alive.
  crashCell: GridCell | null
}

export type RoundOutcome = { type: 'win'; winnerId: SnakeId } | { type: 'draw' }

// Scoped to exactly the simulation's own two phases. The outer onboarding countdown / game-over
// dialog wrapper (see GamePhase below) is a `useSnakeState` (hook-layer) concern layered on top of
// this in a later phase, never a snakeEngine.ts concern.
export interface SnakeGameState {
  phase: 'playing' | 'roundOver'
  grid: GridSize
  // Length 1 (Solo) or 2 (Vs CPU / 2 Player) — see snakeEngine.ts's createInitialSnakeState. Every
  // pairwise rule (head-to-head, etc.) naturally does zero work when there's only one snake.
  snakes: SnakeEntity[]
  food: GridCell
  // Matches the persisted Settings preference of the same name exactly — false (the default) means
  // walls kill; true wraps a step off one edge back onto the opposite one.
  wrapEdges: boolean
  // Only ever populated when snakes.length === 2 — always null for solo, where the caller reads
  // game-over directly off snakes[0].alive/.score instead.
  outcome: RoundOutcome | null
  tick: number
}

// The outer wrapper phase a later phase's `useSnakeState` hook layers on top of
// SnakeGameState.phase: 'onboarding' (pre-round countdown) and 'gameOver' (post-round dialog) are
// screen/hook concerns with no meaning inside the pure engine, so they get their own type here
// rather than widening SnakeGameState.phase itself.
export type GamePhase = 'onboarding' | 'playing' | 'gameOver'
