import { Direction, GridCell, GridSize, RoundOutcome, SnakeEntity, SnakeGameState, SnakeId } from '@/types'

import { cellKey, faceToFaceSpawnPoint, isInBounds, isOppositeDirection, soloSpawnPoint, stepCell, wrapCell } from './grid'

// Every snake starts as a straight 3-segment body — long enough to have a real tail distinct from
// its head (so the tail-vacate rule below has something to demonstrate) without any board being
// too small to spawn one.
export const SNAKE_START_LENGTH = 3

// Default per-seat colors — Solo (which skips /loadout, so has no per-round colors to pass in) and
// any other caller that doesn't supply its own `colors` fall back to these. Vs CPU/2 Player let
// /loadout override them per round (see createInitialSnakeState's own `colors` param) — the same
// role LightCycles' `colors: Record<Player, string>` param plays for its own createInitialGameState.
export const SNAKE_COLORS: Record<SnakeId, string> = { 1: '#3B82F6', 2: '#EF4444' }

const REVERSE_DIRECTION: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }

// Lays out a fresh snake's body trailing straight behind its head, opposite its direction of
// travel — e.g. a snake heading 'up' gets a tail trailing downward, toward its own board edge (see
// faceToFaceSpawnPoint's own comment for why that matters in the 2-snake case). Oldest-first,
// matching SnakeEntity.body's convention: index 0 is the tail, the last element is the head.
function buildInitialBody(head: GridCell, direction: Direction, length: number): GridCell[] {
  const body: GridCell[] = [head]
  let cursor = head
  for (let i = 1; i < length; i++) {
    cursor = stepCell(cursor, REVERSE_DIRECTION[direction])
    body.unshift(cursor)
  }
  return body
}

function buildSnake(id: SnakeId, spawn: { head: GridCell; direction: Direction }, color: string): SnakeEntity {
  return {
    id,
    body: buildInitialBody(spawn.head, spawn.direction, SNAKE_START_LENGTH),
    direction: spawn.direction,
    pendingDirection: null,
    alive: true,
    score: 0,
    color,
    crashCell: null
  }
}

// Every cell any snake currently occupies — the "what's blocked" set food-spawning reads from (see
// pickRandomEmptyCell below), and a natural input for a later phase's CPU flood-fill (see the
// plan's snakeAi.ts design, which takes an `occupied` set built the same way).
export function buildSnakeOccupiedSet(snakes: SnakeEntity[]): Set<string> {
  const occupied = new Set<string>()
  for (const snake of snakes) for (const cell of snake.body) occupied.add(cellKey(cell))
  return occupied
}

// Uniformly-random empty-cell scan for food placement — no clearance-radius check needed here,
// unlike LightCycles' powerup spawn (see gameEngine.ts's hasClearCollectionArea): Snake's food is a
// single exact-cell target a snake either lands on or doesn't, never something approached from a
// particular direction, so "empty" is the only requirement.
function pickRandomEmptyCell(grid: GridSize, occupied: ReadonlySet<string>, random: () => number): GridCell | null {
  const candidates: GridCell[] = []
  for (let x = 0; x < grid.cols; x++) {
    for (let y = 0; y < grid.rows; y++) {
      const cell = { x, y }
      if (!occupied.has(cellKey(cell))) candidates.push(cell)
    }
  }
  if (candidates.length === 0) return null
  return candidates[Math.floor(random() * candidates.length)]
}

