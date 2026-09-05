import { useAutoPaperTheme } from '@rific/auto-paper'
import { IconButton, useVibration } from '@rific/feedback-press'
import { useToast } from '@rific/toaster'
import { computeContentBounds } from '@tastic/core'
import { getFixedZoneRotation, needsSharedNeutralZone, useAccelerometerOrientation } from '@tastic/split-screen'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
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
import { gameActions } from '@/redux/gameSlice'
import type { RootState } from '@/redux/store'
import { Direction, GamePhase, SnakeId, SnakePowerupType, SnakeRoundSettings } from '@/types'
import { computeGridSize } from '@/utils/grid'

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

  const { width, height } = useWindowDimensions()
  const fullScreen = useSelector((state: RootState) => state.game.fullScreen)
  const { gutterWidth } = computeContentBounds(width, MAX_BOARD_CONTENT_WIDTH)
  // The AVAILABLE width computeGridSize sizes the grid from — not just a visual crop applied after
  // the fact, so a wide desktop-web window genuinely gets a narrower board (fewer columns) instead
  // of a merely letterboxed view of a wider one. Mirrors LightCycles' own Full Screen setting, which
  // also governs the actual grid a round plays on, not just its on-screen presentation. Ignored
  // entirely once fullScreen is on, same as LightCycles' extendIntoSafeArea bypassing its own
  // gutter. Live (not frozen) — see boardScale's own comment below for how a live availableWidth and
  // a frozen state.grid stay reconciled across a resize instead of fighting each other.
  const availableWidth = fullScreen ? width : width - 2 * gutterWidth
  const grid = useMemo(() => computeGridSize(availableWidth, height, SNAKE_CELL_PX), [availableWidth, height])

  const wrapEdges = useSelector((state: RootState) => state.game.wrapEdges)
  const speedTier = useSelector((state: RootState) => state.game.speedTier)
  const arenaVariant = useSelector((state: RootState) => state.game.arenaVariant)
  const enabledPowerups = useSelector((state: RootState) => state.game.enabledPowerups)
  // null only until a real vsCpu difficulty is first picked (see gameSlice.ts's own cpuDifficulty
  // comment) — 'normal' here is just a type-safe placeholder for solo/twoPlayer, which gate
  // useSnakeState/recordRoundOutcome away from ever actually reading this value.
  const cpuDifficulty = useSelector((state: RootState) => state.game.cpuDifficulty) ?? 'normal'
  const controlScheme = useSelector((state: RootState) => state.game.controlScheme)
  const { recordRoundOutcome } = useGameStats()
  const { lastSelected } = useProfiles()
  const { success: showAchievementToast } = useToast()
  const highScores = useSelector((state: RootState) => state.game.highScore)
  const dispatch = useDispatch()

  // Bundled once via useMemo — see types/index.ts's own SnakeRoundSettings comment for why this is
  // just a function-signature convenience over 4 already-read redux values, not a second persisted-
  // settings home. Memoized so useSnakeState's own retry/tick-loop callbacks (which depend on this
  // object's identity) don't churn every render — only when one of the underlying redux values
  // actually changes.
  const roundSettings: SnakeRoundSettings = useMemo(() => ({ wrapEdges, speedTier, arenaVariant, enabledPowerups }), [wrapEdges, speedTier, arenaVariant, enabledPowerups])

  const { state, turn, activate, beginPlaying, retry, tickIntervalMs } = useSnakeState(grid, mode, roundSettings, cpuDifficulty, colors)

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

  const handleHome = useCallback(() => {
    router.replace('/')
  }, [])

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
  // What actually gets persisted as "the" high score for this mode: Solo/Vs CPU track snake 1's
  // own score only (a strong CPU run in Vs CPU shouldn't inflate "your" high score); 2 Player
  // tracks whichever of the two human seats actually scored higher this round, since both are
  // equally "you" on a shared local device.
  const recordedScore = useMemo(() => (mode === 'twoPlayer' ? Math.max(humanScore, opponentScore ?? 0) : humanScore), [mode, humanScore, opponentScore])

  // GameOverDialog wants a win/loss/draw framing from snake 1's own perspective ('YOU'/'OPPONENT'
  // in its own copy — see that file's header comment on why there's no per-seat split even in
  // 2 Player), not the engine's own {type,winnerId} RoundOutcome shape. Solo has no outcome at
  // all (undefined renders the plain score framing instead).
  const gameOverOutcome: GameOverOutcome | undefined = useMemo(() => {
    if (mode === 'solo' || !state.outcome) return undefined
    if (state.outcome.type === 'draw') return 'draw'
    return state.outcome.winnerId === 1 ? 'win' : 'loss'
  }, [mode, state.outcome])

  // Records the per-mode high score exactly once per round, on the onboarding/playing ->
  // gameOver transition. hasRecordedRef (not just the phase check alone) guards against a second
  // dispatch from an unrelated re-render while still in 'gameOver'; it resets the instant the
  // round leaves 'gameOver' (via handleRetry above) so the next round's own transition can fire
  // again. isNewHighScore is captured once at that same instant (compared against the pre-dispatch
  // `highScores[mode]`) rather than derived live every render, so it can't flip from true to false
  // the moment the dispatch below actually lands.
  const hasRecordedRef = useRef(false)
  const [isNewHighScore, setIsNewHighScore] = useState(false)

  useEffect(() => {
    if (phase !== 'gameOver') {
      hasRecordedRef.current = false
      return
    }
    if (hasRecordedRef.current) return
    hasRecordedRef.current = true

    setIsNewHighScore(recordedScore > highScores[mode])
    dispatch(gameActions.setHighScore({ mode, score: recordedScore }))

    // Stats/achievements ride the same single-fire transition as the high score above, so the two
    // records can never disagree about what happened this round. Solo carries no result: there's
    // no opponent, so it stays out of the versus record entirely (see utils/statsEngine.ts).
    const result = gameOverOutcome ?? null
    // peakLength, not live body.length — a Constrict can shrink a body mid-round (see types/index.ts's
    // own SnakeEntity.peakLength comment), and this stat should credit the high-water mark a snake
    // actually reached, not whatever it happened to shrink back down to before dying.
    const snakeLength = Math.max(...state.snakes.map((snake) => snake.peakLength), 0)
    // Only seats a human actually drives contribute a profile: snake 2 is the CPU in Vs CPU, and
    // doesn't exist at all in Solo, so neither can carry one.
    const humanSeats: SnakeId[] = mode === 'twoPlayer' ? [1, 2] : [1]
    const profileIds = humanSeats.map((seat) => lastSelected[seat]).filter((id): id is string => id !== null)
    const unlocked = recordRoundOutcome({ mode, score: recordedScore, snakeLength, result }, { cpuDifficulty, profileIds })
    unlocked.forEach((achievement) => {
      showAchievementToast(achievement.title, 'Achievement unlocked', undefined, { color: ACHIEVEMENT_TIER_COLORS[achievement.tier], icon: achievement.icon })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- state.snakes is read once per gameOver entry, matching the roundOver effect below; adding it would re-run this on every tick.
  }, [phase, mode, recordedScore, highScores, dispatch, gameOverOutcome, cpuDifficulty, lastSelected, recordRoundOutcome, showAchievementToast])

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
  // (or state.grid's own cols/rows) ever needing to change. Compared against availableWidth, not the
  // raw window width, on purpose: availableWidth is already gutter-capped when fullScreen is off
  // (see its own comment above), and designWidth was itself computed from whatever availableWidth
  // was at round start — comparing against the SAME live, equally-capped quantity is what keeps a
  // live resize honoring that cap instead of scaling straight back up to the raw window and erasing
  // it. Comparing against raw `width` here would do exactly that: undo the gutter the instant the
  // window resized even slightly, since scale-to-fit doesn't know a gutter was ever applied.
  const designWidth = state.grid.cols * SNAKE_CELL_PX
  const designHeight = state.grid.rows * SNAKE_CELL_PX
  const boardScale = Math.min(availableWidth / designWidth, height / designHeight)

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View style={{ width: designWidth, height: designHeight, transform: [{ scale: boardScale }] }}>
        <SnakeBoard snakes={state.snakes} food={state.food} obstacles={state.obstacles} portals={state.portals} tunnels={state.tunnels} pickups={state.pickups} phase={state.phase} cellPx={SNAKE_CELL_PX} grid={state.grid} tick={state.tick} tickIntervalMs={tickIntervalMs} wrapEdges={wrapEdges} onboarding={phase === 'onboarding'} />
        <TouchInputLayer mode={touchMode} enabled={phase === 'playing'} onTurn={handleTurn} onActivate={handleActivate} controlInverted={controlInverted} />
        {enabledPowerups.length > 0 && <SnakePowerupHud snakes={state.snakes} />}
      </View>
      <KeyboardInputLayer enabled={phase === 'playing'} humanPlayers={humanPlayers} controlScheme={controlScheme} onTurn={handleTurn} onActivate={handleActivate} controlInverted={controlInverted} />

      {phase === 'onboarding' && state.snakes[0] && <OnboardingOverlay onComplete={handleBeginPlaying} humanPlayers={humanPlayers} colors={state.snakes[1] ? { snake1: state.snakes[0].color, snake2: state.snakes[1].color } : { snake1: state.snakes[0].color }} />}

      {phase === 'gameOver' && showGameOverDialog && <GameOverDialog score={humanScore} highScore={Math.max(highScores[mode], recordedScore)} isNewHighScore={isNewHighScore} onRetry={handleRetry} onHome={handleHome} outcome={gameOverOutcome} opponentScore={mode !== 'solo' ? opponentScore : undefined} />}

      {/* Kept as its own sibling of the board/gesture tree above, mirroring LightCycles'/BoxHockey's
      identically-motivated MatchOverlays split — this live tilt subscription's re-renders should
      never cascade into the board/touch-input subtree. */}
      <GameActionChips showBack={phase === 'onboarding'} showSettings={phase === 'onboarding' || (phase === 'gameOver' && showGameOverDialog)} onBack={() => router.back()} onSettings={() => setSettingsOpen(true)} humanPlayerCount={humanPlayers.length} />
      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} />
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
}

