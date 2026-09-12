import { isOppositeDirection } from '@tastic/grid'

import { GridCell, SnakeEntity, SnakeGameState, SnakeRoundSettings } from '@/types'
import { applySnakePowerupActivation, applySnakeTurnIntent, buildSnakeOccupiedSet, createInitialSnakeState, SNAKE_START_LENGTH, tickSnake } from '@/utils/snakeEngine'

// Fills in the fields every fixture needs regardless of what it's actually testing, so each call
// site only has to spell out what's relevant to it — same pattern as LightCycles' gameEngine.test.ts.
function snake(overrides: Partial<SnakeEntity> & Pick<SnakeEntity, 'id' | 'body' | 'direction'>): SnakeEntity {
  return { pendingDirection: null, alive: true, score: 0, color: '#000', crashCell: null, heldPowerup: null, effects: { speed: null, control: null, shield: null }, peakLength: overrides.body.length, ...overrides }
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

function roundSettings(overrides: Partial<SnakeRoundSettings> = {}): SnakeRoundSettings {
  return { wrapEdges: false, speedTier: 'normal', arenaVariant: 'open', enabledPowerups: [], ...overrides }
}

const fixedRandom = (value: number) => () => value

describe('createInitialSnakeState', () => {
  it('centers a single 3-segment snake, alive, in the playing phase, with no outcome', () => {
    const state = createInitialSnakeState({ cols: 20, rows: 20 }, 1, roundSettings())
    expect(state.phase).toBe('playing')
    expect(state.outcome).toBeNull()
    expect(state.snakes).toHaveLength(1)
    expect(state.snakes[0].alive).toBe(true)
    expect(state.snakes[0].body).toHaveLength(SNAKE_START_LENGTH)
    expect(state.snakes[0].body.at(-1)).toEqual({ x: 10, y: 10 })
    expect(state.snakes[0].peakLength).toBe(SNAKE_START_LENGTH)
    expect(state.snakes[0].heldPowerup).toBeNull()
    expect(state.obstacles).toEqual([])
    expect(state.portals).toEqual([])
    expect(state.tunnels).toEqual([])
    expect(state.pickups).toEqual([])
  })

  it('never spawns food on the single snake body', () => {
    const state = createInitialSnakeState({ cols: 20, rows: 20 }, 1, roundSettings())
    const occupied = buildSnakeOccupiedSet(state.snakes)
    expect(occupied.has(`${state.food.x},${state.food.y}`)).toBe(false)
  })

  it('builds the selected arena and stores its obstacles on state', () => {
    const state = createInitialSnakeState({ cols: 40, rows: 60 }, 2, roundSettings({ arenaVariant: 'pillars' }))
    expect(state.obstacles.length).toBeGreaterThan(0)
    // Food never spawns on an obstacle.
    const key = `${state.food.x},${state.food.y}`
    expect(state.obstacles.some((cell) => `${cell.x},${cell.y}` === key)).toBe(false)
  })

  it('filters opponent-targeted powerups out of solo’s effective spawn pool', () => {
    const state = createInitialSnakeState({ cols: 20, rows: 20 }, 1, roundSettings({ enabledPowerups: ['sidewind', 'coldblood', 'scales', 'constrict', 'mesmerize', 'frenzy'] }))
    expect(state.enabledPowerups.sort()).toEqual(['scales', 'sidewind'])
  })

  it('keeps every enabled powerup for a 2-snake round', () => {
    const state = createInitialSnakeState({ cols: 40, rows: 60 }, 2, roundSettings({ enabledPowerups: ['sidewind', 'coldblood'] }))
    expect(state.enabledPowerups.sort()).toEqual(['coldblood', 'sidewind'])
  })

  describe('spawn symmetry (2 snakes)', () => {
    const grid = { cols: 20, rows: 30 }
    const state = createInitialSnakeState(grid, 2, roundSettings())
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

  describe('safe-area margin', () => {
    it('defaults to no unsafeCells when cellPx/safeAreaInsetsPx are omitted', () => {
      const state = createInitialSnakeState({ cols: 20, rows: 20 }, 1, roundSettings())
      expect(state.unsafeCells).toEqual([])
    })

    it('marks no cells unsafe when safeAreaInsetsPx is explicitly all-zero', () => {
      const state = createInitialSnakeState({ cols: 20, rows: 20 }, 1, roundSettings(), undefined, Math.random, 10, { top: 0, right: 0, bottom: 0, left: 0 })
      expect(state.unsafeCells).toEqual([])
    })

    it('marks the ceil(inset/cellPx) cells along each edge unsafe, and none of the interior', () => {
      // A 10x10 grid at cellPx=10: a 25px top inset and 15px left inset round up to 3 and 2 cells
      // respectively (ceil(25/10)=3, ceil(15/10)=2) — anything less than a full cell of overlap
      // still counts as unsafe, since food/a pickup only partially clear of the notch/Dynamic
      // Island/speaker cutout is still partially hidden by it. Mirrors LightCycles' identical test.
      const state = createInitialSnakeState({ cols: 10, rows: 10 }, 1, roundSettings(), undefined, Math.random, 10, { top: 25, right: 0, bottom: 0, left: 15 })
      const unsafe = new Set(state.unsafeCells.map((c) => `${c.x},${c.y}`))
      expect(unsafe.has('5,0')).toBe(true)
      expect(unsafe.has('5,2')).toBe(true)
      expect(unsafe.has('0,5')).toBe(true)
      expect(unsafe.has('1,5')).toBe(true)
      expect(unsafe.has('5,3')).toBe(false)
      expect(unsafe.has('2,5')).toBe(false)
      expect(unsafe.has('9,9')).toBe(false)
    })

    it('never places the very first food on a cell inside unsafeCells, even when it would otherwise be the only clear candidate', () => {
      // A 3x3 grid at cellPx=10 with a 20px right inset and 20px bottom inset marks 2 cells unsafe
      // along each of those edges (ceil(20/10)=2) — the only cell left outside that margin is
      // (0,0), so without the exclusion food would have nowhere else to spawn.
      const state = createInitialSnakeState({ cols: 3, rows: 3 }, 1, roundSettings(), undefined, Math.random, 10, { top: 0, right: 20, bottom: 20, left: 0 })
      const unsafe = new Set(state.unsafeCells.map((c) => `${c.x},${c.y}`))
      expect(unsafe.has('0,0')).toBe(false)
      expect(unsafe.size).toBe(8)
      expect(state.food).toEqual({ x: 0, y: 0 })
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
    expect(next.snakes[0].peakLength).toBe(3)
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
    expect(next.snakes[0].peakLength).toBe(4)
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

  describe('arena obstacles', () => {
    it('kills a snake that steps into an obstacle cell', () => {
      const state = makeState({ obstacles: [{ x: 5, y: 5 }], food: { x: 0, y: 0 } })
      const next = tickSnake(state)
      expect(next.snakes[0].alive).toBe(false)
      expect(next.snakes[0].crashCell).toEqual({ x: 5, y: 5 })
      expect(next.phase).toBe('roundOver')
    })

    it('never respawns food on an obstacle cell', () => {
      // Snake eats at (5,5) this tick; the respawned food must avoid the obstacle at (6,5).
      const state = makeState({ obstacles: [{ x: 6, y: 5 }], food: { x: 5, y: 5 } })
      const next = tickSnake(state, fixedRandom(0.1))
      expect(next.food).not.toEqual({ x: 6, y: 5 })
    })
  })

  describe('safe-area margin (unsafeCells)', () => {
    // Every cell on the grid is marked unsafe, so pickRandomEmptyCell can never find a candidate at
    // all — this isolates the exclusion itself (rather than depending on candidate-ordering/random
    // value) since the only possible outcomes are "found nothing" if the exclusion works, or "landed
    // somewhere" if it doesn't.
    const grid = { cols: 10, rows: 10 }
    const allCells: GridCell[] = []
    for (let x = 0; x < grid.cols; x++) for (let y = 0; y < grid.rows; y++) allCells.push({ x, y })

    it('leaves food exactly where it was if the safe-area margin covers every remaining candidate', () => {
      // Snake eats at (5,5) this tick; with every cell unsafe, there's nowhere left to respawn it.
      const state = makeState({ unsafeCells: allCells, food: { x: 5, y: 5 } })
      const next = tickSnake(state, fixedRandom(0.1))
      expect(next.food).toEqual({ x: 5, y: 5 })
    })

    it('never spawns a pickup at all if the safe-area margin covers every remaining candidate', () => {
      const state = makeState({ enabledPowerups: ['sidewind'], unsafeCells: allCells, food: { x: 0, y: 0 } })
      const next = tickSnake(state, fixedRandom(0.1))
      expect(next.pickups).toEqual([])
    })
  })

  describe('portals', () => {
    it('redirects a step onto a portal cell to its paired exit before any collision check', () => {
      const state = makeState({
        portals: [{ a: { x: 5, y: 5 }, b: { x: 8, y: 8 } }],
        food: { x: 0, y: 0 }
      })
      const next = tickSnake(state)
      expect(next.snakes[0].alive).toBe(true)
      // Head steps onto the portal cell (5,5) and is immediately redirected to (8,8) — the
      // portal's own cell never appears in the body.
      expect(next.snakes[0].body.at(-1)).toEqual({ x: 8, y: 8 })
      expect(next.snakes[0].body.some((c) => c.x === 5 && c.y === 5)).toBe(false)
    })

    it('crashes into whatever already occupies the exit, same as any other blocked move', () => {
      const state = makeState({
        snakes: [
          snake({
            id: 1,
            body: [
              { x: 4, y: 5 },
              { x: 5, y: 5 }
            ],
            direction: 'right'
          }),
          snake({
            id: 2,
            body: [
              { x: 9, y: 9 },
              { x: 8, y: 8 }
            ],
            direction: 'up'
          })
        ],
        portals: [{ a: { x: 6, y: 5 }, b: { x: 8, y: 8 } }],
        food: { x: 0, y: 0 }
      })
      const next = tickSnake(state)
      expect(next.snakes[0].alive).toBe(false)
      expect(next.phase).toBe('roundOver')
    })
  })

  describe('underpass (tunnel)', () => {
    it('lets two snakes occupy tunnel cells at once without colliding', () => {
      const state = makeState({
        snakes: [
          snake({
            id: 1,
            body: [
              { x: 4, y: 5 },
              { x: 5, y: 5 }
            ],
            direction: 'right'
          }),
          snake({
            id: 2,
            body: [
              { x: 7, y: 6 },
              { x: 6, y: 5 }
            ],
            direction: 'left'
          })
        ],
        tunnels: [
          {
            cells: [
              { x: 5, y: 5 },
              { x: 6, y: 5 },
              { x: 7, y: 5 }
            ]
          }
        ],
        food: { x: 0, y: 0 }
      })
      const next = tickSnake(state)
      expect(next.snakes[0].alive).toBe(true)
      expect(next.snakes[1].alive).toBe(true)
      expect(next.snakes[0].body.at(-1)).toEqual({ x: 6, y: 5 })
      expect(next.snakes[1].body.at(-1)).toEqual({ x: 5, y: 5 })
    })

    it('still applies head-to-head inside a tunnel when both land on the exact same cell', () => {
      const state = makeState({
        snakes: [
          // Both converge on (5,5) this tick — a genuine same-cell head-to-head, not the swap
          // the previous test exercises.
          snake({
            id: 1,
            body: [
              { x: 3, y: 5 },
              { x: 4, y: 5 }
            ],
            direction: 'right'
          }),
          snake({
            id: 2,
            body: [
              { x: 7, y: 5 },
              { x: 6, y: 5 }
            ],
            direction: 'left'
          })
        ],
        tunnels: [{ cells: [{ x: 5, y: 5 }] }],
        food: { x: 0, y: 0 }
      })
      const next = tickSnake(state)
      expect(next.snakes[0].alive).toBe(false)
      expect(next.snakes[1].alive).toBe(false)
      expect(next.outcome).toEqual({ type: 'draw' })
    })
  })

  describe('powerup speed effects (sub-stepping)', () => {
    function boosted() {
      return { speed: { type: 'sidewind' as const, multiplier: 2 as const, expiresAtTick: 10 }, control: null, shield: null }
    }

    it('a sidewind-boosted snake advances 2 cells in a single tick call', () => {
      const state = makeState({
        snakes: [
          snake({
            id: 1,
            body: [
              { x: 2, y: 5 },
              { x: 3, y: 5 },
              { x: 4, y: 5 }
            ],
            direction: 'right',
            effects: boosted()
          })
        ],
        food: { x: 0, y: 0 }
      })
      const next = tickSnake(state)
      expect(next.snakes[0].alive).toBe(true)
      expect(next.snakes[0].body).toEqual([
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 6, y: 5 }
      ])
    })

    it('checks collision on the SECOND sub-step independently — dies if it only becomes fatal after the first step', () => {
      const state = makeState({
        snakes: [
          snake({
            id: 1,
            body: [
              { x: 2, y: 5 },
              { x: 3, y: 5 },
              { x: 4, y: 5 }
            ],
            direction: 'right',
            effects: boosted()
          })
        ],
        obstacles: [{ x: 6, y: 5 }],
        food: { x: 0, y: 0 }
      })
      const next = tickSnake(state)
      expect(next.snakes[0].alive).toBe(false)
      // First sub-step (to (5,5)) succeeded and is kept; only the fatal second sub-step is dropped.
      expect(next.snakes[0].body.at(-1)).toEqual({ x: 5, y: 5 })
      expect(next.snakes[0].crashCell).toEqual({ x: 6, y: 5 })
    })

    it('a coldblood’d snake does not move, and keeps its pre-freeze direction and pending turn untouched', () => {
      const state = makeState({
        snakes: [
          snake({
            id: 1,
            body: [
              { x: 2, y: 5 },
              { x: 3, y: 5 },
              { x: 4, y: 5 }
            ],
            direction: 'right',
            pendingDirection: 'up',
            effects: { speed: { type: 'coldblood', multiplier: 0, expiresAtTick: 10 }, control: null, shield: null }
          })
        ],
        food: { x: 0, y: 0 }
      })
      const next = tickSnake(state)
      expect(next.snakes[0].alive).toBe(true)
      expect(next.snakes[0].body).toEqual(state.snakes[0].body)
      expect(next.snakes[0].direction).toBe('right')
      expect(next.snakes[0].pendingDirection).toBe('up')
    })

    it('expires an effect once the tick reaches its expiresAtTick', () => {
      const state = makeState({
        tick: 9,
        snakes: [
          snake({
            id: 1,
            body: [
              { x: 2, y: 5 },
              { x: 3, y: 5 },
              { x: 4, y: 5 }
            ],
            direction: 'right',
            effects: boosted()
          })
        ],
        food: { x: 0, y: 0 }
      })
      const next = tickSnake(state) // tick becomes 10, expiresAtTick: 10 → cleared
      expect(next.snakes[0].effects.speed).toBeNull()
    })
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

describe('applySnakePowerupActivation', () => {
  function twoSnakes(overrides: { p1?: Partial<SnakeEntity>; p2?: Partial<SnakeEntity> } = {}) {
    return makeState({
      snakes: [
        snake({
          id: 1,
          body: [
            { x: 2, y: 5 },
            { x: 3, y: 5 },
            { x: 4, y: 5 }
          ],
          direction: 'right',
          heldPowerup: 'sidewind',
          ...overrides.p1
        }),
        snake({
          id: 2,
          body: [
            { x: 8, y: 5 },
            { x: 7, y: 5 },
            { x: 6, y: 5 }
          ],
          direction: 'left',
          ...overrides.p2
        })
      ]
    })
  }

  it('no-ops when the snake holds nothing', () => {
    const state = twoSnakes({ p1: { heldPowerup: null } })
    expect(applySnakePowerupActivation(state, 1)).toBe(state)
  })

  it('no-ops outside the playing phase', () => {
    const state = makeState({ phase: 'roundOver' })
    expect(applySnakePowerupActivation(state, 1)).toBe(state)
  })

  it('sidewind sets a self speed effect and clears the held slot', () => {
    const state = twoSnakes({ p1: { heldPowerup: 'sidewind' } })
    const next = applySnakePowerupActivation(state, 1)
    const s1 = next.snakes.find((s) => s.id === 1)!
    expect(s1.heldPowerup).toBeNull()
    expect(s1.effects.speed).toEqual({ type: 'sidewind', multiplier: 2, expiresAtTick: expect.any(Number) })
  })

  it('scales sets a self shield effect and works with no opponent (solo)', () => {
    const state = makeState({
      snakes: [
        snake({
          id: 1,
          body: [
            { x: 2, y: 5 },
            { x: 3, y: 5 },
            { x: 4, y: 5 }
          ],
          direction: 'right',
          heldPowerup: 'scales'
        })
      ]
    })
    const next = applySnakePowerupActivation(state, 1)
    expect(next.snakes[0].heldPowerup).toBeNull()
    expect(next.snakes[0].effects.shield).not.toBeNull()
  })

  it('coldblood freezes the opponent, not the activator', () => {
    const state = twoSnakes({ p1: { heldPowerup: 'coldblood' } })
    const next = applySnakePowerupActivation(state, 1)
    expect(next.snakes.find((s) => s.id === 1)!.effects.speed).toBeNull()
    expect(next.snakes.find((s) => s.id === 2)!.effects.speed).toEqual({ type: 'coldblood', multiplier: 0, expiresAtTick: expect.any(Number) })
  })

  it('mesmerize sets a control effect on the opponent', () => {
    const state = twoSnakes({ p1: { heldPowerup: 'mesmerize' } })
    const next = applySnakePowerupActivation(state, 1)
    expect(next.snakes.find((s) => s.id === 2)!.effects.control).toEqual({ type: 'mesmerize', expiresAtTick: expect.any(Number) })
  })

  it('frenzy sets a forced speed effect on the opponent', () => {
    const state = twoSnakes({ p1: { heldPowerup: 'frenzy' } })
    const next = applySnakePowerupActivation(state, 1)
    expect(next.snakes.find((s) => s.id === 2)!.effects.speed).toEqual({ type: 'frenzy', multiplier: 2, expiresAtTick: expect.any(Number) })
  })

  it('constrict shortens the opponent’s body from the tail end without touching its peakLength', () => {
    const state = twoSnakes({
      p1: { heldPowerup: 'constrict' },
      p2: {
        body: [
          { x: 8, y: 5 },
          { x: 7, y: 5 },
          { x: 6, y: 5 },
          { x: 5, y: 5 }
        ],
        peakLength: 4
      }
    })
    const next = applySnakePowerupActivation(state, 1)
    const s2 = next.snakes.find((s) => s.id === 2)!
    expect(s2.body.length).toBeLessThan(4)
    // The head (last element) always survives a constrict.
    expect(s2.body.at(-1)).toEqual({ x: 5, y: 5 })
    expect(s2.peakLength).toBe(4)
  })

  it('opponent-targeted types still clear the held slot when there is no opponent (defensive, solo)', () => {
    const state = makeState({
      snakes: [
        snake({
          id: 1,
          body: [
            { x: 2, y: 5 },
            { x: 3, y: 5 },
            { x: 4, y: 5 }
          ],
          direction: 'right',
          heldPowerup: 'coldblood'
        })
      ]
    })
    const next = applySnakePowerupActivation(state, 1)
    expect(next.snakes[0].heldPowerup).toBeNull()
  })

  it('a Constrict shrink is still reflected in peakLength history correctly across a later tick', () => {
    // Snake grows to length 4, gets constricted back to a shorter body, then ticks again —
    // peakLength must still read 4, the true high-water mark, not whatever the body currently is.
    let state = twoSnakes({
      p1: {
        heldPowerup: null,
        body: [
          { x: 2, y: 5 },
          { x: 3, y: 5 },
          { x: 4, y: 5 },
          { x: 5, y: 5 }
        ],
        peakLength: 4
      },
      p2: {
        heldPowerup: 'constrict',
        body: [
          { x: 20, y: 20 },
          { x: 21, y: 20 }
        ],
        direction: 'left'
      }
    })
    state = applySnakePowerupActivation(state, 2)
    const s1 = state.snakes.find((s) => s.id === 1)!
    expect(s1.body.length).toBeLessThan(4)
    const next = tickSnake(state)
    expect(next.snakes.find((s) => s.id === 1)!.peakLength).toBe(4)
  })
})
