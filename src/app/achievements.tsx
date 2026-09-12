import { useAutoPaperTheme } from '@rific/auto-paper'
import { ACHIEVEMENT_TIER_COLORS, unlockedKey } from '@tastic/achievements'
import { rotateInsets, useRotation } from '@tastic/core'
import { AchievementRow, BaseStatsScreen, LOCKED_BADGE_COLOR, MONO_FONT, StatRow, StatSection, usePopoverHost } from '@tastic/hud'
import { ProfileChip, ProfilePicker } from '@tastic/profile'
import { FakeLandscapeView } from '@tastic/split-screen'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector } from 'react-redux'

import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'
import { useGameStats } from '@/hooks/useGameStats'
import { useProfiles } from '@/hooks/useProfiles'
import { SnakeMode } from '@/hooks/useSnakeState'
import { gameActions } from '@/redux/gameSlice'
import type { RootState } from '@/redux/store'
import { getBestScoreAnyMode, getProfileRankings, getProfileStatsView, getTotalPlayed, getTotalScore, ProfileRanking } from '@/utils/statsEngine'
import { DEFAULT_PROFILE_STATS, SNAKE_MODES } from '@/utils/statsValidation'

const MS_PER_DAY = 24 * 60 * 60 * 1000

const MODE_LABELS: Record<SnakeMode, string> = { solo: 'Solo', vsCpu: 'Vs CPU', twoPlayer: '2 Player' }

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// Calendar-day difference, not raw elapsed time, so something unlocked at 11pm reads as "1 day ago"
// once the date rolls over rather than a full 24 hours later.
function unlockedLabel(unlockedAt: number): string {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(unlockedAt))) / MS_PER_DAY)
  if (days <= 0) return 'Unlocked today'
  if (days === 1) return 'Unlocked 1 day ago'
  return `Unlocked ${days} days ago`
}

interface ProfileRankingRowProps {
  ranking: ProfileRanking
  fg: string
  fgMuted: string
}

// One row per saved profile — a ProfileChip (that profile's own saved color and tag) plus its name
// and versus record. Stays Snake-local: @tastic/hud's StatRow has no notion of a leading identity
// chip, matching how LightCycles/BoxHockey/AirHockey/Pong each keep their own version of this.
function ProfileRankingRow({ ranking, fg, fgMuted }: ProfileRankingRowProps) {
  const { profile, wins, losses, bestScore } = ranking
  return (
    <View style={styles.statRow}>
      <View style={styles.profileValue}>
        <ProfileChip profile={profile} />
        <Text variant='bodyMedium' style={[styles.boldText, { color: fg, fontFamily: MONO_FONT }]} numberOfLines={1}>
          {profile.name}
        </Text>
      </View>
      <Text variant='bodyMedium' style={{ color: fgMuted, fontFamily: MONO_FONT }}>
        {wins}-{losses}
        <Text style={{ color: fgMuted, fontFamily: MONO_FONT }}> (best {bestScore})</Text>
      </Text>
    </View>
  )
}

