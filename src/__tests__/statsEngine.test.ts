import { Profile } from '@tastic/profile'

import { StatsState } from '@/types'
import { applyRoundOutcome, getBestScoreAnyMode, getDifficultiesBeaten, getModesPlayed, getProfileRankings, getProfileStatsView, getTotalPlayed, getTotalScore, RoundContext, RoundOutcome } from '@/utils/statsEngine'
import { DEFAULT_STATS } from '@/utils/statsValidation'

const CTX: RoundContext = { cpuDifficulty: 'normal' }
const DAY = new Date(2026, 8, 2)

function round(overrides: Partial<RoundOutcome> = {}): RoundOutcome {
  return { mode: 'solo', seats: { 1: { score: 10, snakeLength: 12 } }, winner: null, ...overrides }
}

// Seat 1 alone, at the given score and length: the shape every Solo and Vs CPU round records.
function seat1(score: number, snakeLength = 12): RoundOutcome['seats'] {
  return { 1: { score, snakeLength } }
}

function play(prev: StatsState, outcome: RoundOutcome, context: RoundContext = CTX, now = DAY): StatsState {
  return applyRoundOutcome(prev, outcome, context, now)
}

describe('applyRoundOutcome — per mode', () => {
  it('counts the round and tracks best/total score for that mode only', () => {
    const s = play(DEFAULT_STATS, round({ mode: 'solo', seats: seat1(30) }))
    expect(s.byMode.solo).toEqual({ played: 1, bestScore: 30, totalScore: 30 })
    expect(s.byMode.vsCpu.played).toBe(0)
  })

  it('keeps the highest score and sums the total across rounds', () => {
    let s = play(DEFAULT_STATS, round({ seats: seat1(30) }))
    s = play(s, round({ seats: seat1(12) }))
    expect(s.byMode.solo).toEqual({ played: 2, bestScore: 30, totalScore: 42 })
  })

  it('tracks the longest snake across every mode', () => {
    let s = play(DEFAULT_STATS, round({ seats: seat1(10, 18) }))
    s = play(s, round({ mode: 'vsCpu', seats: seat1(10, 44), winner: 1 }))
    s = play(s, round({ seats: seat1(10, 5) }))
    expect(s.longestSnake).toBe(44)
  })
})

describe('applyRoundOutcome — versus record', () => {
  it('leaves the versus record untouched for solo rounds', () => {
    const s = play(DEFAULT_STATS, round({ mode: 'solo' }))
    expect(s.versus).toEqual({ played: 0, wins: 0, losses: 0, draws: 0 })
    expect(s.versusStreak).toEqual({ currentWinStreak: 0, bestWinStreak: 0 })
  })

  it('records wins, losses and draws in competitive modes', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', winner: 1 }))
    s = play(s, round({ mode: 'twoPlayer', winner: 2 }))
    s = play(s, round({ mode: 'twoPlayer', winner: null }))
    expect(s.versus).toEqual({ played: 3, wins: 1, losses: 1, draws: 1 })
  })

  it('extends the streak on wins and breaks it on a draw as well as a loss', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', winner: 1 }))
    s = play(s, round({ mode: 'vsCpu', winner: 1 }))
    expect(s.versusStreak).toEqual({ currentWinStreak: 2, bestWinStreak: 2 })
    s = play(s, round({ mode: 'vsCpu', winner: null }))
    expect(s.versusStreak).toEqual({ currentWinStreak: 0, bestWinStreak: 2 })
  })

  it('does not let a solo round break an active streak', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', winner: 1 }))
    s = play(s, round({ mode: 'solo' }))
    expect(s.versusStreak.currentWinStreak).toBe(1)
  })
})

describe('applyRoundOutcome — cpu difficulty', () => {
  it('buckets vsCpu results by the difficulty played', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', winner: 1 }), { cpuDifficulty: 'hard' })
    s = play(s, round({ mode: 'vsCpu', winner: 2 }), { cpuDifficulty: 'easy' })
    expect(s.byDifficulty.hard.wins).toBe(1)
    expect(s.byDifficulty.easy.losses).toBe(1)
    expect(s.byDifficulty.normal.played).toBe(0)
  })

  it('never buckets a two-player or solo round by difficulty', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'twoPlayer', winner: 1 }), { cpuDifficulty: 'hard' })
    s = play(s, round({ mode: 'solo' }), { cpuDifficulty: 'hard' })
    expect(s.byDifficulty.hard.played).toBe(0)
  })

  it('getDifficultiesBeaten counts distinct difficulties with a win', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', winner: 1 }), { cpuDifficulty: 'easy' })
    expect(getDifficultiesBeaten(s)).toBe(1)
    s = play(s, round({ mode: 'vsCpu', winner: 2 }), { cpuDifficulty: 'hard' })
    expect(getDifficultiesBeaten(s)).toBe(1)
    s = play(s, round({ mode: 'vsCpu', winner: 1 }), { cpuDifficulty: 'hard' })
    expect(getDifficultiesBeaten(s)).toBe(2)
  })
})

