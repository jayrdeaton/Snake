import { useAutoPaperTheme } from '@rific/auto-paper'
import { Button, IconButton } from '@rific/feedback-press'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { HeroTitle } from '@/components/HeroTitle'
import { SettingsDialog } from '@/components/SettingsDialog'

export default function HomeScreen() {
  const { colors, dark } = useAutoPaperTheme()
  const insets = useSafeAreaInsets()

  const [settingsOpen, setSettingsOpen] = useState(false)

  // Both routes go through /loadout now — 1 Player's own CPU difficulty (including "None", Snake's
  // genuine no-opponent solo mode) is picked there, in the same per-seat slot 2 Player already uses
  // for its own second human (see loadout.tsx).
  const chooseMode = useCallback((mode: 'onePlayer' | 'twoPlayer') => {
    router.push({ pathname: '/loadout', params: { mode } })
  }, [])

  // High-contrast retro look: literal black/white, flipped by appearance — same treatment
  // LightCycles' own index.tsx gives its title screen.
  const bg = dark ? '#000000' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : '#000000'

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Same top-left slot every @tastic title screen uses for this — see LightCycles' own
      identical trophy IconButton. */}
      <IconButton icon='trophy' iconColor={fg} size={24} style={[styles.trophyButton, { top: 8 + insets.top, left: 8 + insets.left }]} onPress={() => router.push('/achievements')} accessibilityLabel='Stats & Achievements' />
      <IconButton icon='cog' iconColor={fg} size={24} style={[styles.settingsButton, { top: 8 + insets.top, right: 8 + insets.right }]} onPress={() => setSettingsOpen(true)} accessibilityLabel='Settings' />

      <HeroTitle letterColor={fg} />

      <View style={styles.actions}>
        <Button testID='mode-onePlayer' mode='contained' icon='account' onPress={() => chooseMode('onePlayer')} style={styles.actionButton} buttonColor={colors.primary} textColor={colors.onPrimary}>
          1 Player
        </Button>
        <Button testID='mode-twoPlayer' mode='contained' icon='account-multiple' onPress={() => chooseMode('twoPlayer')} style={styles.actionButton} buttonColor={colors.secondary} textColor={colors.onSecondary}>
          2 Player
        </Button>
      </View>

      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  actionButton: { minWidth: 200 },
  actions: { alignItems: 'center', gap: 16 },
  // Centers HeroTitle/actions directly on this same flex parent — deliberately NOT a separate
  // inner wrapper View around just those two, unlike an earlier version of this screen. A flex:1
  // wrapper sibling rendered after the trophy/cog IconButtons would size itself to the full screen
  // (it's the only flow-participating child once the two absolute-positioned buttons are excluded
  // from layout) and, since every RN Web View defaults to position:relative, would tie the two
  // absolute buttons for z-index:auto stacking — a tie broken by DOM order, so that later sibling
  // paints (and hit-tests) on top despite having no visible pixels there, silently swallowing taps
  // on both corner buttons. Matches LightCycles' own index.tsx, which puts this same centering
  // style directly on the one parent shared with its corner buttons for exactly this reason.
  container: { alignItems: 'center', flex: 1, gap: 48, justifyContent: 'center' },
  settingsButton: { position: 'absolute' },
  trophyButton: { position: 'absolute' }
})
