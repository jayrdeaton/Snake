import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'
import { StatsState } from '@/types'
import { evaluateUnlockedIds, evaluateUnlockedIdsForProfile, unlockedKey } from '@/utils/achievementEngine'
import { DEFAULT_PROFILE_STATS, DEFAULT_STATS } from '@/utils/statsValidation'

function stats(overrides: Partial<StatsState>): StatsState {
  return { ...DEFAULT_STATS, ...overrides }
}

describe('ACHIEVEMENT_CATALOG', () => {
  it('has unique ids', () => {
    const ids = ACHIEVEMENT_CATALOG.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every entry a title, description, icon and valid tier', () => {
    for (const a of ACHIEVEMENT_CATALOG) {
      expect(a.title.length).toBeGreaterThan(0)
      expect(a.description.length).toBeGreaterThan(0)
      expect(a.icon.length).toBeGreaterThan(0)
      expect(['bronze', 'silver', 'gold']).toContain(a.tier)
    }
  })

  it('unlocks nothing on a fresh blob', () => {
    expect(evaluateUnlockedIds(DEFAULT_STATS).size).toBe(0)
  })

  it('keeps every defined progress fraction within 0..1', () => {
    const rich = stats({ longestSnake: 60, versus: { played: 30, wins: 20, losses: 9, draws: 1 } })
    for (const a of ACHIEVEMENT_CATALOG) {
      const p = a.progress?.(rich)
      if (p === undefined) continue
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })
})

describe('unlocking', () => {
  it('unlocks the first-round entry once anything has been played', () => {
    const s = stats({ byMode: { ...DEFAULT_STATS.byMode, solo: { played: 1, bestScore: 8, totalScore: 8 } } })
    expect(evaluateUnlockedIds(s).has('first_game_played')).toBe(true)
  })

  it('does not award first_ever_win for a solo round', () => {
    const s = stats({ byMode: { ...DEFAULT_STATS.byMode, solo: { played: 5, bestScore: 80, totalScore: 200 } } })
    expect(evaluateUnlockedIds(s).has('first_ever_win')).toBe(false)
  })

  it('awards first_ever_win once a versus round is won', () => {
    const s = stats({ versus: { played: 1, wins: 1, losses: 0, draws: 0 } })
    expect(evaluateUnlockedIds(s).has('first_ever_win')).toBe(true)
  })

  it('leaves flawless_debut locked when the first round was solo (recorded as a draw)', () => {
    expect(evaluateUnlockedIds(stats({ firstGameResult: 'draw' })).has('flawless_debut')).toBe(false)
    expect(evaluateUnlockedIds(stats({ firstGameResult: 'win' })).has('flawless_debut')).toBe(true)
  })

  it('unlocks high-score tiers at their thresholds', () => {
    const at = (score: number) => stats({ byMode: { ...DEFAULT_STATS.byMode, solo: { played: 1, bestScore: score, totalScore: score } } })
    expect(evaluateUnlockedIds(at(24)).has('high_score_bronze')).toBe(false)
    expect(evaluateUnlockedIds(at(25)).has('high_score_bronze')).toBe(true)
    expect(evaluateUnlockedIds(at(75)).has('high_score_silver')).toBe(true)
  })

  it('unlocks a beat-the-CPU entry only for the difficulty actually beaten', () => {
    const s = stats({ byDifficulty: { ...DEFAULT_STATS.byDifficulty, hard: { played: 1, wins: 1, losses: 0, draws: 0 } } })
    const ids = evaluateUnlockedIds(s)
    expect(ids.has('beat_cpu_hard')).toBe(true)
    expect(ids.has('beat_cpu_easy')).toBe(false)
  })

  it('never reports the device-scoped achievement for a profile', () => {
    const bucket = { ...DEFAULT_PROFILE_STATS, versus: { played: 1, wins: 1, losses: 0, draws: 0 } }
    const ids = evaluateUnlockedIdsForProfile(bucket)
    expect(ids.has('first_ever_win')).toBe(true)
    expect(ids.has('flawless_debut')).toBe(false)
  })
})

describe('unlockedKey', () => {
  it('keys device-wide unlocks bare and profile unlocks by id', () => {
    expect(unlockedKey('first_ever_win', null)).toBe('first_ever_win')
    expect(unlockedKey('first_ever_win', 'alice')).toBe('alice:first_ever_win')
  })
})
