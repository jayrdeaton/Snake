import { Profile } from '@tastic/profile'

import { StatsState } from '@/types'
import { applyRoundOutcome, getBestScoreAnyMode, getDifficultiesBeaten, getModesPlayed, getProfileRankings, getProfileStatsView, getTotalPlayed, getTotalScore, RoundContext, RoundOutcome } from '@/utils/statsEngine'
import { DEFAULT_STATS } from '@/utils/statsValidation'

const CTX: RoundContext = { cpuDifficulty: 'normal' }
const DAY = new Date(2026, 8, 2)

function round(overrides: Partial<RoundOutcome> = {}): RoundOutcome {
  return { mode: 'solo', score: 10, snakeLength: 12, result: null, ...overrides }
}

function play(prev: StatsState, outcome: RoundOutcome, context: RoundContext = CTX, now = DAY): StatsState {
  return applyRoundOutcome(prev, outcome, context, now)
}

describe('applyRoundOutcome — per mode', () => {
  it('counts the round and tracks best/total score for that mode only', () => {
    const s = play(DEFAULT_STATS, round({ mode: 'solo', score: 30 }))
    expect(s.byMode.solo).toEqual({ played: 1, bestScore: 30, totalScore: 30 })
    expect(s.byMode.vsCpu.played).toBe(0)
  })

  it('keeps the highest score and sums the total across rounds', () => {
    let s = play(DEFAULT_STATS, round({ score: 30 }))
    s = play(s, round({ score: 12 }))
    expect(s.byMode.solo).toEqual({ played: 2, bestScore: 30, totalScore: 42 })
  })

  it('tracks the longest snake across every mode', () => {
    let s = play(DEFAULT_STATS, round({ snakeLength: 18 }))
    s = play(s, round({ mode: 'vsCpu', snakeLength: 44, result: 'win' }))
    s = play(s, round({ snakeLength: 5 }))
    expect(s.longestSnake).toBe(44)
  })
})

describe('applyRoundOutcome — versus record', () => {
  it('leaves the versus record untouched for solo rounds', () => {
    const s = play(DEFAULT_STATS, round({ mode: 'solo', result: null }))
    expect(s.versus).toEqual({ played: 0, wins: 0, losses: 0, draws: 0 })
    expect(s.versusStreak).toEqual({ currentWinStreak: 0, bestWinStreak: 0 })
  })

  it('records wins, losses and draws in competitive modes', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', result: 'win' }))
    s = play(s, round({ mode: 'twoPlayer', result: 'loss' }))
    s = play(s, round({ mode: 'twoPlayer', result: 'draw' }))
    expect(s.versus).toEqual({ played: 3, wins: 1, losses: 1, draws: 1 })
  })

  it('extends the streak on wins and breaks it on a draw as well as a loss', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', result: 'win' }))
    s = play(s, round({ mode: 'vsCpu', result: 'win' }))
    expect(s.versusStreak).toEqual({ currentWinStreak: 2, bestWinStreak: 2 })
    s = play(s, round({ mode: 'vsCpu', result: 'draw' }))
    expect(s.versusStreak).toEqual({ currentWinStreak: 0, bestWinStreak: 2 })
  })

  it('does not let a solo round break an active streak', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', result: 'win' }))
    s = play(s, round({ mode: 'solo', result: null }))
    expect(s.versusStreak.currentWinStreak).toBe(1)
  })
})

describe('applyRoundOutcome — cpu difficulty', () => {
  it('buckets vsCpu results by the difficulty played', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', result: 'win' }), { cpuDifficulty: 'hard' })
    s = play(s, round({ mode: 'vsCpu', result: 'loss' }), { cpuDifficulty: 'easy' })
    expect(s.byDifficulty.hard.wins).toBe(1)
    expect(s.byDifficulty.easy.losses).toBe(1)
    expect(s.byDifficulty.normal.played).toBe(0)
  })

  it('never buckets a two-player or solo round by difficulty', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'twoPlayer', result: 'win' }), { cpuDifficulty: 'hard' })
    s = play(s, round({ mode: 'solo' }), { cpuDifficulty: 'hard' })
    expect(s.byDifficulty.hard.played).toBe(0)
  })

  it('getDifficultiesBeaten counts distinct difficulties with a win', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', result: 'win' }), { cpuDifficulty: 'easy' })
    expect(getDifficultiesBeaten(s)).toBe(1)
    s = play(s, round({ mode: 'vsCpu', result: 'loss' }), { cpuDifficulty: 'hard' })
    expect(getDifficultiesBeaten(s)).toBe(1)
    s = play(s, round({ mode: 'vsCpu', result: 'win' }), { cpuDifficulty: 'hard' })
    expect(getDifficultiesBeaten(s)).toBe(2)
  })
})

