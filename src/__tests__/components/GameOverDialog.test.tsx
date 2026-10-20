import { fireEvent, render, screen } from '@testing-library/react-native'

import { GameOverDialog, type GameOverSeatResult } from '@/components/GameOverDialog'

jest.mock('@rific/auto-paper', () => {
  const { View: MockView } = require('react-native')
  return {
    // @tastic/hud's OverlayCard draws on auto-paper's BlurView and reads the Blur setting with useBlur.
    BlurView: ({ children, style }: { children?: React.ReactNode; style?: unknown }) => <MockView style={style}>{children}</MockView>,
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

// The nearest view laying its children out in a row: hud's action row, for a card's buttons.
const rowOf = (el: { parent: unknown }) => {
  let node = el.parent as { parent: unknown; props?: { style?: unknown } } | null
  while (node && Object.assign({}, ...[node.props?.style].flat(Infinity).filter(Boolean)).flexDirection !== 'row') node = node.parent as typeof node
  return node
}

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

  it('gives each seat its own Quit and Play Again, side by side, acting at once', async () => {
    const onRetry = jest.fn()
    const onHome = jest.fn()
    await render(<GameOverDialog score={0} highScore={0} isNewHighScore={false} onRetry={onRetry} onHome={onHome} seatResults={SEATS} />)

    const retries = screen.getAllByText('Play Again')
    // Each card's two buttons share hud's action row, Quit on the left.
    for (const seat of [0, 1]) {
      const row = rowOf(screen.getAllByText('Quit')[seat])
      expect(row).not.toBeNull()
      expect(rowOf(retries[seat])).toBe(row)
    }
    expect(retries).toHaveLength(2)
    expect(screen.getAllByText('Quit')).toHaveLength(2)
    await fireEvent.press(retries[1])
    expect(onRetry).toHaveBeenCalledTimes(1)
    await fireEvent.press(screen.getAllByText('Quit')[0])
    expect(onHome).toHaveBeenCalledTimes(1)
  })

  it("puts each card in its seat's toast spot, turned the same way", async () => {
    // A phone held sideways: still bottom and top halves (useSeatSplit), both turned the same quarter,
    // where the raw hold (faceToFace in this file's mock) would turn seat 2 across the table.
    const spots = { 1: { rotation: -90, zone: 'bottom' }, 2: { rotation: -90, zone: 'top' } } as const
    await render(<GameOverDialog score={0} highScore={0} isNewHighScore={false} onRetry={jest.fn()} onHome={jest.fn()} seatResults={SEATS} seatSpots={spots} />)
    const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
    const zones = [screen.getByTestId('seat-result-1'), screen.getByTestId('seat-result-2')]
    expect(zones.map((zone) => flat(zone.props.style).top)).toEqual(['50%', 0])
    const cardRotations = zones.map((zone) => flat((zone.children[0] as unknown as { props: { style: unknown } }).props.style).transform?.[0]?.rotate)
    expect(cardRotations).toEqual(['-90deg', '-90deg'])
  })

  it('shows DRAW on both cards for a draw', async () => {
    const draw: Record<1 | 2, GameOverSeatResult> = { 1: { ...SEATS[1], outcome: 'draw' }, 2: { ...SEATS[2], outcome: 'draw' } }
    await render(<GameOverDialog score={0} highScore={0} isNewHighScore={false} onRetry={jest.fn()} onHome={jest.fn()} seatResults={draw} />)
    expect(screen.getAllByText('DRAW')).toHaveLength(2)
  })

  it('keeps the single card without seatResults (Solo, Vs CPU)', async () => {
    await render(<GameOverDialog score={8} highScore={12} isNewHighScore={false} onRetry={jest.fn()} onHome={jest.fn()} outcome='loss' opponentScore={10} />)
    expect(screen.getByText('YOU LOSE!')).toBeTruthy()
    expect(screen.getAllByText('Play Again')).toHaveLength(1)
    // Side by side on hud's action row, Quit on the left, as on the 2 Player cards.
    const row = rowOf(screen.getByText('Quit'))
    expect(row).not.toBeNull()
    expect(rowOf(screen.getByText('Play Again'))).toBe(row)
    expect(screen.getByText('BEST 12')).toBeTruthy()
  })
})
