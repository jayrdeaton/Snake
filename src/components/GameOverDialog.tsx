import { useAutoPaperTheme } from '@rific/auto-paper'
import { Button } from '@rific/feedback-press'
import { getFixedZoneRotation, getOpposingZoneRotation, useOrientationState } from '@tastic/core'
import { overlayActionStyles, OverlayBackdrop, OverlayCard, useOverlayCardColors } from '@tastic/hud'
import { StyleSheet, View } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import type { SeatToastSpot } from '@/components/SeatToasters'
import { SnakeId } from '@/types'

// A two-rival round's result from one seat's own perspective: the single Vs CPU card's (seat 1,
// the only human) or one 2 Player seat's card's (see GameOverSeatResult).
export type GameOverOutcome = 'win' | 'loss' | 'draw'

// Everything one 2 Player seat's own card shows, all from that seat's point of view: its result,
// its score against the other seat's, and its own bucket's best (see game.tsx's seatStats).
export interface GameOverSeatResult {
  outcome: GameOverOutcome
  score: number
  opponentScore: number
  highScore: number
  isNewHighScore: boolean
  // The seat's snake color: tints its zone and its Play Again button.
  color: string
}

export interface GameOverDialogProps {
  score: number
  highScore: number
  isNewHighScore: boolean
  onRetry: () => void
  onHome: () => void
  // null/undefined renders the Solo framing (score + optional New High Score badge). Present
  // renders a win/loss/draw framing instead, still showing both scores.
  outcome?: GameOverOutcome | null
  opponentScore?: number
  // 2 Player only: present, it replaces the single card with one card per seat, each in that
  // seat's own zone and facing that seat (see the split branch below). score/highScore/
  // isNewHighScore/outcome/opponentScore above then go unused.
  seatResults?: Record<SnakeId, GameOverSeatResult>
  // 2 Player: each seat's half and reading angle, the same spots its unlock toasts use
  // (game.tsx's seatSpots, from seatToastSpots), so a player's card sits where their toasts do,
  // facing the same way. Without it the cards follow the raw hold, as OnboardingOverlay does.
  seatSpots?: Record<SnakeId, SeatToastSpot>
  // Live physical-hold rotation (see @tastic/core's getViewRotation) for the single centered card,
  // which has no per-seat zone to match, so it just rotates its own content in place; defaults to 0
  // for call sites with no live orientation signal handy. The per-seat cards ignore it and rotate
  // like OnboardingOverlay's two zones instead.
  rotation?: number
}

