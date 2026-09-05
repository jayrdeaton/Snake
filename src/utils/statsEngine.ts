import { applyDayPlayed, applyResult, applyResultToBucket, applyWinStreak, countBucketsWithAWin, OutcomeRecord, RoundResult } from '@tastic/achievements'
import { Profile } from '@tastic/profile'

import { SnakeMode } from '@/hooks/useSnakeState'
import { ProfileStats, StatsState } from '@/types'
import { CpuDifficulty } from '@/utils/snakeAi'
import { DEFAULT_PROFILE_STATS, SNAKE_MODES } from '@/utils/statsValidation'

// One finished round, from snake 1's perspective — the same framing GameOverDialog uses.
export interface RoundOutcome {
  mode: SnakeMode
  // The score this round is recorded at (2 Player uses the higher of the two — see game.tsx's
  // own recordedScore).
  score: number
  // Longest snake on the board when the round ended.
  snakeLength: number
  // Solo has no opponent, so it carries no result at all.
  result: RoundResult | null
}

export interface RoundContext {
  cpuDifficulty: CpuDifficulty
  profileIds?: string[]
}

function bumpBucket(prev: ProfileStats, outcome: RoundOutcome, context: RoundContext, now: Date): ProfileStats {
  const mode = prev.byMode[outcome.mode]
  const isVersus = outcome.mode !== 'solo' && outcome.result !== null

  return {
    byMode: {
      ...prev.byMode,
      [outcome.mode]: {
        played: mode.played + 1,
        bestScore: Math.max(mode.bestScore, outcome.score),
        totalScore: mode.totalScore + outcome.score
      }
    },
    // Solo never touches the versus record — there's nobody to beat, and counting solo rounds as
    // losses would quietly tank every win rate an achievement reads.
    versus: isVersus ? applyResult(prev.versus, outcome.result!) : prev.versus,
    versusStreak: isVersus ? applyWinStreak(prev.versusStreak, outcome.result!) : prev.versusStreak,
    byDifficulty: outcome.mode === 'vsCpu' && outcome.result !== null ? (applyResultToBucket(prev.byDifficulty, context.cpuDifficulty, outcome.result) as Record<CpuDifficulty, OutcomeRecord>) : prev.byDifficulty,
    longestSnake: Math.max(prev.longestSnake, outcome.snakeLength),
    ...applyDayPlayed(prev, now)
  }
}

// `now` defaults to the real clock — overridable so tests can drive day boundaries directly.
export function applyRoundOutcome(prev: StatsState, outcome: RoundOutcome, context: RoundContext, now: Date = new Date()): StatsState {
  const isFirstEver = getTotalPlayed(prev) === 0
  // A solo round resolves as a draw for this one-time flag: with no opponent, neither 'win' nor
  // 'loss' would be true of it.
  const firstGameResult = isFirstEver ? (outcome.result ?? 'draw') : prev.firstGameResult

  const base = bumpBucket(prev, outcome, context, now)

  let profiles = prev.profiles
  for (const profileId of context.profileIds ?? []) {
    profiles = { ...profiles, [profileId]: bumpBucket(profiles[profileId] ?? DEFAULT_PROFILE_STATS, outcome, context, now) }
  }

  return { ...base, profiles, firstGameResult }
}

export function getTotalPlayed(stats: ProfileStats): number {
  return SNAKE_MODES.reduce((sum, mode) => sum + stats.byMode[mode].played, 0)
}

export function getBestScoreAnyMode(stats: ProfileStats): number {
  return SNAKE_MODES.reduce((max, mode) => Math.max(max, stats.byMode[mode].bestScore), 0)
}

export function getTotalScore(stats: ProfileStats): number {
  return SNAKE_MODES.reduce((sum, mode) => sum + stats.byMode[mode].totalScore, 0)
}

// How many of the three modes have been played at least once — the "try everything" family.
export function getModesPlayed(stats: ProfileStats): number {
  return SNAKE_MODES.filter((mode) => stats.byMode[mode].played > 0).length
}

// How many CPU difficulties have been beaten at least once.
export function getDifficultiesBeaten(stats: ProfileStats): number {
  return countBucketsWithAWin(stats.byDifficulty)
}

export function getProfileStatsView(profileStats: ProfileStats): StatsState {
  return { ...profileStats, profiles: {}, firstGameResult: null }
}

export interface ProfileRanking {
  profile: Profile
  played: number
  wins: number
  losses: number
  bestScore: number
  winRate: number
}

// Sorted by versus wins, then win rate, both descending — the same ordering the other @tastic
// arcade games use, so the section reads the same way everywhere. Solo rounds count toward
// `played` and `bestScore` but never toward wins/losses (see the versus record's own comment), so
// a solo-only profile still appears here rather than being invisible.
export function getProfileRankings(profiles: Profile[], profileStats: Record<string, ProfileStats>): ProfileRanking[] {
  return profiles
    .map((profile) => {
      const bucket = profileStats[profile.id] ?? DEFAULT_PROFILE_STATS
      const { wins, losses } = bucket.versus
      const played = getTotalPlayed(bucket)
      return { profile, played, wins, losses, bestScore: getBestScoreAnyMode(bucket), winRate: bucket.versus.played > 0 ? wins / bucket.versus.played : 0 }
    })
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)
}
