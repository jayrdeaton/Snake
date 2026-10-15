import { useAutoPaperTheme } from '@rific/auto-paper'
import { Button } from '@rific/feedback-press'
import { getFixedZoneRotation, getOpposingZoneRotation, useOrientationState } from '@tastic/core'
import { AchievementUnlockList, type AchievementUnlockOwner, OverlayBackdrop, OverlayCard, useOverlayCardColors } from '@tastic/hud'
import { StyleSheet, View } from 'react-native'
import { Icon, Text } from 'react-native-paper'

import { ACHIEVEMENT_TIER_COLORS } from '@/constants/achievements'
import { AchievementDefinition, SnakeId } from '@/types'

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
  // The seat's snake color: tints its zone and its Retry button.
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
  // 2 Player only: seat -> whatever that seat's own profile newly unlocked this round (see
  // game.tsx's own achievementUnlocks state), each seat's own card summing up its own in one line.
  // Solo/Vs CPU never pass this: both still surface unlocks via the existing screen-fixed
  // showAchievementToast instead (only one human perspective to address in either).
  achievementUnlocks?: Partial<Record<SnakeId, AchievementDefinition[]>>
  // Whose avatar marks each seat's unlock rows on the single card: the seat's selected profile, else
  // its snake color. The per-seat cards' one-line summary doesn't use it.
  achievementOwners?: Record<SnakeId, AchievementUnlockOwner>
  // 2 Player only: present, it replaces the single card with one card per seat, each in that
  // seat's own zone and facing that seat (see the split branch below). score/highScore/
  // isNewHighScore/outcome/opponentScore above then go unused.
  seatResults?: Record<SnakeId, GameOverSeatResult>
  // Live physical-hold rotation (see @tastic/core's getViewRotation) for the single centered card,
  // which has no per-seat zone to match, so it just rotates its own content in place; defaults to 0
  // for call sites with no live orientation signal handy. The per-seat cards ignore it and rotate
  // like OnboardingOverlay's two zones instead.
  rotation?: number
}

const SEATS: readonly SnakeId[] = [1, 2]

