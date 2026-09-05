import { DEFAULT_PROFILE_STATS, DEFAULT_STATS, isValidStats } from '@/utils/statsValidation'

describe('DEFAULT_STATS', () => {
  it('is a zeroed blob that validates', () => {
    expect(isValidStats(DEFAULT_STATS)).toBe(true)
    expect(DEFAULT_STATS.profiles).toEqual({})
    expect(DEFAULT_STATS.firstGameResult).toBeNull()
  })

  it('zeroes every mode and difficulty bucket', () => {
    expect(Object.values(DEFAULT_STATS.byMode).every((m) => m.played === 0)).toBe(true)
    expect(Object.values(DEFAULT_STATS.byDifficulty).every((r) => r.played === 0)).toBe(true)
  })

  it('DEFAULT_PROFILE_STATS carries no nesting of its own', () => {
    expect('profiles' in DEFAULT_PROFILE_STATS).toBe(false)
  })
})

describe('isValidStats', () => {
  it('accepts a blob with no profiles key — the additive-field case migrateStats backfills', () => {
    const { profiles: _dropped, ...withoutProfiles } = DEFAULT_STATS
    expect(isValidStats(withoutProfiles)).toBe(true)
  })

  it('accepts populated profile buckets', () => {
    expect(isValidStats({ ...DEFAULT_STATS, profiles: { alice: DEFAULT_PROFILE_STATS } })).toBe(true)
  })

  it('rejects non-objects and arrays', () => {
    expect(isValidStats(null)).toBe(false)
    expect(isValidStats('{}')).toBe(false)
    expect(isValidStats([])).toBe(false)
  })

  it('rejects a byMode map missing a mode', () => {
    expect(isValidStats({ ...DEFAULT_STATS, byMode: { solo: DEFAULT_STATS.byMode.solo } })).toBe(false)
  })

  it('rejects a byDifficulty map missing a difficulty', () => {
    expect(isValidStats({ ...DEFAULT_STATS, byDifficulty: { easy: DEFAULT_STATS.byDifficulty.easy } })).toBe(false)
  })

  it('rejects a malformed versus record or streak', () => {
    expect(isValidStats({ ...DEFAULT_STATS, versus: { wins: 1 } })).toBe(false)
    expect(isValidStats({ ...DEFAULT_STATS, versusStreak: { currentWinStreak: 1 } })).toBe(false)
  })

  it('rejects a non-numeric longestSnake', () => {
    expect(isValidStats({ ...DEFAULT_STATS, longestSnake: '12' })).toBe(false)
  })

  it('rejects an unrecognized firstGameResult', () => {
    expect(isValidStats({ ...DEFAULT_STATS, firstGameResult: 'forfeit' })).toBe(false)
  })
})
