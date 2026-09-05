import { GridCell, GridSize, SnakeArenaVariant, SnakePortal, SnakeTunnel } from '@/types'

import { faceToFaceSpawnPoint, isInBounds, soloSpawnPoint } from './grid'

// Ported from LightCycles' utils/arenas.ts, with its OrientationMode axis-abstraction dropped
// entirely: Snake's grid model has no side-by-side layout (see grid.ts's own comment on
// faceToFaceSpawnPoint) — "along" is always grid.rows (the split axis, y) and "cross" is always
// grid.cols (the shared axis, x), so there's no mode parameter anywhere in this file. Solo mode
// (one snake, no second head to mirror against) passes soloSpawnPoint as both head1 and head2 below
// (see spawnHeadsFor), which produces correct, board-centered layouts with no special-casing:
// isGroupClear's two clearance checks collapse harmlessly to one real check, and buildGauntlet's own
// axisSum/axisCenter mirror-math reduces exactly to mirroring around that single spawn point when
// both heads are equal.
//
// Every tuning constant below is rescaled from LightCycles' own (tuned at its GRID_CELL_PX.medium =
// 8px) by roughly SNAKE_CELL_PX/8 ≈ 2.25x fewer cells per axis for the same physical screen —
// except PILLAR_BLOCK_RADIUS_CELLS (scaling to 0 would erase the "pillars read as bigger" effect the
// constant exists for), PORTAL_MIN_COLS/ROWS (scaling down would let portals spawn on a genuinely
// tiny grid), and GAUNTLET_GAP_WIDTH_MIN/MAX_CELLS (scaling down would make gaps too tight for a
// snake's body — which nearly fills its own cell, same as LightCycles' cycle — to thread reliably),
// which are kept closer to LightCycles' own source values instead. These are first-pass numbers:
// verify visually against a real phone-sized grid and adjust by feel.

// ─── Pillars ────────────────────────────────────────────────────────────────
export const PILLAR_MIN_ALONG_LENGTH = 13
export const PILLAR_MIN_CROSS_LENGTH = 9
export const PILLAR_CORNER_ALONG_OFFSET_FRACTION = 0.2
export const PILLAR_CORNER_CROSS_OFFSET_FRACTION = 0.3
export const PILLAR_BLOCK_RADIUS_CELLS = 1
export const PILLAR_SPAWN_CLEARANCE_CELLS = 2

// ─── Portals ────────────────────────────────────────────────────────────────
export const PORTAL_CORNER_MARGIN_CELLS = 3
export const PORTAL_MIN_COLS = 14
export const PORTAL_MIN_ROWS = 14
export const PORTAL_SPAWN_CLEARANCE_CELLS = 2
export const PORTAL_MIN_PAIR_DISTANCE_CELLS = 4

function buildPortals(grid: GridSize, head1: GridCell, head2: GridCell): SnakePortal[] {
  if (grid.cols < PORTAL_MIN_COLS || grid.rows < PORTAL_MIN_ROWS) return []

  const m = PORTAL_CORNER_MARGIN_CELLS
  const topLeft = { x: m, y: m }
  const topRight = { x: grid.cols - 1 - m, y: m }
  const bottomLeft = { x: m, y: grid.rows - 1 - m }
  const bottomRight = { x: grid.cols - 1 - m, y: grid.rows - 1 - m }

  // Each catty-corner pair is accepted or dropped independently, so a spawn sitting unusually close
  // to one diagonal doesn't cost the other, otherwise-clear one.
  const portals: SnakePortal[] = []
  for (const [a, b] of [
    [topLeft, bottomRight],
    [topRight, bottomLeft]
  ] as const) {
    if (!isGroupClear([a, b], grid, head1, head2, PORTAL_SPAWN_CLEARANCE_CELLS)) continue
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < PORTAL_MIN_PAIR_DISTANCE_CELLS) continue
    portals.push({ a, b })
  }

  return portals
}

