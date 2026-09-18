import { useAutoPaperTheme } from '@rific/auto-paper'
import { getAchievementCatalogRows } from '@tastic/achievements'
import { FakeLandscapeView, rotateInsets, useRotation } from '@tastic/core'
import { AchievementCatalogSection, ActivityStatSection, BaseStatsScreen, MONO_FONT, StatRow, StatSection, usePopoverHost } from '@tastic/hud'
import { ProfileChip, ProfilePicker } from '@tastic/profile'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'
import { useGameStats } from '@/hooks/useGameStats'
import { useProfiles } from '@/hooks/useProfiles'
import { SnakeMode } from '@/hooks/useSnakeState'
import { safeBack } from '@/utils/navigation'
import { getBestScoreAnyMode, getProfileRankings, getProfileStatsView, getTotalPlayed, getTotalScore, ProfileRanking } from '@/utils/statsEngine'
import { DEFAULT_PROFILE_STATS, SNAKE_MODES } from '@/utils/statsValidation'

const MODE_LABELS: Record<SnakeMode, string> = { solo: 'Solo', vsCpu: 'Vs CPU', twoPlayer: '2 Player' }

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

  // Every hook above runs unconditionally on every render, so this guard sits here rather than as
  // an early return up top — avoids a flash of zeroed stats (0 rounds played, no achievements
  // unlocked, etc.) for the brief window before useGameStats' own AsyncStorage read resolves. This
  // screen is reached by navigation, not the first screen, so it's a screen-local guard rather than
  // a new splash-gate entry (see useGameStats.tsx's own GameStatsProvider doc).
  //
  // Renders the real screen shell (not a bare null) during this window, matching AirHockey/
  // BoxHockey/Pong/LightCycles — a bare null briefly drops the header/back button entirely, which
  // is jarring on a screen reached by navigation (the user just tapped something to get here).
  // onReset is omitted here too — nothing worth resetting has rendered yet.
  if (!loaded) {
    return (
      <FakeLandscapeView style={styles.rotatable}>
        <BaseStatsScreen onBack={safeBack} insets={insets} rotation={rotation}>
          <Text style={{ color: fgMuted, fontFamily: MONO_FONT }}>Loading…</Text>
        </BaseStatsScreen>
      </FakeLandscapeView>
    )
  }

  return (
    <FakeLandscapeView style={styles.rotatable}>
      <BaseStatsScreen onBack={safeBack} insets={insets} onReset={resetAll} resetConfirmBody='This permanently erases every high score, stat and achievement. This cannot be undone.' rotation={rotation}>
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

        {SNAKE_MODES.map((mode) => (
          <StatSection key={mode} label={MODE_LABELS[mode].toUpperCase()}>
            <StatRow label='High Score' value={String(statsView.byMode[mode].bestScore)} />
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

        <ActivityStatSection stats={statsView} />

        <AchievementCatalogSection rows={getAchievementCatalogRows(ACHIEVEMENT_CATALOG, stats, statsView, unlockedAchievements, effectiveProfileId)} />
      </BaseStatsScreen>
    </FakeLandscapeView>
  )
}

const styles = StyleSheet.create({
  boldText: {
    fontWeight: 'bold'
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
