import { ALL_DIRECTIONS, cellKey, isInBounds, stepCell, wrapCell } from '@tastic/grid'

import { GridCell, GridSize } from '@/types'

// 4-directional BFS from `start`, counting cells reachable without crossing `occupied` or the
// grid edge - the "how much room is left to survive in" heuristic snakeAi.ts scores each candidate
// turn by. Index-walked queue (not Array#shift, which is O(n) per call and would make this
// O(cells²)) since this runs fresh for every candidate direction, every tick.
//
// `maxCount` stops the fill early once the queue reaches that many cells, bounding worst-case
// cost at O(maxCount) regardless of grid size - see CPU_FLOOD_FILL_CAP's own comment for why an
// exact count past that point is never actually needed. Defaults to unbounded for direct/test use.
// `portals` defaults to empty so every existing call site/test (predating portals) stays byte-
// identical - a neighbor landing on a portal cell is redirected to its paired exit before the
// visited/bounds/occupied checks run, the same "let + reassign before any check" shape tickGame's
// own movement resolution uses, so a portal reads to this search as a normal 1-step edge to
// wherever it actually leads, not a boundary (see gameEngine.ts's tickGame for why treating it as
// blocked instead would misjudge reachable space near one). `tunnelCellSet`/`tunnelOccupied` both
// default to empty for the same byte-identical-by-default reason - a tunnel-member cell's blocked
// check routes through `tunnelOccupied` instead of `occupied`, exactly mirroring tickGame's own
// `isBlocked` - otherwise this would see every tunnel cell as unconditionally empty regardless of
// what's actually sitting there underground, the CPU blind spot the mechanic's own params exist to
// close (see cpuAi.ts's callers). `wrapEdges` defaults to false so every existing call site/test
// (predating wrap) stays byte-identical - when true, a neighbor that steps off the grid re-enters
// from the opposite edge (see grid.ts's wrapCell) instead of being treated as a boundary, mirroring
// gameEngine.ts's own tickGame. Applied before the portal check, same order tickGame uses, though
// it's moot in practice: a portal is never placed on an edge cell (see arenas.ts), so a raw
// off-grid `next` can never also be a portal entrance.
//
// Ported verbatim from LightCycles' floodFill.ts - confirmed 100% generic (no LightCycles-specific
// logic), with only the import paths adapted to this project's grid.ts/types. Snake's own AI
// (snakeAi.ts) has no portals/tunnels/wrap-awareness of its own yet and simply never passes those
// params, relying on their defaults - kept here rather than stripped so this stays a byte-identical
// port that can absorb a future LightCycles fix with a straight diff.
export function countReachableCells(start: GridCell, grid: GridSize, occupied: ReadonlySet<string>, maxCount: number = Infinity, portals: ReadonlyMap<string, GridCell> = new Map(), tunnelCellSet: ReadonlySet<string> = new Set(), tunnelOccupied: ReadonlySet<string> = new Set(), wrapEdges: boolean = false): number {
  const isBlocked = (key: string): boolean => (tunnelCellSet.has(key) ? tunnelOccupied : occupied).has(key)
  if (!isInBounds(start, grid) || isBlocked(cellKey(start))) return 0

  const visited = new Set<string>([cellKey(start)])
  const queue: GridCell[] = [start]

  let head = 0
  while (head < queue.length && queue.length < maxCount) {
    const cell = queue[head]
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
      visited.add(key)
      queue.push(next)
    }
  }

  return queue.length
}

// Same 4-directional BFS shape as countReachableCells above, but stops early and returns the
// step-distance to the first cell in `targets` it reaches, or null if none is reachable within
// `maxCount` - used by snakeAi.ts to bias food-seeking without a second, differently-shaped search.
// `portals` follows the identical redirect-before-checks shape countReachableCells above uses;
// `tunnelCellSet`/`tunnelOccupied` follow its identical isBlocked-routing shape, and `wrapEdges`
// follows its identical wrap-before-portal-check shape too.
//
// Started as a port of LightCycles' floodFill.ts, but walks the grid by cell index (typed arrays for
// visited/blocked/targets/portals) instead of string keys in Sets: snakeAi.ts runs this uncapped,
// up to three times a tick, and on a full-screen desktop board (about 180 x 100 cells) the string
// version took around 30ms a tick when the food was walled off. Same results as the string version
// (pinned by floodFill.test.ts, which keeps it as a reference). Portal entrances are only read for
// in-bounds cells, which is every portal (see countReachableCells' comment above).
export function distanceToNearestTarget(start: GridCell, grid: GridSize, occupied: ReadonlySet<string>, targets: ReadonlySet<string>, maxCount: number = Infinity, portals: ReadonlyMap<string, GridCell> = new Map(), tunnelCellSet: ReadonlySet<string> = new Set(), tunnelOccupied: ReadonlySet<string> = new Set(), wrapEdges: boolean = false): number | null {
  const isBlocked = (key: string): boolean => (tunnelCellSet.has(key) ? tunnelOccupied : occupied).has(key)
  if (!isInBounds(start, grid) || isBlocked(cellKey(start))) return null
  if (targets.has(cellKey(start))) return 0

  const { cols, rows } = grid
  const size = cols * rows
  // Index of an in-bounds "x,y" key, or -1 for anything else.
  const indexOfKey = (key: string): number => {
    const comma = key.indexOf(',')
    const x = Number(key.slice(0, comma))
    const y = Number(key.slice(comma + 1))
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < cols && y < rows ? y * cols + x : -1
  }

  const blocked = new Uint8Array(size)
  for (const key of occupied) if (!tunnelCellSet.has(key)) markIndex(blocked, indexOfKey(key))
  for (const key of tunnelOccupied) if (tunnelCellSet.has(key)) markIndex(blocked, indexOfKey(key))
  const isTarget = new Uint8Array(size)
  for (const key of targets) markIndex(isTarget, indexOfKey(key))
  // Portal exit for an entrance index, or -1 (also -1 for an exit off the grid, which can't be entered).
  const portalExit = new Int32Array(size).fill(-1)
  for (const [key, exit] of portals) {
    const index = indexOfKey(key)
    if (index >= 0) portalExit[index] = isInBounds(exit, grid) ? exit.y * cols + exit.x : -2
  }

  const startIndex = start.y * cols + start.x
  const visited = new Uint8Array(size)
  visited[startIndex] = 1
  const queue = new Int32Array(size)
  const dist = new Int32Array(size)
  queue[0] = startIndex
  let length = 1

  let head = 0
  while (head < length && length < maxCount) {
    const index = queue[head]
    head++
    const x = index % cols
    const y = (index - x) / cols
    for (let d = 0; d < 4; d++) {
      let nx = d === 2 ? x - 1 : d === 3 ? x + 1 : x
      let ny = d === 0 ? y - 1 : d === 1 ? y + 1 : y
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
        if (!wrapEdges) continue
        nx = (nx + cols) % cols
        ny = (ny + rows) % rows
      }
      let next = ny * cols + nx
      const exit = portalExit[next]
      if (exit === -2) continue
      if (exit >= 0) next = exit
      if (visited[next] || blocked[next]) continue
      if (isTarget[next]) return dist[index] + 1
      visited[next] = 1
      dist[next] = dist[index] + 1
      queue[length++] = next
    }
  }

  return null
}

function markIndex(array: Uint8Array, index: number): void {
  if (index >= 0) array[index] = 1
}
