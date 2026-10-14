import { SNAKE_COLORS } from '@/utils/snakeEngine'

// Seat 2's color, moved off seat 1's when the two resolve to the same color. Each seat's color comes
// from its own source (a profile's saved color, a guest's or the CPU's remembered one), and picking a
// profile has no swap step the way a manual recolor does, so a profile saved as the other seat's
// color would otherwise give both snakes the same color. Seat 2 takes seat 1's default color, or seat
// 2's default when seat 1 is already on its own default. Same rule as LightCycles' lobby.
export function avoidSeatColorClash(p1Color: string, p2Color: string): string {
  if (p2Color.toLowerCase() !== p1Color.toLowerCase()) return p2Color
  return p2Color.toLowerCase() === SNAKE_COLORS[1].toLowerCase() ? SNAKE_COLORS[2] : SNAKE_COLORS[1]
}
