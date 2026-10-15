# TODO

Open fixes after the 2026-10-15 release review. Line numbers are as of that date. The "After launch" items are JS-only, so they can ship as OTA updates.

## Before launch

Nothing open: the 2026-10-15 live checks passed and keep-awake is in (see CLAUDE.md).

## Needs Jay's call

1. **Device-wide unlocks show on both 2 Player cards** (audit F037). "Beginner's Luck" (win the first round ever played on this device) appears on the loser's card too, and with two guest seats every device-wide unlock goes on both cards, so the loser can read "Winner unlocked!". Suggested: in 2 Player, show device-wide unlocks only on the winner's card, and on both for a draw. Small filter in `game.tsx` before `seatResults` is built; slightly wrong when the loser set the high score.

## After launch

2. **Android hardware back and web browser back skip "Quit Match?"** (audit F093). `useQuitConfirmation` only catches the on-screen back chip. Needs hud support (an opt-in `BackHandler` in `useQuitConfirmation`, plus a router-level block for web). Before an Android release; iOS is unaffected.
3. **The Update Available prompt and toasts stay portrait while the screen is turned** (audit F007). `src/components/UpdateDialog.tsx` passes no `rotation`, and the Toaster sits outside any turned frame. Pass `rotation`, or mount both in hud's `RotatedFrame`.
4. **Home's hero snake keeps animating under `/loadout` and `/game`** (audit F016). `HeroSnakeTrail` gets `active={!reducedMotion}` only. Also gate it on focus and app state, as Solitaire's HeroCards does (`useIsFocused` plus AppState).
5. **The tick loop rounds every tick up to a whole frame** (audit F065). At 60Hz the 110ms normal speed runs at about 117ms, and speed varies with the display's refresh rate. Leave it unless the speeds are retuned at the same time: fixing only the loop makes every game faster than it has been tuned. A fixed-step hook in `@tastic/core` would cover LightCycles too.
6. **A loadout shared-setting dropdown can open toward the wrong edge during the 180ms panel-swap fade** (audit F225; from reading the code, not reproduced). Pass the `panelLayout` rotation to each shared-control trigger, as BoxHockey does.