// ─── Gauntlet ───────────────────────────────────────────────────────────────
export const GAUNTLET_MIN_ALONG_LENGTH = 16
export const GAUNTLET_MIN_CROSS_LENGTH = 8
export const GAUNTLET_THREE_WALL_MIN_ALONG_LENGTH = 36
export const GAUNTLET_WALL_ALONG_FRACTIONS_TWO = [0.45, 0.55]
export const GAUNTLET_WALL_ALONG_FRACTIONS_THREE = [0.22, 0.5, 0.78]
export const GAUNTLET_SPAWN_CLEARANCE_CELLS = 3
export const GAUNTLET_WALL_SPACING_CELLS = 2
// Two gaps per wall (not one) — a single door would let one snake camp or block it and permanently
// strand the other on their own side.
export const GAUNTLET_GAP_WIDTH_FRACTION = 0.18
export const GAUNTLET_GAP_WIDTH_MIN_CELLS = 3
export const GAUNTLET_GAP_WIDTH_MAX_CELLS = 6
export const GAUNTLET_GAP_OFFSET_FRACTION = 0.25

// ─── Shared helpers ─────────────────────────────────────────────────────────
function chebyshevDistance(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

// A group survives only if EVERY member clears both bounds and spawn distance from both heads —
// never partially, which is what guarantees a pillar/wall can never appear favoring one snake over
// the other. In solo mode head1 === head2 (see spawnHeadsFor), so this collapses to one real check.
function isGroupClear(group: GridCell[], grid: GridSize, head1: GridCell, head2: GridCell, clearanceCells: number): boolean {
  return group.every((cell) => isInBounds(cell, grid) && chebyshevDistance(cell, head1) >= clearanceCells && chebyshevDistance(cell, head2) >= clearanceCells)
}

// A pip's own footprint — a square block of cells centered on (alongC, crossC), radius cells in
// every direction (radius 1 = 3x3). Cells are only added to the final obstacle list once the whole
// block has cleared isGroupClear, so a block that would clip a spawn's clearance zone at one corner
// is dropped in its entirety, never partially.
function blockCells(alongC: number, crossC: number, radius: number): GridCell[] {
  const cells: GridCell[] = []
  for (let along = alongC - radius; along <= alongC + radius; along++) {
    for (let cross = crossC - radius; cross <= crossC + radius; cross++) {
      cells.push({ x: cross, y: along })
    }
  }
  return cells
}

function buildPillars(grid: GridSize, head1: GridCell, head2: GridCell): GridCell[] {
  const alongLength = grid.rows
  const crossLength = grid.cols
  if (alongLength < PILLAR_MIN_ALONG_LENGTH || crossLength < PILLAR_MIN_CROSS_LENGTH) return []

  const alongCenter = Math.floor(alongLength / 2)
  const crossCenter = Math.floor(crossLength / 2)
  const alongOffset = Math.round(alongLength * PILLAR_CORNER_ALONG_OFFSET_FRACTION)
  const crossOffset = Math.round(crossLength * PILLAR_CORNER_CROSS_OFFSET_FRACTION)
  const obstacles: GridCell[] = []

  // The quincunx's middle pip — dropped alone (no mirror needed: it already sits equidistant from
  // both heads by construction).
  const centerBlock = blockCells(alongCenter, crossCenter, PILLAR_BLOCK_RADIUS_CELLS)
  if (isGroupClear(centerBlock, grid, head1, head2, PILLAR_SPAWN_CLEARANCE_CELLS)) obstacles.push(...centerBlock)

  // The four corner pips, as two along-axis mirror pairs — each pair validated atomically so a
  // corner pip near one head can never appear without its mirror near the other.
  const nearCrossPair = [...blockCells(alongCenter - alongOffset, crossCenter - crossOffset, PILLAR_BLOCK_RADIUS_CELLS), ...blockCells(alongCenter + alongOffset, crossCenter - crossOffset, PILLAR_BLOCK_RADIUS_CELLS)]
  if (isGroupClear(nearCrossPair, grid, head1, head2, PILLAR_SPAWN_CLEARANCE_CELLS)) obstacles.push(...nearCrossPair)

  const farCrossPair = [...blockCells(alongCenter - alongOffset, crossCenter + crossOffset, PILLAR_BLOCK_RADIUS_CELLS), ...blockCells(alongCenter + alongOffset, crossCenter + crossOffset, PILLAR_BLOCK_RADIUS_CELLS)]
  if (isGroupClear(farCrossPair, grid, head1, head2, PILLAR_SPAWN_CLEARANCE_CELLS)) obstacles.push(...farCrossPair)

  return obstacles
}

// The two gap windows for one wall — symmetric around the wall's own cross-center, each clamped
// into [0, crossLength - gapWidth] independently, then nudged apart if clamping ever left them
// touching (only possible on a crossLength barely above the minimum) so there are always genuinely
// two separate routes through.
function computeGapStarts(crossLength: number, gapWidth: number): [number, number] {
  const crossCenter = Math.floor(crossLength / 2)
  const offset = Math.round(crossLength * GAUNTLET_GAP_OFFSET_FRACTION)
  const maxStart = Math.max(0, crossLength - gapWidth)
  const clamp = (start: number) => Math.min(Math.max(start, 0), maxStart)
  let first = clamp(crossCenter - offset - Math.floor(gapWidth / 2))
  let second = clamp(crossCenter + offset - Math.floor(gapWidth / 2))
  if (first > second) [first, second] = [second, first]
  if (second < first + gapWidth) second = Math.min(maxStart, first + gapWidth)
  return [first, second]
}

function buildGauntlet(grid: GridSize, head1: GridCell, head2: GridCell): GridCell[] {
  const alongLength = grid.rows
  const crossLength = grid.cols
  if (alongLength < GAUNTLET_MIN_ALONG_LENGTH || crossLength < GAUNTLET_MIN_CROSS_LENGTH) return []

  const head1Along = head1.y
  const head2Along = head2.y

  const wallCount = alongLength >= GAUNTLET_THREE_WALL_MIN_ALONG_LENGTH ? 3 : 2
  const fractions = wallCount === 3 ? GAUNTLET_WALL_ALONG_FRACTIONS_THREE : GAUNTLET_WALL_ALONG_FRACTIONS_TWO
  const gapWidth = Math.min(GAUNTLET_GAP_WIDTH_MAX_CELLS, Math.max(GAUNTLET_GAP_WIDTH_MIN_CELLS, Math.round(crossLength * GAUNTLET_GAP_WIDTH_FRACTION)))
  const [gap1Start, gap2Start] = computeGapStarts(crossLength, gapWidth)

  const obstacles: GridCell[] = []
  const acceptedPositions: number[] = []

  // Fractions are mirrored around 0.5 — grouping the outer pair and validating each group
  // atomically means a wall that fails its own clearance check always takes its mirror partner down
  // with it, rather than leaving a single wall standing deep in one snake's territory.
  const groups: number[][] = []
  for (let i = 0, j = fractions.length - 1; i <= j; i++, j--) {
    groups.push(i === j ? [fractions[i]] : [fractions[i], fractions[j]])
  }

  // The axis both wall groups mirror around is the real midpoint between the two actual spawn
  // heads, not a naive Math.floor(alongLength / 2) — see LightCycles' own arenas.ts for the parity
  // argument this sidesteps. In solo mode head1Along === head2Along, so this is just that point.
  const axisSum = head1Along + head2Along

  for (const group of groups) {
    const axisCenter = Math.floor(axisSum / 2)
    const positions =
      group.length === 1
        ? [axisCenter]
        : (() => {
            const offset = Math.round(alongLength * (group[1] - 0.5))
            const position1 = axisCenter - offset
            return [position1, axisSum - position1]
          })()
    const groupClear = positions.every((position) => Math.abs(position - head1Along) >= GAUNTLET_SPAWN_CLEARANCE_CELLS && Math.abs(position - head2Along) >= GAUNTLET_SPAWN_CLEARANCE_CELLS && acceptedPositions.every((accepted) => Math.abs(position - accepted) >= GAUNTLET_WALL_SPACING_CELLS))
    if (!groupClear) continue

    for (const position of positions) {
      for (let across = 0; across < crossLength; across++) {
        if (across >= gap1Start && across < gap1Start + gapWidth) continue
        if (across >= gap2Start && across < gap2Start + gapWidth) continue
        const cell = { x: across, y: position }
        if (isInBounds(cell, grid)) obstacles.push(cell)
      }
      acceptedPositions.push(position)
    }
  }

  return obstacles
}

// ─── Underpass ──────────────────────────────────────────────────────────────
// See types/index.ts's own SnakeTunnel comment for why this needs no hidden per-snake occupancy
// layer the way LightCycles' identical-in-spirit tunnel does — Snake's body is a vacating deque,
// not a permanent trail, so a corridor here can never get permanently sealed by an earlier crossing.
export const TUNNEL_MIN_ALONG_LENGTH = 22
export const TUNNEL_MIN_CROSS_LENGTH = 7
export const TUNNEL_LENGTH_CELLS = 6
export const TUNNEL_SPAWN_CLEARANCE_CELLS = 2

// A single straight corridor, oriented along the split axis and centered at board-center — a snake
// driving straight from spawn toward the opponent runs directly into the near mouth, no detour
// required. Never mirrored into a second copy: unlike pillars/gauntlet, a tunnel blocks nothing (see
// buildArenaObstacles' own 'underpass' branch, which always returns []), so it's already fair
// simply by sitting equidistant from both spawns.
function buildTunnel(grid: GridSize, head1: GridCell, head2: GridCell): SnakeTunnel[] {
  const alongLength = grid.rows
  const crossLength = grid.cols
  if (alongLength < TUNNEL_MIN_ALONG_LENGTH || crossLength < TUNNEL_MIN_CROSS_LENGTH) return []

  const alongCenter = Math.floor(alongLength / 2)
  const crossCenter = Math.floor(crossLength / 2)
  const startOffset = Math.floor((TUNNEL_LENGTH_CELLS - 1) / 2)
  const cells: GridCell[] = []
  for (let i = 0; i < TUNNEL_LENGTH_CELLS; i++) {
    cells.push({ x: crossCenter, y: alongCenter - startOffset + i })
  }

  if (!isGroupClear(cells, grid, head1, head2, TUNNEL_SPAWN_CLEARANCE_CELLS)) return []
  return [{ cells }]
}

// ─── Entry points ───────────────────────────────────────────────────────────
// Solo (1 snake) passes its one spawn point as both heads — see this file's own header comment for
// why that's correct, not a special case, for every generator above.
function spawnHeadsFor(grid: GridSize, snakeCount: 1 | 2): [GridCell, GridCell] {
  if (snakeCount === 1) {
    const head = soloSpawnPoint(grid).head
    return [head, head]
  }
  return [faceToFaceSpawnPoint(1, grid).head, faceToFaceSpawnPoint(2, grid).head]
}

// Deterministic static obstacle layout for the selected arena variant — same inputs always produce
// the same cells, so a round's arena never varies for the same settings.
export function buildArenaObstacles(variant: SnakeArenaVariant, grid: GridSize, snakeCount: 1 | 2): GridCell[] {
  // Neither 'portals' nor 'underpass' blocks movement the way every other variant's cells do —
  // their geometry lives on SnakeGameState.portals/.tunnels instead (see buildArenaPortals/
  // buildArenaTunnels below), so both are obstacle-free exactly like 'open'.
  if (variant === 'open' || variant === 'portals' || variant === 'underpass') return []
  const [head1, head2] = spawnHeadsFor(grid, snakeCount)
  if (variant === 'pillars') return buildPillars(grid, head1, head2)
  return buildGauntlet(grid, head1, head2)
}

// Sibling to buildArenaObstacles above rather than folded into its own return type — obstacles and
// portals are different shapes with different collision semantics (see snakeEngine.ts's tickSnake).
export function buildArenaPortals(variant: SnakeArenaVariant, grid: GridSize, snakeCount: 1 | 2): SnakePortal[] {
  if (variant !== 'portals') return []
  const [head1, head2] = spawnHeadsFor(grid, snakeCount)
  return buildPortals(grid, head1, head2)
}

// Sibling to buildArenaObstacles/buildArenaPortals above, same reasoning.
export function buildArenaTunnels(variant: SnakeArenaVariant, grid: GridSize, snakeCount: 1 | 2): SnakeTunnel[] {
  if (variant !== 'underpass') return []
  const [head1, head2] = spawnHeadsFor(grid, snakeCount)
  return buildTunnel(grid, head1, head2)
}
