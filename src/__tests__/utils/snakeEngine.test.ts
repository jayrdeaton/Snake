import { GridCell, SnakeEntity, SnakeGameState } from '@/types'
import { isOppositeDirection } from '@/utils/grid'
import { applySnakeTurnIntent, buildSnakeOccupiedSet, createInitialSnakeState, SNAKE_START_LENGTH, tickSnake } from '@/utils/snakeEngine'

// Fills in the fields every fixture needs regardless of what it's actually testing, so each call
// site only has to spell out what's relevant to it — same pattern as LightCycles' gameEngine.test.ts.
function snake(overrides: Partial<SnakeEntity> & Pick<SnakeEntity, 'id' | 'body' | 'direction'>): SnakeEntity {
  return { pendingDirection: null, alive: true, score: 0, color: '#000', crashCell: null, ...overrides }
}

function makeState(overrides: Partial<SnakeGameState> = {}): SnakeGameState {
  const base: SnakeGameState = {
    phase: 'playing',
    grid: { cols: 10, rows: 10 },
    snakes: [
      snake({
        id: 1,
        body: [
          { x: 2, y: 5 },
          { x: 3, y: 5 },
          { x: 4, y: 5 }
        ],
        direction: 'right'
      })
    ],
    food: { x: 9, y: 9 },
    wrapEdges: false,
    outcome: null,
    tick: 0
  }
  return { ...base, ...overrides }
}

const fixedRandom = (value: number) => () => value

describe('createInitialSnakeState', () => {
  it('centers a single 3-segment snake, alive, in the playing phase, with no outcome', () => {
    const state = createInitialSnakeState({ cols: 20, rows: 20 }, 1, false)
    expect(state.phase).toBe('playing')
    expect(state.outcome).toBeNull()
    expect(state.snakes).toHaveLength(1)
    expect(state.snakes[0].alive).toBe(true)
    expect(state.snakes[0].body).toHaveLength(SNAKE_START_LENGTH)
    expect(state.snakes[0].body.at(-1)).toEqual({ x: 10, y: 10 })
  })

  it('never spawns food on the single snake body', () => {
    const state = createInitialSnakeState({ cols: 20, rows: 20 }, 1, false)
    const occupied = buildSnakeOccupiedSet(state.snakes)
    expect(occupied.has(`${state.food.x},${state.food.y}`)).toBe(false)
  })

  describe('spawn symmetry (2 snakes)', () => {
    const grid = { cols: 20, rows: 30 }
    const state = createInitialSnakeState(grid, 2, false)
    const s1 = state.snakes.find((s) => s.id === 1)!
    const s2 = state.snakes.find((s) => s.id === 2)!

    it('gives each snake a full 3-segment body on opposite halves of the board', () => {
      expect(state.snakes).toHaveLength(2)
      expect(s1.body).toHaveLength(SNAKE_START_LENGTH)
      expect(s2.body).toHaveLength(SNAKE_START_LENGTH)
      expect(s1.body.at(-1)!.x).toBe(s2.body.at(-1)!.x)
      expect(s2.body.at(-1)!.y).toBeLessThan(s1.body.at(-1)!.y)
    })

    it('faces the two snakes toward each other (opposite headings on the shared axis)', () => {
      expect(s1.direction).toBe('up')
      expect(s2.direction).toBe('down')
      // "Facing each other" on a shared vertical axis IS exactly an opposite-direction pair by
      // construction — this is the fact that makes them approach one another tick over tick.
      expect(isOppositeDirection(s1.direction, s2.direction)).toBe(true)
    })

    it('never spawns food on either snake body', () => {
      const occupied = buildSnakeOccupiedSet(state.snakes)
      expect(occupied.has(`${state.food.x},${state.food.y}`)).toBe(false)
    })

    it('causes no collision on the very first tick', () => {
      const next = tickSnake(state)
      expect(next.phase).toBe('playing')
      expect(next.snakes.every((s) => s.alive)).toBe(true)
      expect(next.outcome).toBeNull()
    })
  })
})

