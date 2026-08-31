// Fixed timing/sizing constants for Snake's board and tick loop. Unlike LightCycles'
// constants/game.ts, there is deliberately no speed-ramp table and no per-grid-size-tier scaling
// here (see scaleMsForCellPx / SPEED_RAMP_* there for what that looks like) — the plan explicitly
// defers a speed ramp as unnecessary for v1, so useSnakeState.ts's rAF loop just compares elapsed
// dt against this one fixed interval, every tick, for the life of a round.
export const SNAKE_TICK_INTERVAL_MS = 110

// Classic Snake reads better at larger, chunkier cells than LightCycles' own board does (a
// snake-body-width block is the genre's visual identity) — intentionally chunkier than LightCycles'
// GRID_CELL_PX.medium (8px, see constants/game.ts there), not a rescaled/derived value.
export const SNAKE_CELL_PX = 18

// Onboarding countdown timing — identical values to LightCycles' constants/game.ts (generic UX
// pacing with no game-specific dependency, so there's no reason for Snake's own countdown to feel
// differently paced). "3"/"2"/"1" each held for ONBOARDING_COUNTDOWN_STEP_MS, "GO!" held for an
// extra ONBOARDING_GO_HOLD_MS on top of its own step, then the whole overlay fades out over
// ONBOARDING_FADE_MS before calling onComplete.
export const ONBOARDING_COUNTDOWN_STEP_MS = 700
export const ONBOARDING_GO_HOLD_MS = 500
export const ONBOARDING_FADE_MS = 300
