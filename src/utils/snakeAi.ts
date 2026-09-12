// CPU opponent for Snake — adapted from LightCycles' cpuAi.ts, keeping its flood-fill-scoring +
// tie-break-toward-straight + food-seeking-bias core. Originally dropped everything powerup/
// held-item-related since Snake had no powerups; now that it does, this file grows the same
// lookahead/powerup-awareness/mesmerize-compensation shape LightCycles' own cpuAi.ts already has.

import { ALL_DIRECTIONS, cellKey, isInBounds, isOppositeDirection, stepCell, wrapCell } from '@tastic/grid'
import { applyControlInversion } from '@tastic/input'

import { Direction, GridCell, GridSize, SnakeEntity, SnakeGameState, SnakeId, SnakePowerupPickup, SnakePowerupType } from '@/types'

import { countReachableCells, distanceToNearestTarget } from './floodFill'
import { applySnakePowerupActivation, applySnakeTurnIntent, buildPortalLookup, buildSnakeOccupiedSet, buildTunnelCellSet, stepsForSnake } from './snakeEngine'

export type CpuDifficulty = 'easy' | 'normal' | 'hard'

// Caps countReachableCells' flood fill at this many cells, same role as LightCycles'
// CPU_FLOOD_FILL_CAP (see floodFill.ts's own comment): once a candidate direction has this much
// open room it reads as "plenty of space" regardless of the board's actual size, so the CPU only
// needs to compare candidates against each other, not know the exact count. This file keeps its
// own constant (rather than importing LightCycles') per the plan's decision to give Snake's AI its
// own tuning home instead of a cross-project shared constants module.
export const CPU_FLOOD_FILL_CAP = 900

// Difficulty degrades decision QUALITY only, never reaction speed — the CPU always ticks in step
// with everyone else; only how faithfully it follows its own best-scoring move varies. Same names
// and values as LightCycles' own CPU_NORMAL_SUBOPTIMAL_CHANCE/CPU_EASY_RANDOM_CHANCE (see
// constants/game.ts there), reused here rather than shared since this is a new, standalone file.
//
// CPU_NORMAL_SUBOPTIMAL_CHANCE is rolled independently every tick, so it compounds fast across a
// whole round — kept low so 'normal' wobbles off the optimal line occasionally without reading as
// self-destructive. 'easy' rolls far more often (CPU_EASY_RANDOM_CHANCE) and, when it hits, takes
// any move that merely survives the next step rather than the best-scoring one.
export const CPU_NORMAL_SUBOPTIMAL_CHANCE = 0.05
export const CPU_EASY_RANDOM_CHANCE = 0.5

// How close two directions' open-space scores must be (in cells) to let food-seeking break the tie
// — mirrors LightCycles' CPU_POWERUP_AWARENESS[difficulty].seekTieToleranceCells, collapsed to one
// constant since food-seeking itself is unconditional/difficulty-independent (core to the genre,
// not an optional flourish — see chooseCpuSnakeDirection's own comment). Pickup-seeking below has
// its own, difficulty-gated tolerance in CPU_POWERUP_AWARENESS instead.
export const CPU_FOOD_SEEK_TIE_TOLERANCE_CELLS = 20

// CPU powerup-awareness knobs, one config per difficulty tier — layered onto the existing
// flood-fill scoring the same way CPU_NORMAL_SUBOPTIMAL_CHANCE/CPU_EASY_RANDOM_CHANCE layer onto
// its base direction choice: same algorithm, different faithfulness per tier, not a different
// algorithm per tier. Mirrors LightCycles' CPU_POWERUP_AWARENESS exactly.
export interface CpuSnakePowerupAwareness {
  seekPickups: boolean // bias tied survival-safe directions toward a nearby pickup
  seekTieToleranceCells: number // how close two directions' space scores must be to let pickup-seeking break the tie
  defensiveCounters: boolean // pop held Scales when truly cornered
  opportunisticSelfUse: boolean // use held Sidewind proactively, not just reactively
  offensiveUse: boolean // use held Mesmerize/Frenzy/Coldblood/Constrict against the opponent when advantageous
}
export const CPU_POWERUP_AWARENESS: Record<CpuDifficulty, CpuSnakePowerupAwareness> = {
  easy: { seekPickups: false, seekTieToleranceCells: 0, defensiveCounters: true, opportunisticSelfUse: false, offensiveUse: false },
  normal: { seekPickups: true, seekTieToleranceCells: 20, defensiveCounters: true, opportunisticSelfUse: true, offensiveUse: true },
  hard: { seekPickups: true, seekTieToleranceCells: 40, defensiveCounters: true, opportunisticSelfUse: true, offensiveUse: true }
}
export const POWERUP_CPU_SIDEWIND_MIN_SPACE = 60 // "coast is clear" — floor for opportunistic Sidewind
export const POWERUP_CPU_OFFENSIVE_SPACE_THRESHOLD = 15 // opponent's own space this low = most punishing moment to strike
export const POWERUP_CPU_OFFENSIVE_FALLBACK_CHANCE = 0.02 // per-tick chance to use an offensive item anyway, so it doesn't hoard forever

