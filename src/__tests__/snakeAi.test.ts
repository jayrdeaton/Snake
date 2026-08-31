import { Direction, GridCell, SnakeEntity, SnakeGameState } from '@/types'
import { isOppositeDirection } from '@/utils/grid'
import { applyCpuSnakeTurn, chooseCpuSnakeDirection, CpuDifficulty } from '@/utils/snakeAi'

// Fills in the fields every fixture needs regardless of what it's actually testing, so each call
// site only has to spell out what's relevant to it — same pattern as snakeEngine.test.ts.
function snake(overrides: Partial<SnakeEntity> & Pick<SnakeEntity, 'id' | 'body' | 'direction'>): SnakeEntity {
  return { pendingDirection: null, alive: true, score: 0, color: '#000', crashCell: null, ...overrides }
}

const OPEN_GRID = { cols: 20, rows: 20 }
const FAR_FOOD: GridCell = { x: 19, y: 19 }

const fixedRandom = (value: number) => () => value

describe('chooseCpuSnakeDirection', () => {
  it('never returns a direction that is an immediate 180-degree reversal of the current direction', () => {
    const difficulties: CpuDifficulty[] = ['easy', 'normal', 'hard']
    const randomValues = [0, 0.1, 0.25, 0.49, 0.5, 0.51, 0.75, 0.9, 0.99]

    for (const direction of ['up', 'down', 'left', 'right'] as Direction[]) {
      // Head dead-center of a wide-open grid so every candidate direction is otherwise safe —
      // isolates the reversal guard itself rather than any wall/body pressure forcing the choice.
      const testSnake = snake({
        id: 1,
        direction,
        body: [
          { x: 9, y: 10 },
          { x: 10, y: 10 }
        ]
      })

      for (const difficulty of difficulties) {
        for (const value of randomValues) {
          const result = chooseCpuSnakeDirection({
            snake: testSnake,
            grid: OPEN_GRID,
            occupied: new Set([`${testSnake.body[testSnake.body.length - 1].x},${testSnake.body[testSnake.body.length - 1].y}`]),
            difficulty,
            random: fixedRandom(value),
            food: FAR_FOOD
          })
          expect(isOppositeDirection(result, direction)).toBe(false)
        }
      }
    }
  })
})

describe('chooseCpuSnakeDirection — single safe option', () => {
  // Head at (0,5) facing 'up': candidates are 'up' / 'left' / 'right' ('down' is excluded outright
  // as the reversal). 'left' steps off the left edge (wall death); 'up' steps onto an occupied
  // cell (body collision, simulating either the snake's own body or a rival's); only 'right' is
  // immediately safe.
  const head: GridCell = { x: 0, y: 5 }
  const testSnake = snake({ id: 1, direction: 'up', body: [{ x: 0, y: 6 }, head] })
  const occupied = new Set(['0,6', '0,5', '0,4']) // 0,4 = the 'up' landing cell, occupied

  it('always picks the one safe direction on hard, regardless of random', () => {
    for (const value of [0, 0.2, 0.5, 0.8, 0.999]) {
      const result = chooseCpuSnakeDirection({ snake: testSnake, grid: OPEN_GRID, occupied, difficulty: 'hard', random: fixedRandom(value), food: FAR_FOOD })
      expect(result).toBe('right')
    }
  })

  it('routes the same safe choice through applyCpuSnakeTurn on hard', () => {
    const state: SnakeGameState = { phase: 'playing', grid: OPEN_GRID, snakes: [testSnake], food: FAR_FOOD, wrapEdges: false, outcome: null, tick: 0 }
    const next = applyCpuSnakeTurn(state, 1, 'hard', fixedRandom(0.5))
    expect(next.snakes[0].pendingDirection).toBe('right')
  })
})

describe('chooseCpuSnakeDirection — determinism', () => {
  it('returns the same result on repeated calls with the same fixed random and inputs', () => {
    const testSnake = snake({
      id: 1,
      direction: 'right',
      body: [
        { x: 4, y: 4 },
        { x: 5, y: 4 }
      ]
    })
    const params = {
      snake: testSnake,
      grid: OPEN_GRID,
      occupied: new Set(['4,4', '5,4']),
      difficulty: 'normal' as CpuDifficulty,
      random: fixedRandom(0.01), // below CPU_NORMAL_SUBOPTIMAL_CHANCE — exercises the runner-up branch too
      food: { x: 6, y: 4 }
    }

    const first = chooseCpuSnakeDirection(params)
    const second = chooseCpuSnakeDirection(params)
    expect(second).toBe(first)
  })

  it('is deterministic through applyCpuSnakeTurn as well', () => {
    const testSnake = snake({
      id: 2,
      direction: 'down',
      body: [
        { x: 8, y: 2 },
        { x: 8, y: 3 }
      ]
    })
    const state: SnakeGameState = { phase: 'playing', grid: OPEN_GRID, snakes: [testSnake], food: { x: 8, y: 10 }, wrapEdges: false, outcome: null, tick: 0 }

    const first = applyCpuSnakeTurn(state, 2, 'easy', fixedRandom(0.3))
    const second = applyCpuSnakeTurn(state, 2, 'easy', fixedRandom(0.3))
    expect(second).toEqual(first)
  })
})
