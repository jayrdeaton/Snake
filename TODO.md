# TODO

Open fixes after the 2026-10-15 release review. Line numbers are as of that date. The "After launch" items are JS-only, so they can ship as OTA updates.

## Before launch

Nothing open: the 2026-10-15 live checks passed and keep-awake is in (see CLAUDE.md).

## After launch

1. **Android hardware back and web browser back skip "Quit Match?"** (audit F093). `useQuitConfirmation` only catches the on-screen back chip. Needs hud support (an opt-in `BackHandler` in `useQuitConfirmation`, plus a router-level block for web). Before an Android release; iOS is unaffected.
2. **The Update Available prompt and toasts stay portrait while the screen is turned** (audit F007). `src/components/UpdateDialog.tsx` passes no `rotation`, and the Toaster sits outside any turned frame. Pass `rotation`, or mount both in hud's `RotatedFrame`.
3. **Home's hero snake keeps animating under `/loadout` and `/game`** (audit F016). `HeroSnakeTrail` gets `active={!reducedMotion}` only. Also gate it on focus and app state, as Solitaire's HeroCards does (`useIsFocused` plus AppState).
4. **The tick loop rounds every tick up to a whole frame** (audit F065). At 60Hz the 110ms normal speed runs at about 117ms, and speed varies with the display's refresh rate. Leave it unless the speeds are retuned at the same time: fixing only the loop makes every game faster than it has been tuned. A fixed-step hook in `@tastic/core` would cover LightCycles too.
5. **A loadout shared-setting dropdown can open toward the wrong edge during the 180ms panel-swap fade** (audit F225; from reading the code, not reproduced). Pass the `panelLayout` rotation to each shared-control trigger, as BoxHockey does.

## Expo SDK 58 follow-ups (2026-10-16)

Deferred to ship SDK 58 the same day:

- **Check it on a device.** Verify, typecheck and an iOS prebuild pass, but nothing ran on hardware: launch (SDK 58's scene life cycle), swiping a toast away (`@rific/toaster` 0.8.1 and `@rific/scroll-view` 0.9.2 only had their gesture-handler 3 peer range raised, and their tests mock gesture-handler), scrolling the achievements and settings lists, the board and the Home hero snake (both moved to Skia 2.14's `PathBuilder`), and the edge-gesture guard.
- **React Native 0.88 strict types.** `@infinitetoken/tsconfig` 0.6 resolves React Native 0.88's legacy types, and React Native drops them after 0.88. This app's own code is already clean under the strict types (checked 2026-10-16 with `customConditions: ["react-native"]` only); the errors it sees are all in package source it type-checks (`@rific/scroll-view` 27, `@tastic/hud` 15, `@tastic/split-screen` 6, `@rific/auto-paper` 3, `@tastic/profile` 3, `@tastic/core` 1, `@rific/updater` 1). Fix those packages first (their TODO.md files), then drop the deferral.
