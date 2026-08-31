import { defaultColors, useAutoPaperTheme } from '@rific/auto-paper'
import { IconButton } from '@rific/feedback-press'
import { PressAwayOverlay, ReadyButton, usePopoverHost } from '@tastic/hud'
import { DualZoneLayout, FakeLandscapeView, getViewRotation, rotateInsets, useAccelerometerOrientation, useDualZoneLayout } from '@tastic/split-screen'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSelector } from 'react-redux'

import { PlayerSetupPanel } from '@/components/PlayerSetupPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { useProfiles } from '@/hooks/useProfiles'
import type { RootState } from '@/redux/store'
import { SnakeId } from '@/types'
import { SNAKE_COLORS } from '@/utils/snakeEngine'

// Same 180ms panel-swap fade every other @tastic loadout screen uses (see BoxHockey's/AirHockey's
// own constant of the same name/value).
const PANEL_SWAP_FADE_MS = 180

// Only ever reached for Vs CPU/2 Player (see index.tsx — Solo has no second seat and no color
// conflict to resolve, so it skips straight to /game). Mirrors AirHockey's loadout.tsx — the
// simplest of the three @tastic reference screens — trimmed further: no shared per-round settings
// row (Snake's wrapEdges/cpuDifficulty already live in Redux + SettingsDialog/the title screen's
// own inline difficulty row, so there's nothing to relocate here) and no control-scheme picker
// (both snakes use the same swipe/touch input). Reuses @tastic/split-screen's
// FakeLandscapeView/useAccelerometerOrientation (Snake's own version of that package, like
// BoxHockey's, fakes the rotation in JS since app.json is portrait-locked at the OS level — unlike
// AirHockey's older split-screen version, which still relies on real OS rotation).
export default function LoadoutScreen() {
  const params = useLocalSearchParams<{ mode: string }>()
  const mode = params.mode === 'vsCpu' ? 'vsCpu' : 'twoPlayer'
  const p2IsHuman = mode === 'twoPlayer'

  const lockOrientation = useSelector((state: RootState) => state.game.lockOrientation)
  const { orientationMode, p1OnRight, upsideDown, resolved: p1OnRightResolved } = useAccelerometerOrientation(lockOrientation)
  const { panelLayout, panelFadeStyle } = useDualZoneLayout(orientationMode, p1OnRight, p1OnRightResolved, upsideDown, PANEL_SWAP_FADE_MS)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const rotation = getViewRotation(panelLayout.orientationMode, panelLayout.p1OnRight, panelLayout.upsideDown)
  const insets = rotateInsets(useSafeAreaInsets(), rotation)
  const { dark } = useAutoPaperTheme()
  const { profiles, lastSelected, selectProfile } = useProfiles()

  // Per-round only — Solo has no loadout screen at all, so these never need to persist past this
  // screen; /game reads them once via route params (see game.tsx) and falls back to
  // createInitialSnakeState's own SNAKE_COLORS defaults for every other call site.
  const [p1Color, setP1Color] = useState(SNAKE_COLORS[1])
  const [p2Color, setP2Color] = useState(SNAKE_COLORS[2])

  // Picking the other slot's exact current color swaps the two instead of no-op'ing — only
  // reachable at all when that slot's own picker allowed it (allowSwapTaken: Vs CPU only, where
  // the "other" color there is only ever the CPU's, not a second real person's choice).
  const handleP1ColorChange = useCallback(
    (hex: string) => {
      setP1Color(hex)
      if (hex.toLowerCase() === p2Color.toLowerCase()) setP2Color(p1Color)
    },
    [p1Color, p2Color]
  )
  const handleP2ColorChange = useCallback(
    (hex: string) => {
      setP2Color(hex)
      if (hex.toLowerCase() === p1Color.toLowerCase()) setP1Color(p2Color)
    },
    [p1Color, p2Color]
  )

  const humanPlayers: SnakeId[] = useMemo(() => (p2IsHuman ? [1, 2] : [1]), [p2IsHuman])
  const [ready, setReady] = useState<Record<SnakeId, boolean>>({ 1: false, 2: false })

  // Every time this screen (re)gains focus — first arrival from the title screen, or coming back
  // here via the post-game "Loadout" button — Ready starts false again. Without this, popping back
  // to an already-mounted loadout whose players both left it Ready would immediately re-trigger the
  // all-ready effect below and bounce straight back into /game.
  useFocusEffect(
    useCallback(() => {
      setReady({ 1: false, 2: false })
    }, [])
  )

  useEffect(() => {
    if (!humanPlayers.every((p) => ready[p])) return
    router.push({ pathname: '/game', params: { mode, p1Color, p2Color } })
  }, [ready, humanPlayers, mode, p1Color, p2Color])

  const bg = dark ? '#000000' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : '#000000'

  const isPortrait = panelLayout.orientationMode === 'faceToFace'

  // Where seat 2's own press-away zone lives on screen — matches panelLayout (the already-committed,
  // currently-painted layout), not the live orientationMode/p1OnRight/upsideDown, since it needs to
  // agree with whichever arrangement is actually on screen right now, mid-fade included. Only
  // meaningful in 2 Player mode — Vs CPU's CPU slot shares controlsHost instead (see p2Host below),
  // so it never needs a zone of its own.
  const p2ZoneStyle = mode === 'twoPlayer' ? (isPortrait ? styles.p2ZoneTop : panelLayout.p1OnRight ? styles.p2ZoneLeft : styles.p2ZoneRight) : null

  // Vs CPU only has one human slot, so its Ready toggle renders standalone below both slots instead
  // of embedded in this panel.
  const showReadyButton = mode === 'twoPlayer'
  // Seat 1's own panel shares a host with the CPU slot in Vs CPU (only one human is ever driving
  // both slots there, so having both pickers open at once is just clutter); 2 Player keeps seat 2 on
  // its own independent host, since two real people editing at once is the whole point there.
  const controlsHost = usePopoverHost()
  const p2PanelHost = usePopoverHost()
  const p2Host = mode === 'vsCpu' ? controlsHost : p2PanelHost
  const anyPlayerPickerOpen = !!(controlsHost.openId?.startsWith('p1-') || controlsHost.openId?.startsWith('p2-'))

  const p1Panel = <PlayerSetupPanel idPrefix='p1' host={controlsHost} color={p1Color} onColorChange={handleP1ColorChange} swatches={defaultColors} takenColor={p2Color} allowSwapTaken={mode === 'vsCpu'} isHuman ready={ready[1]} onToggleReady={() => setReady((r) => ({ ...r, 1: !r[1] }))} dark={dark} showReadyButton={showReadyButton} profiles={profiles} selectedProfileId={lastSelected[1]} takenProfileId={lastSelected[2]} guestLabel='P1' onProfileSelect={(profile) => selectProfile(1, profile?.id ?? null)} onManageProfiles={() => router.push('/profiles')} />
  const p2Panel = <PlayerSetupPanel idPrefix='p2' host={p2Host} color={p2Color} onColorChange={handleP2ColorChange} swatches={defaultColors} takenColor={p1Color} allowSwapTaken={mode === 'vsCpu'} isHuman={p2IsHuman} ready={p2IsHuman ? ready[2] : undefined} onToggleReady={p2IsHuman ? () => setReady((r) => ({ ...r, 2: !r[2] })) : undefined} dark={dark} showReadyButton={showReadyButton} profiles={p2IsHuman ? profiles : undefined} selectedProfileId={lastSelected[2]} takenProfileId={lastSelected[1]} guestLabel='P2' onProfileSelect={p2IsHuman ? (profile) => selectProfile(2, profile?.id ?? null) : undefined} />

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <FakeLandscapeView orientationMode={panelLayout.orientationMode} p1OnRight={panelLayout.p1OnRight} upsideDown={panelLayout.upsideDown} style={styles.rotatable}>
        {/* Press-away overlays for this screen's own popovers (color/profile pickers) — see
        PressAwayOverlay's own comment for the paint-order trick that keeps real controls directly
        tappable. Seat 1's covers the whole screen, while seat 2's is scoped to just their own half
        (p2ZoneStyle) and, being a later sibling, takes priority over seat 1's within that rect. */}
        <PressAwayOverlay active={controlsHost.openId !== null} onPress={controlsHost.close} />
        {p2ZoneStyle && <PressAwayOverlay active={controlsHost.openId !== null || p2Host.openId !== null} onPress={p2Host.close} style={p2ZoneStyle} />}

        <IconButton icon='arrow-left' iconColor={fg} size={24} style={[styles.back, { top: 8 + insets.top, left: 8 + insets.left }]} onPress={() => router.back()} />
        <IconButton icon='cog' iconColor={fg} size={24} style={[styles.topRight, { top: 8 + insets.top, right: 8 + insets.right }]} onPress={() => setSettingsOpen(true)} accessibilityLabel='Settings' />

        {mode === 'twoPlayer' ? (
          <DualZoneLayout panelLayout={panelLayout} panelFadeStyle={panelFadeStyle} p1={p1Panel} p2={p2Panel} />
        ) : (
          <View style={styles.stackedZone}>
            <Animated.View style={[styles.playersRow, anyPlayerPickerOpen && styles.playersRowOpen, panelFadeStyle]}>
              {!isPortrait && panelLayout.p1OnRight ? p2Panel : p1Panel}
              {!isPortrait && panelLayout.p1OnRight ? p1Panel : p2Panel}
            </Animated.View>
            <ReadyButton color={p1Color} ready={ready[1]} onToggleReady={() => setReady((r) => ({ ...r, 1: !r[1] }))} style={anyPlayerPickerOpen && styles.readyButtonHidden} />
          </View>
        )}
      </FakeLandscapeView>

      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  back: {
    left: 8,
    position: 'absolute',
    top: 8
  },
  container: {
    flex: 1
  },
  p2ZoneLeft: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: '50%'
  },
  p2ZoneRight: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '50%'
  },
  p2ZoneTop: {
    height: '50%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0
  },
  // Only used by Vs CPU's stacked (non-rotated) layout above — 2 Player's own DualZoneLayout
  // handles its own spacing.
  playersRow: {
    flexDirection: 'row',
    gap: 12
  },
  playersRowOpen: {
    zIndex: 100
  },
  readyButtonHidden: {
    opacity: 0,
    pointerEvents: 'none'
  },
  rotatable: {
    alignItems: 'center',
    flex: 1,
    gap: 32,
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  stackedZone: {
    alignItems: 'center',
    gap: 28
  },
  topRight: {
    position: 'absolute',
    right: 8,
    top: 8
  }
})
