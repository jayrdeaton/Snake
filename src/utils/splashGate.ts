import { createGate } from '@rific/splash-gate'

// Every async condition the very first screen depends on, named once here so nothing can be
// forgotten silently. See Theme.tsx for where each one actually reports in. Add a new gate here,
// and mark it ready from wherever it resolves, any time a future screen picks up a new async
// dependency of its own (a hydrated preference, an auth check, ...).
//
// SplashGate (the Gate component) is exported alongside markSplashReady/useSplashReady/
// pendingSplashGates for a provider that mounts a third-party component whose internal state
// locks in on first render (a lazy useState(() => initialProp) initializer) and so must not render
// until its real value exists, or the gate reporting ready doesn't help — see @rific/splash-gate's
// own README ("Guarding against a child that renders before its data does") for the general
// pattern. `theme`/`fonts` don't have that shape (PersistGate already blocks every child below it
// until Redux's persisted state has rehydrated, so `settings` is already correct the first time
// Theme.tsx renders, and Theme.tsx reports both of those two gates with plain markReady/useReady
// calls, no Gate needed) — `profiles` is this app's first real use of Gate: see useProfiles.tsx's
// own ProfilesProvider, which wraps its children in `<SplashGate gate='profiles' ...>` for exactly
// this reason (closing the /loadout lazy-color-initializer race documented there).
export const { markReady: markSplashReady, useReady: useSplashReady, pendingGates: pendingSplashGates, Gate: SplashGate } = createGate(['theme', 'fonts', 'profiles'] as const)
