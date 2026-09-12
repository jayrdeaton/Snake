import { SNAKE_CELL_PX, SNAKE_DEATH_FADE_MAX_MS, SNAKE_DEATH_FADE_MIN_MS, SNAKE_DEATH_FADE_MS_PER_CELL, snakeDeathFadeMs } from '@/constants/snake'

describe('SNAKE_CELL_PX', () => {
  it('keeps medium at the original fixed 18px so existing players see no default change', () => {
    expect(SNAKE_CELL_PX.medium).toBe(18)
  })

  it('makes small strictly thinner and large strictly chunkier than medium', () => {
    expect(SNAKE_CELL_PX.small).toBeLessThan(SNAKE_CELL_PX.medium)
    expect(SNAKE_CELL_PX.large).toBeGreaterThan(SNAKE_CELL_PX.medium)
  })
})

describe('snakeDeathFadeMs', () => {
  it('clamps a short body to the minimum', () => {
    expect(snakeDeathFadeMs(1)).toBe(SNAKE_DEATH_FADE_MIN_MS)
  })

  it('scales linearly for a mid-length body', () => {
    const bodyLength = 30
    expect(snakeDeathFadeMs(bodyLength)).toBe(bodyLength * SNAKE_DEATH_FADE_MS_PER_CELL)
  })

  it('clamps a long body to the maximum', () => {
    expect(snakeDeathFadeMs(500)).toBe(SNAKE_DEATH_FADE_MAX_MS)
  })
})
