// CPU opponent for Snake — adapted from LightCycles' cpuAi.ts, keeping its flood-fill-scoring +
// tie-break-toward-straight + food-seeking-bias core, with everything powerup/held-item-related
// dropped: Snake has no powerups, so its CPU only ever reasons about open space and food.

import { Direction, GridCell, GridSize, SnakeEntity, SnakeGameState, SnakeId } from '@/types'

import { countReachableCells, distanceToNearestTarget } from './floodFill'
import { ALL_DIRECTIONS, cellKey, isInBounds, isOppositeDirection, stepCell } from './grid'
import { applySnakeTurnIntent, buildSnakeOccupiedSet } from './snakeEngine'

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
// constant since Snake's CPU has exactly one thing to seek (food, always) rather than a per-
// difficulty on/off awareness toggle for several distinct pickup types. Food-seeking can only ever
// break a near-tie among directions that already score within this tolerance of the best — it can
// never pull the CPU toward food at the cost of a genuinely safer direction.
export const CPU_FOOD_SEEK_TIE_TOLERANCE_CELLS = 20

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
}

// Scores each legal turn (i.e. not a 180° reversal — the same rule applySnakeTurnIntent enforces
// for human input) by how much open space it leads toward, via a flood fill from the resulting
// cell. That's what keeps the CPU from boxing itself in the way a purely-greedy "avoid only the
// very next cell" bot would — a direction whose first step is safe but only opens onto a small
// pocket still scores low. Difficulty modulates how faithfully the CPU follows that score, not how
// fast it reacts — 'hard' always takes the best-scoring move, 'normal'/'easy' sometimes settle for
// a worse one.
//
// Food-seeking only ever breaks a tie among directions that already score within
// CPU_FOOD_SEEK_TIE_TOLERANCE_CELLS of the best — see that constant's own comment.
export function chooseCpuSnakeDirection({ snake, grid, occupied, difficulty, random = Math.random, food }: ChooseCpuSnakeDirectionParams): Direction {
  const head = snake.body[snake.body.length - 1]
  const candidates = ALL_DIRECTIONS.filter((direction) => !isOppositeDirection(direction, snake.direction))

  const scored: ScoredDirection[] = candidates
    .map((direction) => {
      const next = stepCell(head, direction)
      if (!isInBounds(next, grid) || occupied.has(cellKey(next))) return { direction, space: -1, cell: null }
      return { direction, space: countReachableCells(next, grid, occupied, CPU_FLOOD_FILL_CAP), cell: next }
    })
    .sort((a, b) => b.space - a.space)

  const maxSpace = scored[0].space
  const tiedForBest = scored.filter((s) => s.space === maxSpace)
  // Prefers continuing straight over an equally-good turn, purely so the CPU doesn't zigzag through
  // symmetric open space for no reason — ties on open-space score are common early in a round,
  // before anyone's body has carved up the grid yet.
  let best = (tiedForBest.find((s) => s.direction === snake.direction) ?? tiedForBest[0]).direction

  if (maxSpace >= 0) {
    const tied = scored.filter((s) => s.space >= 0 && maxSpace - s.space <= CPU_FOOD_SEEK_TIE_TOLERANCE_CELLS)
    if (tied.length > 1) {
      const targets = new Set([cellKey(food)])
      const ranked = tied
        .map((s) => ({ direction: s.direction, dist: s.cell ? distanceToNearestTarget(s.cell, grid, occupied, targets, CPU_FLOOD_FILL_CAP) : null }))
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

  // 'easy': often, ignore the score entirely and take any move that at least survives this step —
  // weak, but not so weak it feels broken by driving straight into a wall on purpose.
  const safeOptions = scored.filter((s) => s.space >= 0)
  if (safeOptions.length > 0 && random() < CPU_EASY_RANDOM_CHANCE) {
    const index = Math.min(safeOptions.length - 1, Math.floor(random() * safeOptions.length))
    return safeOptions[index].direction
  }
  return best
}

// Sole entry point a later hook (useSnakeState) calls each tick for the CPU-controlled snake:
// computes its direction and queues it through the exact same choke point human input goes through
// (applySnakeTurnIntent) — the CPU can't bypass turn-legality rules any more than a human can. A
// no-op (state passed through unchanged) when there's no such snake, it's already dead, or the
// round isn't in progress, mirroring LightCycles' applyCpuTurn's own guards.
export function applyCpuSnakeTurn(state: SnakeGameState, cpuSnakeId: SnakeId, difficulty: CpuDifficulty, random: () => number = Math.random): SnakeGameState {
  if (state.phase !== 'playing') return state
  const snake = state.snakes.find((s) => s.id === cpuSnakeId)
  if (!snake || !snake.alive) return state

  const occupied = buildSnakeOccupiedSet(state.snakes)
  const direction = chooseCpuSnakeDirection({ snake, grid: state.grid, occupied, difficulty, random, food: state.food })
  return applySnakeTurnIntent(state, cpuSnakeId, direction)
}
