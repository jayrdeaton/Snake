# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

# Snake

A classic Snake game with Solo, Vs CPU, and local 2-player pass-and-play modes (Expo/React Native, Skia-rendered). Part of the `@rific`/`@tastic`/InfiniteToken app ecosystem — depends on `@rific/auto-paper`, `@rific/drawer`, `@rific/feedback-press`, `@rific/focus-chain`, `@rific/resizable-input`, `@rific/scroll-view`, `@rific/splash-gate`, `@rific/toaster`, `@rific/updater`, `@tastic/core`, `@tastic/input`, `@tastic/split-screen`. The most complex app in the fleet to migrate so far after CashierFu-Utility — real Redux Toolkit state (`@reduxjs/toolkit`, `react-redux`, `redux-persist`), plus dependencies no other game in the fleet has yet (`react-native-keyboard-controller`, `expo-linking`, `expo-secure-store`, `@shopify/flash-list`).

**Expo has changed.** Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code — don't rely on general Expo knowledge, this app is on SDK 57 specifically.

## Commands

```bash
npm run lint          # expo lint .
npm run fix            # expo lint . --fix
npm test               # Jest (11 suites, 99 tests)
npm run test:watch     # Jest --watchAll
npm run typecheck      # tsc
npm run verify         # lint + test + typecheck
npm run doctor         # expo install --fix && expo-doctor
npm start              # Expo dev server
npm run client          # Expo dev server (dev client build)
```

Always run `npm run lint` before finishing any task. This is an app (`"private": true`, no publish scripts) — `verify` doesn't include a build step.

`build:development`/`build:preview`/`build:production` and `update` (which `update:development`/`update:preview`/`update:production` delegate to) are each gated behind `verify` by prefixing `npm run verify && ` directly onto the script's own definition, same as every other migrated app — see [Swirlio](../Swirlio/.claude/CLAUDE.md)'s CLAUDE.md for the full reasoning (not redundant with CI, since EAS builds/OTA updates have no GitHub Action step to catch this the way `publish.yml` does; inline chaining rather than a separate `pre<script>` hook, since these are scripts we author ourselves, not builtin npm commands).

## Tooling

Onboarded onto the shared `@infinitetoken` config packages (`eslint-config`, `jest-config`, `tsconfig`) — previously hand-rolled its own `eslint-config-expo`-based config, `jest-expo`-preset-direct config, and `expo/tsconfig.base`-extending tsconfig (the same boilerplate pattern documented in [Swirlio](../Swirlio/.claude/CLAUDE.md)'s and [BoxHockey](../BoxHockey/.claude/CLAUDE.md)'s CLAUDE.md).

`npx expo install --fix` + `npm update` were run as part of this pass — `expo install --fix` genuinely found staleness (`expo`, `expo-constants`, `expo-font`, `expo-updates` were a patch behind); confirmed clean afterward: `npx expo install --check` reports up to date, `npm outdated` shows `Current === Wanted` for every dependency.

- `eslint.config.cjs` — `@infinitetoken/eslint-config/expo`, no local override
- `tsconfig.json` — `extends: "@infinitetoken/tsconfig/expo"`, keeps only the path-valued local bits (`paths`, `include`) — no `@shopify/react-native-skia` redirect needed here, unlike Swirlio/BoxHockey/LightCycles/AirHockey: confirmed by grep that this app never imports the package's `/src/web` deep path, so the typecheck-time gotcha those apps hit never triggers here
- `jest.config.cjs` — `@infinitetoken/jest-config/expo`, no options at all

**This app had already independently discovered and locally fixed the exact `.mjs` transform gap that `@infinitetoken/jest-config`'s own `expo.cjs` preset now fixes by default.** Its old `jest.config.ts` manually registered `babel-jest` for `\.mjs$` (with a comment explaining why: jest-expo's preset only transforms `.[jt]sx?$`, and any dual-CJS/ESM `@rific` package resolved to `.mjs` via its `"react-native"` export condition — e.g. after the Toaster worklets fix — hits raw `import` syntax and throws "Cannot use import statement outside a module"). That fix is now baked into the shared preset itself (see `Jest-Config/src/configs/expo.cjs`) — this app's local copy of it, along with the matching `testPathIgnorePatterns` for `.claude/worktrees/`, was dropped entirely rather than ported forward, since both are now defaults. Same for `moduleNameMapper` (including this app's `@/redux/*` alias) — auto-derived from `tsconfig.json`'s own `paths`, no local option needed.

**`jest.config.ts` became `jest.config.cjs`, `tsconfig.json`'s `types` array was removed, and `prettier.config.js` was deleted in favor of `"prettier": "@infinitetoken/eslint-config/prettier"` in `package.json`** — all for the same reasons documented in BoxHockey's/Swirlio's CLAUDE.md; nothing app-specific here. This app never had a `metro.config.js` at all (like Swirlio), so there was nothing to check/delete there.

