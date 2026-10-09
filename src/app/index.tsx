import { useAutoPaperTheme } from '@rific/auto-paper'
import { Button, IconButton } from '@rific/feedback-press'
import { FakeLandscapeView, rotateInsets, useRotation } from '@tastic/core'
import { useAutoShowGuide } from '@tastic/hud/guide'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { HeroTitle } from '@/components/HeroTitle'
import { SettingsDialog } from '@/components/SettingsDialog'

export default function HomeScreen() {
  const { colors, dark } = useAutoPaperTheme()
  // Follows the device's current physical tilt (see @tastic/core's useOrientationState, which
  // useRotation reads internally), so the title screen rotates along with everywhere else as soon
  // as the phone is turned. Lock Orientation (see SettingsDialog) pins it, app-wide: _layout.tsx's
  // OrientationProvider freezes the shared reading itself while it's on, so nothing here takes the
  // flag (see types/index.ts's Settings lockOrientation comment). app.json is portrait-locked at the OS
  // level (no more real OS rotation to rely on); FakeLandscapeView below fakes the rest entirely in
  // JS from this hook's accelerometer reading.
  const rotation = useRotation()
  // react-native-safe-area-context always reports insets relative to the device's own fixed
  // physical frame (the OS thinks the interface is still portrait-locked and never rotates, so it
  // has no idea FakeLandscapeView below is rotating the content) — rotateInsets remaps them onto
  // whichever edge they actually correspond to once visually rotated, using the same rotation
  // FakeLandscapeView itself renders with, so `top`/`right` below always mean the screen's real,
  // visual edges regardless of how the phone is being held.
  const insets = rotateInsets(useSafeAreaInsets(), rotation)

  const [settingsOpen, setSettingsOpen] = useState(false)
  // First launch only (and once per session): opens the how-to-play cards over this screen. Called
  // here and nowhere else so it can never fire over a live match or a two-seat loadout: Home is the
  // one screen with a single reader, before any seating. See GuideHost / @tastic/hud/guide.
  useAutoShowGuide()

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
      {/* Everything below reads correctly no matter which way the phone is actually being held:
      see @tastic/core's FakeLandscapeView. SettingsDialog stays outside it: it renders through a
      Portal over the whole screen, and BaseSettingsDialog lays itself out in its own frame turned
      by the `rotation` passed below (see @tastic/hud's RotatedFrame). */}
      <FakeLandscapeView style={styles.rotatable}>
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
      </FakeLandscapeView>

      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} rotation={rotation} showHowToPlay />
    </View>
  )
}

const styles = StyleSheet.create({
  actionButton: { minWidth: 200 },
  actions: { alignItems: 'center', gap: 16 },
  container: { flex: 1 },
  // Owns the flex-centering layout `container` used to apply directly — now one level deeper, since
  // everything visible sits inside FakeLandscapeView, which needs a real (not shrink-wrapped)
  // full-bleed box to size its own absolutely-positioned children (the trophy/settings buttons)
  // against correctly. Matches BoxHockey's/LightCycles' own index.tsx, which give this same
  // centering style to FakeLandscapeView's own wrapped content instead of `container` for the
  // identical reason.
  rotatable: { alignItems: 'center', flex: 1, gap: 48, justifyContent: 'center' },
  settingsButton: { position: 'absolute' },
  trophyButton: { position: 'absolute' }
})
