import { AchievementTier, tieredFamily } from '@tastic/achievements'

import { AchievementDefinition, StatsState } from '@/types'
import { CpuDifficulty } from '@/utils/snakeAi'
import { getBestScoreAnyMode, getModesPlayed, getTotalPlayed, getTotalScore } from '@/utils/statsEngine'

export { ACHIEVEMENT_TIER_COLORS } from '@tastic/achievements'

// Solo, Vs CPU and 2 Player — hardcoded rather than imported so this stays a dependency-light,
// Jest-safe constants file.
const TOTAL_MODES = 3

const CPU_DIFFICULTY_TIER: Record<CpuDifficulty, AchievementTier> = { easy: 'bronze', normal: 'silver', hard: 'gold' }
const CPU_DIFFICULTY_LABEL: Record<CpuDifficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' }

// Three different predicates, not one value against three thresholds — hand-written, with no
// `progress`, since a fraction of "beat Hard once" isn't meaningful.
function beatCpuFamily(): AchievementDefinition[] {
  const titles: Record<CpuDifficulty, string> = { easy: 'Out-Slithered', normal: 'Worthy Opponent', hard: 'Apex Predator' }
  return (['easy', 'normal', 'hard'] as CpuDifficulty[]).map((difficulty) => ({
    id: `beat_cpu_${difficulty}`,
    title: titles[difficulty],
    description: `Beat the CPU on ${CPU_DIFFICULTY_LABEL[difficulty]} difficulty.`,
    tier: CPU_DIFFICULTY_TIER[difficulty],
    icon: 'robot',
    isUnlocked: (stats: StatsState) => stats.byDifficulty[difficulty].wins >= 1
  }))
}

export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  { id: 'first_game_played', title: 'First Slither', description: 'Play your first round.', tier: 'bronze', icon: 'flag-checkered', isUnlocked: (stats) => getTotalPlayed(stats) >= 1 },
  { id: 'first_ever_win', title: 'First Victory', description: 'Beat another snake — CPU or human.', tier: 'bronze', icon: 'star', isUnlocked: (stats) => stats.versus.wins >= 1 },
  {
    id: 'flawless_debut',
    title: "Beginner's Luck",
    description: 'Win the very first round you ever play.',
    tier: 'gold',
    icon: 'star-circle',
    // firstGameResult is a one-time device-wide flag with no per-profile analog, so it always
    // evaluates against the real device stats regardless of which profile tab is selected. A solo
    // first round records as a draw, so it can never satisfy this.
    scope: 'device',
    isUnlocked: (stats) => stats.firstGameResult === 'win'
  },
  ...tieredFamily<StatsState>({ id: 'games_played', titles: { bronze: 'Getting Started', silver: 'Regular', gold: 'Veteran' }, description: (n) => `Play ${n} total rounds.`, icon: 'gamepad-variant', thresholds: { bronze: 10, silver: 50, gold: 200 }, value: getTotalPlayed }),
  ...tieredFamily<StatsState>({ id: 'high_score', titles: { bronze: 'Peckish', silver: 'Hungry', gold: 'Insatiable' }, description: (n) => `Reach a score of ${n} in a single round.`, icon: 'food-apple', thresholds: { bronze: 25, silver: 75, gold: 200 }, value: getBestScoreAnyMode }),
  ...tieredFamily<StatsState>({ id: 'total_score', titles: { bronze: 'Grazer', silver: 'Feaster', gold: 'Devourer' }, description: (n) => `Score ${n} points across every round.`, icon: 'silverware-fork-knife', thresholds: { bronze: 250, silver: 2000, gold: 10000 }, value: getTotalScore }),
  ...tieredFamily<StatsState>({ id: 'longest_snake', titles: { bronze: 'Lengthy', silver: 'Serpentine', gold: 'Leviathan' }, description: (n) => `Grow a snake ${n} segments long.`, icon: 'ruler', thresholds: { bronze: 20, silver: 50, gold: 100 }, value: (stats) => stats.longestSnake }),
  ...tieredFamily<StatsState>({ id: 'versus_wins', titles: { bronze: 'Winner', silver: 'Big Winner', gold: 'Champion' }, description: (n) => `Win ${n} rounds against another snake.`, icon: 'trophy', thresholds: { bronze: 5, silver: 25, gold: 100 }, value: (stats) => stats.versus.wins }),
  ...tieredFamily<StatsState>({ id: 'versus_streak', titles: { bronze: 'On a Roll', silver: 'Hot Streak', gold: 'Unstoppable' }, description: (n) => `Win ${n} rounds in a row.`, icon: 'fire', thresholds: { bronze: 3, silver: 5, gold: 10 }, value: (stats) => stats.versusStreak.bestWinStreak }),
  ...beatCpuFamily(),
  ...tieredFamily<StatsState>({ id: 'mode_explorer', titles: { bronze: 'Curious', silver: 'Well Rounded', gold: 'Every Mode' }, description: (n) => (n === TOTAL_MODES ? 'Play every mode in the app.' : `Play ${n} different modes.`), icon: 'view-grid', thresholds: { bronze: 1, silver: 2, gold: TOTAL_MODES }, value: getModesPlayed }),
  ...tieredFamily<StatsState>({ id: 'local_matches', titles: { bronze: 'Pass the Phone', silver: 'Couch Champion', gold: 'Living Room Legend' }, description: (n) => `Play ${n} local two-player rounds.`, icon: 'account-multiple', thresholds: { bronze: 10, silver: 50, gold: 150 }, value: (stats) => stats.byMode.twoPlayer.played }),
  ...tieredFamily<StatsState>({ id: 'days_played', titles: { bronze: 'Regular Visitor', silver: 'Dedicated', gold: 'Devoted' }, description: (n) => `Play ${n} days in a row.`, icon: 'calendar-check', thresholds: { bronze: 3, silver: 14, gold: 30 }, value: (stats) => stats.bestDayStreak })
]
