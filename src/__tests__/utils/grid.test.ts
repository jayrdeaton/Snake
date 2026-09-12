import { faceToFaceSpawnPoint, soloSpawnPoint } from '@/utils/grid'

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