// Per-tick chance the CPU "notices" it's currently Mesmerized and steers to compensate — reasoning
// about the true best direction as always (chooseCpuSnakeDirection never itself knows about the
// inversion), then pre-inverting its own output so the automatic Mesmerize flip cancels out and the
// correct direction still lands. Without this, a mesmerized CPU blindly applies the flip on top of
// its own genuinely-best choice, which reliably steers it into a wall whenever the correct escape
// happens to be lateral — a free kill, not an earned one. Mirrors LightCycles' identical
// CPU_HACK_COMPENSATION_CHANCE: 'hard' always compensates (decision quality, not reaction speed, is
// what difficulty already models here), 'normal' sometimes still gets caught out, 'easy' never
// adapts.
export const CPU_MESMERIZE_COMPENSATION_CHANCE: Record<CpuDifficulty, number> = { easy: 0, normal: 0.6, hard: 1 }

interface ScoredDirection {
  direction: Direction
  space: number
  cell: GridCell | null
}

export interface ChooseCpuSnakeDirectionParams {
  snake: SnakeEntity
  grid: GridSize
  occupied: ReadonlySet<string>
  difficulty: CpuDifficulty
  random?: () => number
  food: GridCell
  // How many cells THIS snake itself advances this tick (see snakeEngine.ts's stepsForSnake) — a
  // boosted CPU needs its own safety lookahead to walk the same number of cells ahead, or a
  // direction that's only safe for 1 cell but crashes on the 2nd (while boosted) would misscore as
  // safe. Defaults to 1 (today's behavior) for every existing call site/test.
  ownSteps?: number
  // Powerup awareness, both optional/defaulted so existing call sites/tests are unaffected.
  pickups?: SnakePowerupPickup[]
  heldPowerup?: SnakePowerupType | null
  // Portal/tunnel-aware pathing (see snakeEngine.ts's buildPortalLookup/buildTunnelCellSet) —
  // optional/defaulted so existing call sites/tests (predating arenas) are unaffected.
  portals?: ReadonlyMap<string, GridCell>
  tunnelCellSet?: ReadonlySet<string>
  // The round's true wrapEdges — optional/defaulted (false) so existing call sites/tests are
  // unaffected. This is the ground truth, not a per-difficulty decision; whether it's actually
  // USED is gated to 'hard' further down (see this function's own wrapAware local).
  wrapEdges?: boolean
}