describe('firstGameResult', () => {
  it('records a solo first round as a draw, so it can never satisfy the win-only achievement', () => {
    expect(play(DEFAULT_STATS, round({ mode: 'solo' })).firstGameResult).toBe('draw')
  })

  it('records a competitive first round from snake 1s perspective', () => {
    expect(play(DEFAULT_STATS, round({ mode: 'vsCpu', winner: 1 })).firstGameResult).toBe('win')
  })

  it('is never overwritten by a later round', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', winner: 2 }))
    s = play(s, round({ mode: 'vsCpu', winner: 1 }))
    expect(s.firstGameResult).toBe('loss')
  })
})

describe('profiles', () => {
  it('leaves profiles untouched when none are supplied', () => {
    expect(play(DEFAULT_STATS, round()).profiles).toEqual({})
  })

  // Regression coverage for F021: every profile used to get seat 1's result, the higher of the two
  // scores and the longest snake on the board, so a 2 Player loser's profile recorded a win.
  it('bumps each 2 Player profile from its own seat: its own result, score and length', () => {
    const outcome = round({ mode: 'twoPlayer', seats: { 1: { score: 40, snakeLength: 30 }, 2: { score: 12, snakeLength: 9 } }, winner: 1 })
    const s = play(DEFAULT_STATS, outcome, { ...CTX, profileIds: { 1: 'alice', 2: 'bob' } })

    expect(s.profiles.alice.versus.wins).toBe(1)
    expect(s.profiles.alice.byMode.twoPlayer.bestScore).toBe(40)
    expect(s.profiles.alice.longestSnake).toBe(30)

    expect(s.profiles.bob.versus.losses).toBe(1)
    expect(s.profiles.bob.versus.wins).toBe(0)
    expect(s.profiles.bob.versusStreak.currentWinStreak).toBe(0)
    expect(s.profiles.bob.byMode.twoPlayer.bestScore).toBe(12)
    expect(s.profiles.bob.longestSnake).toBe(9)

    // The device bucket counts the best of either human, with seat 1's result.
    expect(s.byMode.twoPlayer.bestScore).toBe(40)
    expect(s.longestSnake).toBe(30)
    expect(s.versus.wins).toBe(1)
  })

  it('credits the device bucket with the best human seat even when seat 2 outscored seat 1', () => {
    const outcome = round({ mode: 'twoPlayer', seats: { 1: { score: 5, snakeLength: 7 }, 2: { score: 22, snakeLength: 25 } }, winner: 2 })
    const s = play(DEFAULT_STATS, outcome, { ...CTX, profileIds: { 2: 'bob' } })
    expect(s.byMode.twoPlayer.bestScore).toBe(22)
    expect(s.longestSnake).toBe(25)
    expect(s.versus.losses).toBe(1)
    expect(s.profiles.bob.versus.wins).toBe(1)
    expect(s.profiles.bob.versusStreak.currentWinStreak).toBe(1)
  })

  // The CPU snake is never a seat in the outcome, so its length can't unlock seat 1's longestSnake
  // achievements, however long it grew.
  it('never credits the CPU snake in Vs CPU: length and score are seat 1s own', () => {
    const s = play(DEFAULT_STATS, round({ mode: 'vsCpu', seats: seat1(8, 11), winner: 2 }), { ...CTX, profileIds: { 1: 'alice' } })
    expect(s.longestSnake).toBe(11)
    expect(s.byMode.vsCpu.bestScore).toBe(8)
    expect(s.profiles.alice.longestSnake).toBe(11)
    expect(s.profiles.alice.versus.losses).toBe(1)
  })

  it('skips a profile whose seat has no entry in the outcome', () => {
    const s = play(DEFAULT_STATS, round({ mode: 'vsCpu', seats: seat1(8), winner: 1 }), { ...CTX, profileIds: { 1: 'alice', 2: 'ghost' } })
    expect(s.profiles.alice.versus.wins).toBe(1)
    expect(s.profiles.ghost).toBeUndefined()
  })

  it('accumulates across rounds for the same profile', () => {
    let s = play(DEFAULT_STATS, round({ seats: seat1(10) }), { ...CTX, profileIds: { 1: 'alice' } })
    s = play(s, round({ seats: seat1(25) }), { ...CTX, profileIds: { 1: 'alice' } })
    expect(s.profiles.alice.byMode.solo).toEqual({ played: 2, bestScore: 25, totalScore: 35 })
  })

  // Regression coverage for the game-over dialog bug: two profiles playing solo on separate turns
  // must never see each other's best, even though both rounds bump the same device-wide top-level
  // bucket (the honest fallback for guest play, see game.tsx's own seatStats).
  it('keeps one profile solo run from leaking into a different profile own best', () => {
    let s = play(DEFAULT_STATS, round({ seats: seat1(50) }), { ...CTX, profileIds: { 1: 'alice' } })
    s = play(s, round({ seats: seat1(5) }), { ...CTX, profileIds: { 1: 'bob' } })
    expect(s.profiles.alice.byMode.solo.bestScore).toBe(50)
    expect(s.profiles.bob.byMode.solo.bestScore).toBe(5)
    expect(s.byMode.solo.bestScore).toBe(50)
  })
})

