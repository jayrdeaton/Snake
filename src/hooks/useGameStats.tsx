import { mapUnlocksBySeat, useAchievements } from '@tastic/achievements'
import { createContext, ReactNode, useCallback, useContext, useMemo } from 'react'

import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'
import { AchievementDefinition, SnakeId, StatsState, UnlockedAchievementsState } from '@/types'
import { applyRoundOutcome, getProfileStatsView, RoundContext, RoundOutcome } from '@/utils/statsEngine'
import { DEFAULT_STATS, isValidStats } from '@/utils/statsValidation'

// Produces 'snake.stats' and 'snake.achievements' — the single source of truth for both the
// achievements screen and the in-round "new high score" banner (see game.tsx's own viewerStats),
// profile-scoped via `stats.profiles[id]` wherever a specific profile is active.
const STORAGE_NAMESPACE = 'snake'

// Same fields as statsEngine's own RoundContext, but profileIds is seat-keyed here instead of a
// flat list — applyRoundOutcome only ever needs the flat list to bump each profile's own bucket
// (see recordRoundOutcome below, which derives it), but recordRoundOutcome itself also needs to
// know which seat each id belongs to, to hand 2 Player unlocks back split by seat instead of merged
// into one list (see RecordRoundOutcomeResult below, and game.tsx's own achievementUnlocks state —
// the reason this association has to survive the round trip now, where it used to just get
// flattened away before it ever reached here).
interface RecordRoundOutcomeContext extends Omit<RoundContext, 'profileIds'> {
  profileIds?: Partial<Record<SnakeId, string>>
}

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
  loaded: boolean
  // Returns whatever newly unlocked this round, split device-wide vs per-seat — see
  // RecordRoundOutcomeResult above for why the caller needs both instead of one merged list.
  recordRoundOutcome: (outcome: RoundOutcome, context: RecordRoundOutcomeContext) => RecordRoundOutcomeResult
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
    (outcome: RoundOutcome, context: RecordRoundOutcomeContext): RecordRoundOutcomeResult => {
      const seatProfileIds = context.profileIds
      // applyRoundOutcome (and the package's own recordOutcome underneath it) only ever needs the
      // flat list to know WHICH buckets to bump, not which seat each one came from — the seat
      // association is reconstructed from seatProfileIds below, after the fact, purely to route the
      // result back to the caller.
      const flatProfileIds = seatProfileIds ? Object.values(seatProfileIds).filter((id): id is string => id !== undefined) : undefined
      const result = recordOutcome((prev) => applyRoundOutcome(prev, outcome, { ...context, profileIds: flatProfileIds }))

      // The package reports per-profile unlocks keyed by profile id, since it has no notion of
      // seats; callers think in seats, so translate back through the same profileIds map that
      // produced them — same translation LightCycles' own recordRoundOutcome does, now shared via
      // @tastic/achievements' own mapUnlocksBySeat.
      const profiles = mapUnlocksBySeat([1, 2] as SnakeId[], seatProfileIds, result.profiles)

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

  const value = useMemo(() => ({ stats, unlockedAchievements, loaded, recordRoundOutcome, resetAll, removeProfileStats }), [stats, unlockedAchievements, loaded, recordRoundOutcome, resetAll, removeProfileStats])

  return <GameStatsContext.Provider value={value}>{children}</GameStatsContext.Provider>
}

export function useGameStats() {
  const ctx = useContext(GameStatsContext)
  if (!ctx) throw new Error('useGameStats must be used within a GameStatsProvider')
  return ctx
}
