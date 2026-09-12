import { cellKey, isInBounds, isOppositeDirection, stepCell, wrapCell } from '@tastic/grid'

import { SNAKE_POWERUP_CONSTRICT_FRACTION, SNAKE_POWERUP_EFFECT_DURATION_TICKS } from '@/constants/snake'
import { Direction, GridCell, GridSize, RoundOutcome, SnakeControlEffect, SnakeEntity, SnakeGameState, SnakeId, SnakePortal, SnakeRoundSettings, SnakeShieldEffect, SnakeSpeedEffect, SnakeTunnel } from '@/types'

import { buildArenaObstacles, buildArenaPortals, buildArenaTunnels } from './arenas'
import { faceToFaceSpawnPoint, soloSpawnPoint } from './grid'

// Every snake starts as a straight 3-segment body — long enough to have a real tail distinct from
// its head (so the tail-vacate rule below has something to demonstrate) without any board being
// too small to spawn one.
export const SNAKE_START_LENGTH = 3

// Default per-seat colors — Solo (which skips /loadout, so has no per-round colors to pass in) and
// any other caller that doesn't supply its own `colors` fall back to these. Vs CPU/2 Player let
// /loadout override them per round (see createInitialSnakeState's own `colors` param) — the same
// role LightCycles' `colors: Record<Player, string>` param plays for its own createInitialGameState.
// Also the app's own theme identity: store.ts feeds these straight into @rific/auto-paper as the
// primary/secondary of its color triad (tertiary derived via getThirdColor), so player 1's default
// color IS the app's primary and player 2's default color IS its secondary — not a coincidence.
export const SNAKE_COLORS: Record<SnakeId, string> = { 1: '#2E7D32', 2: '#FBC02D' }

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
    crashCell: null,
    heldPowerup: null,
    effects: { speed: null, control: null, shield: null },
    peakLength: SNAKE_START_LENGTH
  }
}

// Every cell any snake currently occupies, plus the round's static arena obstacles — the shared
// "what's blocked" set food/pickup-spawning reads from (see pickRandomEmptyCell below) and CPU
// pathing reads from (see snakeAi.ts). `obstacles` defaults to [] so any existing call site/test
// that only ever passed `snakes` keeps compiling and behaves exactly as before (an 'open' round has
// none anyway).
export function buildSnakeOccupiedSet(snakes: SnakeEntity[], obstacles: GridCell[] = []): Set<string> {
  return occupiedFromBodies(
    snakes.map((s) => s.body),
    obstacles
  )
}

function occupiedFromBodies(bodies: GridCell[][], obstacles: GridCell[]): Set<string> {
  const occupied = new Set<string>()
  for (const body of bodies) for (const cell of body) occupied.add(cellKey(cell))
  for (const cell of obstacles) occupied.add(cellKey(cell))
  return occupied
}

// Symmetric a<->b lookup for the round's portal pair(s) — mirrors LightCycles' buildPortalLookup.
// Portal cells are deliberately absent from buildSnakeOccupiedSet's own output — entering one
// redirects the mover during movement resolution (see tickSnake below), it never crashes them.
// Exported for snakeAi.ts's own lookahead, which needs the identical portal-aware stepping tickSnake
// itself uses so the CPU's own safety scoring can never disagree with what actually happens to it.
export function buildPortalLookup(portals: SnakePortal[]): Map<string, GridCell> {
  const lookup = new Map<string, GridCell>()
  for (const { a, b } of portals) {
    lookup.set(cellKey(a), b)
    lookup.set(cellKey(b), a)
  }
  return lookup
}

// Flat membership set of every cell across the round's tunnel corridor — see types/index.ts's own
// SnakeTunnel comment for why membership alone (no per-snake exclusion layer) is enough here.
// Exported for snakeAi.ts's own lookahead, same reasoning as buildPortalLookup above.
export function buildTunnelCellSet(tunnels: SnakeTunnel[]): Set<string> {
  const cells = new Set<string>()
  for (const tunnel of tunnels) for (const cell of tunnel.cells) cells.add(cellKey(cell))
  return cells
}