// Walks `ownSteps` cells ahead in `direction` from `head`, treating each intermediate cell as
// occupied for the next step's own check (mirroring snakeEngine.ts's tickSnake sub-step
// semantics), then flood-fills from wherever that lands. Unsafe (space -1, cell null) if any of
// those steps would be out of bounds or already occupied. A tunnel-member landing cell is never
// itself a hazard (see types/index.ts's own SnakeTunnel comment — mirrored here by simply never
// adding a tunnel cell to `working`, so a later step through the same cell also reads it as clear),
// matching tickSnake's own "tunnel cells never block" rule exactly.
function candidateSnakeSafety(head: GridCell, direction: Direction, grid: GridSize, occupied: ReadonlySet<string>, ownSteps: number, cap: number, portals: ReadonlyMap<string, GridCell> = new Map(), tunnelCellSet: ReadonlySet<string> = new Set(), wrapEdges: boolean = false): { space: number; cell: GridCell | null } {
  let cell = head
  let working: ReadonlySet<string> = occupied
  const steps = Math.max(1, ownSteps)
  for (let i = 0; i < steps; i++) {
    cell = stepCell(cell, direction)
    if (wrapEdges && !isInBounds(cell, grid)) cell = wrapCell(cell, grid)
    const key = cellKey(cell)
    if (portals.has(key)) cell = portals.get(key)!
    const landedKey = cellKey(cell)
    const isTunnelCell = tunnelCellSet.has(landedKey)
    if (!isInBounds(cell, grid) || (!isTunnelCell && working.has(landedKey))) return { space: -1, cell: null }
    if (i < steps - 1 && !isTunnelCell) working = new Set(working).add(landedKey)
  }
  // tunnelOccupied is always empty here (never passed) since a tunnel cell never blocks anyone in
  // Snake's model — passing an always-empty set is what makes floodFill.ts's own isBlocked routing
  // agree with that (see this file's own header comment on why no tunnelOccupied builder exists).
  return { space: countReachableCells(cell, grid, working, cap, portals, tunnelCellSet, new Set(), wrapEdges), cell }
}

// True only when every legal (non-180°) direction is unsafe within the snake's own lookahead —
// used to decide when a held Scales is worth popping preemptively (see shouldCpuActivateSnakePowerup)
// rather than accepting a move that's about to crash anyway.
function isCornered(snake: SnakeEntity, grid: GridSize, occupied: ReadonlySet<string>, ownSteps: number, portals: ReadonlyMap<string, GridCell>, tunnelCellSet: ReadonlySet<string>, wrapEdges: boolean): boolean {
  const head = snake.body[snake.body.length - 1]
  const candidates = ALL_DIRECTIONS.filter((direction) => !isOppositeDirection(direction, snake.direction))
  return candidates.every((direction) => candidateSnakeSafety(head, direction, grid, occupied, ownSteps, CPU_FLOOD_FILL_CAP, portals, tunnelCellSet, wrapEdges).space < 0)
}

