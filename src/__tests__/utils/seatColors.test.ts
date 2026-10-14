import { avoidSeatColorClash } from '@/utils/seatColors'
import { SNAKE_COLORS } from '@/utils/snakeEngine'

describe('avoidSeatColorClash', () => {
  it("keeps seat 2's color when it differs from seat 1's", () => {
    expect(avoidSeatColorClash('#2196f3', '#e91e63')).toBe('#e91e63')
  })

  it("moves seat 2 to seat 1's default when both land on the same color", () => {
    expect(avoidSeatColorClash('#2196f3', '#2196f3')).toBe(SNAKE_COLORS[1])
  })

  it("moves seat 2 to seat 2's default when both are on seat 1's default", () => {
    expect(avoidSeatColorClash(SNAKE_COLORS[1], SNAKE_COLORS[1])).toBe(SNAKE_COLORS[2])
  })

  it("moves seat 2 to seat 1's default when both are on seat 2's default", () => {
    expect(avoidSeatColorClash(SNAKE_COLORS[2], SNAKE_COLORS[2])).toBe(SNAKE_COLORS[1])
  })

  it('treats colors that differ only in case as the same color', () => {
    expect(avoidSeatColorClash('#2196F3', '#2196f3')).toBe(SNAKE_COLORS[1])
  })

  it("never leaves seat 2 on seat 1's color", () => {
    for (const color of ['#2196f3', SNAKE_COLORS[1], SNAKE_COLORS[2], SNAKE_COLORS[1].toLowerCase()]) {
      expect(avoidSeatColorClash(color, color).toLowerCase()).not.toBe(color.toLowerCase())
    }
  })
})
