import { Direction, GridCell, GridSize, SnakeId } from '@/types'

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