// Back/settings chips, neutral-positioned on whichever dividing line is actually live right now —
// unlike LightCycles'/BoxHockey's boards (always face-to-face, so the wall/midline is always
// horizontal), Snake's board genuinely supports both face-to-face AND side-by-side (see
// TouchInputLayer.tsx/OnboardingOverlay.tsx's own zone splits, both of which switch on the same
// live orientationMode), so the neutral line itself flips between horizontal and vertical along
// with it. Mirrors OnboardingOverlay's own zoneTop/zoneBottom/zoneLeft/zoneRight 50/50 split
// exactly, so "neutral" here always means the same boundary that split already establishes — full-
// height (or full-width) edge slots with the button centered via justifyContent/alignItems land
// exactly on that boundary without needing to compute or track a pixel coordinate for it directly.
// Gated through needsSharedNeutralZone, not bare orientationMode === 'faceToFace' — solo/vsCpu play
// still reports 'faceToFace' whenever the phone is just lying flat, and with only one real player
// there's no far-side reader for the fixed default slot (edgeSlotHorizontal below) to be illegible
// to, so it should stay put rather than jumping to the neutral midline (see LightCycles' MatchOverlays'
// identical useCornerLayout gate for the same reasoning applied to its own corner-vs-neutral choice).
// Each chip also rotates in place via the same getFixedZoneRotation signal LightCycles'/BoxHockey's
// own chip buttons use, so it stays legible however the phone is physically being held.
function GameActionChips({ showBack, showSettings, onBack, onSettings, humanPlayerCount }: GameActionChipsProps) {
  const { orientationMode, p1OnRight, upsideDown } = useAccelerometerOrientation()
  const insets = useSafeAreaInsets()
  const { dark } = useAutoPaperTheme()
  const fg = dark ? '#FFFFFF' : '#000000'
  const chipBg = dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)'

  if (!showBack && !showSettings) return null

  const rotation = getFixedZoneRotation(orientationMode, p1OnRight, upsideDown)
  const chipRotation = rotation % 360 !== 0 ? { transform: [{ rotate: `${rotation}deg` }] } : undefined
  const neutral = needsSharedNeutralZone(orientationMode, humanPlayerCount)
  const backSlot = neutral ? [styles.edgeSlotVertical, { left: insets.left }] : [styles.edgeSlotHorizontal, { top: insets.top }]
  const settingsSlot = neutral ? [styles.edgeSlotVertical, { right: insets.right }] : [styles.edgeSlotHorizontal, { bottom: insets.bottom }]

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

const styles = StyleSheet.create({
  chipButton: { margin: 0 },
  // Side-by-side: full screen width at a fixed top/bottom edge, button centered horizontally via
  // alignItems — lands exactly on the vertical 50/50 zone split (see OnboardingOverlay's own
  // zoneLeft/zoneRight).
  edgeSlotHorizontal: { alignItems: 'center', justifyContent: 'center', left: 0, position: 'absolute', right: 0 },
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
