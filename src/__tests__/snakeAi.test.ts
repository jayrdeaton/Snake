import { isOppositeDirection } from '@tastic/grid'

import { Direction, GridCell, SnakeEntity, SnakeGameState, SnakePowerupPickup } from '@/types'
import { applyCpuSnakePowerupActivation, applyCpuSnakeTurn, chooseCpuSnakeDirection, CpuDifficulty, shouldCpuActivateSnakePowerup } from '@/utils/snakeAi'
import { buildSnakeOccupiedSet } from '@/utils/snakeEngine'

// Fills in the fields every fixture needs regardless of what it's actually testing, so each call
// site only has to spell out what's relevant to it — same pattern as snakeEngine.test.ts.
function snake(overrides: Partial<SnakeEntity> & Pick<SnakeEntity, 'id' | 'body' | 'direction'>): SnakeEntity {
  return { pendingDirection: null, alive: true, score: 0, color: '#000', crashCell: null, heldPowerup: null, effects: { speed: null, control: null, shield: null }, peakLength: overrides.body.length, ...overrides }
}

const OPEN_GRID = { cols: 20, rows: 20 }
const FAR_FOOD: GridCell = { x: 19, y: 19 }

function makeState(overrides: Partial<SnakeGameState> = {}): SnakeGameState {
  const base: SnakeGameState = {
    phase: 'playing',
    grid: OPEN_GRID,
    snakes: [],
    food: FAR_FOOD,
    wrapEdges: false,
    outcome: null,
    tick: 0,
    obstacles: [],
    portals: [],
    tunnels: [],
    enabledPowerups: [],
    pickups: [],
    unsafeCells: []
  }
  return { ...base, ...overrides }
}

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
    const state = makeState({ snakes: [testSnake] })
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
    const state = makeState({ snakes: [testSnake], food: { x: 8, y: 10 } })

    const first = applyCpuSnakeTurn(state, 2, 'easy', fixedRandom(0.3))
    const second = applyCpuSnakeTurn(state, 2, 'easy', fixedRandom(0.3))
    expect(second).toEqual(first)
  })
})

describe('chooseCpuSnakeDirection — boosted lookahead (ownSteps)', () => {
  // Head at (5,5) facing 'right', an obstacle sitting 2 cells ahead at (7,5). One step ('right' to
  // (6,5)) is safe in isolation; a 2x-boosted snake continuing 'right' would crash on its own
  // second step into that obstacle — ownSteps must catch this, not just the immediate next cell.
  //
  // On a wide-open grid minus one distant cell, every candidate direction still scores essentially
  // the same open-space count (removing 1 of 400 cells barely changes reachability from anywhere),
  // so the space-based score alone can't distinguish them — the real assertion here is about
  // ownSteps, not about tie-breaking. Food is placed exactly on 'right's own 1-step landing cell
  // (distanceToNearestTarget returns 0 for a start cell that's already a target), which up/down
  // can only reach in 2 real BFS steps each — this resolves the tie in 'right's favor
  // unambiguously for ownSteps=1, without the (7,5) obstacle (irrelevant to this short a path)
  // ever entering into it.
  const foodAtRightLanding: GridCell = { x: 6, y: 5 }

  it('treats a direction as unsafe when a later sub-step (not just the first) would crash', () => {
    const testSnake = snake({
      id: 1,
      direction: 'right',
      body: [
        { x: 4, y: 5 },
        { x: 5, y: 5 }
      ]
    })
    const occupied = new Set(['7,5']) // the obstacle two cells ahead

    const oneStep = chooseCpuSnakeDirection({ snake: testSnake, grid: OPEN_GRID, occupied, difficulty: 'hard', food: foodAtRightLanding, ownSteps: 1 })
    expect(oneStep).toBe('right') // fine for a single, unboosted step

    const twoStep = chooseCpuSnakeDirection({ snake: testSnake, grid: OPEN_GRID, occupied, difficulty: 'hard', food: foodAtRightLanding, ownSteps: 2 })
    expect(twoStep).not.toBe('right') // continuing right would die on the boosted second step
  })
})