describe('day streak', () => {
  it('counts a day once regardless of how many rounds it holds', () => {
    let s = play(DEFAULT_STATS, round(), CTX, new Date(2026, 8, 2, 9))
    s = play(s, round(), CTX, new Date(2026, 8, 2, 22))
    expect(s.distinctDaysPlayed).toBe(1)
    expect(getTotalPlayed(s)).toBe(2)
  })

  it('extends on a consecutive day and restarts after a gap', () => {
    let s = play(DEFAULT_STATS, round(), CTX, new Date(2026, 8, 1))
    s = play(s, round(), CTX, new Date(2026, 8, 2))
    expect(s.currentDayStreak).toBe(2)
    s = play(s, round(), CTX, new Date(2026, 8, 11))
    expect(s).toMatchObject({ currentDayStreak: 1, bestDayStreak: 2 })
  })
})

describe('selectors', () => {
  it('sums played and score across every mode', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'solo', seats: seat1(10) }))
    s = play(s, round({ mode: 'vsCpu', seats: seat1(30), winner: 1 }))
    expect(getTotalPlayed(s)).toBe(2)
    expect(getTotalScore(s)).toBe(40)
    expect(getBestScoreAnyMode(s)).toBe(30)
  })

  it('getModesPlayed counts distinct modes actually played', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'solo' }))
    expect(getModesPlayed(s)).toBe(1)
    s = play(s, round({ mode: 'twoPlayer', winner: 1 }))
    expect(getModesPlayed(s)).toBe(2)
  })

  it('getProfileStatsView drops nesting and the device-only flag', () => {
    const s = play(DEFAULT_STATS, round(), { ...CTX, profileIds: { 1: 'alice' } })
    const view = getProfileStatsView(s.profiles.alice)
    expect(view.profiles).toEqual({})
    expect(view.firstGameResult).toBeNull()
  })
})

describe('getProfileRankings', () => {
  const mk = (id: string, name: string): Profile => ({ id, name, color: '#fff', tag: '', createdAt: 0, updatedAt: 0 })

  it('sorts by versus wins, then win rate, both descending', () => {
    const profiles = [mk('a', 'A'), mk('b', 'B')]
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', winner: 1 }), { ...CTX, profileIds: { 1: 'a' } })
    s = play(s, round({ mode: 'vsCpu', winner: 2 }), { ...CTX, profileIds: { 1: 'a' } })
    s = play(s, round({ mode: 'vsCpu', winner: 1 }), { ...CTX, profileIds: { 1: 'b' } })
    // Both have 1 win; b's rate is 1.0 against a's 0.5, so b leads.
    expect(getProfileRankings(profiles, s.profiles).map((r) => r.profile.id)).toEqual(['b', 'a'])
  })

  it('includes a profile with nothing recorded at zeroes, never NaN', () => {
    const ranked = getProfileRankings([mk('c', 'C')], {})
    expect(ranked[0]).toMatchObject({ played: 0, wins: 0, losses: 0, bestScore: 0, winRate: 0 })
  })

  it('surfaces a solo-only profile, counting its rounds and best score but no wins', () => {
    const s = play(DEFAULT_STATS, round({ mode: 'solo', seats: seat1(42) }), { ...CTX, profileIds: { 1: 'a' } })
    const ranked = getProfileRankings([mk('a', 'A')], s.profiles)
    expect(ranked[0]).toMatchObject({ played: 1, wins: 0, bestScore: 42, winRate: 0 })
  })
})