// `snakeCount` is 1 (Solo — a single centered body) or 2 (Vs CPU / 2 Player — identical spawn
// either way: a face-to-face pair on opposite halves of the board, facing the shared middle).
// `colors` lets /loadout's per-round color pickers override the SNAKE_COLORS defaults (Solo has no
// loadout screen, so it always falls through to the defaults for its one snake). `random` defaults
// to Math.random so every existing call site behaves normally, while a test can inject a
// seeded/fixed generator for deterministic food placement.
export function createInitialSnakeState(grid: GridSize, snakeCount: 1 | 2, wrapEdges: boolean, colors?: Partial<Record<SnakeId, string>>, random: () => number = Math.random): SnakeGameState {
  const color1 = colors?.[1] ?? SNAKE_COLORS[1]
  const color2 = colors?.[2] ?? SNAKE_COLORS[2]
  const snakes: SnakeEntity[] = snakeCount === 1 ? [buildSnake(1, soloSpawnPoint(grid), color1)] : [buildSnake(1, faceToFaceSpawnPoint(1, grid), color1), buildSnake(2, faceToFaceSpawnPoint(2, grid), color2)]

  // Falls back to the origin cell only if the board is so small every cell is already a snake body
  // segment — never expected on any real playable grid, but keeps this total rather than throwing.
  const food = pickRandomEmptyCell(grid, buildSnakeOccupiedSet(snakes), random) ?? { x: 0, y: 0 }

  return { phase: 'playing', grid, snakes, food, wrapEdges, outcome: null, tick: 0 }
}

// Queues a turn for the next tick. Ignored outside 'playing', for a dead snake, an unknown
// `snakeId`, a direction matching the current heading (no-op already), or a 180° reversal into the
// snake's own body — enforced here, once, rather than by every input source (human swipe or CPU
// decision) that could dispatch a turn. Reuses isOppositeDirection verbatim from grid.ts.
export function applySnakeTurnIntent(state: SnakeGameState, snakeId: SnakeId, direction: Direction): SnakeGameState {
  if (state.phase !== 'playing') return state
  const snake = state.snakes.find((s) => s.id === snakeId)
  if (!snake || !snake.alive) return state
  if (direction === snake.direction) return state
  if (isOppositeDirection(direction, snake.direction)) return state
  if (snake.pendingDirection === direction) return state

  return { ...state, snakes: state.snakes.map((s) => (s.id === snakeId ? { ...s, pendingDirection: direction } : s)) }
}

