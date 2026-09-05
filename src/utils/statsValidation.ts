import { DEFAULT_DAY_STREAK, DEFAULT_OUTCOME_RECORD, DEFAULT_WIN_STREAK, OutcomeRecord, WinStreakState } from '@tastic/achievements'

import { SnakeMode } from '@/hooks/useSnakeState'
import { ProfileStats, SnakeModeStats, StatsState } from '@/types'
import { CpuDifficulty } from '@/utils/snakeAi'

export const SNAKE_MODES: SnakeMode[] = ['solo', 'vsCpu', 'twoPlayer']
export const CPU_DIFFICULTIES: CpuDifficulty[] = ['easy', 'normal', 'hard']

const DEFAULT_MODE_STATS: SnakeModeStats = { played: 0, bestScore: 0, totalScore: 0 }

// One factory per nested field, each called independently everywhere a default is needed —
// DEFAULT_PROFILE_STATS and DEFAULT_STATS below each need their own independent objects, not two
// references to the same one. Every consumer today only ever spreads/reads these, but a shared
// reference is a standing invitation for a future in-place mutation (or, previously here, a bare
// `versus: DEFAULT_OUTCOME_RECORD` with no clone at all) to corrupt both at once — mirrors
// LightCycles' own statsValidation.ts createDefaultVsCpu/createDefaultTwoPlayer pattern.
function createDefaultByMode(): Record<SnakeMode, SnakeModeStats> {
  return Object.fromEntries(SNAKE_MODES.map((m) => [m, { ...DEFAULT_MODE_STATS }])) as Record<SnakeMode, SnakeModeStats>
}

function createDefaultVersus(): OutcomeRecord {
  return { ...DEFAULT_OUTCOME_RECORD }
}

function createDefaultVersusStreak(): WinStreakState {
  return { ...DEFAULT_WIN_STREAK }
}

function createDefaultByDifficulty(): Record<CpuDifficulty, OutcomeRecord> {
  return Object.fromEntries(CPU_DIFFICULTIES.map((d) => [d, { ...DEFAULT_OUTCOME_RECORD }])) as Record<CpuDifficulty, OutcomeRecord>
}

export const DEFAULT_PROFILE_STATS: ProfileStats = {
  byMode: createDefaultByMode(),
  versus: createDefaultVersus(),
  versusStreak: createDefaultVersusStreak(),
  byDifficulty: createDefaultByDifficulty(),
  longestSnake: 0,
  ...DEFAULT_DAY_STREAK
}

// byMode/versus/versusStreak/byDifficulty are re-created here rather than spread straight from
// DEFAULT_PROFILE_STATS, specifically so the two don't end up aliasing the same nested objects —
// see the factories' own doc above.
export const DEFAULT_STATS: StatsState = {
  ...DEFAULT_PROFILE_STATS,
  byMode: createDefaultByMode(),
  versus: createDefaultVersus(),
  versusStreak: createDefaultVersusStreak(),
  byDifficulty: createDefaultByDifficulty(),
  profiles: {},
  firstGameResult: null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isValidOutcomeRecord(value: unknown): value is OutcomeRecord {
  if (!isRecord(value)) return false
  return typeof value.played === 'number' && typeof value.wins === 'number' && typeof value.losses === 'number' && typeof value.draws === 'number'
}

function isValidModeStats(value: unknown): value is SnakeModeStats {
  if (!isRecord(value)) return false
  return typeof value.played === 'number' && typeof value.bestScore === 'number' && typeof value.totalScore === 'number'
}

// Both maps are fixed, exhaustive sets, so a missing key is a genuinely broken blob rather than an
// inert gap. Extra unrecognized keys are tolerated (a leftover from a removed mode/difficulty).
function isValidProfileStats(value: unknown): value is ProfileStats {
  if (!isRecord(value)) return false
  const v = value as Partial<ProfileStats>
  if (!isRecord(v.byMode) || !SNAKE_MODES.every((m) => isValidModeStats((v.byMode as Record<string, unknown>)[m]))) return false
  if (!isRecord(v.byDifficulty) || !CPU_DIFFICULTIES.every((d) => isValidOutcomeRecord((v.byDifficulty as Record<string, unknown>)[d]))) return false
  if (!isValidOutcomeRecord(v.versus)) return false
  if (!isRecord(v.versusStreak) || typeof v.versusStreak.currentWinStreak !== 'number' || typeof v.versusStreak.bestWinStreak !== 'number') return false
  return typeof v.longestSnake === 'number' && typeof v.distinctDaysPlayed === 'number' && typeof v.currentDayStreak === 'number' && typeof v.bestDayStreak === 'number' && (v.lastPlayedDate === null || typeof v.lastPlayedDate === 'string')
}

export function isValidStats(value: unknown): value is StatsState {
  if (!isValidProfileStats(value)) return false
  const v = value as Partial<StatsState>
  const profilesOk = v.profiles === undefined || (isRecord(v.profiles) && Object.values(v.profiles).every(isValidProfileStats))
  return profilesOk && (v.firstGameResult === undefined || v.firstGameResult === null || v.firstGameResult === 'win' || v.firstGameResult === 'loss' || v.firstGameResult === 'draw')
}
