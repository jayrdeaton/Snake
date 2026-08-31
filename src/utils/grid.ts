import { Direction, GridCell, GridSize, SnakeId } from '@/types'

// The 4 directions a snake can ever face, in a fixed order — the set floodFill.ts's BFS walks from
// every cell. Ported verbatim from LightCycles' grid.ts (same name, same value), added here
// alongside the rest of the grid primitives once floodFill.ts's verbatim port needed it.
export const ALL_DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right']

export function computeGridSize(width: number, height: number, cellPx: number): GridSize {
  return {
    cols: Math.max(1, Math.floor(width / cellPx)),
    rows: Math.max(1, Math.floor(height / cellPx))
  }
}

export function cellToPixel(cell: GridCell, cellPx: number) {
  return { x: cell.x * cellPx, y: cell.y * cellPx }
}

export function cellKey(cell: GridCell): string {
  return `${cell.x},${cell.y}`
}

export function isInBounds(cell: GridCell, grid: GridSize): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < grid.cols && cell.y < grid.rows
}

// Re-enters an off-grid cell from the opposite edge — wrap-mode's counterpart to isInBounds above
// (see snakeEngine.ts's tickSnake, which checks isInBounds first and only wraps a cell that's
// already failed it). The double-mod handles a negative coordinate (stepping off the top/left)
// correctly, since JS's % can return a negative result that a single mod wouldn't clean up.
// Ported verbatim from LightCycles' grid.ts.
export function wrapCell(cell: GridCell, grid: GridSize): GridCell {
  return { x: ((cell.x % grid.cols) + grid.cols) % grid.cols, y: ((cell.y % grid.rows) + grid.rows) % grid.rows }
}

export function stepCell(cell: GridCell, direction: Direction): GridCell {
  switch (direction) {
    case 'up':
      return { x: cell.x, y: cell.y - 1 }
    case 'down':
      return { x: cell.x, y: cell.y + 1 }
    case 'left':
      return { x: cell.x - 1, y: cell.y }
    case 'right':
      return { x: cell.x + 1, y: cell.y }
  }
}

export function isOppositeDirection(a: Direction, b: Direction): boolean {
  return (a === 'up' && b === 'down') || (a === 'down' && b === 'up') || (a === 'left' && b === 'right') || (a === 'right' && b === 'left')
}

// True when `b` is exactly one step from `a` — the only distance stepCell itself can ever produce.
// Ported verbatim from LightCycles' grid.ts (not currently consumed by the engine itself, but kept
// alongside the rest of the ported grid primitives for the rendering phase that will want it).
export function isAdjacent(a: GridCell, b: GridCell): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1
}

// Starting head + heading for the two-snake face-to-face layout — snake 1 is the near/bottom seat
// (the human's own device orientation in every 2-snake mode, matching LightCycles' player-1-is-
// device-owner convention), snake 2 is the far/top seat. Both start at the vertical center of
// their own half of the board and face the shared middle, so the two begin as close together as
// possible while still leaving a full quarter-board of room behind each of them to maneuver into.
// Direct port of the math in LightCycles' startingStateFor's faceToFace branch, fixed to that one
// orientation — Snake's board, unlike LightCycles', is never rotated into a side-by-side layout.
export function faceToFaceSpawnPoint(snakeId: SnakeId, grid: GridSize): { head: GridCell; direction: Direction } {
  const firstHalfLength = Math.floor(grid.rows / 2)
  // Center of the [0, firstHalfLength) zone (snake 2's, far/top) and center of the
  // [firstHalfLength, rows) zone (snake 1's, near/bottom).
  const firstZoneCenter = Math.floor(firstHalfLength / 2)
  const secondZoneCenter = firstHalfLength + Math.floor((grid.rows - firstHalfLength) / 2)
  const x = Math.floor(grid.cols / 2)
  return snakeId === 2 ? { head: { x, y: firstZoneCenter }, direction: 'down' } : { head: { x, y: secondZoneCenter }, direction: 'up' }
}

// Starting head + heading for the solo (1-snake) case — dead center of the board. Direction is an
// arbitrary but fixed choice (there's no opponent to face), kept on the same up/down axis the
// two-snake case already spawns on for consistency.
export function soloSpawnPoint(grid: GridSize): { head: GridCell; direction: Direction } {
  return { head: { x: Math.floor(grid.cols / 2), y: Math.floor(grid.rows / 2) }, direction: 'up' }
}
