import { SNAKE_DEATH_FADE_MAX_MS, SNAKE_DEATH_FADE_MIN_MS, SNAKE_DEATH_FADE_MS_PER_CELL, snakeDeathFadeMs } from '@/constants/snake'

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