describe('chooseCpuSnakeDirection — pickup-seeking', () => {
  const pickups: SnakePowerupPickup[] = [{ id: 'pu-1', type: 'scales', cell: { x: 10, y: 10 } }]

  it('breaks a near-tie toward a live pickup on normal/hard when nothing is already held', () => {
    // Symmetric open space in every direction (food is far away and irrelevant to the tie), so the
    // only thing that can break the tie is the pickup itself.
    const testSnake = snake({
      id: 1,
      direction: 'right',
      body: [
        { x: 9, y: 11 },
        { x: 10, y: 11 }
      ]
    })
    const result = chooseCpuSnakeDirection({ snake: testSnake, grid: OPEN_GRID, occupied: new Set(), difficulty: 'hard', food: FAR_FOOD, pickups })
    expect(result).toBe('up')
  })

  it('ignores pickups entirely on easy (seekPickups is off for that tier)', () => {
    const testSnake = snake({
      id: 1,
      direction: 'right',
      body: [
        { x: 9, y: 11 },
        { x: 10, y: 11 }
      ]
    })
    // 'easy' still has a 50% chance to ignore scoring altogether — force the scored branch via a
    // random draw above CPU_EASY_RANDOM_CHANCE so this test actually exercises tie-breaking, not
    // the random-safe-move branch.
    const result = chooseCpuSnakeDirection({ snake: testSnake, grid: OPEN_GRID, occupied: new Set(), difficulty: 'easy', random: fixedRandom(0.99), food: FAR_FOOD, pickups })
    expect(result).not.toBe('up')
  })

  it('does not seek a pickup while already holding one', () => {
    const testSnake = snake({
      id: 1,
      direction: 'right',
      body: [
        { x: 9, y: 11 },
        { x: 10, y: 11 }
      ],
      heldPowerup: 'sidewind'
    })
    const result = chooseCpuSnakeDirection({ snake: testSnake, grid: OPEN_GRID, occupied: new Set(), difficulty: 'hard', food: FAR_FOOD, pickups, heldPowerup: 'sidewind' })
    expect(result).not.toBe('up')
  })
})

describe('shouldCpuActivateSnakePowerup', () => {
  function twoSnakes(cpu: Partial<SnakeEntity>, human: Partial<SnakeEntity> = {}) {
    return [
      snake({
        id: 2,
        body: [
          { x: 10, y: 10 },
          { x: 10, y: 11 }
        ],
        direction: 'down',
        ...cpu
      }),
      snake({
        id: 1,
        body: [
          { x: 5, y: 5 },
          { x: 5, y: 6 }
        ],
        direction: 'down',
        ...human
      })
    ]
  }

  it('returns false when the CPU holds nothing', () => {
    const state = makeState({ snakes: twoSnakes({ heldPowerup: null }) })
    expect(shouldCpuActivateSnakePowerup(state, 2, 'hard', buildSnakeOccupiedSet(state.snakes))).toBe(false)
  })

  it('pops a held scales when cornered, on every difficulty (defensiveCounters is always on)', () => {
    // Boxed into a 1x1 pocket at (0,0) facing down, walled in by obstacles on every other side.
    const cornered = snake({ id: 2, body: [{ x: 0, y: 0 }], direction: 'down', heldPowerup: 'scales' })
    const state = makeState({
      snakes: [cornered, snake({ id: 1, body: [{ x: 19, y: 19 }], direction: 'up' })],
      obstacles: [
        { x: 1, y: 0 },
        { x: 0, y: 1 }
      ]
    })
    for (const difficulty of ['easy', 'normal', 'hard'] as CpuDifficulty[]) {
      expect(shouldCpuActivateSnakePowerup(state, 2, difficulty, buildSnakeOccupiedSet(state.snakes, state.obstacles))).toBe(true)
    }
  })

  it('does not pop scales when there is plenty of open room', () => {
    const state = makeState({ snakes: twoSnakes({ heldPowerup: 'scales' }) })
    expect(shouldCpuActivateSnakePowerup(state, 2, 'hard', buildSnakeOccupiedSet(state.snakes))).toBe(false)
  })

  it('uses sidewind opportunistically on normal/hard when there is plenty of room, never on easy', () => {
    const state = makeState({ snakes: twoSnakes({ heldPowerup: 'sidewind' }) })
    const occupied = buildSnakeOccupiedSet(state.snakes)
    expect(shouldCpuActivateSnakePowerup(state, 2, 'hard', occupied)).toBe(true)
    expect(shouldCpuActivateSnakePowerup(state, 2, 'normal', occupied)).toBe(true)
    expect(shouldCpuActivateSnakePowerup(state, 2, 'easy', occupied)).toBe(false)
  })

  it('uses an offensive item when the opponent is nearly boxed in, never on easy', () => {
    // Human heads 'right' into a short, 3-cell dead-end corridor (walled top/bottom, capped at the
    // far end) — its own next-step space is small (3) but not already-fatal, which is exactly the
    // "nearly boxed in, not yet dead" case the offensive threshold targets (a space of -1, already
    // doomed regardless, falls through to the random fallback chance instead — see
    // shouldCpuActivateSnakePowerup's own offensive branch).
    const boxedHuman = snake({
      id: 1,
      body: [
        { x: 4, y: 5 },
        { x: 5, y: 5 }
      ],
      direction: 'right'
    })
    const state = makeState({
      snakes: [snake({ id: 2, body: [{ x: 19, y: 19 }], direction: 'up', heldPowerup: 'mesmerize' }), boxedHuman],
      obstacles: [
        { x: 6, y: 4 },
        { x: 7, y: 4 },
        { x: 8, y: 4 },
        { x: 6, y: 6 },
        { x: 7, y: 6 },
        { x: 8, y: 6 },
        { x: 9, y: 5 }
      ]
    })
    const occupied = buildSnakeOccupiedSet(state.snakes, state.obstacles)
    expect(shouldCpuActivateSnakePowerup(state, 2, 'hard', occupied, fixedRandom(0.99))).toBe(true)
    expect(shouldCpuActivateSnakePowerup(state, 2, 'easy', occupied, fixedRandom(0.99))).toBe(false)
  })
})