// Uniformly-random empty-cell scan for food/pickup placement — no clearance-radius check needed,
// unlike LightCycles' powerup spawn: Snake's collectibles are a single exact-cell target a snake
// either lands on or doesn't. `excludeCells` covers cells that are technically "empty" (no body/
// obstacle) but still shouldn't host a collectible — portal/tunnel cells (a collectible could never
// actually be landed on there, see buildArenaPortals' own redirect-before-any-check behavior) and,
// new since powerups, the OTHER live collectible's own cell (food and a pickup can now be on the
// board at once, something this app never had to keep apart before).
function pickRandomEmptyCell(grid: GridSize, occupied: ReadonlySet<string>, random: () => number, excludeCells: ReadonlySet<string> = new Set()): GridCell | null {
  const candidates: GridCell[] = []
  for (let x = 0; x < grid.cols; x++) {
    for (let y = 0; y < grid.rows; y++) {
      const cell = { x, y }
      const key = cellKey(cell)
      if (occupied.has(key) || excludeCells.has(key)) continue
      candidates.push(cell)
    }
  }
  if (candidates.length === 0) return null
  return candidates[Math.floor(random() * candidates.length)]
}

function pickupId(tick: number, cell: GridCell): string {
  return `pu-${tick}-${cell.x}-${cell.y}`
}

// The grid-cell margin along each edge that falls inside the device's own safe-area inset —
// `insetsPx` is expected to already be zeroed out by the caller (see GameScreen's own fullScreen
// branch) whenever the board ISN'T bleeding under it, since otherwise the board's pixel container
// already stops short of the inset and every cell is already clear of it; this function itself
// stays agnostic of that setting. Mirrors LightCycles' identical buildUnsafeAreaCells. Ceil'd up to
// whole cells so food/a pickup can never spawn partially under the notch/Dynamic Island/
// home-indicator/speaker cutout — better to lose a cell of margin than leave one still hidden.
function buildUnsafeAreaCells(grid: GridSize, cellPx: number, insetsPx: { top: number; right: number; bottom: number; left: number }): GridCell[] {
  const marginTop = Math.ceil(insetsPx.top / cellPx)
  const marginBottom = Math.ceil(insetsPx.bottom / cellPx)
  const marginLeft = Math.ceil(insetsPx.left / cellPx)
  const marginRight = Math.ceil(insetsPx.right / cellPx)
  if (marginTop <= 0 && marginBottom <= 0 && marginLeft <= 0 && marginRight <= 0) return []
  const cells: GridCell[] = []
  for (let x = 0; x < grid.cols; x++) {
    for (let y = 0; y < grid.rows; y++) {
      if (x < marginLeft || x >= grid.cols - marginRight || y < marginTop || y >= grid.rows - marginBottom) cells.push({ x, y })
    }
  }
  return cells
}

// `settings.arenaVariant`/`settings.enabledPowerups` default this round's obstacle layout and
// powerup pool; `snakeCount` is 1 (Solo) or 2 (Vs CPU / 2 Player) — identical spawn either way for
// 2, a face-to-face pair on opposite halves of the board. `colors` lets /loadout's per-round color
// pickers override the SNAKE_COLORS defaults. `random` defaults to Math.random so every existing
// call site behaves normally, while a test can inject a seeded/fixed generator. `cellPx`/
// `safeAreaInsetsPx` default to 1/all-zero (no margin) — see buildUnsafeAreaCells above — so every
// existing call site/test (predating safe-area avoidance) stays byte-identical.
export function createInitialSnakeState(grid: GridSize, snakeCount: 1 | 2, settings: SnakeRoundSettings, colors?: Partial<Record<SnakeId, string>>, random: () => number = Math.random, cellPx: number = 1, safeAreaInsetsPx: { top: number; right: number; bottom: number; left: number } = { top: 0, right: 0, bottom: 0, left: 0 }): SnakeGameState {
  const color1 = colors?.[1] ?? SNAKE_COLORS[1]
  const color2 = colors?.[2] ?? SNAKE_COLORS[2]
  const snakes: SnakeEntity[] = snakeCount === 1 ? [buildSnake(1, soloSpawnPoint(grid), color1)] : [buildSnake(1, faceToFaceSpawnPoint(1, grid), color1), buildSnake(2, faceToFaceSpawnPoint(2, grid), color2)]

  const obstacles = buildArenaObstacles(settings.arenaVariant, grid, snakeCount)
  const portals = buildArenaPortals(settings.arenaVariant, grid, snakeCount)
  const tunnels = buildArenaTunnels(settings.arenaVariant, grid, snakeCount)
  const unsafeCells = buildUnsafeAreaCells(grid, cellPx, safeAreaInsetsPx)
  const arenaCellSet = new Set<string>([...buildTunnelCellSet(tunnels), ...buildPortalLookup(portals).keys(), ...unsafeCells.map(cellKey)])

  // Solo has no opponent, so the four opponent-targeted powerups (coldblood/constrict/mesmerize/
  // frenzy) would never do anything — see types/index.ts's own SnakePowerupType comment. Filtered
  // once here, into the EFFECTIVE pool stored on state, so the tick loop and pickup-spawn logic
  // below never need mode-awareness of their own.
  const enabledPowerups = snakeCount === 1 ? settings.enabledPowerups.filter((type) => type === 'sidewind' || type === 'scales') : settings.enabledPowerups

  // Falls back to the origin cell only if the board is so small every cell is already blocked —
  // never expected on any real playable grid, but keeps this total rather than throwing.
  const food = pickRandomEmptyCell(grid, buildSnakeOccupiedSet(snakes, obstacles), random, arenaCellSet) ?? { x: 0, y: 0 }

  return { phase: 'playing', grid, snakes, food, wrapEdges: settings.wrapEdges, outcome: null, tick: 0, obstacles, portals, tunnels, enabledPowerups, pickups: [], unsafeCells }
}