// Scores each legal turn (i.e. not a 180° reversal — the same rule applySnakeTurnIntent enforces
// for human input) by how much open space it leads toward, via a flood fill from the resulting
// cell. That's what keeps the CPU from boxing itself in the way a purely-greedy "avoid only the
// very next cell" bot would — a direction whose first step is safe but only opens onto a small
// pocket still scores low. Difficulty modulates how faithfully the CPU follows that score, not how
// fast it reacts — 'hard' always takes the best-scoring move, 'normal'/'easy' sometimes settle for
// a worse one.
//
// Food-seeking is unconditional and difficulty-independent — core to the genre, not an optional
// flourish. Pickup-seeking (difficulty-gated via CPU_POWERUP_AWARENESS) unions in every live
// pickup's cell as an additional target once seeking, so a single tie-break pass covers both
// rather than two competing systems; like food-seeking, it can only ever break a tie among
// directions that already score within tolerance of the best — it can never pull the CPU toward a
// target at the cost of a genuinely safer option.
export function chooseCpuSnakeDirection({ snake, grid, occupied, difficulty, random = Math.random, food, ownSteps = 1, pickups = [], heldPowerup = null, portals = new Map(), tunnelCellSet = new Set(), wrapEdges = false }: ChooseCpuSnakeDirectionParams): Direction {
  const head = snake.body[snake.body.length - 1]
  const candidates = ALL_DIRECTIONS.filter((direction) => !isOppositeDirection(direction, snake.direction))

  // Deliberately gated to 'hard' only, matching LightCycles' identical reasoning — easy/normal keep
  // treating the edge as a wall even when it isn't, which reads as in-character weakness for those
  // tiers rather than an unfinished feature.
  const wrapAware = wrapEdges && difficulty === 'hard'

  const scored: ScoredDirection[] = candidates.map((direction) => ({ direction, ...candidateSnakeSafety(head, direction, grid, occupied, ownSteps, CPU_FLOOD_FILL_CAP, portals, tunnelCellSet, wrapAware) })).sort((a, b) => b.space - a.space)

  const maxSpace = scored[0].space
  const tiedForBest = scored.filter((s) => s.space === maxSpace)
  // Prefers continuing straight over an equally-good turn, purely so the CPU doesn't zigzag through
  // symmetric open space for no reason — ties on open-space score are common early in a round,
  // before anyone's body has carved up the grid yet.
  let best = (tiedForBest.find((s) => s.direction === snake.direction) ?? tiedForBest[0]).direction

  if (maxSpace >= 0) {
    const targets = new Set([cellKey(food)])
    const awareness = CPU_POWERUP_AWARENESS[difficulty]
    let tolerance = CPU_FOOD_SEEK_TIE_TOLERANCE_CELLS
    if (awareness.seekPickups && !heldPowerup && pickups.length > 0) {
      for (const pickup of pickups) targets.add(cellKey(pickup.cell))
      tolerance = Math.max(tolerance, awareness.seekTieToleranceCells)
    }
    const tied = scored.filter((s) => s.space >= 0 && maxSpace - s.space <= tolerance)
    if (tied.length > 1) {
      const ranked = tied
        .map((s) => ({ direction: s.direction, dist: s.cell ? distanceToNearestTarget(s.cell, grid, occupied, targets, CPU_FLOOD_FILL_CAP, portals, tunnelCellSet, new Set(), wrapAware) : null }))
        .filter((s): s is { direction: Direction; dist: number } => s.dist !== null)
        .sort((a, b) => a.dist - b.dist)
      if (ranked.length > 0) best = ranked[0].direction
    }
  }

  if (difficulty === 'hard') return best

  if (difficulty === 'normal') {
    const runnerUp = scored.find((s) => s.direction !== best)
    if (runnerUp && runnerUp.space >= 0 && random() < CPU_NORMAL_SUBOPTIMAL_CHANCE) return runnerUp.direction
    return best
  }

  // 'easy': half the time, ignore the score entirely and take any move that at least survives
  // this step — weak, but not so weak it feels broken by driving straight into a wall on purpose.
  const safeOptions = scored.filter((s) => s.space >= 0)
  if (safeOptions.length > 0 && random() < CPU_EASY_RANDOM_CHANCE) {
    const index = Math.min(safeOptions.length - 1, Math.floor(random() * safeOptions.length))
    return safeOptions[index].direction
  }
  return best
}

// Whether the CPU "notices" it's currently Mesmerized and steers to compensate this tick —
// difficulty gates how often, not whether it's even capable of it. Chances of exactly 0 or 1 skip
// the random() call entirely, so 'easy'/'hard' never consume an extra roll a test wouldn't expect.
function shouldCompensateForMesmerize(difficulty: CpuDifficulty, random: () => number): boolean {
  const chance = CPU_MESMERIZE_COMPENSATION_CHANCE[difficulty]
  if (chance <= 0) return false
  if (chance >= 1) return true
  return random() < chance
}

// Sole entry point a later hook (useSnakeState) calls each tick for the CPU-controlled snake:
// computes its direction and queues it through the exact same choke point human input goes through
// (applySnakeTurnIntent) — the CPU can't bypass turn-legality rules any more than a human can. A
// no-op (state passed through unchanged) when there's no such snake, it's already dead, or the
// round isn't in progress.
//
// chooseCpuSnakeDirection always reasons about the true best direction, uninverted — it has no idea
// whether it's currently Mesmerized. Whether the CPU compensates is decided first (see
// shouldCompensateForMesmerize): if it does, the flip is skipped entirely (the two inversions would
// just cancel out); if it doesn't "notice," the flip lands exactly as it would against unaware
// human input (see @tastic/input's applyControlInversion, already a dependency via
// keyboardControls.ts).
export function applyCpuSnakeTurn(state: SnakeGameState, cpuSnakeId: SnakeId, difficulty: CpuDifficulty, random: () => number = Math.random): SnakeGameState {
  if (state.phase !== 'playing') return state
  const snake = state.snakes.find((s) => s.id === cpuSnakeId)
  if (!snake || !snake.alive) return state

  const occupied = buildSnakeOccupiedSet(state.snakes, state.obstacles)
  const portals = buildPortalLookup(state.portals)
  const tunnelCellSet = buildTunnelCellSet(state.tunnels)
  const rawDirection = chooseCpuSnakeDirection({
    snake,
    grid: state.grid,
    occupied,
    difficulty,
    random,
    food: state.food,
    ownSteps: stepsForSnake(snake.effects),
    pickups: state.pickups,
    heldPowerup: snake.heldPowerup,
    portals,
    tunnelCellSet,
    wrapEdges: state.wrapEdges
  })
  const mesmerized = snake.effects.control?.type === 'mesmerize'
  const compensates = mesmerized && shouldCompensateForMesmerize(difficulty, random)
  const direction = mesmerized && !compensates ? applyControlInversion(rawDirection, true) : rawDirection
  return applySnakeTurnIntent(state, cpuSnakeId, direction)
}

