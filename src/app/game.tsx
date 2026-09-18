import { useAutoPaperTheme } from '@rific/auto-paper'
import { IconButton, useVibration } from '@rific/feedback-press'
import { useToast } from '@rific/toaster'
import { broadcastDeviceUnlocks } from '@tastic/achievements'
import { computeContentBounds, FakeLandscapeView, getFixedZoneRotation, getViewRotation, rotateInsets, useOrientationState, useSettledWindowDimensions } from '@tastic/core'
import { computeGridSize } from '@tastic/grid'
import { ConfirmDialog, useQuitConfirmation } from '@tastic/hud'
import { needsSharedNeutralZone } from '@tastic/split-screen'
import { useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector } from 'react-redux'

import { GameOverDialog, type GameOverOutcome } from '@/components/GameOverDialog'
import KeyboardInputLayer from '@/components/KeyboardInputLayer'
import OnboardingOverlay from '@/components/OnboardingOverlay'
import { SettingsDialog } from '@/components/SettingsDialog'
import { SnakeBoard } from '@/components/SnakeBoard'
import { SnakePowerupHud } from '@/components/SnakePowerupHud'
import TouchInputLayer, { TouchInputMode } from '@/components/TouchInputLayer'
import { ACHIEVEMENT_TIER_COLORS } from '@/constants/achievements'
import { MAX_BOARD_CONTENT_WIDTH, SNAKE_CELL_PX, SNAKE_GAME_OVER_DIALOG_HOLD_MS, snakeDeathFadeMs } from '@/constants/snake'
import { useGameStats } from '@/hooks/useGameStats'
import { useProfiles } from '@/hooks/useProfiles'
import { useSnakeSounds } from '@/hooks/useSnakeSounds'
import { SnakeMode, useSnakeState } from '@/hooks/useSnakeState'
import { liveplayActions } from '@/redux/liveplaySlice'
import type { RootState } from '@/redux/store'
import { AchievementDefinition, Direction, GamePhase, SnakeId, SnakePowerupType, SnakeRoundSettings } from '@/types'
import { safeBack } from '@/utils/navigation'
import { DEFAULT_PROFILE_STATS } from '@/utils/statsValidation'

// A stable, referentially-constant all-zero insets object — see safeAreaInsetsPx's own comment
// below for why this is passed instead of the device's real insets whenever the board isn't
// actually bleeding under them.
const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 }

