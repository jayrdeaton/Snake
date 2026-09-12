import { AchievementDefinition as BaseAchievementDefinition, DayStreakState, OutcomeRecord, RoundResult, WinStreakState } from '@tastic/achievements'
import type { GridCell, GridSize } from '@tastic/grid'
import { KeyScheme } from '@tastic/input'

import { SnakeMode } from '@/hooks/useSnakeState'
import { CpuDifficulty } from '@/utils/snakeAi'

export type { GridCell, GridSize }

// Fresh types for Snake's own engine — deliberately NOT shared with LightCycles. LightCycles'
// types are shaped around exactly-two-players-always (Record<Player, PlayerState>) and a trail
// that only ever grows, never shrinks; Snake genuinely has 1-or-2 simulated participants and a
// body that's a fixed-identity chain of cells (grow on eating, otherwise constant length), so it
// gets its own SnakeEntity/SnakeGameState shape rather than reusing GameState/PlayerState as-is.

export type Direction = 'up' | 'down' | 'left' | 'right'

// Per-round speed tier — mirrors LightCycles' SpeedTier exactly (see constants/snake.ts's
// SNAKE_SPEED_TIER_INTERVAL_MS). No speed-ramp equivalent: LightCycles itself keeps that toggle
// hidden in its own UI, so there's nothing live there worth porting.
export type SnakeSpeedTier = 'slow' | 'normal' | 'fast'

// Per-round cell pixel size — mirrors LightCycles' GridSizeTier. A tier picks a fixed cellPx (see
// constants/snake.ts's SNAKE_CELL_PX); computeGridSize then derives however many cols/rows actually
// fit the live screen from it, so this is never a fixed cell COUNT. Unlike LightCycles, tick
// interval is NOT rescaled per tier (see SNAKE_CELL_PX's own comment) — a 'small' round ticks at
// exactly the same cadence as 'large', it just moves fewer px per tick.
export type SnakeGridSizeTier = 'small' | 'medium' | 'large'

// Selectable static board layout for the round — mirrors LightCycles' ArenaVariant. 'open' is the
// original empty rectangle and stays the default everywhere a caller doesn't specify otherwise
// (see snakeEngine.ts's createInitialSnakeState). 'portals' and 'underpass' don't produce
// obstacles at all (see utils/arenas.ts's buildArenaObstacles) — their geometry lives on
// SnakeGameState.portals/.tunnels instead.
export type SnakeArenaVariant = 'open' | 'pillars' | 'gauntlet' | 'portals' | 'underpass'

// Mirrors LightCycles' PowerupType. Sidewind/Scales are self-targeted; Coldblood/Constrict/Mesmerize/
// Frenzy target the opponent, which is why solo mode (no opponent — see snakeEngine.ts's
// createInitialSnakeState) only ever spawns the first two regardless of the persisted setting.
export type SnakePowerupType = 'sidewind' | 'coldblood' | 'scales' | 'constrict' | 'mesmerize' | 'frenzy'

// KeyScheme (wasd/arrows/ijkl/numpad) is the shared, cross-app set of physical key layouts —
// extracted to @tastic/input so LightCycles/Pong/AirHockey/future games all read numpad support
// (and any future scheme) from one place instead of each hand-rolling its own. 'mouse' stays a
// Snake-local addition on top rather than joining KeyScheme itself: it covers both mouse-drag and
// touch-drag — the always-available TouchInputLayer swipe zone (see that file), which needs no
// scheme of its own since it isn't key-based — and @tastic/input has no opinion on non-key schemes
// (see that package's own KeyScheme doc). PlayerSetupPanel's takenValue still treats all five values
// as one mutually exclusive set, since Snake's two human seats can contend over the one physical
// mouse a desktop has, same as they contend over keyboard keys.
export type ControlScheme = KeyScheme | 'mouse'

// 1 = near/bottom spawn, 2 = far/top spawn — meaningful only when two snakes share the board (Vs
// CPU, 2 Player). A solo round is simply the one entry in a length-1 SnakeGameState.snakes.
export type SnakeId = 1 | 2

// One active effect per axis — a same-axis activation replaces whatever was already there rather
// than stacking (see snakeEngine.ts's applySnakePowerupActivation), mirroring LightCycles'
// PlayerEffects exactly. Different axes coexist independently. Constrict has no entry here at all —
// it's instant/one-shot, never an ongoing effect.
export interface SnakeSpeedEffect {
  type: 'sidewind' | 'coldblood' | 'frenzy'
  multiplier: 0 | 2
  // Absolute tick number this effect is in force through — see snakeEngine.ts's stepsForSnake/
  // expire. Computed once at activation as `state.tick + duration` and never mutated thereafter.
  expiresAtTick: number
}