// Styled after LightCycles' RoundOverDialog.tsx. Solo and Vs CPU have one human, so they get its
// single centered card (icon + text + buttons). 2 Player is simultaneous split-screen, both players
// at the device at once, often face to face, so it gets the per-seat split instead: one compact card
// per seat in that seat's own zone, each telling its own player whether they won, with their own
// score, best and unlocks, and its own Quit/Retry (either seat's press acts at once, as the single
// card's does; there is no LightCycles-style Rematch handshake).
export function GameOverDialog({ score, highScore, isNewHighScore, onRetry, onHome, outcome, opponentScore, achievementUnlocks, achievementOwners, seatResults, rotation = 0 }: GameOverDialogProps) {
  const { colors } = useAutoPaperTheme()
  // Read unconditionally (hooks can't sit behind the seatResults branch below); only the split
  // branch uses it.
  const { orientationMode, p1OnRight, upsideDown } = useOrientationState()
  const { fg, fgMuted } = useOverlayCardColors()
  // Quit is outlined, the fleet's secondary action (ConfirmDialog's Cancel), so Retry is the one
  // filled button and the easier reach (see button ordering below, same as LightCycles'
  // RoundOverDialog Quit/Rematch pair). It used to be a fixed gray fill, which stopped matching once
  // the card took the theme's tinted surface.

  if (seatResults) {
    // OnboardingOverlay's two-zone split and rotations exactly (face-to-face: snake 1 near/bottom,
    // snake 2 far/top; side-by-side: by p1OnRight), so each card lands where that seat's countdown
    // and touch zone were, facing the same way.
    const isFaceToFace = orientationMode === 'faceToFace'
    const snake1Zone = isFaceToFace ? styles.zoneBottom : p1OnRight ? styles.zoneRight : styles.zoneLeft
    const snake2Zone = isFaceToFace ? styles.zoneTop : p1OnRight ? styles.zoneLeft : styles.zoneRight
    const snake1Rotation = getFixedZoneRotation(orientationMode, p1OnRight, upsideDown)
    const snake2Rotation = getOpposingZoneRotation(snake1Rotation)
    const onColors: Record<SnakeId, string> = { 1: colors.onPrimary, 2: colors.onSecondary }

    const renderCard = (seat: SnakeId, cardRotation: number) => {
      const result = seatResults[seat]
      const { text, icon, color } = result.outcome === 'win' ? { color: result.color, icon: 'trophy', text: 'YOU WIN!' } : result.outcome === 'draw' ? { color: fgMuted, icon: 'handshake-outline', text: 'DRAW' } : { color: fgMuted, icon: 'skull-outline', text: 'YOU LOSE!' }
      const unlocked = achievementUnlocks?.[seat]
      return (
        <OverlayCard style={[styles.zoneCard, cardRotation % 360 !== 0 && { transform: [{ rotate: `${cardRotation}deg` }] }]}>
          <Icon source={icon} size={28} color={color} />
          <Text variant='headlineSmall' style={[styles.title, { color }]}>
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
          {/* One line, like RoundOverDialog's own badge, rather than a row per unlock: device-wide
          unlocks land on both cards, so a first round can list several, and a taller card than half
          a short phone gets clipped by its zone, buttons included. */}
          {unlocked && unlocked.length > 0 && (
            <View style={styles.achievementBadge}>
              <Icon source='trophy-award' size={16} color={result.color} />
              <Text variant='labelSmall' style={{ color: result.color }}>
                {unlocked.length === 1 ? `${unlocked[0].title} unlocked!` : `${unlocked.length} achievements unlocked!`}
              </Text>
            </View>
          )}
          {/* Quit before Retry: this card is rotated to face its own seat, which puts the button
          authored LAST nearest that player's hands, same as the single card below. */}
          <Button mode='outlined' onPress={onHome} style={styles.zoneButton} labelStyle={styles.zoneButtonLabel}>
            Quit
          </Button>
          <Button mode='contained' onPress={onRetry} style={styles.zoneButton} labelStyle={styles.zoneButtonLabel} buttonColor={result.color} textColor={onColors[seat]}>
            Retry
          </Button>
        </OverlayCard>
      )
    }

    return (
      <OverlayBackdrop>
        <View style={[styles.zone, snake1Zone, { borderColor: seatResults[1].color, backgroundColor: `${seatResults[1].color}22` }]}>{renderCard(1, snake1Rotation)}</View>
        <View style={[styles.zone, snake2Zone, { borderColor: seatResults[2].color, backgroundColor: `${seatResults[2].color}22` }]}>{renderCard(2, snake2Rotation)}</View>
      </OverlayBackdrop>
    )
  }

  const solo = outcome === null || outcome === undefined
  const { text, icon, color } = solo ? { color: fgMuted, icon: 'skull-outline', text: 'GAME OVER' } : outcome === 'win' ? { color: colors.primary, icon: 'trophy', text: 'YOU WIN!' } : outcome === 'draw' ? { color: fgMuted, icon: 'handshake-outline', text: 'DRAW' } : { color: fgMuted, icon: 'skull-outline', text: 'YOU LOSE!' }

  return (
    <OverlayBackdrop>
      <OverlayCard style={rotation % 360 !== 0 && { transform: [{ rotate: `${rotation}deg` }] }}>
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

        {/* One row per achievement rather than a per-seat "N unlocked!" summary badge: a summary
        badge per seat throws off vertical alignment whenever only one side has one. */}
        {achievementUnlocks && achievementOwners && <AchievementUnlockList unlocks={achievementUnlocks} seats={SEATS} owners={achievementOwners} tierColors={ACHIEVEMENT_TIER_COLORS} fg={fg} style={styles.achievementList} />}

        {/* Home listed before Retry: both buttons render bottom-most in the card, so the LAST one
        authored lands nearest a thumb reaching up from the bottom of the screen - same ordering
        rationale as RoundOverDialog's own Quit-before-Rematch pair. */}
        <Button mode='outlined' onPress={onHome} style={styles.button}>
          Quit
        </Button>
        <Button mode='contained' onPress={onRetry} style={styles.button} buttonColor={colors.primary} textColor={colors.onPrimary}>
          Retry
        </Button>
      </OverlayCard>
    </OverlayBackdrop>
  )
}

const styles = StyleSheet.create({
  // RoundOverDialog's achievementBadge.
  achievementBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: -2
  },
  achievementList: { maxWidth: 260 },
  button: { width: 160 },
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
  // The per-seat split below matches RoundOverDialog's zone/zoneCard/zoneButton styles. A seat's
  // zone is half the screen, so the card is compact, and overflow: 'hidden' clips an extreme case
  // at the zone's edge instead of letting the two cards overlap at the seam.
  zone: {
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: 3,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute'
  },
  zoneBottom: { bottom: 0, left: 0, right: 0, top: '50%' },
  zoneButton: { width: 130 },
  // Claws back react-native-paper's default label margin so a full card fits half a short screen.
  zoneButtonLabel: { marginVertical: 4 },
  zoneCard: {
    borderRadius: 16,
    gap: 6,
    padding: 14
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