describe('firstGameResult', () => {
  it('records a solo first round as a draw, so it can never satisfy the win-only achievement', () => {
    expect(play(DEFAULT_STATS, round({ mode: 'solo', result: null })).firstGameResult).toBe('draw')
  })

  it('records a competitive first round from snake 1s perspective', () => {
    expect(play(DEFAULT_STATS, round({ mode: 'vsCpu', result: 'win' })).firstGameResult).toBe('win')
  })

  it('is never overwritten by a later round', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', result: 'loss' }))
    s = play(s, round({ mode: 'vsCpu', result: 'win' }))
    expect(s.firstGameResult).toBe('loss')
  })
})

describe('profiles', () => {
  it('leaves profiles untouched when none are supplied', () => {
    expect(play(DEFAULT_STATS, round()).profiles).toEqual({})
  })

  it('mirrors the round into every supplied profile bucket', () => {
    const s = play(DEFAULT_STATS, round({ mode: 'twoPlayer', score: 40, result: 'win' }), { ...CTX, profileIds: ['alice', 'bob'] })
    expect(s.profiles.alice.byMode.twoPlayer.played).toBe(1)
    expect(s.profiles.bob.byMode.twoPlayer.bestScore).toBe(40)
  })

  it('accumulates across rounds for the same profile', () => {
    let s = play(DEFAULT_STATS, round({ score: 10 }), { ...CTX, profileIds: ['alice'] })
    s = play(s, round({ score: 25 }), { ...CTX, profileIds: ['alice'] })
    expect(s.profiles.alice.byMode.solo).toEqual({ played: 2, bestScore: 25, totalScore: 35 })
  })

  // Regression coverage for the game-over dialog bug: two profiles playing solo on separate turns
  // must never see each other's best, even though both rounds bump the same device-wide top-level
  // bucket (the honest fallback for guest play — see game.tsx's own viewerStats).
  it('keeps one profile solo run from leaking into a different profile own best', () => {
    let s = play(DEFAULT_STATS, round({ score: 50 }), { ...CTX, profileIds: ['alice'] })
    s = play(s, round({ score: 5 }), { ...CTX, profileIds: ['bob'] })
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
    let s = play(DEFAULT_STATS, round({ mode: 'solo', score: 10 }))
    s = play(s, round({ mode: 'vsCpu', score: 30, result: 'win' }))
    expect(getTotalPlayed(s)).toBe(2)
    expect(getTotalScore(s)).toBe(40)
    expect(getBestScoreAnyMode(s)).toBe(30)
  })

  it('getModesPlayed counts distinct modes actually played', () => {
    let s = play(DEFAULT_STATS, round({ mode: 'solo' }))
    expect(getModesPlayed(s)).toBe(1)
    s = play(s, round({ mode: 'twoPlayer', result: 'win' }))
    expect(getModesPlayed(s)).toBe(2)
  })

  it('getProfileStatsView drops nesting and the device-only flag', () => {
    const s = play(DEFAULT_STATS, round(), { ...CTX, profileIds: ['alice'] })
    const view = getProfileStatsView(s.profiles.alice)
    expect(view.profiles).toEqual({})
    expect(view.firstGameResult).toBeNull()
  })
})

describe('getProfileRankings', () => {
  const mk = (id: string, name: string): Profile => ({ id, name, color: '#fff', tag: '', createdAt: 0, updatedAt: 0 })

  it('sorts by versus wins, then win rate, both descending', () => {
    const profiles = [mk('a', 'A'), mk('b', 'B')]
    let s = play(DEFAULT_STATS, round({ mode: 'vsCpu', result: 'win' }), { ...CTX, profileIds: ['a'] })
    s = play(s, round({ mode: 'vsCpu', result: 'loss' }), { ...CTX, profileIds: ['a'] })
    s = play(s, round({ mode: 'vsCpu', result: 'win' }), { ...CTX, profileIds: ['b'] })
    // Both have 1 win; b's rate is 1.0 against a's 0.5, so b leads.
    expect(getProfileRankings(profiles, s.profiles).map((r) => r.profile.id)).toEqual(['b', 'a'])
  })

  it('includes a profile with nothing recorded at zeroes, never NaN', () => {
    const ranked = getProfileRankings([mk('c', 'C')], {})
    expect(ranked[0]).toMatchObject({ played: 0, wins: 0, losses: 0, bestScore: 0, winRate: 0 })
  })

  it('surfaces a solo-only profile, counting its rounds and best score but no wins', () => {
    const s = play(DEFAULT_STATS, round({ mode: 'solo', score: 42 }), { ...CTX, profileIds: ['a'] })
    const ranked = getProfileRankings([mk('a', 'A')], s.profiles)
    expect(ranked[0]).toMatchObject({ played: 1, wins: 0, bestScore: 42, winRate: 0 })
  })
})
