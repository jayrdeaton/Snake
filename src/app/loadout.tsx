import { defaultColors, getThirdColor, useAutoPaperTheme, useThemeSettings } from '@rific/auto-paper'
import { FakeLandscapeView, getViewRotation, rotateInsets, useOrientationState } from '@tastic/core'
import { CornerActionButtons, LabeledDropdownOption, MenuOption, PressAwayOverlay, ReadyButton, SharedActionBand, usePopoverHost } from '@tastic/hud'
import { DualZoneLayout, needsSharedNeutralZone, useDualZoneLayout } from '@tastic/split-screen'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector } from 'react-redux'

import { LOADOUT_SHARED_CONTROLS_IDS, LoadoutSharedControls } from '@/components/LoadoutSharedControls'
import { CpuDifficultyChoice, PlayerSetupPanel } from '@/components/PlayerSetupPanel'
import { SettingsDialog } from '@/components/SettingsDialog'
import { SNAKE_POWERUP_ALL_TYPES, SNAKE_POWERUP_ICONS } from '@/constants/snake'
import { useProfiles } from '@/hooks/useProfiles'
import { SnakeMode } from '@/hooks/useSnakeState'
import { defaultGameState, gameActions } from '@/redux/gameSlice'
import type { RootState } from '@/redux/store'
import { ControlScheme, SnakeArenaVariant, SnakeGridSizeTier, SnakeId, SnakePowerupType, SnakeSpeedTier } from '@/types'

// Same 180ms panel-swap fade every other @tastic loadout screen uses (see BoxHockey's/AirHockey's
// own constant of the same name/value).
const PANEL_SWAP_FADE_MS = 180

// Snake-flavored escalation instead of a plain skill-level label, matching LightCycles' own
// Drone/Bot/MCP convention but in reptile language rather than Tron's: "Garter" (a real, famously
// harmless beginner snake), "Rattler" (a genuine pit-viper threat), "King Cobra" (the world's
// longest venomous snake — the apex/final-boss tier, and "King" signals that status the same way
// MCP's own name does). The underlying CpuDifficulty value stays plain 'easy'/'normal'/'hard'
// throughout the engine/AI/stats — same split LightCycles itself uses, where Drone/Bot/MCP are
// display labels only and never touch the real difficulty value.
// Plus a 4th "None" choice LightCycles has no equivalent of — Snake's 1-Player flow folds its
// genuine no-opponent Solo mode in here alongside a real CPU difficulty (see finalMode below).
const CPU_DIFFICULTY_OPTIONS: LabeledDropdownOption<CpuDifficultyChoice>[] = [
  { value: 'none', label: 'None', icon: 'close-circle-outline' },
  { value: 'easy', label: 'Garter', icon: 'emoticon-happy-outline' },
  { value: 'normal', label: 'Rattler', icon: 'robot' },
  { value: 'hard', label: 'King Cobra', icon: 'fire' }
]

// Left icon-less, mirroring LightCycles' own KEY_SCHEME_OPTIONS (LobbyPlayerPanel.tsx) exactly —
// there's no MaterialCommunityIcons glyph that reads as "WASD" or "IJKL" at a glance the way
// CPU_DIFFICULTY_OPTIONS' icons do for a difficulty, so mixing one iconned option (Mouse) in with
// four icon-less ones would look like an inconsistency rather than a real distinction.
const CONTROL_SCHEME_OPTIONS: MenuOption<ControlScheme>[] = [
  { value: 'mouse', label: 'Mouse' },
  { value: 'wasd', label: 'WASD' },
  { value: 'arrows', label: 'Arrows' },
  { value: 'ijkl', label: 'IJKL' },
  { value: 'numpad', label: 'Numpad' }
]