// Queues a turn for the next tick. Ignored outside 'playing', for a dead snake, an unknown
// `snakeId`, a direction matching the current heading (no-op already), or a 180° reversal into the
// snake's own body — enforced here, once, rather than by every input source (human swipe or CPU
// decision) that could dispatch a turn. Reuses isOppositeDirection verbatim from grid.ts. A snake
// currently frozen (Coldblood, 0 steps this tick) can still queue a turn here — it just won't move
// until it unfreezes; see tickSnake's own direction/pendingDirection resolution for why that's safe
// across multiple frozen ticks.
export function applySnakeTurnIntent(state: SnakeGameState, snakeId: SnakeId, direction: Direction): SnakeGameState {
  if (state.phase !== 'playing') return state
  const snake = state.snakes.find((s) => s.id === snakeId)
  if (!snake || !snake.alive) return state
  if (direction === snake.direction) return state
  if (isOppositeDirection(direction, snake.direction)) return state
  if (snake.pendingDirection === direction) return state

  return { ...state, snakes: state.snakes.map((s) => (s.id === snakeId ? { ...s, pendingDirection: direction } : s)) }
}

// Cells advanced in one tickSnake sub-step loop for a boosted/frozen snake — Coldblood's 0 isn't a
// multiplier lookup, it's "skip movement entirely," checked first and explicitly. Mirrors
// LightCycles' stepsFor exactly. Exported so snakeAi.ts's own survival scoring can walk the same
// number of cells ahead for itself when boosted, rather than a second, potentially-drifting copy.
export function stepsForSnake(effects: SnakeEntity['effects']): number {
  if (effects.speed?.multiplier === 0) return 0
  if (effects.speed?.multiplier === 2) return 2
  return 1
}

// Effect expiry — cleared once `tick` has fully consumed the effect's own expiresAtTick. Applied
// unconditionally, every tick, to every snake (harmless for a snake that died this same tick, since
// the round is already over) — mirrors LightCycles' own `expire`.
function expireEffects(effects: SnakeEntity['effects'], tick: number): SnakeEntity['effects'] {
  return {
    speed: effects.speed && tick >= effects.speed.expiresAtTick ? null : effects.speed,
    control: effects.control && tick >= effects.control.expiresAtTick ? null : effects.control,
    shield: effects.shield && tick >= effects.shield.expiresAtTick ? null : effects.shield
  }
}

// Slices `count` cells off the front (the tail end — see SnakeEntity.body's own convention),
// clamped so the head is never removed. Shared by Constrict's instant application below.
function trimSnakeBodyFront(body: GridCell[], count: number): GridCell[] {
  const maxRemovable = body.length - 1
  return body.slice(Math.min(count, maxRemovable))
}