// Advances the round exactly one tick. Resolution order (see the plan's Engine design section):
//   1. No-op if `phase !== 'playing'`.
//   2-3. Each alive snake resolves `pendingDirection ?? direction` and its intended next head
//        cell; `wrapEdges` re-enters an off-grid destination from the opposite edge, otherwise an
//        out-of-bounds destination is a wall death.
//   4. Determine which (still-alive, not-wall-dead) snakes are landing on the food cell this tick.
//   5. Build a `vacating` set from every alive, non-growing snake's CURRENT tail cell — a cell
//      about to be empty is safe to step into for ANY snake, not just its own owner (a growing
//      snake keeps its tail, so it does NOT vacate).
//   6. Head-to-head: any two snakes whose next cell coincides both die — resolved BEFORE body
//      collision, so an exact-same-cell race (including a shared-food race) is always a mutual
//      death, never a body-collision "win" for whichever happens to be checked first.
//   7. Body collision: a snake dies if its next cell is in the union of every alive snake's CURRENT
//      body minus the `vacating` set — covers self-collision and other-snake-body collision with
//      one check.
//   8-9. Growth (keep tail, append head, +1 score) for a food-landing survivor; a normal move (drop
//        tail, append head) for every other survivor.
//   10. Food respawn, once, if anyone ate it this tick — checked against every snake's post-tick
//       body. At most one snake can ever be `growing` in a single tick (two landing on the same
//       food cell is already a head-to-head death at step 6), so this never double-spawns.
//   11. Round outcome — only meaningful when `snakes.length === 2`: both dying this tick is a draw,
//       one dying is a win for the survivor, and the round ends immediately (this function's own
//       phase !== 'playing' no-op guard stops any further tick, so the survivor never keeps playing
//       solo). For `snakes.length === 1`, a death just flips `phase` to 'roundOver'; `outcome` stays
//       whatever it already was (null, since a solo round never sets it).
export function tickSnake(state: SnakeGameState, random: () => number = Math.random): SnakeGameState {
  if (state.phase !== 'playing') return state

  const { grid, wrapEdges, snakes, food } = state
  const tick = state.tick + 1
  const count = snakes.length

  const aliveBefore = snakes.map((s) => s.alive)

  // Steps 2-3.
  const direction = snakes.map((s) => s.pendingDirection ?? s.direction)
  const rawNext = snakes.map((s, i) => stepCell(s.body[s.body.length - 1], direction[i]))
  const outOfBounds = rawNext.map((cell) => !isInBounds(cell, grid))
  const wallDeath = outOfBounds.map((oob, i) => aliveBefore[i] && oob && !wrapEdges)
  const nextCell = rawNext.map((cell, i) => (aliveBefore[i] && outOfBounds[i] && wrapEdges ? wrapCell(cell, grid) : cell))

  // Step 4.
  const growing = snakes.map((_, i) => aliveBefore[i] && !wallDeath[i] && nextCell[i].x === food.x && nextCell[i].y === food.y)

  // Step 5.
  const vacating = new Set<string>()
  snakes.forEach((s, i) => {
    if (aliveBefore[i] && !wallDeath[i] && !growing[i]) vacating.add(cellKey(s.body[0]))
  })

  const dead = wallDeath.map((w, i) => w || !aliveBefore[i])

  // Step 6.
  for (let i = 0; i < count; i++) {
    if (dead[i] || !aliveBefore[i]) continue
    for (let j = i + 1; j < count; j++) {
      if (dead[j] || !aliveBefore[j]) continue
      if (nextCell[i].x === nextCell[j].x && nextCell[i].y === nextCell[j].y) {
        dead[i] = true
        dead[j] = true
      }
    }
  }

  // Step 7.
  const bodyUnion = new Set<string>()
  snakes.forEach((s, i) => {
    if (aliveBefore[i]) for (const cell of s.body) bodyUnion.add(cellKey(cell))
  })
  for (let i = 0; i < count; i++) {
    if (dead[i] || !aliveBefore[i]) continue
    const key = cellKey(nextCell[i])
    if (bodyUnion.has(key) && !vacating.has(key)) dead[i] = true
  }

  const diedThisTick = dead.map((d, i) => d && aliveBefore[i])

  // Steps 8-9. A snake that wasn't alive coming into this tick is passed through untouched; one
  // that died this tick keeps its body as of its last surviving position, records where it died,
  // and stops moving/turning.
  let ateFood = false
  const nextSnakes = snakes.map((s, i) => {
    if (!aliveBefore[i]) return s
    if (dead[i]) return { ...s, alive: false, pendingDirection: null, direction: direction[i], crashCell: nextCell[i] }
    if (growing[i]) {
      ateFood = true
      return { ...s, body: [...s.body, nextCell[i]], direction: direction[i], pendingDirection: null, score: s.score + 1 }
    }
    return { ...s, body: [...s.body.slice(1), nextCell[i]], direction: direction[i], pendingDirection: null }
  })

  // Step 10.
  const nextFood = ateFood ? (pickRandomEmptyCell(grid, buildSnakeOccupiedSet(nextSnakes), random) ?? food) : food

  // Step 11.
  let phase: SnakeGameState['phase'] = state.phase
  let outcome: RoundOutcome | null = state.outcome

  if (count === 2) {
    const [aDied, bDied] = diedThisTick
    if (aDied && bDied) {
      phase = 'roundOver'
      outcome = { type: 'draw' }
    } else if (aDied || bDied) {
      phase = 'roundOver'
      outcome = { type: 'win', winnerId: aDied ? nextSnakes[1].id : nextSnakes[0].id }
    }
  } else if (diedThisTick[0]) {
    phase = 'roundOver'
  }

  return { ...state, phase, outcome, tick, snakes: nextSnakes, food: nextFood }
}
