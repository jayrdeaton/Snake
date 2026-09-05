import { GridCell, SnakeArenaVariant } from '@/types'
import { buildArenaObstacles, buildArenaPortals, buildArenaTunnels, PILLAR_SPAWN_CLEARANCE_CELLS, PORTAL_MIN_PAIR_DISTANCE_CELLS, TUNNEL_LENGTH_CELLS } from '@/utils/arenas'
import { faceToFaceSpawnPoint, soloSpawnPoint } from '@/utils/grid'

// Comfortably above every arena's own minimum threshold (see arenas.ts's own header comment on
// where these numbers come from) — hand-verified below to produce a specific, known layout for
// each variant, both for 2 snakes and for solo (which passes its one spawn point as both heads —
// see arenas.ts's own spawnHeadsFor comment for why that's correct, not a special case).
const LARGE_GRID = { cols: 40, rows: 30 }
// Below every variant's own minimum on both axes — every generator should gracefully degrade to
// an empty/no-op result rather than producing a cramped or invalid layout.
const TINY_GRID = { cols: 6, rows: 8 }

const NON_OBSTACLE_VARIANTS: SnakeArenaVariant[] = ['open', 'portals', 'underpass']
const NON_PORTAL_VARIANTS: SnakeArenaVariant[] = ['open', 'pillars', 'gauntlet', 'underpass']
const NON_TUNNEL_VARIANTS: SnakeArenaVariant[] = ['open', 'pillars', 'gauntlet', 'portals']