export interface SnakeControlEffect {
  type: 'mesmerize'
  expiresAtTick: number
}

export interface SnakeShieldEffect {
  expiresAtTick: number
}

export interface SnakePlayerEffects {
  speed: SnakeSpeedEffect | null
  control: SnakeControlEffect | null
  shield: SnakeShieldEffect | null
}

export interface SnakePowerupPickup {
  id: string
  // Decided at spawn time, not collection — see SnakeBoardCanvas.tsx's Pickups layer, which
  // deliberately ignores this field and renders every live pickup identically, mystery-box style.
  // Only revealed once collected, in the holder's own HUD badge (SnakePowerupHud.tsx).
  type: SnakePowerupType
  cell: GridCell
}

// A linked pair of cells for the 'portals' arena (see utils/arenas.ts's buildArenaPortals) —
// stepping onto either one instantly redirects the mover to the other, continuing in the same
// direction, before any collision check runs (see snakeEngine.ts's tickSnake). Symmetric: `a` and
// `b` are interchangeable, neither is "the" entrance.
export interface SnakePortal {
  a: GridCell
  b: GridCell
}

// A short, straight corridor for the 'underpass' arena (see utils/arenas.ts's buildArenaTunnels),
// ordered mouth-to-mouth. Unlike LightCycles' identically-named Tunnel, this needs no hidden
// per-player occupancy layer: a snake's body is a vacating deque, not a permanent trail, so a
// corridor can never get permanently sealed by an earlier crossing the way LightCycles' trail-based
// one could. Snake's tunnel cells are instead simply exempt from body-collision checks entirely
// (both a snake's own body and the opponent's) — see snakeEngine.ts's tickSnake — while head-to-head
// and wall/out-of-bounds rules still apply normally, and the mouths are ordinary, fully-collidable
// cells.
export interface SnakeTunnel {
  cells: GridCell[]
}

export interface SnakeEntity {
  id: SnakeId
  // Ordered cells the snake currently occupies, oldest first — body[body.length - 1] is the head,
  // body[0] is the current tail. snakeEngine.ts's tickSnake relies on this exact convention for its
  // cross-snake tail-vacate rule (see its own comment).
  body: GridCell[]
  direction: Direction
  // A turn queued by input but not yet applied — consumed (and cleared) on the next tick, so a
  // swipe/CPU decision landing between ticks isn't dropped and can't apply more than one turn per
  // tick. Same role as LightCycles' PlayerState.pendingDirection.
  pendingDirection: Direction | null
  alive: boolean
  score: number
  color: string
  // The cell this snake actually attempted to move into on the tick it died — set once, in
  // tickSnake's death branch, and never touched again after. Populated for every death cause (wall,
  // self, other-snake body, head-to-head), including an out-of-bounds wall death whose true
  // destination has no `body` slot to land in — same role as LightCycles' PlayerState.crashCell.
  // Null while alive.
  crashCell: GridCell | null
  // Single-slot inventory — null when empty. Set on pickup collection, cleared on activation.
  heldPowerup: SnakePowerupType | null
  effects: SnakePlayerEffects
  // High-water mark of `body.length` across the whole round, updated every tick (see
  // snakeEngine.ts's tickSnake) — deliberately NOT the same as live `body.length` once Constrict can
  // shrink a body mid-round. game.tsx's own stats/achievement recording reads this (not live
  // body.length) for "longest snake this round", so a constrict-then-die run still credits the peak
  // it actually reached rather than whatever it shrank back down to. Rendering (death-fade
  // duration) intentionally keeps reading live body.length instead — an animation should scale to
  // the body that's actually fading, not its historical peak.
  peakLength: number
}

export type RoundOutcome = { type: 'win'; winnerId: SnakeId } | { type: 'draw' }

