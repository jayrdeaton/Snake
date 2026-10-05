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
