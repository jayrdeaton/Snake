import { SnakePowerupType, SnakeSpeedTier } from '@/types'

// Per-tier tick interval, mirroring LightCycles' SPEED_TIER_INTERVAL_MS. Unlike LightCycles, there
// is deliberately no speed-ramp table and no per-grid-size-tier scaling here (see
// scaleMsForCellPx/SPEED_RAMP_* there for what that looks like) — LightCycles itself keeps its own
// ramp toggle hidden in its UI, and Snake has no grid-size tiers to rescale against (SNAKE_CELL_PX
// below is fixed). useSnakeState.ts's rAF loop just compares elapsed dt against whichever of these
// three the round's persisted speedTier picked, every tick, for the life of a round. `normal`
// preserves this app's original fixed 110ms exactly, so a player who never touches the new setting
// sees no behavior change; `slow`/`fast` fan out from it using roughly LightCycles' own slow/normal
// and fast/normal ratios.
export const SNAKE_SPEED_TIER_INTERVAL_MS: Record<SnakeSpeedTier, number> = {
  slow: 150,
  normal: 110,
  fast: 80
}

// Classic Snake reads better at larger, chunkier cells than LightCycles' own board does (a
// snake-body-width block is the genre's visual identity) — intentionally chunkier than LightCycles'
// GRID_CELL_PX.medium (8px, see constants/game.ts there), not a rescaled/derived value.
export const SNAKE_CELL_PX = 18

// Caps the board's own width via @tastic/core's computeContentBounds (see game.tsx) whenever
// fullScreen is off — mirrors LightCycles' identical MAX_BOARD_CONTENT_WIDTH (same 1000px cap; no
// game-specific reason for Snake's own saturation point to differ, same reasoning as
// ONBOARDING_COUNTDOWN_STEP_MS above borrowing LightCycles' generic pacing). Real phones/tablets
// stay well under this and see gutterWidth === 0 either way; it only actually kicks in on a
// maximized desktop-web window, where nothing else stops the grid from growing into an unplayably
// wide board.
export const MAX_BOARD_CONTENT_WIDTH = 1000

// Onboarding countdown timing — identical values to LightCycles' constants/game.ts (generic UX
// pacing with no game-specific dependency, so there's no reason for Snake's own countdown to feel
// differently paced). "3"/"2"/"1" each held for ONBOARDING_COUNTDOWN_STEP_MS, "GO!" held for an
// extra ONBOARDING_GO_HOLD_MS on top of its own step, then the whole overlay fades out over
// ONBOARDING_FADE_MS before calling onComplete.
export const ONBOARDING_COUNTDOWN_STEP_MS = 700
export const ONBOARDING_GO_HOLD_MS = 500
export const ONBOARDING_FADE_MS = 300

// Death-ceremony timing — a dying snake's body fades tail-to-head over a duration scaled to its own
// length (a long, well-fed snake gets a more drawn-out fade than a freshly-spawned one), clamped to
// a sane range. Deliberately tighter than LightCycles' own deathAnimationDurationMs (6ms/cell,
// 250-1400ms) since Snake bodies are far shorter than a round-long LightCycles trail.
export const SNAKE_DEATH_FADE_MS_PER_CELL = 18
export const SNAKE_DEATH_FADE_MIN_MS = 320
export const SNAKE_DEATH_FADE_MAX_MS = 900
// Softness (in cells) of the sweeping wipe edge — how gradually a given point along the body
// crosses from fully opaque to fully transparent as the wipe front passes it, rather than an
// instant per-segment pop.
export const SNAKE_DEATH_FADE_BAND_CELLS = 1.5
// Extra pause after the slowest dying snake's fade finishes, before the game-over dialog appears —
// a brief beat once the board's already gone quiet, not instead of the fade itself.
export const SNAKE_GAME_OVER_DIALOG_HOLD_MS = 200

// Single source of truth for the fade's own duration — imported by both SnakeBoardCanvas.tsx (the
// actual withTiming driving the visual sweep) and game.tsx (the dialog-reveal setTimeout), so the
// two can never drift apart. Mirrors LightCycles' own deathAnimationDurationMs in spirit.
export function snakeDeathFadeMs(bodyLength: number): number {
  return Math.min(SNAKE_DEATH_FADE_MAX_MS, Math.max(SNAKE_DEATH_FADE_MIN_MS, bodyLength * SNAKE_DEATH_FADE_MS_PER_CELL))
}