export default function GameScreen() {
  const params = useLocalSearchParams<{ mode?: string | string[]; p1Color?: string | string[]; p2Color?: string | string[] }>()
  // Safe fallback to solo — a direct deep-link, a stale/incoming param shape, or a missing param
  // never crashes into an unknown mode, it just plays the simplest one.
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode
  const mode: SnakeMode = rawMode === 'vsCpu' || rawMode === 'twoPlayer' ? rawMode : 'solo'

  // Only ever present coming from /loadout (Vs CPU/2 Player) — Solo skips that screen entirely and
  // falls through to createInitialSnakeState's own SNAKE_COLORS defaults (see useSnakeState.ts).
  const rawP1Color = Array.isArray(params.p1Color) ? params.p1Color[0] : params.p1Color
  const rawP2Color = Array.isArray(params.p2Color) ? params.p2Color[0] : params.p2Color
  const colors = useMemo(() => (rawP1Color || rawP2Color ? { 1: rawP1Color, 2: rawP2Color } : undefined), [rawP1Color, rawP2Color])

  const { width, height } = useSettledWindowDimensions()
  const fullScreen = useSelector((state: RootState) => state.game.fullScreen)
  const lockOrientation = useSelector((state: RootState) => state.game.lockOrientation)
  // Resolved once here (not inside the computeGridSize useMemo below) since designWidth/
  // designHeight and the cellPx prop passed to SnakeBoard both need the same resolved pixel size
  // too — see constants/snake.ts's own SNAKE_CELL_PX comment for what each tier actually means.
  const gridSizeTier = useSelector((state: RootState) => state.game.gridSizeTier)
  const cellPx = SNAKE_CELL_PX[gridSizeTier]
  const insets = useSafeAreaInsets()
  const { gutterWidth } = computeContentBounds(width, MAX_BOARD_CONTENT_WIDTH)
  // The AVAILABLE width/height computeGridSize sizes the grid from — not just a visual crop applied
  // after the fact, so a wide desktop-web window genuinely gets a narrower board (fewer columns) and
  // a device's notch/status bar/home indicator genuinely gets a shorter one (fewer rows), instead of
  // a merely letterboxed view of a bigger one. Mirrors LightCycles' own Full Screen/extendIntoSafeArea
  // setting, which also governs the actual grid a round plays on, not just its on-screen presentation:
  // width loses both the desktop-web gutter and the left/right safe-area insets, height loses the
  // top/bottom safe-area insets. Both ignored entirely once fullScreen is on, same as LightCycles'
  // extendIntoSafeArea bypassing its own gutter+insets. Live (not frozen) — see boardScale's own
  // comment below for how a live availableWidth/availableHeight and a frozen state.grid stay
  // reconciled across a resize instead of fighting each other.
  const availableWidth = fullScreen ? width : width - insets.left - insets.right - 2 * gutterWidth
  const availableHeight = fullScreen ? height : height - insets.top - insets.bottom
  const grid = useMemo(() => computeGridSize(availableWidth, availableHeight, cellPx), [availableWidth, availableHeight, cellPx])

  const wrapEdges = useSelector((state: RootState) => state.game.wrapEdges)
  const speedTier = useSelector((state: RootState) => state.game.speedTier)
  const arenaVariant = useSelector((state: RootState) => state.game.arenaVariant)
  const enabledPowerups = useSelector((state: RootState) => state.game.enabledPowerups)
  // null only until a real vsCpu difficulty is first picked (see gameSlice.ts's own cpuDifficulty
  // comment) — 'normal' here is just a type-safe placeholder for solo/twoPlayer, which gate
  // useSnakeState/recordRoundOutcome away from ever actually reading this value.
  const cpuDifficulty = useSelector((state: RootState) => state.game.cpuDifficulty) ?? 'normal'
  const controlScheme = useSelector((state: RootState) => state.game.controlScheme)
  const { recordRoundOutcome, stats } = useGameStats()
  const { lastSelected } = useProfiles()
  const { success: showAchievementToast } = useToast()
  const dispatch = useDispatch()

  // Bundled once via useMemo — see types/index.ts's own SnakeRoundSettings comment for why this is
  // just a function-signature convenience over 4 already-read redux values, not a second persisted-
  // settings home. Memoized so useSnakeState's own retry/tick-loop callbacks (which depend on this
  // object's identity) don't churn every render — only when one of the underlying redux values
  // actually changes.
  const roundSettings: SnakeRoundSettings = useMemo(() => ({ wrapEdges, speedTier, arenaVariant, enabledPowerups }), [wrapEdges, speedTier, arenaVariant, enabledPowerups])

  // All-zero unless the board is actually bleeding under the real insets (fullScreen) — see
  // useSnakeState's own safeAreaInsetsPx comment for why: the non-fullScreen boardArea style below
  // already stops short of the inset on its own, so there's nothing left for food/a pickup to avoid.
  const safeAreaInsetsPx = fullScreen ? insets : ZERO_INSETS
  const { state, turn, activate, beginPlaying, retry, tickIntervalMs } = useSnakeState(grid, mode, roundSettings, cpuDifficulty, colors, cellPx, safeAreaInsetsPx)

  // useSnakeState's own outer phase (onboarding -> playing -> gameOver — see that hook's own
  // extensive comment on why this is a different, hook-layer phase from the pure engine's inner
  // state.phase) isn't part of what the hook returns; only state/turn/beginPlaying/retry/
  // tickIntervalMs are. Mirrored here instead: `localPhase` tracks exactly the same
  // onboarding<->playing transition the hook's own internal `phaseIntent` does, since both only
  // ever flip via the same two call sites (beginPlaying / retry) this screen already owns calling.
  // `state.phase` flipping to 'roundOver' (the engine's own one-way transition, driven by
  // tickSnake) still drives the rest exactly the way it does inside the hook.
  const [localPhase, setLocalPhase] = useState<'onboarding' | 'playing'>('onboarding')
  const phase: GamePhase = state.phase === 'roundOver' ? 'gameOver' : localPhase

  const handleBeginPlaying = useCallback(() => {
    beginPlaying()
    setLocalPhase('playing')
  }, [beginPlaying])

  const handleRetry = useCallback(() => {
    retry()
    setLocalPhase('onboarding')
  }, [retry])

  // Each seat's current (committed) heading, straight from game state — passed down to both
  // TouchInputLayer and KeyboardInputLayer so each can gate its own turn sound/haptic on
  // isEffectiveTurn, mirroring LightCycles' identical currentDirections memo (and identical prop on
  // its own TouchInputLayer/TouchInputLayer.web) in its own game.tsx exactly — the feedback itself
  // lives in the input layers there too, not here. 'up' is an arbitrary placeholder for a seat that
  // doesn't exist yet (solo's snake 2); neither input layer ever actually looks it up for a seat no
  // zone/key scheme is wired to.
  const currentDirections: Record<SnakeId, Direction> = useMemo(
    () => ({
      1: state.snakes.find((s) => s.id === 1)?.direction ?? 'up',
      2: state.snakes.find((s) => s.id === 2)?.direction ?? 'up'
    }),
    [state.snakes]
  )

  // Vs CPU: only the near/bottom zone (snake 1, the human) is ever wired to actually turn a
  // snake here — the far/top zone still renders (TouchInputLayer's 'dual' mode always mounts both
  // GestureDetectors, since it has no notion of which game mode is active) but any turn it
  // reports is dropped, since the CPU splice inside useSnakeState already drives snake 2's
  // pendingDirection every tick; wiring the far zone to `turn(2, ...)` too would have human input
  // and the CPU fighting over the same seat. 2 Player forwards both zones as-is. Solo only ever
  // receives snakeId 1 in the first place (TouchInputLayer's 'solo' mode has just one zone). See
  // useSnakeState.ts's own module comment for the full responsibility split this mirrors.
  const handleTurn = useCallback(
    (snakeId: SnakeId, direction: Direction) => {
      if (mode === 'vsCpu' && snakeId !== 1) return
      turn(snakeId, direction)
    },
    [mode, turn]
  )

  // Hoisted above handleActivate (which needs playActivate) — see the later, single-declaration
  // comment near playGameOver's own usage for what each function maps to.
  const { playGameOver, playActivate, playPickup } = useSnakeSounds()

  // Same vsCpu seat-gating as handleTurn above, for the identical reason: the CPU splice inside
  // useSnakeState already decides snake 2's own activation every tick, so a stray activate(2) from
  // the far zone's still-mounted (but unused) gesture must never reach it. Only plays the activate
  // sound for a MEANINGFUL activation (the seat actually had something held) — a bare tap with
  // nothing to use is silent, matching how a no-op activation already produces no visible effect.
  const handleActivate = useCallback(
    (snakeId: SnakeId) => {
      if (mode === 'vsCpu' && snakeId !== 1) return
      if (state.snakes.find((s) => s.id === snakeId)?.heldPowerup) playActivate()
      activate(snakeId)
    },
    [mode, activate, state.snakes, playActivate]
  )

  // Fires once per snake the instant its heldPowerup transitions from empty to held — a board-wide
  // pickup-collection event, unlike activation, so this fires for a CPU's own collection too, not
  // just a human's. Tracked via a ref (not state) purely to detect the null->non-null edge across
  // ticks; a fresh round's snakes all start back at heldPowerup: null, so this self-heals on retry
  // without needing an explicit reset (a stale 'held' snapshot from the previous round can never
  // itself read as a fresh pickup — only a transition INTO holding something does).
  const prevHeldPowerupRef = useRef<Partial<Record<SnakeId, SnakePowerupType | null>>>({})
  useEffect(() => {
    for (const snake of state.snakes) {
      if (!prevHeldPowerupRef.current[snake.id] && snake.heldPowerup) playPickup()
      prevHeldPowerupRef.current[snake.id] = snake.heldPowerup
    }
  }, [state.snakes, playPickup])

  // Whether each seat's own controls are currently Mesmerized (see types/index.ts's
  // SnakeControlEffect) — both input layers invert a mesmerized seat's resolved direction before
  // calling onTurn. `false` for a seat that doesn't exist yet (e.g. seat 2 in Solo) rather than
  // throwing on a missing lookup.
  const controlInverted: Record<SnakeId, boolean> = useMemo(
    () => ({
      1: state.snakes.find((s) => s.id === 1)?.effects.control?.type === 'mesmerize',
      2: state.snakes.find((s) => s.id === 2)?.effects.control?.type === 'mesmerize'
    }),
    [state.snakes]
  )

  const touchMode: TouchInputMode = mode === 'solo' ? 'solo' : 'dual'

  // Solo/Vs CPU: only seat 1 is human (Vs CPU's seat 2 is the CPU, driven by the splice inside
  // useSnakeState). 2 Player: both. KeyboardInputLayer's own web-only listener uses this to know
  // which seats' control schemes to even look up — mirrors touchMode's identical mode-based split
  // just above, as the seat list rather than a zone-layout mode.
  const humanPlayers: SnakeId[] = useMemo(() => (mode === 'twoPlayer' ? [1, 2] : [1]), [mode])

  // Snake 1 is always the human in every mode (solo's only snake, or Vs CPU's human seat); snake
  // 2 is the CPU in Vs CPU or the second human in 2 Player. See snakeEngine.ts's own spawn
  // convention and snakeAi.ts's CPU_SNAKE_ID for why seat 2 is always the non-primary one.
  const humanScore = state.snakes[0]?.score ?? 0
  const opponentScore = state.snakes[1]?.score

  // Mirrors BoxHockey's/AirHockey's/Pong's/LightCycles' identical onBackPress + ConfirmDialog
  // pair (rendered near SettingsDialog below): only interrupts with a "Quit Match?" confirmation
  // when there's an actual score to lose, so backing out of a still-scoreless round (onboarding,
  // or a round that ended 0-0) exits immediately instead of confirming nothing. Previously this
  // screen had no confirmation at all — its back button only ever showed during onboarding, where
  // this same zero-score case already made it a no-op. Now backed by @tastic/hud's shared
  // useQuitConfirmation — see that hook's own doc for why it owns only confirmVisible/requestBack/
  // cancelBack, not the ConfirmDialog JSX/copy itself.
  const { confirmVisible, requestBack, cancelBack } = useQuitConfirmation(() => humanScore > 0 || (opponentScore ?? 0) > 0, safeBack)

  // What actually gets persisted as "the" high score for this mode: Solo/Vs CPU track snake 1's
  // own score only (a strong CPU run in Vs CPU shouldn't inflate "your" high score); 2 Player
  // tracks whichever of the two human seats actually scored higher this round, since both are
  // equally "you" on a shared local device.
  const recordedScore = useMemo(() => (mode === 'twoPlayer' ? Math.max(humanScore, opponentScore ?? 0) : humanScore), [mode, humanScore, opponentScore])

  // Snake 1's own profile-scoped stats bucket — GameOverDialog's "BEST" is always from this same
  // single viewer's perspective (see that file's header comment), so the number it beats should be
  // whichever profile actually sits in that seat, not a device-wide figure every profile shares.
  // Falls back to the device-wide bucket for guest play (no profile selected in seat 1), mirroring
  // how @tastic/achievements' own device-vs-profile scope split works.
  const viewerStats = lastSelected[1] ? (stats.profiles[lastSelected[1]] ?? DEFAULT_PROFILE_STATS) : stats

  // GameOverDialog wants a win/loss/draw framing from snake 1's own perspective ('YOU'/'OPPONENT'
  // in its own copy — see that file's header comment on why there's no per-seat split even in
  // 2 Player), not the engine's own {type,winnerId} RoundOutcome shape. Solo has no outcome at
  // all (undefined renders the plain score framing instead).
  const gameOverOutcome: GameOverOutcome | undefined = useMemo(() => {
    if (mode === 'solo' || !state.outcome) return undefined
    if (state.outcome.type === 'draw') return 'draw'
    return state.outcome.winnerId === 1 ? 'win' : 'loss'
  }, [mode, state.outcome])

  // Records stats/achievements exactly once per round, on the onboarding/playing -> gameOver
  // transition. hasRecordedRef (not just the phase check alone) guards against a second dispatch
  // from an unrelated re-render while still in 'gameOver'; it resets the instant the round leaves
  // 'gameOver' (via handleRetry above) so the next round's own transition can fire again.
  // isNewHighScore is captured once at that same instant (compared against the pre-update
  // `viewerStats`) rather than derived live every render, so it can't flip from true to false the
  // moment recordRoundOutcome below actually lands.
  const hasRecordedRef = useRef(false)
  const [isNewHighScore, setIsNewHighScore] = useState(false)
  // 2 Player only — seat -> whatever that seat's own profile newly unlocked this round, read by
  // GameOverDialog to show each seat's own achievements alongside the score it already displays
  // (see that component's own achievementUnlocks comment for why: seat 2 sits rotated 180° from
  // seat 1 in this screen's face-to-face layout, so a shared, screen-fixed showAchievementToast
  // below it is only ever right-side-up for whoever's seat 1). Always overwritten every round, even
  // to {}, same as LightCycles' identical profileUnlockToast — GameOverDialog stays on screen far
  // longer than a toast's own auto-dismiss, so a stale badge from the previous round can't rely on
  // that to clear itself.
  const [achievementUnlocks, setAchievementUnlocks] = useState<Partial<Record<SnakeId, AchievementDefinition[]>>>({})

  useEffect(() => {
    if (phase !== 'gameOver') {
      hasRecordedRef.current = false
      return
    }
    if (hasRecordedRef.current) return
    hasRecordedRef.current = true

    setIsNewHighScore(recordedScore > viewerStats.byMode[mode].bestScore)

    // Solo carries no result: there's no opponent, so it stays out of the versus record entirely
    // (see utils/statsEngine.ts).
    const result = gameOverOutcome ?? null
    // peakLength, not live body.length — a Constrict can shrink a body mid-round (see types/index.ts's
    // own SnakeEntity.peakLength comment), and this stat should credit the high-water mark a snake
    // actually reached, not whatever it happened to shrink back down to before dying.
    const snakeLength = Math.max(...state.snakes.map((snake) => snake.peakLength), 0)
    // Only seats a human actually drives contribute a profile: snake 2 is the CPU in Vs CPU, and
    // doesn't exist at all in Solo, so neither can carry one. Seat-keyed (not a flattened list) so
    // recordRoundOutcome can hand unlocks back split by seat below — see its own
    // RecordRoundOutcomeContext.profileIds comment for why that association has to survive the call.
    const humanSeats: SnakeId[] = mode === 'twoPlayer' ? [1, 2] : [1]
    const profileIds: Partial<Record<SnakeId, string>> = {}
    humanSeats.forEach((seat) => {
      const profileId = lastSelected[seat]
      if (profileId) profileIds[seat] = profileId
    })
    const unlocked = recordRoundOutcome({ mode, score: recordedScore, snakeLength, result }, { cpuDifficulty, profileIds })

    // Both seats are human and physically opposite each other in 2 Player — broadcast device-wide
    // unlocks (no seat owner of their own) into BOTH seats' lists, same as LightCycles' identical
    // broadcast, so GameOverDialog's per-seat rows show them regardless of which seat is "YOU".
    // Solo/Vs CPU never populate this (see achievementUnlocks' own comment above). Now shared via
    // @tastic/achievements' own broadcastDeviceUnlocks — note this changes the "nothing unlocked"
    // shape from {1:[],2:[]} to {}, behaviorally identical at GameOverDialog's own read site
    // ((achievementUnlocks[seat] ?? []).map(...) and the summed .length check).
    const seatUnlocks: Partial<Record<SnakeId, AchievementDefinition[]>> = mode === 'twoPlayer' ? broadcastDeviceUnlocks([1, 2] as SnakeId[], unlocked.profiles, unlocked.device) : {}
    setAchievementUnlocks(seatUnlocks)

    // Solo/Vs CPU: only ever one human perspective to address (Solo has no seat 2 at all; Vs CPU's
    // seat 2 is the CPU and never earns a profile unlock of its own), so the existing screen-fixed
    // toast is already always right-side-up for whoever's looking — no reason to route these into
    // the dialog too.
    if (mode !== 'twoPlayer') {
      const merged = [...unlocked.device, ...(unlocked.profiles[1] ?? [])]
      merged.forEach((achievement) => {
        showAchievementToast(achievement.title, 'Achievement unlocked', undefined, { color: ACHIEVEMENT_TIER_COLORS[achievement.tier], icon: achievement.icon })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- state.snakes is read once per gameOver entry, matching the roundOver effect below; adding it would re-run this on every tick.
  }, [phase, mode, recordedScore, viewerStats, gameOverOutcome, cpuDifficulty, lastSelected, recordRoundOutcome, showAchievementToast])

  // Crash sound + haptic — fires once, the instant the engine's own state.phase (not the derived,
  // onboarding-aware `phase` above) flips into 'roundOver', mirroring LightCycles' own immediate
  // crash sound+haptic (game.tsx there fires on the identical transition, independent of any dialog
  // delay). useSnakeSounds/useVibration each already gate themselves on the user's own sound/haptics
  // settings, so no extra enabled-check is needed here. playGameOver itself comes from the single
  // useSnakeSounds() call hoisted up near handleActivate above.
  const { notification } = useVibration()
  const hasFiredCrashFeedbackRef = useRef(false)

  useEffect(() => {
    if (state.phase !== 'roundOver') {
      hasFiredCrashFeedbackRef.current = false
      return
    }
    if (hasFiredCrashFeedbackRef.current) return
    hasFiredCrashFeedbackRef.current = true
    playGameOver()
    notification()
  }, [state.phase, playGameOver, notification])

  // Gates GameOverDialog's own visibility behind the death-fade ceremony (see SnakeBoardCanvas.tsx's
  // own per-snake deathProgress animation) rather than showing it the instant phase flips —
  // mirrors LightCycles' identical showResultDialog effect. Reads state.snakes once per
  // 'roundOver' entry rather than as a dependency: a dead snake's body/alive never changes again
  // for the rest of the round, so there's nothing to go stale. Math.max across every dead snake
  // (not just the first) is what makes a simultaneous double-death in 2P/Vs CPU wait for whichever
  // fade takes longer, rather than revealing the dialog over a still-fading loser.
  const [showGameOverDialog, setShowGameOverDialog] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Same condition GameActionChips' own showBack/showSettings use below.
  const controlsVisible = phase === 'onboarding' || (phase === 'gameOver' && showGameOverDialog)

  // Mirrors phase === 'playing' into Redux (liveplaySlice — see its own doc) rather than calling
  // @tastic/edge-guard's useEdgeGestureGuard directly here: that hook stays mounted once at the app
  // root (Providers.tsx's EdgeGuardBridge), same as every other cross-cutting settings bridge in
  // this app (FeedbackBridge, ScrollViewBridge) — this just reports the one signal that bridge has
  // no other way to read. Reset to false on unmount too, so leaving this screen mid-round by any
  // path (not just the in-app back button) can't leave Edge Guard stuck on.
  useEffect(() => {
    dispatch(liveplayActions.setActivelyPlaying(phase === 'playing'))
    return () => {
      dispatch(liveplayActions.setActivelyPlaying(false))
    }
  }, [phase, dispatch])

  // SettingsDialog and GameOverDialog are both a single centered card with no second seat's zone to
  // stay neutral for (see each one's own doc) — getViewRotation, not getFixedZoneRotation, so a
  // portrait upside-down hold repositions/flips them too instead of being silently ignored, same as
  // index.tsx's own identical rotation for its title-screen dialog. lockOrientation-aware (unlike
  // GameActionChips' own neutral-zone rotation below, which has no lock concept of its own): a
  // second, independent subscription rather than a shared one, since GameActionChips computes its
  // own orientation reading internally and doesn't receive one as a prop.
  const { orientationMode: overlayOrientationMode, p1OnRight: overlayP1OnRight, upsideDown: overlayUpsideDown } = useOrientationState(lockOrientation)
  const overlayRotation = getViewRotation(overlayOrientationMode, overlayP1OnRight, overlayUpsideDown)

  useEffect(() => {
    if (state.phase !== 'roundOver') return undefined
    const deadSnakes = state.snakes.filter((s) => !s.alive)
    const fadeMs = deadSnakes.length > 0 ? Math.max(...deadSnakes.map((s) => snakeDeathFadeMs(s.body.length))) : 0
    const timer = setTimeout(() => setShowGameOverDialog(true), fadeMs + SNAKE_GAME_OVER_DIALOG_HOLD_MS)
    return () => {
      clearTimeout(timer)
      setShowGameOverDialog(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- state.snakes intentionally read once per roundOver entry, not tracked as a dep; see comment above.
  }, [state.phase])

  const { dark } = useAutoPaperTheme()
  const bg = dark ? '#000000' : '#FFFFFF'
  const fgMuted = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'

  // state.grid is already the round's own frozen design resolution — createInitialSnakeState only
  // ever runs again on retry (see useSnakeState.ts), so every snake body/food coordinate laid down
  // this round is already committed to state.grid's own cols/rows and can't safely be rederived from
  // a live resize without invalidating them, exactly like LightCycles' analogous grid. Unlike
  // LightCycles, though, nothing here used to freeze the PRESENTATION to match: SnakeBoardCanvas's
  // <Canvas> is a bare StyleSheet.absoluteFill, so it (and TouchInputLayer, also absoluteFill)
  // stretched to whatever styles.root's live size happened to be on every render, while the actual
  // drawn cells stayed pinned to state.grid's own frozen pixel footprint — on a resize after a round
  // already started, the board would silently stop filling (or overflow) its own canvas instead of
  // visibly growing/shrinking with the window. designWidth/designHeight below are that frozen
  // footprint made explicit; boardScale — the same live-size-over-design-size transform LightCycles'
  // GameRound uses, and safe for the identical reason: TouchInputLayer's own zones are
  // percentage-of-parent/pan-translation based, not absolute-pixel — scales the board+touch subtree
  // below as one rigid unit to fit the live window, so it now visibly tracks a resize without state
  // (or state.grid's own cols/rows) ever needing to change. Compared against availableWidth/
  // availableHeight, not the raw window width/height, on purpose: both are already gutter/inset-
  // capped when fullScreen is off (see their own comment above), and designWidth/designHeight were
  // themselves computed from whatever availableWidth/availableHeight were at round start — comparing
  // against the SAME live, equally-capped quantities is what keeps a live resize honoring that cap
  // instead of scaling straight back up to the raw window and erasing it. Comparing against raw
  // `width`/`height` here would do exactly that: undo the gutter/inset the instant the window
  // resized (or a rotation changed the insets) even slightly, since scale-to-fit doesn't know a
  // gutter or inset was ever applied.
  const designWidth = state.grid.cols * cellPx
  const designHeight = state.grid.rows * cellPx
  const boardScale = Math.min(availableWidth / designWidth, availableHeight / designHeight)

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {/* Hidden only here, not on /loadout or the title screen — matches BoxHockey's/LightCycles'/
      AirHockey's identical per-screen override. Unconditional: hidden for the whole time a round
      is in progress, for full-screen immersion during actual play. Reverts to whatever
      _layout.tsx's own RotationAwareStatusBar says the instant this screen unmounts. */}
      <StatusBar hidden />
      {/* Explicit top/bottom/left/right edges from insets (not a flex-centered shrink within a
      full-bleed parent) so an asymmetric inset — a landscape notch/Dynamic Island sitting on just
      one side, for instance — still produces a genuinely safe rectangle instead of one that's
      merely the right SIZE but mis-centered relative to it. fullScreen swaps in boardAreaFullBleed,
      bleeding the board all the way to the physical screen edge instead. Mirrors LightCycles'
      identical boardArea/boardAreaFullBleed split. */}
      <View style={[styles.boardArea, fullScreen ? styles.boardAreaFullBleed : { top: insets.top, bottom: insets.bottom, left: insets.left + gutterWidth, right: insets.right + gutterWidth }]}>
        <View style={{ width: designWidth, height: designHeight, transform: [{ scale: boardScale }] }}>
          <SnakeBoard snakes={state.snakes} food={state.food} obstacles={state.obstacles} portals={state.portals} tunnels={state.tunnels} pickups={state.pickups} phase={state.phase} cellPx={cellPx} grid={state.grid} tick={state.tick} tickIntervalMs={tickIntervalMs} wrapEdges={wrapEdges} onboarding={phase === 'onboarding'} />
          <TouchInputLayer mode={touchMode} enabled={phase === 'playing'} onTurn={handleTurn} onActivate={handleActivate} controlInverted={controlInverted} currentDirections={currentDirections} />
          {enabledPowerups.length > 0 && <SnakePowerupHud snakes={state.snakes} />}
        </View>
      </View>
      <KeyboardInputLayer enabled={phase === 'playing'} humanPlayers={humanPlayers} controlScheme={controlScheme} onTurn={handleTurn} onActivate={handleActivate} controlInverted={controlInverted} currentDirections={currentDirections} />

      {phase === 'onboarding' && state.snakes[0] && <OnboardingOverlay onComplete={handleBeginPlaying} humanPlayers={humanPlayers} colors={state.snakes[1] ? { snake1: state.snakes[0].color, snake2: state.snakes[1].color } : { snake1: state.snakes[0].color }} lockOrientation={lockOrientation} />}

      {phase === 'gameOver' && showGameOverDialog && <GameOverDialog score={humanScore} highScore={Math.max(viewerStats.byMode[mode].bestScore, recordedScore)} isNewHighScore={isNewHighScore} onRetry={handleRetry} onHome={safeBack} outcome={gameOverOutcome} opponentScore={mode !== 'solo' ? opponentScore : undefined} achievementUnlocks={mode === 'twoPlayer' ? achievementUnlocks : undefined} rotation={overlayRotation} />}

      {/* Kept as its own sibling of the board/gesture tree above, mirroring LightCycles'/BoxHockey's
      identically-motivated MatchOverlays split — this live tilt subscription's re-renders should
      never cascade into the board/touch-input subtree. showBack now matches showSettings' own
      gameOver gating (previously back-only during onboarding) — matches BoxHockey's/AirHockey's/
      Pong's identical always-available back button, so there's a consistent way out of a finished
      round beyond GameOverDialog's own Home button. */}
      <GameActionChips showBack={controlsVisible} showSettings={controlsVisible} onBack={requestBack} onSettings={() => setSettingsOpen(true)} humanPlayerCount={humanPlayers.length} lockOrientation={lockOrientation} />
      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} rotation={overlayRotation} />

      {/* Fleet-shared @tastic/hud ConfirmDialog, matching BoxHockey's/AirHockey's/LightCycles'/
      Pong's identical "Quit Match?" prompt — see onBackPress's own comment above for why it's
      gated on there being an actual score to lose. Solo gets its own score-only message (no
      opponent to show a "–" pairing against); vsCpu/twoPlayer show both scores in each snake's own
      color, same colored-segment convention the other apps use. */}
      <ConfirmDialog
        visible={confirmVisible}
        title='Quit Match?'
        message={
          mode === 'solo' ? (
            <Text style={{ color: state.snakes[0]?.color ?? fgMuted }}>Score: {humanScore}</Text>
          ) : (
            <>
              <Text style={{ color: state.snakes[0]?.color ?? fgMuted }}>{humanScore}</Text>
              <Text style={{ color: fgMuted }}> – </Text>
              <Text style={{ color: state.snakes[1]?.color ?? fgMuted }}>{opponentScore ?? 0}</Text>
            </>
          )
        }
        confirmLabel='Quit'
        cancelLabel='Cancel'
        icon='alert-circle-outline'
        destructive={false}
        onConfirm={safeBack}
        onCancel={cancelBack}
        rotation={overlayRotation}
      />
    </View>
  )
}

interface GameActionChipsProps {
  showBack: boolean
  showSettings: boolean
  onBack: () => void
  onSettings: () => void
  // Solo and vsCpu both report a single human regardless of live orientationMode — see
  // needsSharedNeutralZone's own doc for why that (not bare orientationMode) is what actually
  // decides whether the neutral slot is needed.
  humanPlayerCount: number
  // Only consulted in the non-neutral (corner) branch below, for FakeLandscapeView's own `locked`
  // — the neutral branch has no lock concept of its own (see its own comment) and stays unlocked.
  lockOrientation: boolean
}

// Back/settings chips. Two structurally different layouts, not just two positions:
//
// Shared neutral zone (needsSharedNeutralZone — 2 human players, face-to-face): both players read
// this same pair of chips from opposite sides of the device, so they sit on whichever dividing line
// is actually live right now rather than a fixed corner — unlike LightCycles'/BoxHockey's boards
// (always face-to-face, so the wall/midline is always horizontal), Snake's board genuinely supports
// both face-to-face AND side-by-side (see TouchInputLayer.tsx/OnboardingOverlay.tsx's own zone
// splits, both of which switch on the same live orientationMode) — but needsSharedNeutralZone is
// only ever true for face-to-face (side-by-side already gives each seat its own dedicated half, see
// its own doc), so the neutral line itself is always the horizontal seam OnboardingOverlay's
// zoneTop/zoneBottom split already establishes; edgeSlotVertical (full height, fixed left/right edge,
// vertically centered) lands exactly on it. Each chip only ever rotates its own glyph in place here
// (getFixedZoneRotation, unlocked) — repositioning it under a live tilt would put it inside whichever
// seat's zone is now upside-down to the OTHER seat instead of staying neutral, the same reason
// BoxHockey's board-anchored buttons never move either.
//
// Corner layout (solo, vsCpu, or 2P side-by-side — no second seat's zone to protect): the same
// top-left/top-right corners every other screen in the fleet uses (see index.tsx's trophy/settings
// buttons), wrapped in FakeLandscapeView so the pair actually MOVES to wherever "top" visually is
// right now — including a portrait upside-down hold, which the neutral branch's fixed-zone rotation
// deliberately ignores — rather than just spinning in place while staying glued to the device's fixed
// physical top edge. lockOrientation-aware, unlike the neutral branch: there's only one seat (or two
// seats who already agree on which way is "up"), so freezing it in place while a match is in progress
// is a real, sensible request in a way it isn't for the neutral branch's protected 2-seat zone.
function GameActionChips({ showBack, showSettings, onBack, onSettings, humanPlayerCount, lockOrientation }: GameActionChipsProps) {
  const { orientationMode, p1OnRight, upsideDown } = useOrientationState()
  const { orientationMode: cornerOrientationMode, p1OnRight: cornerP1OnRight, upsideDown: cornerUpsideDown } = useOrientationState(lockOrientation)
  const insets = useSafeAreaInsets()
  const { dark } = useAutoPaperTheme()
  const fg = dark ? '#FFFFFF' : '#000000'
  const chipBg = dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)'

  if (!showBack && !showSettings) return null

  const neutral = needsSharedNeutralZone(orientationMode, humanPlayerCount)

  if (neutral) {
    const rotation = getFixedZoneRotation(orientationMode, p1OnRight, upsideDown)
    const chipRotation = rotation % 360 !== 0 ? { transform: [{ rotate: `${rotation}deg` }] } : undefined
    const backSlot = [styles.edgeSlotVertical, { left: insets.left }]
    const settingsSlot = [styles.edgeSlotVertical, { right: insets.right }]
    return (
      <>
        {showBack && (
          <View style={backSlot}>
            <IconButton icon='arrow-left' iconColor={fg} containerColor={chipBg} style={[styles.chipButton, chipRotation]} size={24} onPress={onBack} />
          </View>
        )}
        {showSettings && (
          <View style={settingsSlot}>
            <IconButton icon='cog' iconColor={fg} containerColor={chipBg} style={[styles.chipButton, chipRotation]} size={24} onPress={onSettings} accessibilityLabel='Settings' />
          </View>
        )}
      </>
    )
  }

  const cornerRotation = getViewRotation(cornerOrientationMode, cornerP1OnRight, cornerUpsideDown)
  const cornerInsets = rotateInsets(insets, cornerRotation)

  return (
    <FakeLandscapeView locked={lockOrientation} style={[StyleSheet.absoluteFill, styles.cornerChipsWrap]}>
      {showBack && (
        <View style={[styles.cornerSlot, { top: 8 + cornerInsets.top, left: 8 + cornerInsets.left }]}>
          <IconButton icon='arrow-left' iconColor={fg} containerColor={chipBg} style={styles.chipButton} size={24} onPress={onBack} />
        </View>
      )}
      {showSettings && (
        <View style={[styles.cornerSlot, { top: 8 + cornerInsets.top, right: 8 + cornerInsets.right }]}>
          <IconButton icon='cog' iconColor={fg} containerColor={chipBg} style={styles.chipButton} size={24} onPress={onSettings} accessibilityLabel='Settings' />
        </View>
      )}
    </FakeLandscapeView>
  )
}

const styles = StyleSheet.create({
  // See the boardArea View's own comment at its call site for what these two are switching between.
  boardArea: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'absolute' },
  boardAreaFullBleed: { bottom: 0, left: 0, right: 0, top: 0 },
  chipButton: { margin: 0 },
  // box-none: this full-bleed wrapper only exists to give FakeLandscapeView something to rotate —
  // it must never itself swallow the board's own touches in the (mostly empty) space between the
  // two corner slots below.
  cornerChipsWrap: { pointerEvents: 'box-none' },
  cornerSlot: { position: 'absolute' },
  // Face-to-face: full screen height at a fixed left/right edge, button centered vertically via
  // justifyContent — lands exactly on the horizontal 50/50 zone split (see OnboardingOverlay's own
  // zoneTop/zoneBottom), the one strip of the board neither snake's own zone claims.
  edgeSlotVertical: { alignItems: 'center', bottom: 0, justifyContent: 'center', position: 'absolute', top: 0 },
  // alignItems/justifyContent center the design-resolution board+touch View (see boardScale's own
  // comment) inside root's live bounds. Every other direct child here (KeyboardInputLayer,
  // OnboardingOverlay, GameOverDialog, GameActionChips, SettingsDialog) positions itself via
  // StyleSheet.absoluteFill or explicit position:'absolute' styles of its own, so centering root
  // has no effect on any of them — only the board's normal-flow scaled View actually gets centered.
  root: { alignItems: 'center', flex: 1, justifyContent: 'center' }
})