describe('applyCpuSnakePowerupActivation', () => {
  it('is a no-op when shouldCpuActivateSnakePowerup would return false', () => {
    const state = makeState({ snakes: [snake({ id: 2, body: [{ x: 10, y: 10 }], direction: 'up', heldPowerup: null }), snake({ id: 1, body: [{ x: 5, y: 5 }], direction: 'up' })] })
    expect(applyCpuSnakePowerupActivation(state, 2, 'hard')).toBe(state)
  })

  it('actually activates through the same choke point a human tap uses', () => {
    const cornered = snake({ id: 2, body: [{ x: 0, y: 0 }], direction: 'down', heldPowerup: 'scales' })
    const state = makeState({
      snakes: [cornered, snake({ id: 1, body: [{ x: 19, y: 19 }], direction: 'up' })],
      obstacles: [
        { x: 1, y: 0 },
        { x: 0, y: 1 }
      ]
    })
    const next = applyCpuSnakePowerupActivation(state, 2, 'hard')
    const cpu = next.snakes.find((s) => s.id === 2)!
    expect(cpu.heldPowerup).toBeNull()
    expect(cpu.effects.shield).not.toBeNull()
  })
})

describe('applyCpuSnakeTurn — mesmerize compensation', () => {
  const mesmerizedCpu = snake({
    id: 2,
    direction: 'right',
    body: [
      { x: 9, y: 10 },
      { x: 10, y: 10 }
    ],
    effects: { speed: null, control: { type: 'mesmerize', expiresAtTick: 100 }, shield: null }
  })

  it('hard always compensates — the queued direction matches the unmesmerized best choice exactly', () => {
    const state = makeState({ snakes: [mesmerizedCpu] })
    const unmesmerizedChoice = chooseCpuSnakeDirection({ snake: { ...mesmerizedCpu, effects: { speed: null, control: null, shield: null } }, grid: OPEN_GRID, occupied: new Set(), difficulty: 'hard', food: FAR_FOOD })
    const next = applyCpuSnakeTurn(state, 2, 'hard', fixedRandom(0.99))
    expect(next.snakes[0].pendingDirection ?? next.snakes[0].direction).toBe(unmesmerizedChoice)
  })

  it('easy never compensates — the queued direction is the inverted (not the raw best) choice', () => {
    const state = makeState({ snakes: [mesmerizedCpu] })
    const unmesmerizedChoice = chooseCpuSnakeDirection({ snake: { ...mesmerizedCpu, effects: { speed: null, control: null, shield: null } }, grid: OPEN_GRID, occupied: new Set(), difficulty: 'easy', random: fixedRandom(0), food: FAR_FOOD })
    const next = applyCpuSnakeTurn(state, 2, 'easy', fixedRandom(0))
    expect(next.snakes[0].pendingDirection ?? next.snakes[0].direction).not.toBe(unmesmerizedChoice)
  })
})
