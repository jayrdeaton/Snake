import { useAutoPaperTheme } from '@rific/auto-paper'
import { Button, IconButton } from '@rific/feedback-press'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector } from 'react-redux'

import { SettingsDialog } from '@/components/SettingsDialog'
import { SnakeMode } from '@/hooks/useSnakeState'
import { CpuDifficulty, gameActions } from '@/redux/gameSlice'
import type { RootState } from '@/redux/store'

const CPU_DIFFICULTIES: CpuDifficulty[] = ['easy', 'normal', 'hard']

function difficultyLabel(difficulty: CpuDifficulty): string {
  return difficulty[0].toUpperCase() + difficulty.slice(1)
}

interface HighScoreStatProps {
  label: string
  value: number
  color: string
}

function HighScoreStat({ label, value, color }: HighScoreStatProps) {
  return (
    <View style={styles.highScoreStat}>
      <Text variant='titleLarge' style={{ color }}>
        {value}
      </Text>
      <Text variant='labelMedium' style={{ color }}>
        {label}
      </Text>
    </View>
  )
}

export default function HomeScreen() {
  const { colors, dark } = useAutoPaperTheme()
  const insets = useSafeAreaInsets()
  const dispatch = useDispatch()

  // Per-mode high scores, and the persisted Vs CPU difficulty preference — both live in gameSlice
  // (see that file's own comment on why scores are tracked per mode rather than merged).
  const highScore = useSelector((state: RootState) => state.game.highScore)
  const cpuDifficulty = useSelector((state: RootState) => state.game.cpuDifficulty)

  const [settingsOpen, setSettingsOpen] = useState(false)
  // Vs CPU needs one extra choice (difficulty) before it can actually start a round — surfaced as
  // a small inline row rather than a separate screen/route, per the plan's own "a simple 3-button
  // row or a picker component is fine, does not need to be fancy."
  const [pickingCpuDifficulty, setPickingCpuDifficulty] = useState(false)

  const goToGame = useCallback((mode: SnakeMode) => {
    router.push({ pathname: '/game', params: { mode } })
  }, [])

  // Vs CPU/2 Player both have a second seat and a color conflict to resolve, so they go through
  // /loadout first (see that screen — it forwards the chosen colors on to /game as route params).
  // Solo has neither, so it keeps going straight to /game.
  const goToLoadout = useCallback((mode: 'vsCpu' | 'twoPlayer') => {
    router.push({ pathname: '/loadout', params: { mode } })
  }, [])

  const chooseSolo = useCallback(() => {
    setPickingCpuDifficulty(false)
    goToGame('solo')
  }, [goToGame])

  const chooseTwoPlayer = useCallback(() => {
    setPickingCpuDifficulty(false)
    goToLoadout('twoPlayer')
  }, [goToLoadout])

  // Toggles the difficulty row open/closed rather than navigating immediately — Vs CPU is the
  // only mode with a second decision to make first.
  const toggleCpuDifficultyPicker = useCallback(() => {
    setPickingCpuDifficulty((open) => !open)
  }, [])

  const chooseCpuDifficulty = useCallback(
    (difficulty: CpuDifficulty) => {
      dispatch(gameActions.setCpuDifficulty(difficulty))
      setPickingCpuDifficulty(false)
      goToLoadout('vsCpu')
    },
    [dispatch, goToLoadout]
  )

  // High-contrast retro look: literal black/white, flipped by appearance — same treatment
  // LightCycles' own index.tsx gives its title screen.
  const bg = dark ? '#000000' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : '#000000'

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <IconButton icon='cog' iconColor={fg} size={24} style={[styles.settingsButton, { top: 8 + insets.top, right: 8 + insets.right }]} onPress={() => setSettingsOpen(true)} accessibilityLabel='Settings' />

      <View style={styles.content}>
        <Text variant='displayLarge' style={[styles.title, { color: fg }]}>
          Snake
        </Text>

        <View style={styles.highScores}>
          <HighScoreStat label='Solo' value={highScore.solo} color={fg} />
          <HighScoreStat label='Vs CPU' value={highScore.vsCpu} color={fg} />
          <HighScoreStat label='2 Player' value={highScore.twoPlayer} color={fg} />
        </View>

        <View style={styles.actions}>
          <Button testID='mode-solo' mode='contained' icon='play' onPress={chooseSolo} style={styles.actionButton} buttonColor={colors.primary} textColor={colors.onPrimary}>
            Solo
          </Button>
          <Button testID='mode-vsCpu' mode='contained' icon='robot' onPress={toggleCpuDifficultyPicker} style={styles.actionButton} buttonColor={colors.secondary} textColor={colors.onSecondary}>
            Vs CPU
          </Button>
          <Button testID='mode-twoPlayer' mode='contained' icon='account-multiple' onPress={chooseTwoPlayer} style={styles.actionButton} buttonColor={colors.tertiary} textColor={colors.onTertiary}>
            2 Player
          </Button>

          {pickingCpuDifficulty && (
            <View style={styles.difficultyRow}>
              {CPU_DIFFICULTIES.map((difficulty) => (
                <Button key={difficulty} testID={`difficulty-${difficulty}`} mode={difficulty === cpuDifficulty ? 'contained' : 'outlined'} onPress={() => chooseCpuDifficulty(difficulty)} style={styles.difficultyButton} buttonColor={difficulty === cpuDifficulty ? colors.secondary : undefined} textColor={difficulty === cpuDifficulty ? colors.onSecondary : undefined}>
                  {difficultyLabel(difficulty)}
                </Button>
              ))}
            </View>
          )}
        </View>
      </View>

      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  actionButton: { minWidth: 200 },
  actions: { alignItems: 'center', gap: 16 },
  container: { flex: 1 },
  content: { alignItems: 'center', flex: 1, gap: 48, justifyContent: 'center' },
  difficultyButton: { minWidth: 84 },
  difficultyRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  highScoreStat: { alignItems: 'center' },
  highScores: { flexDirection: 'row', gap: 32 },
  settingsButton: { position: 'absolute' },
  title: { fontWeight: 'bold' }
})
