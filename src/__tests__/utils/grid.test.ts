import { cellKey, cellToPixel, computeGridSize, faceToFaceSpawnPoint, isAdjacent, isInBounds, isOppositeDirection, soloSpawnPoint, stepCell, wrapCell } from '@/utils/grid'

describe('computeGridSize', () => {
  it('floors pixel dimensions down to whole cells', () => {
    expect(computeGridSize(10 * 20 + 3, 7 * 20 + 5, 20)).toEqual({ cols: 10, rows: 7 })
  })

  it('never returns fewer than one cell per axis', () => {
    expect(computeGridSize(2, 2, 20)).toEqual({ cols: 1, rows: 1 })
  })
})

describe('cellToPixel', () => {
  it('scales a cell by the pixel size', () => {
    expect(cellToPixel({ x: 3, y: 4 }, 20)).toEqual({ x: 60, y: 80 })
  })
})

describe('stepCell', () => {
  it.each([
    ['up', { x: 5, y: 4 }],
    ['down', { x: 5, y: 6 }],
    ['left', { x: 4, y: 5 }],
    ['right', { x: 6, y: 5 }]
  ] as const)('steps %s correctly', (direction, expected) => {
    expect(stepCell({ x: 5, y: 5 }, direction)).toEqual(expected)
  })
})

describe('isInBounds', () => {
  const grid = { cols: 10, rows: 8 }

  it('accepts cells within the grid', () => {
    expect(isInBounds({ x: 0, y: 0 }, grid)).toBe(true)
    expect(isInBounds({ x: 9, y: 7 }, grid)).toBe(true)
  })

  it('rejects cells at or past the edges', () => {
    expect(isInBounds({ x: -1, y: 0 }, grid)).toBe(false)
    expect(isInBounds({ x: 0, y: -1 }, grid)).toBe(false)
    expect(isInBounds({ x: 10, y: 0 }, grid)).toBe(false)
    expect(isInBounds({ x: 0, y: 8 }, grid)).toBe(false)
  })
})

describe('wrapCell', () => {
  const grid = { cols: 10, rows: 8 }

  it('leaves an already-in-bounds cell untouched', () => {
    expect(wrapCell({ x: 5, y: 4 }, grid)).toEqual({ x: 5, y: 4 })
  })

  it('wraps a step past the right/bottom edge back to 0 on that axis', () => {
    expect(wrapCell({ x: 10, y: 4 }, grid)).toEqual({ x: 0, y: 4 })
    expect(wrapCell({ x: 5, y: 8 }, grid)).toEqual({ x: 5, y: 0 })
  })

  it('wraps a step past the left/top edge to the far edge on that axis', () => {
    expect(wrapCell({ x: -1, y: 4 }, grid)).toEqual({ x: 9, y: 4 })
    expect(wrapCell({ x: 5, y: -1 }, grid)).toEqual({ x: 5, y: 7 })
  })
})

describe('isOppositeDirection', () => {
  it('identifies opposite pairs', () => {
    expect(isOppositeDirection('up', 'down')).toBe(true)
    expect(isOppositeDirection('left', 'right')).toBe(true)
  })

  it('rejects non-opposite pairs', () => {
    expect(isOppositeDirection('up', 'up')).toBe(false)
    expect(isOppositeDirection('up', 'left')).toBe(false)
  })
})

describe('isAdjacent', () => {
  it('accepts every 4-directional neighbor', () => {
    expect(isAdjacent({ x: 5, y: 5 }, { x: 5, y: 4 })).toBe(true)
    expect(isAdjacent({ x: 5, y: 5 }, { x: 5, y: 6 })).toBe(true)
    expect(isAdjacent({ x: 5, y: 5 }, { x: 4, y: 5 })).toBe(true)
    expect(isAdjacent({ x: 5, y: 5 }, { x: 6, y: 5 })).toBe(true)
  })

  it('rejects the same cell and a diagonal neighbor', () => {
    expect(isAdjacent({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(false)
    expect(isAdjacent({ x: 5, y: 5 }, { x: 6, y: 6 })).toBe(false)
  })
})

describe('cellKey', () => {
  it('produces a stable, distinct key per cell', () => {
    expect(cellKey({ x: 3, y: 4 })).toBe('3,4')
    expect(cellKey({ x: 3, y: 4 })).not.toBe(cellKey({ x: 4, y: 3 }))
  })
})

describe('soloSpawnPoint', () => {
  it('centers the single snake on the board', () => {
    expect(soloSpawnPoint({ cols: 20, rows: 30 })).toEqual({ head: { x: 10, y: 15 }, direction: 'up' })
  })
})

describe('faceToFaceSpawnPoint', () => {
  const grid = { cols: 20, rows: 30 }

  it('places snake 1 (near/bottom) facing up and snake 2 (far/top) facing down, sharing a column', () => {
    const s1 = faceToFaceSpawnPoint(1, grid)
    const s2 = faceToFaceSpawnPoint(2, grid)
    expect(s1.direction).toBe('up')
    expect(s2.direction).toBe('down')
    expect(s1.head.x).toBe(s2.head.x)
    expect(s2.head.y).toBeLessThan(s1.head.y)
  })

  it('keeps both spawns within the grid even on a small board', () => {
    const tiny = { cols: 6, rows: 6 }
    const s1 = faceToFaceSpawnPoint(1, tiny)
    const s2 = faceToFaceSpawnPoint(2, tiny)
    expect(s1.head.y).toBeGreaterThanOrEqual(0)
    expect(s1.head.y).toBeLessThan(tiny.rows)
    expect(s2.head.y).toBeGreaterThanOrEqual(0)
    expect(s2.head.y).toBeLessThan(tiny.rows)
  })
})