// Scoped to exactly the simulation's own two phases. The outer onboarding countdown / game-over
// dialog wrapper (see GamePhase below) is a `useSnakeState` (hook-layer) concern layered on top of
// this in a later phase, never a snakeEngine.ts concern.
export interface SnakeGameState {
  phase: 'playing' | 'roundOver'
  grid: GridSize
  // Length 1 (Solo) or 2 (Vs CPU / 2 Player) — see snakeEngine.ts's createInitialSnakeState. Every
  // pairwise rule (head-to-head, etc.) naturally does zero work when there's only one snake.
  snakes: SnakeEntity[]
  food: GridCell
  // Matches the persisted Settings preference of the same name exactly — false (the default) means
  // walls kill; true wraps a step off one edge back onto the opposite one.
  wrapEdges: boolean
  // Only ever populated when snakes.length === 2 — always null for solo, where the caller reads
  // game-over directly off snakes[0].alive/.score instead.
  outcome: RoundOutcome | null
  tick: number
  // Static per-round obstacle layout from the selected SnakeArenaVariant (see utils/arenas.ts's
  // buildArenaObstacles) — computed once in createInitialSnakeState and never mutated after.
  obstacles: GridCell[]
  // Static per-round portal pair(s) from the 'portals' SnakeArenaVariant (see utils/arenas.ts's
  // buildArenaPortals) — empty for every other variant. Computed once, never mutated after.
  portals: SnakePortal[]
  // Static per-round tunnel corridor from the 'underpass' SnakeArenaVariant (see utils/arenas.ts's
  // buildArenaTunnels) — empty for every other variant. Computed once, never mutated after.
  tunnels: SnakeTunnel[]
  // The EFFECTIVE spawn pool for this round — already solo-filtered down to just
  // sidewind/scales when snakes.length === 1 (see createInitialSnakeState), so the tick loop and
  // pickup-spawn logic never need mode-awareness of their own. Empty means powerups are off.
  enabledPowerups: SnakePowerupType[]
  // Board-wide, not per-snake — at most one entry at a time (see snakeEngine.ts's
  // maybeSpawnSnakePickup), so a linear scan is fine.
  pickups: SnakePowerupPickup[]
  // Cells inside the round's device safe-area margin (see snakeEngine.ts's buildUnsafeAreaCells) —
  // only non-empty when the round is bleeding under that margin (fullScreen; see the Settings
  // preference of the same name), since otherwise the board's own pixel container already stops
  // short of the inset and every cell is already clear of it. Food/pickups never spawn here (see
  // createInitialSnakeState/tickSnake) because a notch/Dynamic Island/home-indicator/speaker cutout
  // can physically hide them there — the board itself stays fully traversable, same as any other
  // cosmetically-obscured cell. Computed once in createInitialSnakeState and never mutated after,
  // same as `obstacles`.
  unsafeCells: GridCell[]
}

// Bundles the per-round settings useSnakeState/createInitialSnakeState need, rather than growing
// their own signatures to a long, error-prone positional-arg list as this feature set grows. Purely
// a function-signature convenience — the persisted source of truth stays redux/gameSlice.ts exactly
// as before (unlike LightCycles, which keeps a parallel AsyncStorage-backed GameSettings object;
// Snake deliberately consolidated away from that pattern — see gameSlice.ts's own comment).
export interface SnakeRoundSettings {
  wrapEdges: boolean
  speedTier: SnakeSpeedTier
  arenaVariant: SnakeArenaVariant
  enabledPowerups: SnakePowerupType[]
}

// The outer wrapper phase a later phase's `useSnakeState` hook layers on top of
// SnakeGameState.phase: 'onboarding' (pre-round countdown) and 'gameOver' (post-round dialog) are
// screen/hook concerns with no meaning inside the pure engine, so they get their own type here
// rather than widening SnakeGameState.phase itself.
export type GamePhase = 'onboarding' | 'playing' | 'gameOver'

// ─── Stats & achievements ───────────────────────────────────────────────────
export type { AchievementTier, UnlockedAchievementsState } from '@tastic/achievements'
export type AchievementDefinition = BaseAchievementDefinition<StatsState>

// Per mode. Solo has no opponent, so wins/losses live in `versus` below rather than here — every
// mode shares only "how many rounds, and how well did they score".
export interface SnakeModeStats {
  played: number
  bestScore: number
  totalScore: number
}

export interface ProfileStats extends DayStreakState {
  byMode: Record<SnakeMode, SnakeModeStats>
  // Win/loss/draw across the two competitive modes only. Solo rounds never touch this: there's
  // nobody to beat, so counting them as losses would quietly tank every win-rate an achievement
  // reads. A 2 Player round is recorded from snake 1's perspective, matching GameOverDialog.
  versus: OutcomeRecord
  versusStreak: WinStreakState
  byDifficulty: Record<CpuDifficulty, OutcomeRecord>
  // Longest single snake ever grown, any mode — the length the board actually ended at.
  longestSnake: number
}

export interface StatsState extends ProfileStats {
  profiles: Record<string, ProfileStats>
  // Set once, on the very first round ever recorded, from snake 1's perspective. Solo rounds
  // resolve as a draw here: there's no opponent, so neither 'win' nor 'loss' would be true.
  firstGameResult: RoundResult | null
}
