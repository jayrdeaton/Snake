import { useAchievements } from '@tastic/achievements'
import { createContext, ReactNode, useCallback, useContext, useMemo } from 'react'

import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'
import { AchievementDefinition, StatsState, UnlockedAchievementsState } from '@/types'
import { applyRoundOutcome, getProfileStatsView, RoundContext, RoundOutcome } from '@/utils/statsEngine'
import { DEFAULT_STATS, isValidStats } from '@/utils/statsValidation'

// Produces 'snake.stats' and 'snake.achievements' — the single source of truth for both the
// achievements screen and the in-round "new high score" banner (see game.tsx's own viewerStats),
// profile-scoped via `stats.profiles[id]` wherever a specific profile is active.
const STORAGE_NAMESPACE = 'snake'

interface GameStatsContextValue {
  stats: StatsState
  unlockedAchievements: UnlockedAchievementsState
  loaded: boolean
  // Returns whatever newly unlocked this round, so the caller can surface a toast.
  recordRoundOutcome: (outcome: RoundOutcome, context: RoundContext) => AchievementDefinition[]
  resetAll: () => void
  removeProfileStats: (profileId: string) => void
}

const GameStatsContext = createContext<GameStatsContextValue | null>(null)

function profileViews(stats: StatsState): Record<string, StatsState> {
  return Object.fromEntries(Object.entries(stats.profiles).map(([profileId, bucket]) => [profileId, getProfileStatsView(bucket)]))
}

export function GameStatsProvider({ children }: { children: ReactNode }) {
  const { stats, unlockedAchievements, loaded, recordOutcome, resetAll, removeProfile } = useAchievements<StatsState>({
    namespace: STORAGE_NAMESPACE,
    catalog: ACHIEVEMENT_CATALOG,
    defaultStats: DEFAULT_STATS,
    isValidStats,
    profileViews,
    migrateStats: (stored) => ({ ...stored, profiles: stored.profiles ?? {} })
  })

  const recordRoundOutcome = useCallback(
    (outcome: RoundOutcome, context: RoundContext): AchievementDefinition[] => {
      const result = recordOutcome((prev) => applyRoundOutcome(prev, outcome, context))
      // Every seat in a Snake round shares one screen and one toast area, so the device-wide and
      // per-profile unlocks are surfaced together rather than split per seat.
      const perProfile = Object.values(result.profiles).flat()
      return [...result.device, ...perProfile]
    },
    [recordOutcome]
  )

  const removeProfileStats = useCallback(
    (profileId: string) => {
      removeProfile(profileId, (prev) => {
        if (!(profileId in prev.profiles)) return prev
        const { [profileId]: _removed, ...rest } = prev.profiles
        return { ...prev, profiles: rest }
      })
    },
    [removeProfile]
  )

  const value = useMemo(() => ({ stats, unlockedAchievements, loaded, recordRoundOutcome, resetAll, removeProfileStats }), [stats, unlockedAchievements, loaded, recordRoundOutcome, resetAll, removeProfileStats])

  return <GameStatsContext.Provider value={value}>{children}</GameStatsContext.Provider>
}

export function useGameStats() {
  const ctx = useContext(GameStatsContext)
  if (!ctx) throw new Error('useGameStats must be used within a GameStatsProvider')
  return ctx
}