// Styled after LightCycles' RoundOverDialog.tsx. Solo and Vs CPU have one human, so they get its
// single centered card (icon + text + buttons). 2 Player is simultaneous split-screen, both players
// at the device at once, often face to face, so it gets the per-seat split instead: one card per
// seat in that seat's own zone, each telling its own player whether they won, with their own
// score and best, and its own Quit/Play Again (either seat's press acts at once, as the single
// card's does; there is no LightCycles-style Rematch handshake).
export function GameOverDialog({ score, highScore, isNewHighScore, onRetry, onHome, outcome, opponentScore, seatResults, seatSpots, rotation = 0 }: GameOverDialogProps) {
  const { colors } = useAutoPaperTheme()
  // Read unconditionally (hooks can't sit behind the seatResults branch below); only the split
  // branch uses it.
  const { orientationMode, p1OnRight, upsideDown } = useOrientationState()
  const { fg, fgMuted } = useOverlayCardColors()
  // Quit is outlined, the fleet's secondary action (ConfirmDialog's Cancel), so Play Again is the one
  // filled button and the easier reach (see button ordering below, same as LightCycles'
  // RoundOverDialog Quit/Play Again pair). It used to be a fixed gray fill, which stopped matching once
  // the card took the theme's tinted surface. Its label is the card's own text color, not Paper's
  // default (the theme's primary), so neither seat's card shows a color that isn't its own (Jay,
  // 2026-10-20).

  if (seatResults) {
    // OnboardingOverlay's two-zone split and rotations exactly (face-to-face: snake 1 near/bottom,
    // snake 2 far/top; side-by-side: by p1OnRight), so each card lands where that seat's countdown
    // and touch zone were, facing the same way.
    const zoneStyles = { bottom: styles.zoneBottom, left: styles.zoneLeft, right: styles.zoneRight, top: styles.zoneTop }
    const isFaceToFace = orientationMode === 'faceToFace'
    const snake1Zone = seatSpots ? zoneStyles[seatSpots[1].zone] : isFaceToFace ? styles.zoneBottom : p1OnRight ? styles.zoneRight : styles.zoneLeft
    const snake2Zone = seatSpots ? zoneStyles[seatSpots[2].zone] : isFaceToFace ? styles.zoneTop : p1OnRight ? styles.zoneLeft : styles.zoneRight
    const snake1Rotation = seatSpots ? seatSpots[1].rotation : getFixedZoneRotation(orientationMode, p1OnRight, upsideDown)
    const snake2Rotation = seatSpots ? seatSpots[2].rotation : getOpposingZoneRotation(snake1Rotation)
    const onColors: Record<SnakeId, string> = { 1: colors.onPrimary, 2: colors.onSecondary }

    const renderCard = (seat: SnakeId, cardRotation: number) => {
      const result = seatResults[seat]
      const { text, icon, color } = result.outcome === 'win' ? { color: result.color, icon: 'trophy', text: 'YOU WIN!' } : result.outcome === 'draw' ? { color: fgMuted, icon: 'handshake-outline', text: 'DRAW' } : { color: fgMuted, icon: 'skull-outline', text: 'YOU LOSE!' }
      return (
        <OverlayCard style={[styles.zoneCard, cardRotation % 360 !== 0 && { transform: [{ rotate: `${cardRotation}deg` }] }]}>
          <Icon source={icon} size={40} color={color} />
          <Text variant='headlineMedium' style={[styles.title, { color }]}>
            {text}
          </Text>
          <View style={styles.scoreRow}>
            <View style={styles.scoreColumn}>
              <Text variant='labelSmall' style={{ color: fgMuted }}>
                YOU
              </Text>
              <Text variant='headlineSmall' style={{ color: fg }}>
                {result.score}
              </Text>
            </View>
            <View style={styles.scoreColumn}>
              <Text variant='labelSmall' style={{ color: fgMuted }}>
                OPPONENT
              </Text>
              <Text variant='headlineSmall' style={{ color: fg }}>
                {result.opponentScore}
              </Text>
            </View>
          </View>
          {result.isNewHighScore ? (
            <View style={styles.zoneHighScoreBadge}>
              <Icon source='trophy-award' size={16} color={result.color} />
              <Text variant='labelSmall' style={{ color: result.color }}>
                New High Score!
              </Text>
            </View>
          ) : (
            <Text variant='bodySmall' style={{ color: fgMuted }}>
              BEST {result.highScore}
            </Text>
          )}
          {/* hud's action row, as in ConfirmDialog: Quit (outlined) on the left and Play Again (filled in
          the seat's color) on the right, side by side, wrapping to a stack only on a card too narrow
          for both. Side by side keeps the card short, leaving room in the half for that seat's unlock
          toasts (Jay, 2026-10-20). */}
          <View style={overlayActionStyles.actions}>
            <Button mode='outlined' onPress={onHome} style={overlayActionStyles.actionButton} textColor={fg}>
              Quit
            </Button>
            <Button mode='contained' onPress={onRetry} style={overlayActionStyles.actionButton} buttonColor={result.color} textColor={onColors[seat]}>
              Play Again
            </Button>
          </View>
        </OverlayCard>
      )
    }

    return (
      <OverlayBackdrop>
        <View style={[styles.zone, snake1Zone, { borderColor: seatResults[1].color, backgroundColor: `${seatResults[1].color}22` }]} testID='seat-result-1'>
          {renderCard(1, snake1Rotation)}
        </View>
        <View style={[styles.zone, snake2Zone, { borderColor: seatResults[2].color, backgroundColor: `${seatResults[2].color}22` }]} testID='seat-result-2'>
          {renderCard(2, snake2Rotation)}
        </View>
      </OverlayBackdrop>
    )
  }

  const solo = outcome === null || outcome === undefined
  const { text, icon, color } = solo ? { color: fgMuted, icon: 'skull-outline', text: 'GAME OVER' } : outcome === 'win' ? { color: colors.primary, icon: 'trophy', text: 'YOU WIN!' } : outcome === 'draw' ? { color: fgMuted, icon: 'handshake-outline', text: 'DRAW' } : { color: fgMuted, icon: 'skull-outline', text: 'YOU LOSE!' }

  return (
    <OverlayBackdrop style={styles.backdrop}>
      <OverlayCard style={[styles.card, rotation % 360 !== 0 && { transform: [{ rotate: `${rotation}deg` }] }]}>
        <Icon source={icon} size={64} color={color} />
        <Text variant='headlineLarge' style={[styles.title, { color }]}>
          {text}
        </Text>

        {solo ? (
          <Text variant='displaySmall' style={[styles.soloScore, { color: fg }]}>
            {score}
          </Text>
        ) : (
          <View style={styles.scoreRow}>
            <View style={styles.scoreColumn}>
              <Text variant='labelSmall' style={{ color: fgMuted }}>
                YOU
              </Text>
              <Text variant='headlineMedium' style={{ color: fg }}>
                {score}
              </Text>
            </View>
            <View style={styles.scoreColumn}>
              <Text variant='labelSmall' style={{ color: fgMuted }}>
                OPPONENT
              </Text>
              <Text variant='headlineMedium' style={{ color: fg }}>
                {opponentScore ?? 0}
              </Text>
            </View>
          </View>
        )}

        {isNewHighScore ? (
          <View style={styles.highScoreBadge}>
            <Icon source='trophy-award' size={16} color={colors.secondary} />
            <Text variant='labelSmall' style={{ color: colors.secondary }}>
              New High Score!
            </Text>
          </View>
        ) : (
          <Text variant='bodySmall' style={{ color: fgMuted }}>
            BEST {highScore}
          </Text>
        )}

        {/* hud's action row, as in ConfirmDialog: Quit (outlined) on the left, Play Again (filled) on the
        right, side by side, as on the 2 Player seat cards above (Jay, 2026-10-20). */}
        <View style={overlayActionStyles.actions}>
          <Button mode='outlined' onPress={onHome} style={overlayActionStyles.actionButton} textColor={fg}>
            Quit
          </Button>
          <Button mode='contained' onPress={onRetry} style={overlayActionStyles.actionButton} buttonColor={colors.primary} textColor={colors.onPrimary}>
            Play Again
          </Button>
        </View>
      </OverlayCard>
    </OverlayBackdrop>
  )
}

