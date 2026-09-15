import { useAutoPaperTheme } from '@rific/auto-paper'
import { Button } from '@rific/feedback-press'
import { StyleSheet, View } from 'react-native'
import { Icon, Text } from 'react-native-paper'

// The two-rival modes' result, from the single viewer's own perspective — Vs CPU and 2 Player both
// pass this straight in rather than a richer per-seat winner id, since this dialog (unlike
// LightCycles' RoundOverDialog) is always ONE centered card, never a per-seat split (see this
// file's own header comment on why).
export type GameOverOutcome = 'win' | 'loss' | 'draw'

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
  // Live physical-hold rotation (see @tastic/core's getViewRotation) — this is a single centered
  // card with no per-seat zone to match (see this file's own header comment), so it just rotates its
  // own content in place; defaults to 0 for call sites with no live orientation signal handy.
  rotation?: number
}

// Styled after LightCycles' RoundOverDialog.tsx — specifically its single-human centered-card
// branch (icon + text + buttons in one centered overlay card) — NOT its two-player per-seat split
// branch: Snake's two-rival modes still only ever show one dialog to whoever is looking at the
// device between passes, so there's no second physical viewer to rotate a second card for.
export function GameOverDialog({ score, highScore, isNewHighScore, onRetry, onHome, outcome, opponentScore, rotation = 0 }: GameOverDialogProps) {
  const { colors, dark } = useAutoPaperTheme()
  const cardBg = dark ? '#111111' : '#F2F2F2'
  const cardBorder = dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
  const fg = dark ? '#FFFFFF' : '#000000'
  const fgMuted = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'
  // Home deliberately avoids colors.primary — Retry already renders in that color as the easier-
  // reach action (see button ordering below, same rationale as RoundOverDialog's own Quit/Rematch
  // pair) — a neutral gray reads as clearly secondary regardless of theme.
  const homeBg = dark ? '#2A2A2A' : '#E0E0E0'
  const homeFg = dark ? '#FFFFFF' : '#000000'

  const solo = outcome === null || outcome === undefined
  const { text, icon, color } = solo ? { color: fgMuted, icon: 'skull-outline', text: 'GAME OVER' } : outcome === 'win' ? { color: colors.primary, icon: 'trophy', text: 'YOU WIN!' } : outcome === 'draw' ? { color: fgMuted, icon: 'handshake-outline', text: 'DRAW' } : { color: fgMuted, icon: 'skull-outline', text: 'YOU LOSE!' }

  return (
    <View style={styles.overlay}>
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }, rotation % 360 !== 0 && { transform: [{ rotate: `${rotation}deg` }] }]}>
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

        {/* Home listed before Retry: both buttons render bottom-most in the card, so the LAST one
        authored lands nearest a thumb reaching up from the bottom of the screen — same ordering
        rationale as RoundOverDialog's own Quit-before-Rematch pair. */}
        <Button mode='contained' onPress={onHome} style={styles.button} buttonColor={homeBg} textColor={homeFg}>
          Loadout
        </Button>
        <Button mode='contained' onPress={onRetry} style={styles.button} buttonColor={colors.primary} textColor={colors.onPrimary}>
          Retry
        </Button>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  button: { width: 160 },
  card: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
    maxWidth: 360,
    padding: 32
  },
  highScoreBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginTop: -8
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
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
  // `gap` stacks on top of — clawed back the same way RoundOverDialog's own overlayTitle does.
  soloScore: { fontWeight: 'bold', marginTop: -8 },
  title: { fontWeight: 'bold', marginBottom: -8 }
})