**Native/Expo module mocks moved from inline `jest.mock()` calls in `jest.setup.cjs` into individual `src/__mocks__/*.ts` files** — the largest mock set in the fleet so far, reflecting this app's larger dependency surface: `react-native-reanimated`, `react-native-worklets`, `@expo/vector-icons`, `@react-native-async-storage/async-storage`, `expo-audio`, `expo-blur`, `expo-font`, `expo-linking`, `expo-splash-screen`, `react-native-gesture-handler`, `react-native-keyboard-controller`, `react-native-safe-area-context`, `redux-persist`, and `redux-persist/integration/react` (a scoped subpath mock, same convention as `@expo/vector-icons/createIconSet` elsewhere in the fleet — mirrors the resolved import path under `src/__mocks__/`). Each mock's content was ported verbatim from this app's own pre-migration `jest.setup.ts`, not copied from another app — several (`react-native-gesture-handler`'s `GestureHandlerRootView`/`Gesture.Native`, `react-native-safe-area-context` without an actual-module spread, `expo-font`'s MaterialCommunityIcons-subpath comment) are genuinely app-specific variants, not drift to converge away. `jest.setup.cjs` now holds only genuine setup-file content (the `IS_REACT_ACT_ENVIRONMENT` flag, `unhandledRejection`/`uncaughtException` handlers, the RAF/cancelAnimationFrame polyfills, and the no-factory `NativeAnimatedHelper` automock).

Note: `expo-router` and `expo-sensors` are real dependencies of this app but have no global manual mock — neither did before this migration. `src/__tests__/app/_not-found.test.tsx` has its own narrow, test-file-local `jest.mock('expo-router', ...)` instead (a one-off override for that single test, not a fleet-wide default) — left as-is, not promoted to a global mock, since nothing else currently needs `expo-router` mocked.

**Migrating onto `@infinitetoken/tsconfig/expo` turned on `noUnusedLocals` for the first time**, surfacing 4 dead `React` imports (leftover from before the `react-jsx` transform made them unnecessary) in `src/__tests__/app/_layout.test.tsx`, `src/__tests__/app/index.test.tsx`, `src/__tests__/components/Providers.test.tsx`, and `src/__tests__/components/Theme.test.tsx` — removed, same pattern as Swirlio's own 18-import cleanup.

**Migrating onto `@infinitetoken/eslint-config/expo` surfaced one stale `eslint-disable` directive** in `src/__tests__/app/_not-found.test.tsx` (a leftover `/* eslint-disable @typescript-eslint/no-require-imports */` no longer matching any actual violation under the new config) — removed via `eslint --fix`.

**This app never had a CI workflow at all** — `.github/workflows/` only had `docs.yml` (a TypeDoc-to-GitHub-Pages deploy, unrelated, left untouched). Added `.github/workflows/ci.yml` using the shared reusable workflow (`infinitetoken/Workflows/.github/workflows/npm-ci.yml@v1`, defaults to `npm run verify`) — a genuinely new file, not a rename/conversion of an existing hand-rolled one. There was also no `"ci"` script to rename; `"verify": "npm run lint && npm test && npm run typecheck"` was added fresh.

**Flagged, not fixed — out of scope for this tooling migration:** `docs.yml` runs `npm run docs` (TypeDoc generation) on every push to `main`, but no `"docs"` script exists in `package.json` at all — this workflow would fail the moment it actually ran. Looks like leftover boilerplate copied from one of the fleet's library packages (which do publish TypeDoc), not something that was ever wired up for this app. Worth a separate pass to either add a real `docs` script or delete the workflow.

`@infinitetoken/eslint-config` (`^0.2.0`), `@infinitetoken/jest-config` (`^0.2.3`), and `@infinitetoken/tsconfig` (`^0.4.1`) are all on real published versions — never yalc-linked for this app.

## Testing

- Framework: Jest (`@infinitetoken/jest-config/expo`, `jest-expo` preset)
- Tests live in `src/__tests__/`, mirroring the source subfolder structure (`app/`, `components/`, `constants/`, `redux/`, `utils/`)
- Native/Expo module mocks live in `src/__mocks__/`, one file per module (plus one scoped subpath), picked up automatically (no `jest.mock()` call needed) — see Tooling above
- `jest.setup.cjs` holds only genuine setup-file concerns: process-level error handlers, RAF polyfills, the `IS_REACT_ACT_ENVIRONMENT` flag

## Architecture

```
src/
  app/          - expo-router routes
  components/   - UI components (board rendering, controls, dialogs, providers)
  constants/    - static config, game params
  hooks/        - custom hooks, sounds/
  redux/        - Redux Toolkit store, slices, persistence
  types/        - shared TypeScript types
  utils/        - grid/engine logic, AI, splash gate, validation
  __tests__/    - test suites
  __mocks__/    - manual Jest mocks for native/Expo modules
```

## CI

`.github/workflows/ci.yml` uses the shared reusable workflow (`infinitetoken/Workflows/.github/workflows/npm-ci.yml@v1`, defaults to `npm run verify`) — newly added by this migration, see Tooling above. `docs.yml` is separate and unrelated (TypeDoc → GitHub Pages).