// Same "bundled multi-select, not two boolean-shaped single-selects" technique LightCycles' own
// EXTEND_SAFE_AREA_OPTION/WRAP_EDGES_OPTION use — presence in the section's own value array is each
// toggle's on/off state, converted to/from a plain boolean at LoadoutSharedControls' own prop
// boundary. Icons match that same cross-app convention for each of these two exact settings:
// Pac-Man's own glyph for screen wrap, the expand-arrows glyph LightCycles' "Full Screen" uses.
const FULL_SCREEN_OPTION: MenuOption<'fullScreen'> = { value: 'fullScreen', label: 'Full Screen', icon: 'arrow-expand-all' }
const WRAP_EDGES_OPTION: MenuOption<'wrapEdges'> = { value: 'wrapEdges', label: 'Wrap Edges', icon: 'pac-man' }

// Static board layout — mirrors LightCycles' own arena picker (see utils/arenas.ts for what each
// variant actually builds).
const ARENA_OPTIONS: MenuOption<SnakeArenaVariant>[] = [
  { value: 'open', label: 'Open', icon: 'checkbox-blank-outline' },
  { value: 'pillars', label: 'Pillars', icon: 'view-grid-outline' },
  { value: 'gauntlet', label: 'Gauntlet', icon: 'wall' },
  { value: 'portals', label: 'Portals', icon: 'circle-double' },
  { value: 'underpass', label: 'Underpass', icon: 'tunnel-outline' }
]

// Per-round cell size — mirrors LightCycles' own grid-size picker (see constants/snake.ts's
// SNAKE_CELL_PX). Plain Small/Medium/Large labels rather than a themed relabel (unlike LightCycles'
// own motorbike/car/train icons, or this screen's own Garter/Rattler/King Cobra difficulty labels
// above) — a growing-dot icon progression already reads as "size" at a glance, so there's no need
// to invent a snake-specific metaphor just for this one setting.
const GRID_SIZE_OPTIONS: MenuOption<SnakeGridSizeTier>[] = [
  { value: 'small', label: 'Small', icon: 'circle-small' },
  { value: 'medium', label: 'Medium', icon: 'circle-medium' },
  { value: 'large', label: 'Large', icon: 'circle' }
]

// Per-round tick speed — mirrors LightCycles' own speed picker (see constants/snake.ts's
// SNAKE_SPEED_TIER_INTERVAL_MS).
const SPEED_OPTIONS: MenuOption<SnakeSpeedTier>[] = [
  { value: 'slow', label: 'Slow', icon: 'speedometer-slow' },
  { value: 'normal', label: 'Normal', icon: 'speedometer-medium' },
  { value: 'fast', label: 'Fast', icon: 'speedometer' }
]

// Reuses SNAKE_POWERUP_ICONS/SNAKE_POWERUP_ALL_TYPES so the loadout picker's own icons/order can
// never drift from the HUD badge/on-board glyph's own idea of what each type is.
const POWERUP_LABELS: Record<SnakePowerupType, string> = { sidewind: 'Sidewind', coldblood: 'Coldblood', scales: 'Scales', constrict: 'Constrict', mesmerize: 'Mesmerize', frenzy: 'Frenzy' }
const POWERUP_OPTIONS: MenuOption<SnakePowerupType>[] = SNAKE_POWERUP_ALL_TYPES.map((type) => ({ value: type, label: POWERUP_LABELS[type], icon: SNAKE_POWERUP_ICONS[type] }))

