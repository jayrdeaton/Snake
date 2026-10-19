// Seed data for the App Store screenshots (see store/README.md), made by the app's own engine, CPU AI,
// stats engine and achievement catalog: three weeks of real rounds on the board an iPhone 17 Pro Max
// gets, by a player who makes fewer mistakes as the weeks go on, in Solo, Vs CPU (all three
// difficulties) and 2 Player (Maya vs Leo), so every number on the Stats screen is one the app produced.
//
//   node store/seed/generate.mjs        writes store/seed/seed.json (gitignored), then store/seed/reseed.sh
//
// Deterministic apart from the dates, which count back from now.
import { build } from 'esbuild'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '../..')

const ENTRY = `
import { newlyUnlocked, unlockedKey } from '@tastic/achievements'
import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'
import { createInitialSnakeState, tickSnake, applySnakeTurnIntent } from '@/utils/snakeEngine'
import { applyCpuSnakeTurn } from '@/utils/snakeAi'
import { applyRoundOutcome, getProfileStatsView } from '@/utils/statsEngine'
import { DEFAULT_STATS } from '@/utils/statsValidation'
export { ACHIEVEMENT_CATALOG, createInitialSnakeState, tickSnake, applySnakeTurnIntent, applyCpuSnakeTurn, applyRoundOutcome, getProfileStatsView, DEFAULT_STATS, newlyUnlocked, unlockedKey }
`

const out = path.join(HERE, '.bundle.cjs')
await build({
  stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  alias: { '@': path.join(ROOT, 'src') },
  logLevel: 'error'
})
const app = createRequire(import.meta.url)(out)
fs.rmSync(out)

let rng = 2026
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff), rng / 0x7fffffff)

// The board an iPhone 17 Pro Max gets at the default Medium grid (18 pt cells).
const GRID = { cols: 24, rows: 50 }
const DIRECTIONS = ['up', 'down', 'left', 'right']
const PROFILES = [
  { id: 'seed-maya', name: 'Maya', color: '#00bcd4', tag: 'MK' },
  { id: 'seed-leo', name: 'Leo', color: '#ff9800', tag: 'LEO' },
  { id: 'seed-priya', name: 'Priya', color: '#d500f9', tag: 'PJ' }
]

// A human seat: the CPU's own steering, plus a wrong turn now and then (fewer as the player improves).
function steerHuman(state, id, mistakeRate) {
  const steered = app.applyCpuSnakeTurn(state, id, 'hard', rand)
  return rand() < mistakeRate ? app.applySnakeTurnIntent(steered, id, DIRECTIONS[Math.floor(rand() * 4)]) : steered
}

function playRound(mode, cpuDifficulty, mistakes) {
  const settings = { wrapEdges: false, speedTier: 'normal', arenaVariant: ['open', 'open', 'pillars', 'portals', 'gauntlet', 'underpass'][Math.floor(rand() * 6)], enabledPowerups: [] }
  let s = app.createInitialSnakeState(GRID, mode === 'solo' ? 1 : 2, settings, undefined, rand)
  for (let tick = 0; tick < 20000 && s.phase !== 'roundOver'; tick++) {
    s = steerHuman(s, 1, mistakes[1])
    if (mode === 'twoPlayer') s = steerHuman(s, 2, mistakes[2])
    if (mode === 'vsCpu') s = app.applyCpuSnakeTurn(s, 2, cpuDifficulty, rand)
    s = app.tickSnake(s, rand)
  }
  const seats = {}
  for (const snake of s.snakes) if (snake.id === 1 || mode === 'twoPlayer') seats[snake.id] = { score: snake.score, snakeLength: snake.peakLength }
  return { mode, seats, winner: s.outcome?.type === 'win' ? s.outcome.winnerId : null, arena: settings.arenaVariant }
}

const DAYS = 21
const SKIPPED_DAYS = new Set([5])
const now = Date.now()
let stats = app.DEFAULT_STATS
let unlocked = {}
const log = []

for (let day = 0; day < DAYS; day++) {
  if (SKIPPED_DAYS.has(day)) continue
  const skill = day / (DAYS - 1)
  const rounds = 4 + Math.floor(rand() * 6)
  const dayStart = new Date(now - (DAYS - day) * 86400000)
  dayStart.setHours(18 + Math.floor(rand() * 3), Math.floor(rand() * 60), 0, 0)
  for (let r = 0; r < rounds; r++) {
    const when = new Date(dayStart.getTime() + r * 4 * 60000)
    const roll = rand()
    const mode = roll < 0.4 ? 'solo' : roll < 0.8 ? 'vsCpu' : 'twoPlayer'
    const pick = rand()
    const cpuDifficulty = skill < 0.3 || pick < 0.4 ? 'easy' : pick < 0.85 ? 'normal' : 'hard'
    const base = 0.04 - 0.03 * skill
    // Against the CPU the player is careful (fewer stray turns), so Vs CPU wins come out near two in three.
    const mistakes = { 1: mode === 'vsCpu' ? base * 0.25 : base, 2: base * (1.1 + rand() * 0.4) }
    const profileIds = mode === 'twoPlayer' ? { 1: 'seed-maya', 2: 'seed-leo' } : rand() < 0.7 ? { 1: 'seed-maya' } : {}
    const outcome = playRound(mode, cpuDifficulty, mistakes)
    stats = app.applyRoundOutcome(stats, outcome, { cpuDifficulty, profileIds }, when)
    const t = when.getTime() + 60000
    for (const a of app.newlyUnlocked(app.ACHIEVEMENT_CATALOG, stats, unlocked)) unlocked[a.id] = t
    for (const [profileId, bucket] of Object.entries(stats.profiles)) {
      for (const a of app.newlyUnlocked(app.ACHIEVEMENT_CATALOG, app.getProfileStatsView(bucket), unlocked, profileId)) unlocked[app.unlockedKey(a.id, profileId)] = t
    }
    log.push(`${when.toISOString().slice(0, 10)} ${mode.padEnd(9)} ${mode === 'vsCpu' ? cpuDifficulty.padEnd(6) : '      '} ${outcome.arena.padEnd(9)} ${JSON.stringify(outcome.seats)} winner=${outcome.winner}`)
  }
}

const deviceUnlocks = Object.keys(unlocked).filter((k) => !k.includes(':'))
console.log(log.slice(-8).join('\n'))
console.log(`rounds ${log.length}, byMode ${JSON.stringify(stats.byMode)}, versus ${JSON.stringify(stats.versus)}, longest ${stats.longestSnake}, best day streak ${stats.bestDayStreak}`)
console.log(`device unlocks ${deviceUnlocks.length}/${app.ACHIEVEMENT_CATALOG.length}: ${deviceUnlocks.join(', ')}`)

const createdAt = now - 25 * 86400000
fs.writeFileSync(
  path.join(HERE, 'seed.json'),
  JSON.stringify({ stats, unlocked, profiles: PROFILES.map((p, i) => ({ ...p, createdAt: createdAt + i * 86400000, updatedAt: createdAt + i * 86400000 })) }, null, 1)
)
console.log('wrote store/seed/seed.json')