// Activation-side counterpart to applySnakeTurnIntent — the single choke point a held powerup's
// effect goes through, for a human's tap or the CPU's own decision (see snakeAi.ts's
// applyCpuSnakePowerupActivation). Clears the activating snake's single-slot inventory in every
// branch. Same-axis effects replace rather than stack (see types/index.ts's SnakePlayerEffects).
// Sidewind/Scales are self-targeted and work fine solo; Coldblood/Constrict/Mesmerize/Frenzy target
// the opponent and no-op (still clearing the held slot) if there isn't one — defensive only, since
// createInitialSnakeState's own solo-mode filtering already keeps these four out of solo's spawn
// pool entirely.
export function applySnakePowerupActivation(state: SnakeGameState, snakeId: SnakeId): SnakeGameState {
  if (state.phase !== 'playing') return state
  const snake = state.snakes.find((s) => s.id === snakeId)
  if (!snake || !snake.alive || !snake.heldPowerup) return state

  const opponent = state.snakes.find((s) => s.id !== snakeId) ?? null
  const type = snake.heldPowerup
  const tick = state.tick

  const withCleared = (s: SnakeEntity): SnakeEntity => ({ ...s, heldPowerup: null })

  if (type === 'sidewind') {
    const speed: SnakeSpeedEffect = { type: 'sidewind', multiplier: 2, expiresAtTick: tick + SNAKE_POWERUP_EFFECT_DURATION_TICKS.sidewind }
    return { ...state, snakes: state.snakes.map((s) => (s.id === snakeId ? { ...withCleared(s), effects: { ...s.effects, speed } } : s)) }
  }

  if (type === 'scales') {
    const shield: SnakeShieldEffect = { expiresAtTick: tick + SNAKE_POWERUP_EFFECT_DURATION_TICKS.scales }
    return { ...state, snakes: state.snakes.map((s) => (s.id === snakeId ? { ...withCleared(s), effects: { ...s.effects, shield } } : s)) }
  }

  if (!opponent) return { ...state, snakes: state.snakes.map((s) => (s.id === snakeId ? withCleared(s) : s)) }

  if (type === 'constrict') {
    // Proportional to the opponent's own current length (not a fixed cell count) so it stays a
    // meaningful punish no matter how long the round has run — and deliberately leaves
    // opponent.peakLength untouched, since that's a high-water mark, not the live length (see
    // types/index.ts's own SnakeEntity.peakLength comment).
    const trimmed = trimSnakeBodyFront(opponent.body, Math.floor(opponent.body.length * SNAKE_POWERUP_CONSTRICT_FRACTION))
    return {
      ...state,
      snakes: state.snakes.map((s) => {
        if (s.id === snakeId) return withCleared(s)
        if (s.id === opponent.id) return { ...s, body: trimmed }
        return s
      })
    }
  }

  if (type === 'coldblood') {
    const speed: SnakeSpeedEffect = { type: 'coldblood', multiplier: 0, expiresAtTick: tick + SNAKE_POWERUP_EFFECT_DURATION_TICKS.coldblood }
    return { ...state, snakes: state.snakes.map((s) => (s.id === snakeId ? withCleared(s) : s.id === opponent.id ? { ...s, effects: { ...s.effects, speed } } : s)) }
  }

  if (type === 'mesmerize') {
    const control: SnakeControlEffect = { type: 'mesmerize', expiresAtTick: tick + SNAKE_POWERUP_EFFECT_DURATION_TICKS.mesmerize }
    return { ...state, snakes: state.snakes.map((s) => (s.id === snakeId ? withCleared(s) : s.id === opponent.id ? { ...s, effects: { ...s.effects, control } } : s)) }
  }

  // type === 'frenzy'
  const speed: SnakeSpeedEffect = { type: 'frenzy', multiplier: 2, expiresAtTick: tick + SNAKE_POWERUP_EFFECT_DURATION_TICKS.frenzy }
  return { ...state, snakes: state.snakes.map((s) => (s.id === snakeId ? withCleared(s) : s.id === opponent.id ? { ...s, effects: { ...s.effects, speed } } : s)) }
}

