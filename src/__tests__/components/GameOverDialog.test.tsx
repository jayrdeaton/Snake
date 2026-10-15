import { fireEvent, render, screen } from '@testing-library/react-native'

import { GameOverDialog, type GameOverSeatResult } from '@/components/GameOverDialog'
import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'

jest.mock('@rific/auto-paper', () => {
  const { View: MockView } = require('react-native')
  return {
    // @tastic/hud's OverlayCard draws on auto-paper's BlurView and reads the Blur setting with useBlur.
    BlurView: ({ children }: { children?: React.ReactNode }) => <MockView>{children}</MockView>,
    useAutoPaperTheme: () => ({ dark: false, colors: { primary: '#00AA00', secondary: '#AAAA00', onPrimary: '#FFFFFF', onSecondary: '#000000' } }),
    useBlur: () => false
  }
})

jest.mock('@rific/feedback-press', () => {
  const { Pressable, Text: MockText } = require('react-native')
  return {
    Button: ({ children, onPress }: { children: string; onPress: () => void }) => (
      <Pressable onPress={onPress}>
        <MockText>{children}</MockText>
      </Pressable>
    )
  }
})

jest.mock('@tastic/core', () => ({
  ...jest.requireActual('@tastic/core'),
  useOrientationState: () => ({ orientationMode: 'faceToFace', p1OnRight: false, upsideDown: false })
}))

const SEATS: Record<1 | 2, GameOverSeatResult> = {
  1: { outcome: 'win', score: 14, opponentScore: 6, highScore: 20, isNewHighScore: false, color: '#00AA00' },
  2: { outcome: 'loss', score: 6, opponentScore: 14, highScore: 9, isNewHighScore: true, color: '#AAAA00' }
}

// Regression coverage for F170: 2 Player used to show one card from seat 1's point of view, so the
// player in seat 2 read seat 1's YOU WIN!, seat 1's scores as YOU/OPPONENT, and seat 1's BEST.
describe('GameOverDialog 2 Player cards', () => {
  it('gives each seat its own result, scores and best', async () => {
    await render(<GameOverDialog score={0} highScore={0} isNewHighScore={false} onRetry={jest.fn()} onHome={jest.fn()} seatResults={SEATS} />)

    expect(screen.getByText('YOU WIN!')).toBeTruthy()
    expect(screen.getByText('YOU LOSE!')).toBeTruthy()
    // Seat 1's own best; seat 2 set a new one, so its card shows the badge instead.
    expect(screen.getByText('BEST 20')).toBeTruthy()
    expect(screen.queryByText('BEST 9')).toBeNull()
    expect(screen.getByText('New High Score!')).toBeTruthy()
    // Both cards show both scores, each from its own seat's side.
    expect(screen.getAllByText('14')).toHaveLength(2)
    expect(screen.getAllByText('6')).toHaveLength(2)
  })

  it('gives each seat its own Quit and Retry, acting at once', async () => {
    const onRetry = jest.fn()
    const onHome = jest.fn()
    await render(<GameOverDialog score={0} highScore={0} isNewHighScore={false} onRetry={onRetry} onHome={onHome} seatResults={SEATS} />)

    const retries = screen.getAllByText('Retry')
    expect(retries).toHaveLength(2)
    expect(screen.getAllByText('Quit')).toHaveLength(2)
    await fireEvent.press(retries[1])
    expect(onRetry).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getAllByText('Quit')[0])
    expect(onHome).toHaveBeenCalledTimes(1)
  })

  // Each card is sized to fit half a short phone, so a seat's unlocks are one line, never a row each.
  it("sums up each seat's own unlocks in one line", async () => {
    const owners = { 1: { color: SEATS[1].color }, 2: { color: SEATS[2].color } }
    const unlocks = { 1: [ACHIEVEMENT_CATALOG[0]], 2: [ACHIEVEMENT_CATALOG[0], ACHIEVEMENT_CATALOG[1], ACHIEVEMENT_CATALOG[2]] }
    await render(<GameOverDialog score={0} highScore={0} isNewHighScore={false} onRetry={jest.fn()} onHome={jest.fn()} seatResults={SEATS} achievementUnlocks={unlocks} achievementOwners={owners} />)

    expect(screen.getByText(`${ACHIEVEMENT_CATALOG[0].title} unlocked!`)).toBeTruthy()
    expect(screen.getByText('3 achievements unlocked!')).toBeTruthy()
    expect(screen.queryByText(ACHIEVEMENT_CATALOG[1].title)).toBeNull()
  })

  it('shows DRAW on both cards for a draw', async () => {
    const draw: Record<1 | 2, GameOverSeatResult> = { 1: { ...SEATS[1], outcome: 'draw' }, 2: { ...SEATS[2], outcome: 'draw' } }
    await render(<GameOverDialog score={0} highScore={0} isNewHighScore={false} onRetry={jest.fn()} onHome={jest.fn()} seatResults={draw} />)
    expect(screen.getAllByText('DRAW')).toHaveLength(2)
  })

  it('keeps the single card without seatResults (Solo, Vs CPU)', async () => {
    await render(<GameOverDialog score={8} highScore={12} isNewHighScore={false} onRetry={jest.fn()} onHome={jest.fn()} outcome='loss' opponentScore={10} />)
    expect(screen.getByText('YOU LOSE!')).toBeTruthy()
    expect(screen.getAllByText('Retry')).toHaveLength(1)
    expect(screen.getByText('BEST 12')).toBeTruthy()
  })
})
