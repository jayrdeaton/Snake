import { applyDayPlayed, applyResult, applyResultToBucket, applyWinStreak, countBucketsWithAWin, OutcomeRecord, resultFor, RoundResult } from '@tastic/achievements'
import { Profile } from '@tastic/profile'

import { SnakeMode } from '@/hooks/useSnakeState'
import { ProfileStats, SnakeId, StatsState } from '@/types'
import { CpuDifficulty } from '@/utils/snakeAi'
import { DEFAULT_PROFILE_STATS, SNAKE_MODES } from '@/utils/statsValidation'

// One human seat's own numbers for a finished round.
export interface SeatRoundOutcome {
  score: number
  // peakLength, the longest that seat's snake grew this round (see types/index.ts's
  // SnakeEntity.peakLength), not whatever it shrank back to before the round ended.
  snakeLength: number
}

// One finished round, seat by seat.
export interface RoundOutcome {
  mode: SnakeMode
  // Only human-driven seats: seat 1 always, seat 2 only in 2 Player. Vs CPU's CPU snake never
  // appears here, so its score and length can't count toward anyone's stats.
  seats: Partial<Record<SnakeId, SeatRoundOutcome>>
  // null for a draw. Ignored in Solo, which has no opponent and so no result at all.
  winner: SnakeId | null
}

export interface RoundContext {
  cpuDifficulty: CpuDifficulty
  // Seat -> profile id, only for seats with a profile selected this round. Each profile is bumped
  // from its own seat's numbers and result.
  profileIds?: Partial<Record<SnakeId, string>>
}

// This round's result from one seat's point of view, or null in Solo (nobody to beat).
function seatResult(outcome: RoundOutcome, seat: SnakeId): RoundResult | null {
  if (outcome.mode === 'solo') return null
  return resultFor(outcome.winner, seat)
}

function bumpBucket(prev: ProfileStats, mode: SnakeMode, seat: SeatRoundOutcome, result: RoundResult | null, context: RoundContext, now: Date): ProfileStats {
  const modeStats = prev.byMode[mode]

  return {
    byMode: {
      ...prev.byMode,
      [mode]: {
        played: modeStats.played + 1,
        bestScore: Math.max(modeStats.bestScore, seat.score),
        totalScore: modeStats.totalScore + seat.score
      }
    },
    // Solo never touches the versus record (its result is null): there's nobody to beat, and
    // counting solo rounds as losses would quietly tank every win rate an achievement reads.
    versus: result !== null ? applyResult(prev.versus, result) : prev.versus,
    versusStreak: result !== null ? applyWinStreak(prev.versusStreak, result) : prev.versusStreak,
    byDifficulty: mode === 'vsCpu' && result !== null ? (applyResultToBucket(prev.byDifficulty, context.cpuDifficulty, result) as Record<CpuDifficulty, OutcomeRecord>) : prev.byDifficulty,
    longestSnake: Math.max(prev.longestSnake, seat.snakeLength),
    ...applyDayPlayed(prev, now)
  }
}

// `now` defaults to the real clock — overridable so tests can drive day boundaries directly.
export function applyRoundOutcome(prev: StatsState, outcome: RoundOutcome, context: RoundContext, now: Date = new Date()): StatsState {
  const deviceResult = seatResult(outcome, 1)
  const isFirstEver = getTotalPlayed(prev) === 0
  // A solo round resolves as a draw for this one-time flag: with no opponent, neither 'win' nor
  // 'loss' would be true of it.
  const firstGameResult = isFirstEver ? (deviceResult ?? 'draw') : prev.firstGameResult

  // The device bucket counts the round once for "either human": the best score and longest snake
  // any human seat reached, with seat 1's result (the device's versus record stays seat 1's view).
  const humanSeats = Object.values(outcome.seats).filter((seat): seat is SeatRoundOutcome => seat !== undefined)
  const deviceSeat: SeatRoundOutcome = { score: Math.max(0, ...humanSeats.map((seat) => seat.score)), snakeLength: Math.max(0, ...humanSeats.map((seat) => seat.snakeLength)) }
  const base = bumpBucket(prev, outcome.mode, deviceSeat, deviceResult, context, now)

  // Each profile is bumped from the seat it played in, so in 2 Player the loser's profile records
  // its own loss and its own score, not seat 1's.
  let profiles = prev.profiles
  for (const seat of [1, 2] as SnakeId[]) {
    const profileId = context.profileIds?.[seat]
    const seatOutcome = outcome.seats[seat]
    if (!profileId || !seatOutcome) continue
    profiles = { ...profiles, [profileId]: bumpBucket(profiles[profileId] ?? DEFAULT_PROFILE_STATS, outcome.mode, seatOutcome, seatResult(outcome, seat), context, now) }
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