// Advances the round exactly one tick, in 1-2 sub-steps per snake depending on any active speed
// effect (Sidewind/Frenzy cover 2 cells this call; Coldblood covers 0) — mirrors LightCycles'
// tickGame's own sub-step loop. Each snake still resolves exactly one queued direction for the
// whole tick; a boosted snake just covers 2 cells in it, not two independent turns. When no snake
// has an active effect, maxSteps is always 1 and this reduces to exactly the same single-pass
// resolution this function used before powerups existed.
//
// Resolution per sub-step: compute the raw next cell → wrap-edges redirect (if still off-grid) →
// portal redirect (unconditional, before any check below ever sees the raw destination) → wall/
// out-of-bounds check on the FINAL cell → food-landing check → build the `vacating` set (current
// tails of snakes stepping-and-surviving-and-not-growing this sub-step) → head-to-head among
// snakes actually stepping this sub-step → body/obstacle collision against every not-already-dead
// snake's CURRENT body minus `vacating`, with a tunnel-member destination exempted from this check
// entirely (see types/index.ts's own SnakeTunnel comment for why no per-snake exclusion layer is
// needed here, unlike LightCycles' equivalent). If anyone dies this sub-step, their crashCell is
// recorded and the loop stops WITHOUT committing anyone's move for this sub-step — a still-alive
// snake's own partial movement on the sub-step where someone else died is dropped too, which is
// invisible since the round is already over the instant anyone dies. Otherwise, each stepping
// snake's move commits (grow-and-keep-tail if it landed on food, slide otherwise), then pickup
// collection is checked at the exact landed cell, snake-index order, so at most one snake can
// claim a given pickup in one sub-step.
export function tickSnake(state: SnakeGameState, random: () => number = Math.random): SnakeGameState {
  if (state.phase !== 'playing') return state

  const { grid, wrapEdges, snakes, obstacles, enabledPowerups } = state
  const tick = state.tick + 1
  const count = snakes.length

  const portalLookup = buildPortalLookup(state.portals)
  const tunnelCellSet = buildTunnelCellSet(state.tunnels)
  const obstacleSet = new Set(obstacles.map(cellKey))
  const arenaCellSet = new Set<string>([...tunnelCellSet, ...portalLookup.keys(), ...state.unsafeCells.map(cellKey)])

  const aliveBefore = snakes.map((s) => s.alive)
  const direction = snakes.map((s) => s.pendingDirection ?? s.direction)
  const steps = snakes.map((s) => stepsForSnake(s.effects))
  const maxSteps = steps.reduce((max, s) => Math.max(max, s), 0)

  // Mutable per-tick locals, seeded from pre-tick values, accumulated across sub-steps.
  const dead = aliveBefore.map((alive) => !alive)
  const crashCell: (GridCell | null)[] = snakes.map((s) => s.crashCell)
  const heldPowerup = snakes.map((s) => s.heldPowerup)
  const bodies = snakes.map((s) => s.body)
  let pickups = state.pickups
  let food = state.food

  substep: for (let step = 1; step <= maxSteps; step++) {
    const stepping = snakes.map((_, i) => !dead[i] && step <= steps[i])

    const nextCell: (GridCell | null)[] = bodies.map((body, i) => {
      if (!stepping[i]) return null
      let cell = stepCell(body[body.length - 1], direction[i])
      if (wrapEdges && !isInBounds(cell, grid)) cell = wrapCell(cell, grid)
      return portalLookup.get(cellKey(cell)) ?? cell
    })

    const outOfBounds = nextCell.map((cell, i) => stepping[i] && !isInBounds(cell!, grid))
    const wallDeath = outOfBounds.map((oob, i) => stepping[i] && oob)
    const growing = nextCell.map((cell, i) => stepping[i] && !wallDeath[i] && cell!.x === food.x && cell!.y === food.y)

    const vacating = new Set<string>()
    for (let i = 0; i < count; i++) {
      if (stepping[i] && !wallDeath[i] && !growing[i]) vacating.add(cellKey(bodies[i][0]))
    }

    const stepDead = wallDeath.slice()
    for (let i = 0; i < count; i++) {
      if (stepDead[i] || !stepping[i]) continue
      for (let j = i + 1; j < count; j++) {
        if (stepDead[j] || !stepping[j]) continue
        if (nextCell[i]!.x === nextCell[j]!.x && nextCell[i]!.y === nextCell[j]!.y) {
          stepDead[i] = true
          stepDead[j] = true
        }
      }
    }

    const bodyUnion = new Set<string>()
    for (let i = 0; i < count; i++) {
      if (!dead[i]) for (const cell of bodies[i]) bodyUnion.add(cellKey(cell))
    }
    for (let i = 0; i < count; i++) {
      if (stepDead[i] || !stepping[i]) continue
      const key = cellKey(nextCell[i]!)
      if (tunnelCellSet.has(key)) continue
      if (obstacleSet.has(key) || (bodyUnion.has(key) && !vacating.has(key))) stepDead[i] = true
    }

    if (stepDead.some((d, i) => d && !dead[i])) {
      // A dying snake's move on THIS sub-step never commits (crashCell alone records where it
      // would have landed — see SnakeEntity.crashCell's own comment: the body array stays exactly
      // as of its last successful sub-step, the original single-step engine's own convention,
      // generalized unchanged). A snake that DIDN'T die on this sub-step, though, still commits its
      // own move here even though the tick as a whole is about to end — dying is per-snake, not a
      // global "nothing else happened this tick" flag, and the original single-pass engine (and
      // every test written against it) already relied on a survivor's own successful move landing
      // on the same tick a rival crashes (e.g. one snake eating food the exact tick the other steps
      // into its body). Only stepping snakes are touched; a 0-step (frozen) snake was never in the
      // running to begin with.
      for (let i = 0; i < count; i++) {
        if (!stepping[i]) continue
        if (stepDead[i] && !dead[i]) {
          dead[i] = true
          crashCell[i] = nextCell[i]
          continue
        }
        if (dead[i]) continue
        bodies[i] = growing[i] ? [...bodies[i], nextCell[i]!] : [...bodies[i].slice(1), nextCell[i]!]
        if (enabledPowerups.length > 0 && pickups.length > 0) {
          const landed = nextCell[i]!
          const found = pickups.find((pu) => pu.cell.x === landed.x && pu.cell.y === landed.y)
          if (found) {
            heldPowerup[i] = found.type
            pickups = pickups.filter((pu) => pu.id !== found.id)
          }
        }
      }
      break substep
    }

    for (let i = 0; i < count; i++) {
      if (!stepping[i]) continue
      bodies[i] = growing[i] ? [...bodies[i], nextCell[i]!] : [...bodies[i].slice(1), nextCell[i]!]
    }

    if (enabledPowerups.length > 0 && pickups.length > 0) {
      for (let i = 0; i < count; i++) {
        if (!stepping[i]) continue
        const landed = nextCell[i]!
        const found = pickups.find((pu) => pu.cell.x === landed.x && pu.cell.y === landed.y)
        if (found) {
          heldPowerup[i] = found.type
          pickups = pickups.filter((pu) => pu.id !== found.id)
        }
      }
    }
  }

  const diedThisTick = dead.map((d, i) => d && aliveBefore[i])

  // A snake's `body` only ever grows (+1, food) or stays flat (slide) within this function —
  // Constrict is the only thing that can shrink it, and that happens in a separate call before
  // tickSnake ever runs (see useSnakeState.ts's own per-tick ordering) — so any length increase
  // here is exactly this tick's own food-eating, whether or not the snake went on to crash later
  // in the same tick.
  const nextSnakes: SnakeEntity[] = snakes.map((s, i) => {
    if (!aliveBefore[i]) return s
    const scoreGain = Math.max(0, bodies[i].length - s.body.length)
    return {
      ...s,
      body: bodies[i],
      alive: !dead[i],
      direction: steps[i] > 0 ? direction[i] : s.direction,
      pendingDirection: steps[i] > 0 ? null : s.pendingDirection,
      score: s.score + scoreGain,
      heldPowerup: heldPowerup[i],
      effects: expireEffects(s.effects, tick),
      crashCell: diedThisTick[i] ? crashCell[i] : s.crashCell,
      peakLength: Math.max(s.peakLength, bodies[i].length)
    }
  })

  const ateFood = bodies.some((body, i) => body.length > snakes[i].body.length)
  if (ateFood) {
    const occupied = occupiedFromBodies(bodies, obstacles)
    const exclude = new Set(arenaCellSet)
    if (pickups.length > 0) exclude.add(cellKey(pickups[0].cell))
    food = pickRandomEmptyCell(grid, occupied, random, exclude) ?? food
  }

  // Exactly one pickup on the board at a time, like the one apple — the instant it's collected (or
  // none has spawned yet this round) a replacement appears immediately, next tick.
  if (enabledPowerups.length > 0 && pickups.length === 0) {
    const occupied = occupiedFromBodies(bodies, obstacles)
    const exclude = new Set(arenaCellSet)
    exclude.add(cellKey(food))
    const cell = pickRandomEmptyCell(grid, occupied, random, exclude)
    if (cell) {
      const type = enabledPowerups[Math.floor(random() * enabledPowerups.length)]
      pickups = [...pickups, { id: pickupId(tick, cell), type, cell }]
    }
  }

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

  return { ...state, phase, outcome, tick, snakes: nextSnakes, food, pickups }
}