// Decides whether the CPU should activate its held powerup this tick — a difficulty-gated
// heuristic layer (see CPU_POWERUP_AWARENESS) on top of the same flood-fill space assessment
// chooseCpuSnakeDirection already uses, not a separate lookahead system. Each branch reasons only
// about its own held type; there's no "pick the best of several held items" question since the
// single-slot inventory means at most one is ever held.
export function shouldCpuActivateSnakePowerup(state: SnakeGameState, cpuSnakeId: SnakeId, difficulty: CpuDifficulty, occupied: ReadonlySet<string>, random: () => number = Math.random): boolean {
  const cpu = state.snakes.find((s) => s.id === cpuSnakeId)
  if (!cpu || !cpu.alive) return false
  const held = cpu.heldPowerup
  if (!held) return false

  const portals = buildPortalLookup(state.portals)
  const tunnelCellSet = buildTunnelCellSet(state.tunnels)
  const awareness = CPU_POWERUP_AWARENESS[difficulty]
  // Same hard-only gate as chooseCpuSnakeDirection's own wrapAware — see that comment.
  const wrapAware = state.wrapEdges && difficulty === 'hard'
  const cpuOwnSteps = stepsForSnake(cpu.effects)

  if (held === 'scales' && awareness.defensiveCounters) {
    return isCornered(cpu, state.grid, occupied, cpuOwnSteps, portals, tunnelCellSet, wrapAware)
  }

  if (held === 'sidewind' && awareness.opportunisticSelfUse) {
    const cpuHead = cpu.body[cpu.body.length - 1]
    const ownSpace = candidateSnakeSafety(cpuHead, cpu.pendingDirection ?? cpu.direction, state.grid, occupied, cpuOwnSteps, CPU_FLOOD_FILL_CAP, portals, tunnelCellSet, wrapAware).space
    return !cpu.effects.speed && ownSpace > POWERUP_CPU_SIDEWIND_MIN_SPACE
  }

  const opponent = state.snakes.find((s) => s.id !== cpuSnakeId) ?? null
  if ((held === 'mesmerize' || held === 'frenzy' || held === 'coldblood' || held === 'constrict') && awareness.offensiveUse && opponent) {
    const opponentHead = opponent.body[opponent.body.length - 1]
    const opponentSpace = candidateSnakeSafety(opponentHead, opponent.pendingDirection ?? opponent.direction, state.grid, occupied, stepsForSnake(opponent.effects), CPU_FLOOD_FILL_CAP, portals, tunnelCellSet, wrapAware).space
    return (opponentSpace >= 0 && opponentSpace < POWERUP_CPU_OFFENSIVE_SPACE_THRESHOLD) || random() < POWERUP_CPU_OFFENSIVE_FALLBACK_CHANCE
  }

  return false
}

// Delegates to the exact same applySnakePowerupActivation a human's tap goes through —
// CPU-awareness is purely a decision layer on top (see shouldCpuActivateSnakePowerup), mirroring
// how applyCpuSnakeTurn above delegates to applySnakeTurnIntent.
export function applyCpuSnakePowerupActivation(state: SnakeGameState, cpuSnakeId: SnakeId, difficulty: CpuDifficulty, random: () => number = Math.random): SnakeGameState {
  if (state.phase !== 'playing') return state
  const occupied = buildSnakeOccupiedSet(state.snakes, state.obstacles)
  if (!shouldCpuActivateSnakePowerup(state, cpuSnakeId, difficulty, occupied, random)) return state
  return applySnakePowerupActivation(state, cpuSnakeId)
}
