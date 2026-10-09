import { mapUnlocksBySeat, useAchievements } from '@tastic/achievements'
import { createContext, ReactNode, useCallback, useContext, useMemo } from 'react'

import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'
import { achievementsActions } from '@/redux/achievementsSlice'
import type { RootState } from '@/redux/store'
import { AchievementDefinition, SnakeId, StatsState, UnlockedAchievementsState } from '@/types'
import { applyRoundOutcome, getProfileStatsView, RoundContext, RoundOutcome } from '@/utils/statsEngine'

// Returned by recordRoundOutcome below — `device` is the device-wide/"All Profiles" newly-unlocked
// list (no seat owner), `profiles` is a parallel per-seat breakdown of whatever THAT seat's own
// profile newly unlocked. Solo/Vs CPU merge both into one flat toast list at the call site
// (game.tsx) — only 2 Player needs the seat split, to show each unlock next to the seat that
// actually earned it instead of a single screen-fixed toast neither seat's zone belongs to.
export interface RecordRoundOutcomeResult {
  device: AchievementDefinition[]
  profiles: Partial<Record<SnakeId, AchievementDefinition[]>>
}

interface GameStatsContextValue {
  stats: StatsState
  unlockedAchievements: UnlockedAchievementsState
  // Returns whatever newly unlocked this round, split device-wide vs per-seat — see
  // RecordRoundOutcomeResult above for why the caller needs both instead of one merged list.
  recordRoundOutcome: (outcome: RoundOutcome, context: RoundContext) => RecordRoundOutcomeResult
  resetAll: () => void
  removeProfileStats: (profileId: string) => void
}

const GameStatsContext = createContext<GameStatsContextValue | null>(null)

function profileViews(stats: StatsState): Record<string, StatsState> {
  return Object.fromEntries(Object.entries(stats.profiles).map(([profileId, bucket]) => [profileId, getProfileStatsView(bucket)]))
}

// The single source of truth for both the achievements screen and the in-round "new high score"
// banner (see game.tsx's own seatStats), profile-scoped via `stats.profiles[id]` wherever a
// specific profile is active. The data itself lives in the store's `achievements` slice.
export function GameStatsProvider({ children }: { children: ReactNode }) {
  const { stats, unlockedAchievements, recordOutcome, resetAll, removeProfile } = useAchievements<StatsState, RootState>({
    catalog: ACHIEVEMENT_CATALOG,
    select: (state) => state.achievements,
    actions: achievementsActions,
    profileViews
  })

  const recordRoundOutcome = useCallback(
    (outcome: RoundOutcome, context: RoundContext): RecordRoundOutcomeResult => {
      const result = recordOutcome((prev) => applyRoundOutcome(prev, outcome, context))

      // The package reports per-profile unlocks keyed by profile id, since it has no notion of
      // seats; callers think in seats, so translate back through the same profileIds map that
      // produced them — same translation LightCycles' own recordRoundOutcome does, now shared via
      // @tastic/achievements' own mapUnlocksBySeat.
      const profiles = mapUnlocksBySeat([1, 2] as SnakeId[], context.profileIds, result.profiles)

      return { device: result.device, profiles }
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

  const value = useMemo(() => ({ stats, unlockedAchievements, recordRoundOutcome, resetAll, removeProfileStats }), [stats, unlockedAchievements, recordRoundOutcome, resetAll, removeProfileStats])

  return <GameStatsContext.Provider value={value}>{children}</GameStatsContext.Provider>
}

export function useGameStats() {
  const ctx = useContext(GameStatsContext)
  if (!ctx) throw new Error('useGameStats must be used within a GameStatsProvider')
  return ctx
}
