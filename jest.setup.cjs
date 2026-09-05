/* global jest */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Jest's manual __mocks__/ auto-pickup doesn't reliably extend to a subpath import
// (only bare package names). src/__mocks__/redux-persist/integration/react.ts needs
// an explicit registration or the real module loads silently instead. See Hangman's
// jest.setup.cjs / Jest-Config's CLAUDE.md for the full investigation.
jest.mock('redux-persist/integration/react')

// Theme.tsx imports this bare subpath directly (`@expo/vector-icons/MaterialCommunityIcons`) to
// preload the icon font — there's no src/__mocks__/ file for it at all (distinct from the
// '@expo/vector-icons' barrel mocked separately), so without this registration it silently loads
// the real font-glyph component in every test that renders Theme. Same gap, same fix, as
// Hangman's own jest.setup.cjs for the identical import.
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({
  __esModule: true,
  default: ({ children }) => children || null,
  font: {}
}))

// Every src/hooks/sounds/use*Sounds.ts file (useDefaultSounds.ts, useWarmSounds.ts, etc.) imports
// useAudioPool from this subpath directly. There's no src/__mocks__/ file for it, and the bare
// 'expo-audio' manual mock above only covers @rific/feedback-press/audio's own internal
// dependency, not the subpath itself — so without this registration the real hook loads
// unmocked. Confirmed directly: a console.warn probe planted in the real, resolved
// src/audio/index.ts (Jest resolves this package's 'react-native' export condition here, not its
// CJS 'dist/' build, so probing dist/audio/index.js alone would have missed it) fired while
// running src/__tests__/app/index.test.tsx and src/__tests__/app/_layout.test.tsx (both mount
// Providers -> useDefaultSounds). Same asymmetry as the @expo/vector-icons/MaterialCommunityIcons
// fix above — see this repo's .claude/CLAUDE.md and Hangman's own jest.setup.cjs for the full
// investigation. Stubbed as a no-op play trigger, matching the real hook's signature:
// (source, options) => playFn.
jest.mock('@rific/feedback-press/audio', () => ({
  __esModule: true,
  useAudioPool: () => () => {}
}))

const handleUnhandledRejection = (reason) => {
  console.error('UnhandledRejection in tests:', reason) // eslint-disable-line no-console
}
const handleUncaughtException = (err) => {
  console.error('UncaughtException in tests:', err) // eslint-disable-line no-console
}

if (typeof process !== 'undefined' && process?.on) {
  process.on('unhandledRejection', handleUnhandledRejection)
  process.on('uncaughtException', handleUncaughtException)
}

try {
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper')
} catch {
  // ignore
}

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
}
if (typeof globalThis.cancelAnimationFrame === 'undefined') {
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id ?? undefined)
}
