import { ALL_DIRECTIONS, cellKey, isInBounds, stepCell, wrapCell } from '@tastic/grid'

import { GridCell, GridSize } from '@/types'
import { distanceToNearestTarget } from '@/utils/floodFill'

// The string-keyed BFS distanceToNearestTarget used to be (LightCycles' floodFill.ts), kept as the
// reference the index-based version has to agree with.
function referenceDistance(start: GridCell, grid: GridSize, occupied: ReadonlySet<string>, targets: ReadonlySet<string>, maxCount: number, portals: ReadonlyMap<string, GridCell>, tunnelCellSet: ReadonlySet<string>, tunnelOccupied: ReadonlySet<string>, wrapEdges: boolean): number | null {
  const isBlocked = (key: string): boolean => (tunnelCellSet.has(key) ? tunnelOccupied : occupied).has(key)
  if (!isInBounds(start, grid) || isBlocked(cellKey(start))) return null
  if (targets.has(cellKey(start))) return 0
  const visited = new Set<string>([cellKey(start)])
  const queue: { cell: GridCell; dist: number }[] = [{ cell: start, dist: 0 }]
  let head = 0
  while (head < queue.length && queue.length < maxCount) {
    const { cell, dist } = queue[head]
    head++
    for (const direction of ALL_DIRECTIONS) {
      let next = stepCell(cell, direction)
      if (wrapEdges && !isInBounds(next, grid)) next = wrapCell(next, grid)
      let key = cellKey(next)
      if (portals.has(key)) {
        next = portals.get(key)!
        key = cellKey(next)
      }
      if (visited.has(key) || !isInBounds(next, grid) || isBlocked(key)) continue
      if (targets.has(key)) return dist + 1
      visited.add(key)
      queue.push({ cell: next, dist: dist + 1 })
    }
  }
  return null
}

// Small deterministic PRNG so a failure reproduces.
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('distanceToNearestTarget', () => {
  it('finds the step distance on an open grid', () => {
    expect(distanceToNearestTarget({ x: 0, y: 0 }, { cols: 10, rows: 10 }, new Set(), new Set(['9,9']))).toBe(18)
  })

  it('returns 0 on a target and null when the start is blocked or every target is walled off', () => {
    const grid = { cols: 5, rows: 5 }
    expect(distanceToNearestTarget({ x: 2, y: 2 }, grid, new Set(), new Set(['2,2']))).toBe(0)
    expect(distanceToNearestTarget({ x: 2, y: 2 }, grid, new Set(['2,2']), new Set(['0,0']))).toBeNull()
    expect(distanceToNearestTarget({ x: 2, y: 2 }, grid, new Set(['1,0', '0,1']), new Set(['0,0']))).toBeNull()
  })

  it('wraps edges and follows portals', () => {
    const grid = { cols: 10, rows: 10 }
    expect(distanceToNearestTarget({ x: 0, y: 5 }, grid, new Set(), new Set(['9,5']), Infinity, new Map(), new Set(), new Set(), true)).toBe(1)
    expect(distanceToNearestTarget({ x: 1, y: 1 }, grid, new Set(), new Set(['8,8']), Infinity, new Map([['2,1', { x: 7, y: 8 }]]))).toBe(2)
  })

  it('agrees with the string-keyed reference on random boards', () => {
    const random = seededRandom(42)
    const pick = (n: number) => Math.floor(random() * n)
    for (let trial = 0; trial < 400; trial++) {
      const grid = { cols: 3 + pick(20), rows: 3 + pick(20) }
      const cell = (): GridCell => ({ x: pick(grid.cols), y: pick(grid.rows) })
      const occupied = new Set<string>()
      const tunnelCellSet = new Set<string>()
      const tunnelOccupied = new Set<string>()
      const targets = new Set<string>()
      const portals = new Map<string, GridCell>()
      const density = random() * 0.4
      for (let i = 0; i < grid.cols * grid.rows * density; i++) occupied.add(cellKey(cell()))
      for (let i = 0; i < pick(6); i++) tunnelCellSet.add(cellKey(cell()))
      for (let i = 0; i < pick(4); i++) tunnelOccupied.add(cellKey(cell()))
      for (let i = 0; i < 1 + pick(3); i++) targets.add(cellKey(cell()))
      if (random() < 0.5) {
        const a = { x: 1 + pick(grid.cols - 2), y: 1 + pick(grid.rows - 2) }
        const b = { x: 1 + pick(grid.cols - 2), y: 1 + pick(grid.rows - 2) }
        if (cellKey(a) !== cellKey(b)) {
          portals.set(cellKey(a), b)
          portals.set(cellKey(b), a)
        }
      }
      const start = cell()
      const maxCount = random() < 0.3 ? 1 + pick(grid.cols * grid.rows) : Infinity
      const wrapEdges = random() < 0.5
      const args = [start, grid, occupied, targets, maxCount, portals, tunnelCellSet, tunnelOccupied, wrapEdges] as const
      expect(distanceToNearestTarget(...args)).toBe(referenceDistance(...args))
    }
  })
})