const styles = StyleSheet.create({
  // The single card, as ConfirmDialog's: room from the screen's edges, and the card's full width
  // allowance (OverlayCard's maxWidth, 360) so its action row has room to sit side by side.
  backdrop: { paddingHorizontal: 24 },
  card: { width: '100%' },
  highScoreBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: -8
  },
  scoreColumn: {
    alignItems: 'center',
    gap: 2
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 32
  },
  // displaySmall/headlineLarge's own line-height leaves slack under the glyphs that the card's flex
  // `gap` stacks on top of - clawed back the same way RoundOverDialog's own overlayTitle does.
  soloScore: { fontWeight: 'bold', marginTop: -8 },
  title: { fontWeight: 'bold', marginBottom: -8 },
  // The per-seat split below matches RoundOverDialog's zone styles. A seat's zone is half the
  // screen, and overflow: 'hidden' clips an extreme case at the zone's edge instead of letting the
  // two cards overlap at the seam.
  // The padding keeps a full-width seat card off the half's dashed edge.
  zone: {
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 3,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 16,
    position: 'absolute'
  },
  zoneBottom: { bottom: 0, left: 0, right: 0, top: '50%' },
  // A seat's card has the single card's buttons (`button`, Paper's full 40pt height) so each seat
  // gets the same size target. They used to be 130 wide with the label margin cut to 4 (about 28pt
  // tall), too small to hit reliably (Jay, 2026-10-17). The rest is trimmed from the single card
  // (smaller icon, title and gaps) because this card also carries both scores and the best: worst
  // case it's under 312pt tall (its size when it also carried a one-line unlock badge, since moved
  // to toasts), under half of an iPhone SE's 667pt screen. The single card's own sizes would be about 404pt, more than half of a 375x812 phone.
  // The full width allowance (OverlayCard's maxWidth, 360), as ConfirmDialog's card takes, so the
  // action row has room to sit side by side: sized to its content the card would be as narrow as
  // one button and the row would wrap.
  zoneCard: {
    gap: 8,
    padding: 18,
    width: '100%'
  },
  zoneHighScoreBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4
  },
  zoneLeft: { bottom: 0, left: 0, right: '50%', top: 0 },
  zoneRight: { bottom: 0, left: '50%', right: 0, top: 0 },
  zoneTop: { bottom: '50%', left: 0, right: 0, top: 0 }
})