function chebyshevDistance(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

function hasCell(cells: GridCell[], cell: GridCell): boolean {
  return cells.some((c) => c.x === cell.x && c.y === cell.y)
}

// Counts maximal runs of x-values in [0, cols) that are NOT present in `cells` for the given row —
// i.e. the "gap" openings through a gauntlet wall. Two distinct runs is exactly what the two-gaps-
// per-wall design (see arenas.ts's own GAUNTLET_GAP_WIDTH_FRACTION comment) should produce, checked
// structurally here rather than by hand-deriving the exact gap boundaries.
function countGapRuns(cells: GridCell[], row: number, cols: number): number {
  const occupied = new Set(cells.filter((c) => c.y === row).map((c) => c.x))
  let runs = 0
  let inGap = false
  for (let x = 0; x < cols; x++) {
    if (occupied.has(x)) {
      inGap = false
    } else if (!inGap) {
      inGap = true
      runs++
    }
  }
  return runs
}

describe('buildArenaObstacles', () => {
  it.each(NON_OBSTACLE_VARIANTS)('produces no obstacles for %s regardless of grid or snake count', (variant) => {
    expect(buildArenaObstacles(variant, LARGE_GRID, 2)).toEqual([])
    expect(buildArenaObstacles(variant, LARGE_GRID, 1)).toEqual([])
  })

  describe('pillars', () => {
    it('degrades to empty on a grid below its own minimum size', () => {
      expect(buildArenaObstacles('pillars', TINY_GRID, 2)).toEqual([])
    })

    it('places all 5 pips (center + 2 mirrored corner pairs) when every one clears spawn distance', () => {
      const obstacles = buildArenaObstacles('pillars', LARGE_GRID, 2)
      // 5 pips x 9 cells (a radius-1 3x3 block each) — see arenas.ts's own blockCells/buildPillars.
      expect(obstacles).toHaveLength(45)
      const head1 = faceToFaceSpawnPoint(1, LARGE_GRID).head
      const head2 = faceToFaceSpawnPoint(2, LARGE_GRID).head
      for (const cell of obstacles) {
        expect(chebyshevDistance(cell, head1)).toBeGreaterThanOrEqual(PILLAR_SPAWN_CLEARANCE_CELLS)
        expect(chebyshevDistance(cell, head2)).toBeGreaterThanOrEqual(PILLAR_SPAWN_CLEARANCE_CELLS)
      }
    })

    it('solo: drops exactly the center pip (which would otherwise sit on the one spawn point), keeps both corner pairs', () => {
      const obstacles = buildArenaObstacles('pillars', LARGE_GRID, 1)
      // 4 surviving pips x 9 cells — the center pip's own group fails isGroupClear against the
      // solo spawn (distance 0), so it alone is dropped; the corner pairs are far enough away.
      expect(obstacles).toHaveLength(36)
      const head = soloSpawnPoint(LARGE_GRID).head
      expect(hasCell(obstacles, head)).toBe(false)
      for (const cell of obstacles) {
        expect(chebyshevDistance(cell, head)).toBeGreaterThanOrEqual(PILLAR_SPAWN_CLEARANCE_CELLS)
      }
    })
  })

  describe('gauntlet', () => {
    it('degrades to empty on a grid below its own minimum size', () => {
      expect(buildArenaObstacles('gauntlet', TINY_GRID, 2)).toEqual([])
    })

    it('builds at least one wall, each with two distinct gap openings, clear of both spawn cells', () => {
      const obstacles = buildArenaObstacles('gauntlet', LARGE_GRID, 2)
      expect(obstacles.length).toBeGreaterThan(0)
      const head1 = faceToFaceSpawnPoint(1, LARGE_GRID).head
      const head2 = faceToFaceSpawnPoint(2, LARGE_GRID).head
      expect(hasCell(obstacles, head1)).toBe(false)
      expect(hasCell(obstacles, head2)).toBe(false)
      const rows = [...new Set(obstacles.map((c) => c.y))]
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) expect(countGapRuns(obstacles, row, LARGE_GRID.cols)).toBeGreaterThanOrEqual(2)
    })

    it('solo: drops a wall entirely when its mirrored position would land within clearance of the one spawn', () => {
      // On LARGE_GRID both symmetric wall positions land within GAUNTLET_SPAWN_CLEARANCE_CELLS of
      // the single spawn's own row (axisCenter collapses to exactly the spawn's row when
      // head1Along === head2Along — see arenas.ts's own axisSum comment) — a real, meaningful
      // fairness/safety check, not just an empty-input edge case.
      expect(buildArenaObstacles('gauntlet', LARGE_GRID, 1)).toEqual([])
    })

    it('solo: the outer wall pair still survives on a large enough grid, with the center wall correctly dropped', () => {
      const bigGrid = { cols: 40, rows: 100 }
      const obstacles = buildArenaObstacles('gauntlet', bigGrid, 1)
      expect(obstacles.length).toBeGreaterThan(0)
      const head = soloSpawnPoint(bigGrid).head
      const rows = [...new Set(obstacles.map((c) => c.y))]
      // Exactly the two outer walls, never the center one (which would sit exactly on the spawn's
      // own row and fail clearance against it).
      expect(rows).toHaveLength(2)
      expect(rows).not.toContain(head.y)
      for (const row of rows) expect(countGapRuns(obstacles, row, bigGrid.cols)).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('buildArenaPortals', () => {
  it.each(NON_PORTAL_VARIANTS)('produces no portals for %s', (variant) => {
    expect(buildArenaPortals(variant, LARGE_GRID, 2)).toEqual([])
  })

  it('degrades to empty on a grid below its own minimum size', () => {
    expect(buildArenaPortals('portals', TINY_GRID, 2)).toEqual([])
  })

  it('places both catty-corner pairs when the grid is large enough and both clear spawn distance', () => {
    const portals = buildArenaPortals('portals', LARGE_GRID, 2)
    expect(portals).toHaveLength(2)
    for (const { a, b } of portals) {
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(PORTAL_MIN_PAIR_DISTANCE_CELLS)
    }
  })

  it('solo: still places both pairs (far corners, nowhere near a board-centered spawn)', () => {
    const portals = buildArenaPortals('portals', LARGE_GRID, 1)
    expect(portals).toHaveLength(2)
  })
})

describe('buildArenaTunnels', () => {
  it.each(NON_TUNNEL_VARIANTS)('produces no tunnels for %s', (variant) => {
    expect(buildArenaTunnels(variant, LARGE_GRID, 2)).toEqual([])
  })

  it('degrades to empty on a grid below its own minimum size', () => {
    expect(buildArenaTunnels('underpass', TINY_GRID, 2)).toEqual([])
  })

  it('builds one straight, contiguous corridor of the expected length, centered on the board', () => {
    const tunnels = buildArenaTunnels('underpass', LARGE_GRID, 2)
    expect(tunnels).toHaveLength(1)
    const { cells } = tunnels[0]
    expect(cells).toHaveLength(TUNNEL_LENGTH_CELLS)
    const xs = new Set(cells.map((c) => c.x))
    expect(xs.size).toBe(1) // a single vertical run — Snake's one split axis, see arenas.ts's own header comment
    for (let i = 1; i < cells.length; i++) expect(cells[i].y).toBe(cells[i - 1].y + 1)
  })

  it('solo: drops the tunnel entirely when it would run straight through the one spawn point', () => {
    expect(buildArenaTunnels('underpass', LARGE_GRID, 1)).toEqual([])
  })
})