export default function AchievementsScreen() {
  // Unlike index.tsx, this screen previously had no orientation handling at all — it always
  // rendered right-side-up regardless of how the phone was actually being held. rotateInsets
  // remaps the device's own raw (never-rotated) safe-area reading onto whichever edge it actually
  // corresponds to once FakeLandscapeView below visually rotates the content.
  const rotation = useRotation()
  const insets = rotateInsets(useSafeAreaInsets(), rotation)
  const { dark } = useAutoPaperTheme()
  const fgMuted = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
  const { stats, unlockedAchievements, resetAll, loaded } = useGameStats()
  const { profiles } = useProfiles()
  const { colors: themeColors } = useAutoPaperTheme()
  const profilePickerHost = usePopoverHost()
  const fg = dark ? '#FFFFFF' : '#000000'

  // null = "All Profiles" (device-wide). Self-heals to null if the selected profile is deleted
  // from another still-mounted screen — effectiveProfileId stops matching any entry in `profiles`.
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const effectiveProfileId = selectedProfileId && profiles.some((p) => p.id === selectedProfileId) ? selectedProfileId : null
  const profileBucket = effectiveProfileId ? (stats.profiles[effectiveProfileId] ?? DEFAULT_PROFILE_STATS) : null
  // The same StatsState-shaped object every predicate and helper already reads — statsView === stats
  // for "All Profiles", so every section collapses to the device-wide view in that case.
  const statsView = profileBucket ? getProfileStatsView(profileBucket) : stats
  const rankings = useMemo(() => getProfileRankings(profiles, stats.profiles), [profiles, stats.profiles])
  // The redux-persist high score still drives the in-round "new high score" banner (see game.tsx),
  // so resetting stats here clears it too — otherwise the banner would keep comparing against a
  // score the stats screen no longer shows.
  const highScore = useSelector((state: RootState) => state.game.highScore)
  const dispatch = useDispatch()

  const handleReset = () => {
    resetAll()
    dispatch(gameActions.resetHighScore())
  }

  // Every hook above runs unconditionally on every render, so this guard sits here rather than as
  // an early return up top — avoids a flash of zeroed stats (0 rounds played, no achievements
  // unlocked, etc.) for the brief window before useGameStats' own AsyncStorage read resolves. This
  // screen is reached by navigation, not the first screen, so it's a screen-local guard rather than
  // a new splash-gate entry (see useGameStats.tsx's own GameStatsProvider doc).
  if (!loaded) return null

  return (
    <FakeLandscapeView style={styles.rotatable}>
      <BaseStatsScreen onBack={() => router.back()} insets={insets} onReset={handleReset} resetConfirmBody='This permanently erases every high score, stat and achievement. This cannot be undone.' rotation={rotation}>
        {profiles.length > 0 && <ProfilePicker idPrefix='achievements' host={profilePickerHost} profiles={profiles} selectedId={effectiveProfileId} color={themeColors.primary} dark={dark} guestLabel='All Profiles' nullLabel='All Profiles' nullIcon='account-group' onSelect={(profile) => setSelectedProfileId(profile?.id ?? null)} />}

        <StatSection label='OVERALL'>
          <StatRow label='Rounds Played' value={String(getTotalPlayed(statsView))} />
          <StatRow label='Best Score' value={String(getBestScoreAnyMode(statsView))} />
          <StatRow label='Total Score' value={String(getTotalScore(statsView))} />
          <StatRow label='Longest Snake' value={String(statsView.longestSnake)} />
        </StatSection>

        <StatSection label='VERSUS'>
          <StatRow label='Record (W-L-D)' value={`${statsView.versus.wins}-${statsView.versus.losses}-${statsView.versus.draws}`} />
          <StatRow label='Current Streak' value={String(statsView.versusStreak.currentWinStreak)} />
          <StatRow label='Best Streak' value={String(statsView.versusStreak.bestWinStreak)} />
        </StatSection>

        {/* High score comes from the redux-persist store, which predates this screen and still feeds
      the in-round banner; everything else on this row is from the stats blob. */}
        {SNAKE_MODES.map((mode) => (
          <StatSection key={mode} label={MODE_LABELS[mode].toUpperCase()}>
            <StatRow label='High Score' value={String(highScore[mode])} />
            <StatRow label='Rounds' value={String(statsView.byMode[mode].played)} />
            <StatRow label='Total Score' value={String(statsView.byMode[mode].totalScore)} />
          </StatSection>
        ))}

        {/* A leaderboard across profiles is inherently a cross-profile question, so it only appears
      on "All Profiles" — once you've drilled into one profile it answers a different question. */}
        {effectiveProfileId === null && rankings.length > 0 && (
          <StatSection label='PLAYER RANKINGS'>
            {rankings.map((ranking) => (
              <ProfileRankingRow key={ranking.profile.id} ranking={ranking} fg={fg} fgMuted={fgMuted} />
            ))}
          </StatSection>
        )}

        <StatSection label='ACTIVITY'>
          <StatRow label='Days Played' value={String(statsView.distinctDaysPlayed)} />
          <StatRow label='Day Streak' value={String(statsView.currentDayStreak)} />
          <StatRow label='Best Day Streak' value={String(statsView.bestDayStreak)} />
        </StatSection>

        <Text variant='labelMedium' style={[styles.listLabel, { color: fgMuted, fontFamily: MONO_FONT }]}>
          ALL ACHIEVEMENTS
        </Text>
        {ACHIEVEMENT_CATALOG.map((achievement) => {
          // scope:'device' always evaluates against the real device stats and its bare-id key,
          // regardless of which tab is active; everything else follows the selected view. On
          // "All Profiles" both branches collapse to the same thing.
          const scope = achievement.scope ?? 'profile'
          const evalStats = scope === 'device' ? stats : statsView
          const unlockedAt = unlockedAchievements[unlockedKey(achievement.id, scope === 'device' ? null : effectiveProfileId)]
          const progress = unlockedAt === undefined ? achievement.progress?.(evalStats) : undefined
          const tierColor = ACHIEVEMENT_TIER_COLORS[achievement.tier]
          return <AchievementRow key={achievement.id} icon={achievement.icon} title={achievement.title} description={achievement.description} badgeColor={unlockedAt !== undefined ? tierColor : LOCKED_BADGE_COLOR} checkColor={tierColor} unlockedLabel={unlockedAt !== undefined ? unlockedLabel(unlockedAt) : undefined} progress={progress} deviceMarker={effectiveProfileId !== null && scope === 'device'} />
        })}
      </BaseStatsScreen>
    </FakeLandscapeView>
  )
}

const styles = StyleSheet.create({
  boldText: {
    fontWeight: 'bold'
  },
  listLabel: {
    letterSpacing: 2,
    marginTop: 8
  },
  profileValue: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  rotatable: {
    flex: 1
  },
  statRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  }
})