describe('applySnakeTurnIntent', () => {
  it('queues a valid turn', () => {
    const state = makeState()
    const next = applySnakeTurnIntent(state, 1, 'up')
    expect(next.snakes[0].pendingDirection).toBe('up')
  })

  it('ignores a 180° reversal into its own body', () => {
    const state = makeState()
    const next = applySnakeTurnIntent(state, 1, 'left')
    expect(next).toBe(state)
    expect(next.snakes[0].pendingDirection).toBeNull()
  })

  it('ignores a turn matching the current heading (no-op)', () => {
    const state = makeState()
    expect(applySnakeTurnIntent(state, 1, 'right')).toBe(state)
  })

  it('ignores turns outside the playing phase', () => {
    const state = makeState({ phase: 'roundOver' })
    expect(applySnakeTurnIntent(state, 1, 'up')).toBe(state)
  })

  it('ignores turns for a dead snake', () => {
    const state = makeState({ snakes: [{ ...makeState().snakes[0], alive: false }] })
    expect(applySnakeTurnIntent(state, 1, 'up')).toBe(state)
  })
})

describe('tickSnake', () => {
  it('no-ops outside the playing phase', () => {
    const state = makeState({ phase: 'roundOver' })
    expect(tickSnake(state)).toBe(state)
  })

  it('keeps body length constant on a normal move (no food nearby)', () => {
    const state = makeState({ food: { x: 9, y: 9 } })
    const next = tickSnake(state)
    expect(next.snakes[0].alive).toBe(true)
    expect(next.snakes[0].body).toHaveLength(3)
    expect(next.snakes[0].body).toEqual([
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 5, y: 5 }
    ])
    expect(next.snakes[0].score).toBe(0)
  })

  it('grows and increments score on eating', () => {
    const state = makeState({ food: { x: 5, y: 5 } })
    const next = tickSnake(state, fixedRandom(0))
    expect(next.snakes[0].alive).toBe(true)
    expect(next.snakes[0].body).toHaveLength(4)
    expect(next.snakes[0].body).toEqual([
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 5, y: 5 }
    ])
    expect(next.snakes[0].score).toBe(1)
    // The just-eaten cell is now occupied — the respawned food must land somewhere else.
    expect(next.food).not.toEqual({ x: 5, y: 5 })
  })

  it('never respawns food on a snake body, across a range of random draws', () => {
    // A 4x4 board where a single snake's 12-cell body covers every cell except the bottom row —
    // after this tick's growth eats (3,3) it covers every cell except (0,3)/(1,3)/(2,3). Any of
    // the random draws below picking an occupied cell would mean the exclusion logic is broken.
    const body: GridCell[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 }
    ]
    const state = makeState({
      grid: { cols: 4, rows: 4 },
      snakes: [snake({ id: 1, body, direction: 'down' })],
      food: { x: 3, y: 3 }
    })
    const stillFree = new Set(['0,3', '1,3', '2,3'])
    for (const r of [0, 0.5, 0.99]) {
      const next = tickSnake(state, fixedRandom(r))
      expect(stillFree.has(`${next.food.x},${next.food.y}`)).toBe(true)
    }
  })

  it('dies on self-collision with an interior body segment', () => {
    const state = makeState({
      snakes: [
        snake({
          id: 1,
          body: [
            { x: 5, y: 5 },
            { x: 5, y: 6 },
            { x: 5, y: 7 }
          ],
          direction: 'up'
        })
      ],
      food: { x: 0, y: 0 }
    })
    const next = tickSnake(state)
    expect(next.snakes[0].alive).toBe(false)
    expect(next.snakes[0].crashCell).toEqual({ x: 5, y: 6 })
    expect(next.phase).toBe('roundOver')
    expect(next.outcome).toBeNull()
  })

  it('survives stepping onto its own current tail cell on a non-eating tick', () => {
    // A tight 4-cell loop: turning left from the current heading steps exactly onto the tail,
    // which vacates this same tick since the snake isn't growing.
    const state = makeState({
      snakes: [
        snake({
          id: 1,
          body: [
            { x: 5, y: 5 },
            { x: 5, y: 6 },
            { x: 6, y: 6 },
            { x: 6, y: 5 }
          ],
          direction: 'up',
          pendingDirection: 'left'
        })
      ],
      food: { x: 0, y: 0 }
    })
    const next = tickSnake(state)
    expect(next.snakes[0].alive).toBe(true)
    expect(next.snakes[0].direction).toBe('left')
    expect(next.snakes[0].pendingDirection).toBeNull()
    expect(next.snakes[0].body).toEqual([
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
      { x: 5, y: 5 }
    ])
  })

  it('kills a snake that steps off the edge when wrapEdges is false', () => {
    const state = makeState({
      snakes: [
        snake({
          id: 1,
          body: [
            { x: 2, y: 5 },
            { x: 1, y: 5 },
            { x: 0, y: 5 }
          ],
          direction: 'left'
        })
      ],
      wrapEdges: false
    })
    const next = tickSnake(state)
    expect(next.snakes[0].alive).toBe(false)
    expect(next.snakes[0].crashCell).toEqual({ x: -1, y: 5 })
    expect(next.phase).toBe('roundOver')
  })

  it('wraps around to the opposite edge when wrapEdges is true', () => {
    const state = makeState({
      snakes: [
        snake({
          id: 1,
          body: [
            { x: 2, y: 5 },
            { x: 1, y: 5 },
            { x: 0, y: 5 }
          ],
          direction: 'left'
        })
      ],
      wrapEdges: true
    })
    const next = tickSnake(state)
    expect(next.snakes[0].alive).toBe(true)
    expect(next.phase).toBe('playing')
    expect(next.snakes[0].body).toEqual([
      { x: 1, y: 5 },
      { x: 0, y: 5 },
      { x: 9, y: 5 }
    ])
  })

  describe('two-snake rounds', () => {
    function twoSnakeState(overrides: Partial<SnakeGameState> = {}): SnakeGameState {
      return makeState({
        snakes: [
          snake({
            id: 1,
            body: [
              { x: 2, y: 5 },
              { x: 3, y: 5 },
              { x: 4, y: 5 }
            ],
            direction: 'right'
          }),
          snake({
            id: 2,
            body: [
              { x: 8, y: 5 },
              { x: 7, y: 5 },
              { x: 6, y: 5 }
            ],
            direction: 'left'
          })
        ],
        food: { x: 0, y: 9 },
        ...overrides
      })
    }

    it('kills both snakes in a head-to-head collision, resulting in a draw', () => {
      const next = tickSnake(twoSnakeState())
      expect(next.snakes[0].alive).toBe(false)
      expect(next.snakes[1].alive).toBe(false)
      expect(next.snakes[0].crashCell).toEqual({ x: 5, y: 5 })
      expect(next.snakes[1].crashCell).toEqual({ x: 5, y: 5 })
      expect(next.phase).toBe('roundOver')
      expect(next.outcome).toEqual({ type: 'draw' })
    })

    it('awards a win to the survivor when one snake steps into the other body (not head-to-head)', () => {
      const state = twoSnakeState({
        snakes: [
          snake({
            id: 1,
            body: [
              { x: 2, y: 5 },
              { x: 3, y: 5 },
              { x: 4, y: 5 }
            ],
            direction: 'right'
          }),
          snake({
            id: 2,
            body: [
              { x: 5, y: 4 },
              { x: 5, y: 5 },
              { x: 5, y: 6 }
            ],
            direction: 'down'
          })
        ],
        food: { x: 0, y: 0 }
      })
      const next = tickSnake(state)
      expect(next.snakes[0].alive).toBe(false)
      expect(next.snakes[0].crashCell).toEqual({ x: 5, y: 5 })
      expect(next.snakes[1].alive).toBe(true)
      expect(next.snakes[1].body).toEqual([
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 }
      ])
      expect(next.phase).toBe('roundOver')
      expect(next.outcome).toEqual({ type: 'win', winnerId: 2 })
    })

    it('draws on two independent, unrelated simultaneous deaths (not a shared cell)', () => {
      const state = twoSnakeState({
        snakes: [
          snake({
            id: 1,
            body: [
              { x: 2, y: 5 },
              { x: 1, y: 5 },
              { x: 0, y: 5 }
            ],
            direction: 'left'
          }),
          snake({
            id: 2,
            body: [
              { x: 5, y: 5 },
              { x: 5, y: 6 },
              { x: 5, y: 7 }
            ],
            direction: 'up'
          })
        ],
        food: { x: 9, y: 0 },
        wrapEdges: false
      })
      const next = tickSnake(state)
      expect(next.snakes[0].alive).toBe(false)
      expect(next.snakes[0].crashCell).toEqual({ x: -1, y: 5 })
      expect(next.snakes[1].alive).toBe(false)
      expect(next.snakes[1].crashCell).toEqual({ x: 5, y: 6 })
      expect(next.outcome).toEqual({ type: 'draw' })
    })

    it('does not tick further once the round is over — the survivor does not keep playing solo', () => {
      const state = twoSnakeState()
      const afterDeath = tickSnake(state)
      expect(afterDeath.phase).toBe('roundOver')
      const afterAnotherTick = tickSnake(afterDeath)
      expect(afterAnotherTick).toBe(afterDeath)
    })

    describe('shared food race', () => {
      it('resolves a clean race normally — whichever snake reaches the food eats it, food respawns off both bodies', () => {
        const state = twoSnakeState({
          snakes: [
            snake({
              id: 1,
              body: [
                { x: 2, y: 5 },
                { x: 3, y: 5 },
                { x: 4, y: 5 }
              ],
              direction: 'right'
            }),
            snake({
              id: 2,
              body: [
                { x: 0, y: 0 },
                { x: 0, y: 1 },
                { x: 0, y: 2 }
              ],
              direction: 'down'
            })
          ],
          food: { x: 5, y: 5 }
        })
        const next = tickSnake(state, fixedRandom(0))
        expect(next.snakes[0].alive).toBe(true)
        expect(next.snakes[0].score).toBe(1)
        expect(next.snakes[0].body).toHaveLength(4)
        expect(next.snakes[1].alive).toBe(true)
        expect(next.snakes[1].score).toBe(0)
        expect(next.snakes[1].body).toHaveLength(3)
        expect(next.food).toEqual({ x: 0, y: 0 })
      })

      it('resolves an exact-same-tick collision on the food cell as a head-to-head: nobody scores, food is not consumed', () => {
        const state = twoSnakeState({ food: { x: 5, y: 5 } })
        const next = tickSnake(state, fixedRandom(0))
        expect(next.snakes[0].alive).toBe(false)
        expect(next.snakes[1].alive).toBe(false)
        expect(next.snakes[0].score).toBe(0)
        expect(next.snakes[1].score).toBe(0)
        expect(next.outcome).toEqual({ type: 'draw' })
        // Food was never collected, so it stays exactly where it was.
        expect(next.food).toEqual({ x: 5, y: 5 })
      })
    })

    describe('cross-snake tail-vacate rule', () => {
      function vacateState(otherGrowing: boolean): SnakeGameState {
        return twoSnakeState({
          snakes: [
            snake({
              id: 1,
              body: [
                { x: 2, y: 5 },
                { x: 3, y: 5 },
                { x: 4, y: 5 }
              ],
              direction: 'right'
            }),
            snake({
              id: 2,
              body: [
                { x: 5, y: 5 },
                { x: 5, y: 6 },
                { x: 5, y: 7 }
              ],
              direction: 'down'
            })
          ],
          // Snake 2's tail sits at (5,5) — exactly where snake 1's next head cell (5,5) lands.
          food: otherGrowing ? { x: 5, y: 8 } : { x: 0, y: 0 }
        })
      }

      it('is safe to step into another snake’s current tail cell when that snake is not growing', () => {
        const next = tickSnake(vacateState(false), fixedRandom(0))
        expect(next.snakes[0].alive).toBe(true)
        expect(next.snakes[0].body.at(-1)).toEqual({ x: 5, y: 5 })
        expect(next.snakes[1].alive).toBe(true)
        expect(next.snakes[1].body).toEqual([
          { x: 5, y: 6 },
          { x: 5, y: 7 },
          { x: 5, y: 8 }
        ])
      })

      it('is fatal when that snake IS growing this tick, since its tail does not vacate', () => {
        const next = tickSnake(vacateState(true), fixedRandom(0))
        expect(next.snakes[0].alive).toBe(false)
        expect(next.snakes[0].crashCell).toEqual({ x: 5, y: 5 })
        expect(next.snakes[1].alive).toBe(true)
        expect(next.snakes[1].score).toBe(1)
        expect(next.snakes[1].body).toEqual([
          { x: 5, y: 5 },
          { x: 5, y: 6 },
          { x: 5, y: 7 },
          { x: 5, y: 8 }
        ])
        expect(next.outcome).toEqual({ type: 'win', winnerId: 2 })
      })
    })
  })
})