// ─── Powerups ───────────────────────────────────────────────────────────────
// Tick-based (not ms) throughout, mirroring LightCycles' identical convention — real-world cadence
// then varies with speedTier the same way every other tick-denominated constant here does. Values
// reused verbatim from LightCycles' own tuning as a first pass — Snake's own tick is slower than
// LightCycles' at every tier, so the same tick-count lasts noticeably longer in wall-clock time;
// worth a playtest pass, not just a read of the numbers.
export const SNAKE_POWERUP_ALL_TYPES: SnakePowerupType[] = ['sidewind', 'coldblood', 'scales', 'constrict', 'mesmerize', 'frenzy']

// Ticks a timed activation remains in force. Constrict has no entry — it's instant/one-shot, never
// an ongoing effect (see types/index.ts's SnakePlayerEffects).
export const SNAKE_POWERUP_EFFECT_DURATION_TICKS: Record<'sidewind' | 'coldblood' | 'scales' | 'mesmerize' | 'frenzy', number> = {
  sidewind: 40,
  coldblood: 24,
  scales: 48,
  mesmerize: 32,
  frenzy: 32
}

// Cells advanced in one tickSnake sub-step loop for a boosted snake — Coldblood's 0 isn't a
// multiplier lookup, it's "skip movement entirely," handled as its own case in snakeEngine.ts's
// stepsForSnake.
export const SNAKE_POWERUP_SPEED_MULTIPLIER: Record<'sidewind' | 'frenzy', 2> = { sidewind: 2, frenzy: 2 }

// Fraction of the opponent's own current body length removed from its front on Constrict
// activation — see snakeEngine.ts's applySnakePowerupActivation. Always leaves at least the head
// cell intact.
export const SNAKE_POWERUP_CONSTRICT_FRACTION = 0.5

// Visual radius of the on-board mystery-box pickup glyph, as a fraction of cellPx — matches
// SnakeBoardCanvas.tsx's own convention of expressing every visual dimension as a cellPx ratio
// (see e.g. its FoodDot's identical baseRadius = cellPx * 0.32) rather than a bare pixel constant.
// Deliberately a bit larger than FoodDot's own 0.32 — a pickup should read as rarer/more eye-
// catching than the ordinary food dot — but nowhere near LightCycles' own cellPx * 1.8 ratio, which
// is tuned for a thin-trail board with nothing else competing for scale; against Snake's own
// already-chunky body width (BODY_MAX_HALF_WIDTH_RATIO = 0.29, i.e. ~0.58 across) that ratio would
// render a pickup roughly 3x the width of a snake's own body. First-pass number, verify visually.
export const SNAKE_POWERUP_PICKUP_RADIUS_RATIO = 0.42

// On-board glyph animation timing — a quick grow/fade the instant a pickup spawns, then an endless
// gentle pulse for as long as it sits uncollected (see SnakeBoardCanvas.tsx's PickupGlyph). Purely
// cosmetic — never affects when it's actually collectible (collection is exact-cell, matching how
// food collection already works in this app, unlike LightCycles' radius-based collection).
export const SNAKE_POWERUP_SPAWN_FADE_MS = 260
export const SNAKE_POWERUP_PULSE_DURATION_MS = 900
export const SNAKE_POWERUP_PULSE_SCALE = 0.16

// On-board head-effect-tell ring colors, keyed by what's actually driving the effect (not just its
// axis) so Sidewind/Frenzy read as visually distinct despite sharing the same 2x multiplier — a
// player should be able to tell "sped up because I chose to" from "sped up because my opponent did
// this to me" at a glance. Reused verbatim from LightCycles' own POWERUP_EFFECT_COLORS.
export const SNAKE_POWERUP_EFFECT_COLORS: Record<'sidewind' | 'coldblood' | 'frenzy' | 'mesmerize' | 'scales', string> = {
  sidewind: '#FFC107', // gold — self speed-up
  coldblood: '#29B6F6', // ice blue — frozen
  frenzy: '#E53935', // red — danger, forced on you
  mesmerize: '#AB47BC', // violet — control-axis interference
  scales: '#26C6DA' // bright cyan — invincible
}

// Held-item HUD badge icon per type (MDI names, matching react-native-paper's Icon usage elsewhere
// in this app — see GameOverDialog.tsx) — shown only once a pickup is collected, since the on-board
// glyph itself never reveals type. Reused verbatim from LightCycles' own POWERUP_ICONS, except
// Frenzy: LightCycles' Overclock used a 'chip' glyph, too circuit-board-coded to survive the switch
// to reptile theming — swapped for 'lightning-bolt', which still reads as "a dangerous jolt of
// forced energy" without the Tron connotation.
export const SNAKE_POWERUP_ICONS: Record<SnakePowerupType, string> = {
  sidewind: 'speedometer',
  coldblood: 'pause-circle-outline',
  scales: 'shield-outline',
  constrict: 'content-cut',
  mesmerize: 'swap-horizontal-bold',
  frenzy: 'lightning-bolt'
}