// Reached for 1 Player/2 Player (see index.tsx). Mirrors AirHockey's/BoxHockey's loadout.tsx —
// trimmed down further: LoadoutSharedControls has just the one board dropdown (wrapEdges +
// fullScreen, Snake's only two board options). CPU difficulty and (web-only) control scheme each
// live in this screen's own per-seat pickers below
// per-seat pickers below (PlayerSetupPanel), not the shared row — same cross-app convention
// BoxHockey's/AirHockey's/LightCycles' own per-seat pickers use. Reuses @tastic/split-screen's
// FakeLandscapeView (@tastic/core's own useOrientationState feeds it) — Snake's own version of
// that package, like BoxHockey's, fakes the rotation in JS since app.json is portrait-locked at
// the OS level — unlike AirHockey's older split-screen version, which still relies on real OS
// rotation).
export default function LoadoutScreen() {
  const params = useLocalSearchParams<{ mode: string }>()
  const routeMode = params.mode === 'twoPlayer' ? 'twoPlayer' : 'onePlayer'
  const p2IsHuman = routeMode === 'twoPlayer'

  const lockOrientation = useSelector((state: RootState) => state.game.lockOrientation)
  const { orientationMode, p1OnRight, upsideDown, resolved: p1OnRightResolved } = useOrientationState(lockOrientation)
  const { panelLayout, panelFadeStyle } = useDualZoneLayout(orientationMode, p1OnRight, p1OnRightResolved, upsideDown, PANEL_SWAP_FADE_MS)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const rotation = getViewRotation(panelLayout.orientationMode, panelLayout.p1OnRight, panelLayout.upsideDown)
  const insets = rotateInsets(useSafeAreaInsets(), rotation)
  const { colors: themeColors, dark } = useAutoPaperTheme()
  const { set: setThemeSettings } = useThemeSettings()
  const { profiles, lastSelected, selectProfile } = useProfiles()
  const dispatch = useDispatch()
  const lastGuestColor = useSelector((state: RootState) => state.game.lastGuestColor)
  const lastCpuColor = useSelector((state: RootState) => state.game.lastCpuColor)
  const persistedCpuDifficulty = useSelector((state: RootState) => state.game.cpuDifficulty)
  // Promoted here from SettingsDialog's own former "BOARD" section — see LoadoutSharedControls'
  // own header comment for why. Persisted straight to gameSlice, same as every other Snake
  // preference (this app centralizes all of them there rather than a separate settings object).
  const wrapEdges = useSelector((state: RootState) => state.game.wrapEdges)
  // Same board-dropdown bundle as wrapEdges immediately above — see gameSlice.ts's own fullScreen
  // comment for what it actually does.
  const fullScreen = useSelector((state: RootState) => state.game.fullScreen)
  const arenaVariant = useSelector((state: RootState) => state.game.arenaVariant)
  const gridSizeTier = useSelector((state: RootState) => state.game.gridSizeTier)
  const speedTier = useSelector((state: RootState) => state.game.speedTier)
  const enabledPowerups = useSelector((state: RootState) => state.game.enabledPowerups)
  // Web-only per-seat picker (see PlayerSetupPanel's showControlScheme) — Record<SnakeId,...>
  // rather than tied to a Profile, since Snake's Profile is the shared @tastic/profile package's
  // own type as-is (see useProfiles.tsx's own comment) and isn't extended with app-specific fields
  // the way LightCycles' local Profile.keyScheme is.
  const controlScheme = useSelector((state: RootState) => state.game.controlScheme)

  // Seat 2 only ever has a profile in 2 Player — 1 Player's seat 2 is the CPU (or nothing at all,
  // once "None" is picked), which has no profile concept either way (see PlayerSetupPanel's own
  // profiles={p2IsHuman ? profiles : undefined}).
  const p1Profile = useMemo(() => profiles.find((p) => p.id === lastSelected[1]) ?? null, [profiles, lastSelected])
  const p2Profile = useMemo(() => (p2IsHuman ? (profiles.find((p) => p.id === lastSelected[2]) ?? null) : null), [profiles, p2IsHuman, lastSelected])

  // Per-round only — these never need to persist past this screen; /game reads them once via route
  // params (see game.tsx) and falls back to createInitialSnakeState's own SNAKE_COLORS defaults for
  // every other call site. Seeded here from whichever source currently owns the seat's color
  // (profile > last guest color, or last CPU color for 1 Player's seat 2) so the very first paint
  // already matches; the focus effect below is what keeps it that way afterward.
  const [p1Color, setP1Color] = useState(() => p1Profile?.color ?? lastGuestColor[1])
  const [p2Color, setP2Color] = useState(() => (p2IsHuman ? (p2Profile?.color ?? lastGuestColor[2]) : lastCpuColor))

  // 1 Player's own CPU-seat choice — Easy/Normal/Hard/None (see CPU_DIFFICULTY_OPTIONS). Seeded
  // from (and, on every focus, reset back to) the persisted preference, same convention as
  // p1Color/p2Color just above — except "None" itself is never persisted (see handleDifficultyChange),
  // so a "None" pick from an earlier visit never survives a trip away and back, only a real
  // difficulty does. persistedCpuDifficulty is null until a real difficulty has ever been picked
  // (see gameSlice.ts's own cpuDifficulty comment), which folds into this same "no CPU" state.
  const [difficulty, setDifficulty] = useState<CpuDifficultyChoice>(persistedCpuDifficulty ?? 'none')

  // (a) A seat with a profile selected always shows that profile's current color — never a
  // persisted-color read of its own. Refires on every focus (first mount, and coming back to an
  // already-mounted /loadout via the post-game "Loadout" button), so a manual recolor or clash-swap
  // made against a profile earlier in this session doesn't survive a trip away and back — and
  // whenever a seat's own selected profile id changes (a fresh tap-select, or switching to/from
  // guest). Deliberately NOT keyed on the profile records or the guest/CPU slots themselves — an
  // edit to a profile elsewhere while the same one stays selected here, or this screen's own writes
  // to those slots below, must not bounce this back. Those four are instead read through refs, each
  // kept in sync by its own trivial effect below, so the callback still sees their CURRENT values on
  // a real refire instead of whatever they were frozen at on the last lastSelected/p2IsHuman change.
  const p1ProfileRef = useRef(p1Profile)
  useEffect(() => {
    p1ProfileRef.current = p1Profile
  }, [p1Profile])
  const p2ProfileRef = useRef(p2Profile)
  useEffect(() => {
    p2ProfileRef.current = p2Profile
  }, [p2Profile])
  const lastGuestColorRef = useRef(lastGuestColor)
  useEffect(() => {
    lastGuestColorRef.current = lastGuestColor
  }, [lastGuestColor])
  const lastCpuColorRef = useRef(lastCpuColor)
  useEffect(() => {
    lastCpuColorRef.current = lastCpuColor
  }, [lastCpuColor])
  const persistedCpuDifficultyRef = useRef(persistedCpuDifficulty)
  useEffect(() => {
    persistedCpuDifficultyRef.current = persistedCpuDifficulty
  }, [persistedCpuDifficulty])

  useFocusEffect(
    useCallback(() => {
      setP1Color(p1ProfileRef.current?.color ?? lastGuestColorRef.current[1])
      setP2Color(p2IsHuman ? (p2ProfileRef.current?.color ?? lastGuestColorRef.current[2]) : lastCpuColorRef.current)
      setDifficulty(persistedCpuDifficultyRef.current ?? 'none')
      // lastSelected is intentionally a trigger-only dependency here — a fresh tap-select or
      // guest/profile switch must reapply the seat's color, even though the callback body reads the
      // resolved profile/color through the refs above rather than lastSelected itself.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastSelected, p2IsHuman])
  )

  // Dispatched immediately on a real Easy/Normal/Hard pick, matching the old title-screen inline
  // picker's exact behavior now that it lives here instead — "None" is deliberately never
  // dispatched: it isn't a CPU difficulty preference to remember for next time, it's "there's no
  // CPU," which finalMode below fully captures without a persisted trace of its own.
  const handleDifficultyChange = useCallback(
    (value: CpuDifficultyChoice) => {
      setDifficulty(value)
      if (value !== 'none') dispatch(gameActions.setCpuDifficulty(value))
    },
    [dispatch]
  )

  // (b)/(c): a profile-selected seat's color is never written here — the effect above is what
  // keeps it live instead, so a manual recolor/clash-swap against it stays a for-this-visit-only
  // override. A guest and 1 Player's CPU seat 2 each get their own remembered slot, so a CPU
  // opponent's last color and a human guest's last color don't fight over one persisted value.
  const persistP1Color = useCallback(
    (hex: string) => {
      if (p1Profile) return
      dispatch(gameActions.setLastGuestColor({ seat: 1, color: hex }))
    },
    [p1Profile, dispatch]
  )
  const persistP2Color = useCallback(
    (hex: string) => {
      if (!p2IsHuman) {
        dispatch(gameActions.setLastCpuColor(hex))
        return
      }
      if (p2Profile) return
      dispatch(gameActions.setLastGuestColor({ seat: 2, color: hex }))
    },
    [p2IsHuman, p2Profile, dispatch]
  )

  // Whether a second colored entity actually exists right now — a real human (2 Player) or a real
  // CPU difficulty (1 Player, anything but None). When it's false (1 Player's "None" seat), p2Color
  // is just a stale leftover (lastCpuColor) for a seat the user can no longer even see or edit, so
  // it must never factor into P1's own color logic below.
  const p2Exists = p2IsHuman || difficulty !== 'none'

  // Picking the other slot's exact current color swaps the two instead of no-op'ing — only
  // reachable at all when that slot's own picker allowed it (allowSwapTaken: 1 Player only, where
  // the "other" color there is only ever the CPU's, not a second real person's choice). Each side of
  // a swap persists independently, per its own seat's rule above.
  const handleP1ColorChange = useCallback(
    (hex: string) => {
      setP1Color(hex)
      persistP1Color(hex)
      if (p2Exists && hex.toLowerCase() === p2Color.toLowerCase()) {
        setP2Color(p1Color)
        persistP2Color(p1Color)
      }
    },
    [p1Color, p2Color, p2Exists, persistP1Color, persistP2Color]
  )
  const handleP2ColorChange = useCallback(
    (hex: string) => {
      setP2Color(hex)
      persistP2Color(hex)
      if (p2Exists && hex.toLowerCase() === p1Color.toLowerCase()) {
        setP1Color(p2Color)
        persistP1Color(p2Color)
      }
    },
    [p1Color, p2Color, p2Exists, persistP1Color, persistP2Color]
  )

  // The app-wide theme follows whichever colors are actually live here — primary is always P1's,
  // secondary is P2's (human or CPU, whichever seat 2 currently is), tertiary the third color
  // maximally distinct from both, so a board/HUD element that wants a neutral accent never clashes
  // with either seat. Goes through auto-paper's own live settings setter (not a direct Redux
  // dispatch) since Theme.tsx's `initialValue` only ever seeds the Provider once, at mount — `set`
  // is what actually re-renders the running theme; Theme.tsx's existing onChange then mirrors this
  // out to Redux for us, so it still persists across a relaunch with no extra wiring here.
  useEffect(() => {
    setThemeSettings({ color: { primary: p1Color, secondary: p2Color, tertiary: getThirdColor(p1Color, p2Color) } })
  }, [p1Color, p2Color, setThemeSettings])

  // Covers every genuine gameplay variant LoadoutSharedControls exposes — wrapEdges (a coin flip,
  // same as before), arenaVariant/gridSizeTier (a random pick off the same option list each picker
  // itself offers), speedTier (same), and enabledPowerups (an independent coin flip per type,
  // matching wrapEdges' own single-line style rather than picking from a curated subset). Per-seat stuff
  // (colors, difficulty) and app-wide prefs (lock orientation) live outside this row and aren't
  // "match settings" in the sense a player means when they ask to shuffle or reset the current
  // round. fullScreen is the one exception left inside the row itself: still a toggle in the same
  // bundled dropdown as wrapEdges/arenaVariant (see FULL_SCREEN_OPTION above), but deliberately not
  // shuffled here — it governs the board's @tastic/core gutter inset (see game.tsx), which makes it
  // a stable "how does the board fit my screen" preference rather than a gameplay variant, and
  // players would find it disorienting for that to flip on a random shuffle mid-session.
  const handleRandomizeMatchSettings = useCallback(() => {
    dispatch(gameActions.setWrapEdges(Math.random() < 0.5))
    dispatch(gameActions.setArenaVariant(ARENA_OPTIONS[Math.floor(Math.random() * ARENA_OPTIONS.length)].value))
    dispatch(gameActions.setGridSizeTier(GRID_SIZE_OPTIONS[Math.floor(Math.random() * GRID_SIZE_OPTIONS.length)].value))
    dispatch(gameActions.setSpeedTier(SPEED_OPTIONS[Math.floor(Math.random() * SPEED_OPTIONS.length)].value))
    dispatch(gameActions.setEnabledPowerups(SNAKE_POWERUP_ALL_TYPES.filter(() => Math.random() < 0.5)))
  }, [dispatch])

  const handleResetMatchSettings = useCallback(() => {
    dispatch(gameActions.setWrapEdges(defaultGameState.wrapEdges))
    dispatch(gameActions.setArenaVariant(defaultGameState.arenaVariant))
    dispatch(gameActions.setGridSizeTier(defaultGameState.gridSizeTier))
    dispatch(gameActions.setSpeedTier(defaultGameState.speedTier))
    dispatch(gameActions.setEnabledPowerups(defaultGameState.enabledPowerups))
  }, [dispatch])

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

  // 2 Player always means twoPlayer; 1 Player means vsCpu for a real difficulty, or Snake's own
  // genuine no-opponent solo mode for "None" — the one piece of this screen with no equivalent in
  // either BoxHockey's or LightCycles' own loadout/lobby screen (see loadout's header comment).
  // game.tsx/useSnakeState.ts already handle mode:'solo' and mode:'vsCpu' exactly as before this
  // redesign, reading cpuDifficulty from redux the same way — nothing downstream of this changes.
  const finalMode: SnakeMode = routeMode === 'twoPlayer' ? 'twoPlayer' : difficulty === 'none' ? 'solo' : 'vsCpu'

  useEffect(() => {
    if (!humanPlayers.every((p) => ready[p])) return
    // p2Color is omitted for solo, honestly reflecting "there is no second seat" — matching how
    // Solo already worked pre-redesign, when it skipped /loadout and went straight to /game with
    // no p2Color param at all.
    router.push({ pathname: '/game', params: finalMode === 'solo' ? { mode: finalMode, p1Color } : { mode: finalMode, p1Color, p2Color } })
  }, [ready, humanPlayers, finalMode, p1Color, p2Color])

  const bg = dark ? '#000000' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : '#000000'
  const fgMuted = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'

  const isPortrait = panelLayout.orientationMode === 'faceToFace'
  // See @tastic/split-screen's needsSharedNeutralZone for the full reasoning — extracted there
  // once this exact boolean turned up independently hand-duplicated across LightCycles/BoxHockey/
  // AirHockey too.
  const showMetaInSharedBand = needsSharedNeutralZone(panelLayout.orientationMode, humanPlayers.length)

  // Where seat 2's own press-away zone lives on screen — matches panelLayout (the already-committed,
  // currently-painted layout), not the live orientationMode/p1OnRight/upsideDown, since it needs to
  // agree with whichever arrangement is actually on screen right now, mid-fade included. Only
  // meaningful in 2 Player mode — 1 Player's CPU slot shares controlsHost instead (see p2Host
  // below), so it never needs a zone of its own.
  const p2ZoneStyle = routeMode === 'twoPlayer' ? (isPortrait ? styles.p2ZoneTop : panelLayout.p1OnRight ? styles.p2ZoneLeft : styles.p2ZoneRight) : null

  // 1 Player only has one human slot, so its Ready toggle renders standalone below both slots
  // instead of embedded in this panel.
  const showReadyButton = routeMode === 'twoPlayer'
  // Seat 1's own panel shares a host with the CPU slot in 1 Player (only one human is ever driving
  // both slots there, so having both pickers open at once is just clutter); 2 Player keeps seat 2 on
  // its own independent host, since two real people editing at once is the whole point there.
  const controlsHost = usePopoverHost()
  const p2PanelHost = usePopoverHost()
  const p2Host = routeMode === 'onePlayer' ? controlsHost : p2PanelHost
  const anyPlayerPickerOpen = !!(controlsHost.openId?.startsWith('p1-') || controlsHost.openId?.startsWith('p2-'))

  const sharedControlsRow = (
    <LoadoutSharedControls
      host={controlsHost}
      arenaVariant={arenaVariant}
      arenaOptions={ARENA_OPTIONS}
      onArenaChange={(value) => dispatch(gameActions.setArenaVariant(value))}
      wrapEdges={wrapEdges}
      wrapEdgesOption={WRAP_EDGES_OPTION}
      onWrapEdgesChange={(value) => dispatch(gameActions.setWrapEdges(value))}
      fullScreen={fullScreen}
      fullScreenOption={FULL_SCREEN_OPTION}
      onFullScreenChange={(value) => dispatch(gameActions.setFullScreen(value))}
      gridSizeTier={gridSizeTier}
      gridSizeOptions={GRID_SIZE_OPTIONS}
      onGridSizeChange={(value) => dispatch(gameActions.setGridSizeTier(value))}
      speedTier={speedTier}
      speedOptions={SPEED_OPTIONS}
      onSpeedChange={(value) => dispatch(gameActions.setSpeedTier(value))}
      enabledPowerups={enabledPowerups}
      powerupOptions={POWERUP_OPTIONS}
      onPowerupsChange={(value) => dispatch(gameActions.setEnabledPowerups(value))}
      // Omitted (leaving LoadoutSharedControls' own actionsRow unrendered) whenever
      // showMetaInSharedBand is about to fold randomize/reset into its own merged header row
      // instead — otherwise both would render at once.
      onRandomize={showMetaInSharedBand ? undefined : handleRandomizeMatchSettings}
      onReset={showMetaInSharedBand ? undefined : handleResetMatchSettings}
      accentColor={themeColors.tertiary}
      mutedColor={fgMuted}
      onAccentColor={themeColors.onTertiary}
      dark={dark}
    />
  )

  // Only wrapped for showMetaInSharedBand (see its own comment above) — everywhere else back/
  // settings stay in their usual top corners (CornerActionButtons below) and randomize/reset stay
  // in LoadoutSharedControls' own row above the trigger gauge. SharedActionBand owns the "is the
  // open popover actually one of mine" self-elevation check internally, given just the resolved
  // boolean below.
  const sharedControlsPopoverOpen = controlsHost.openId !== null && LOADOUT_SHARED_CONTROLS_IDS.includes(controlsHost.openId)
  const sharedControls = showMetaInSharedBand ? (
    <SharedActionBand onBack={() => router.back()} onSettings={() => setSettingsOpen(true)} onRandomize={handleRandomizeMatchSettings} onReset={handleResetMatchSettings} fg={fg} popoverOpen={sharedControlsPopoverOpen}>
      {sharedControlsRow}
    </SharedActionBand>
  ) : (
    sharedControlsRow
  )

  const p1Panel = <PlayerSetupPanel idPrefix='p1' host={controlsHost} color={p1Color} onColorChange={handleP1ColorChange} swatches={defaultColors} takenColor={p2Exists ? p2Color : undefined} allowSwapTaken={routeMode === 'onePlayer' && p2Exists} isHuman controlScheme={controlScheme[1]} onControlSchemeChange={(scheme) => dispatch(gameActions.setControlScheme({ seat: 1, scheme }))} controlSchemeOptions={CONTROL_SCHEME_OPTIONS} otherControlScheme={p2IsHuman ? controlScheme[2] : undefined} ready={ready[1]} onToggleReady={() => setReady((r) => ({ ...r, 1: !r[1] }))} dark={dark} showReadyButton={showReadyButton} profiles={profiles} selectedProfileId={lastSelected[1]} takenProfileId={lastSelected[2]} guestLabel='P1' onProfileSelect={(profile) => selectProfile(1, profile?.id ?? null)} onManageProfiles={() => router.push('/profiles')} />
  const p2Panel = (
    <PlayerSetupPanel
      idPrefix='p2'
      host={p2Host}
      color={p2Color}
      onColorChange={handleP2ColorChange}
      swatches={defaultColors}
      takenColor={p1Color}
      allowSwapTaken={routeMode === 'onePlayer' && p2Exists}
      isHuman={p2IsHuman}
      controlScheme={p2IsHuman ? controlScheme[2] : undefined}
      onControlSchemeChange={p2IsHuman ? (scheme) => dispatch(gameActions.setControlScheme({ seat: 2, scheme })) : undefined}
      controlSchemeOptions={p2IsHuman ? CONTROL_SCHEME_OPTIONS : undefined}
      otherControlScheme={p2IsHuman ? controlScheme[1] : undefined}
      ready={p2IsHuman ? ready[2] : undefined}
      onToggleReady={p2IsHuman ? () => setReady((r) => ({ ...r, 2: !r[2] })) : undefined}
      dark={dark}
      showReadyButton={showReadyButton}
      profiles={p2IsHuman ? profiles : undefined}
      selectedProfileId={lastSelected[2]}
      takenProfileId={lastSelected[1]}
      guestLabel='P2'
      onProfileSelect={p2IsHuman ? (profile) => selectProfile(2, profile?.id ?? null) : undefined}
      cpuDifficulty={p2IsHuman ? undefined : difficulty}
      cpuDifficultyOptions={p2IsHuman ? undefined : CPU_DIFFICULTY_OPTIONS}
      onCpuDifficultyChange={p2IsHuman ? undefined : handleDifficultyChange}
    />
  )

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <FakeLandscapeView orientationMode={panelLayout.orientationMode} p1OnRight={panelLayout.p1OnRight} upsideDown={panelLayout.upsideDown} style={styles.rotatable}>
        {/* Press-away overlays for this screen's own popovers (color/profile pickers) — see
        PressAwayOverlay's own comment for the paint-order trick that keeps real controls directly
        tappable. Seat 1's covers the whole screen, while seat 2's is scoped to just their own half
        (p2ZoneStyle) and, being a later sibling, takes priority over seat 1's within that rect. */}
        <PressAwayOverlay active={controlsHost.openId !== null} onPress={controlsHost.close} />
        {p2ZoneStyle && <PressAwayOverlay active={controlsHost.openId !== null || p2Host.openId !== null} onPress={p2Host.close} style={p2ZoneStyle} />}

        {!showMetaInSharedBand && <CornerActionButtons onBack={() => router.back()} onSettings={() => setSettingsOpen(true)} fg={fg} insets={insets} />}

        {routeMode === 'twoPlayer' ? (
          <DualZoneLayout
            panelLayout={panelLayout}
            panelFadeStyle={panelFadeStyle}
            p1={p1Panel}
            p2={p2Panel}
            shared={sharedControls}
            // Without these, a popover escaping its own zone (e.g. the shared board dropdown
            // growing down into P1/P2's row below it) paints underneath whichever zone happens
            // to be the later DOM sibling, regardless of which one actually has something open —
            // see DualZoneLayout's own p1Elevated/p2Elevated/sharedElevated doc for the
            // stacking-context reason a zone can't just self-elevate the way
            // PlayerSetupPanel/LoadoutSharedControls already do internally. Same openId checks
            // those two components use for their own internal elevation, just re-run here for
            // the outer zone wrapper neither of them can reach on its own.
            p1Elevated={controlsHost.openId?.startsWith('p1-') ?? false}
            p2Elevated={p2Host.openId !== null}
            sharedElevated={sharedControlsPopoverOpen}
          />
        ) : (
          <View style={styles.stackedZone}>
            {sharedControls}
            <Animated.View style={[styles.playersRow, anyPlayerPickerOpen && styles.playersRowOpen, panelFadeStyle]}>
              {!isPortrait && panelLayout.p1OnRight ? p2Panel : p1Panel}
              {!isPortrait && panelLayout.p1OnRight ? p1Panel : p2Panel}
            </Animated.View>
            <ReadyButton color={p1Color} ready={ready[1]} onToggleReady={() => setReady((r) => ({ ...r, 1: !r[1] }))} style={anyPlayerPickerOpen && styles.readyButtonHidden} />
          </View>
        )}
      </FakeLandscapeView>

      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} rotation={rotation} />
    </View>
  )
}

const styles = StyleSheet.create({
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
  // Only used by 1 Player's stacked (non-rotated) layout above — 2 Player's own DualZoneLayout
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
  }
})
