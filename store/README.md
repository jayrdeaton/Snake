# App Store

Everything the iOS listing needs. The text lives in `store.config.json` (repo root), which `eas metadata:push` sends to App Store Connect. The rest is set by hand in App Store Connect once and carries over to later versions.

## Pushed by EAS Metadata (`store.config.json`)

Title, subtitle, promotional text, description, keywords, marketing/support/privacy URLs, copyright, categories (Games > Action, Casual) and the age rating answers (all None, so 4+).

```bash
eas metadata:lint
```

```bash
eas metadata:push
```

`push` needs the app record to exist in App Store Connect and edits its editable version, setting its number to `store.config.json`'s `apple.version`. Keep that equal to `app.json`'s `expo.version` and bump both together: without it, push sends no version number and Apple refuses the version step (copyright, promo text, description, keywords, support and marketing URLs) while the rest goes through. The first `eas submit` creates the record (named by `eas.json`'s `submit.production.ios.appName`) when you sign in with your Apple ID. Apple's API can't create apps, so with an API key create it first: My Apps > + > New App, bundle ID `com.infinitetoken.Snake`, name `SnakeTastic`, primary language English (U.S.).

Limits: title 30, subtitle 30, promotional text 170 (editable any time without review), description 4000, keywords 100 in total with the commas. Keywords don't repeat words already in the title or subtitle ("snake", "classic", "game", "ad", "free" are indexed from the subtitle; "SnakeTastic" is one word, so it does NOT match a search for "snake" on its own).

`releaseNotes` (What's New) is left out for the first version, which has none. Add it to `info.en-US` for every later version.

## Screenshots (uploaded by hand)

`store/screenshots/iphone-medium/` (1206x2622) goes in the "iPhone 6.1" or 6.3" displays" slot, which App Store Connect requires (a 1320x2868 file there fails with "File dimensions are invalid"). `store/screenshots/iphone/` (1320x2868) is for the optional 6.9" slot, and `store/screenshots/ipad/` (2064x2752) for the 13" iPad slot. Apple scales these to every smaller device. The iPad set is required because `ios.supportsTablet` is on. The order in the folder is the upload order; the first three are what search results show. Shot 06 differs by device (`06-highscore` on iPhone, `06-results` on iPad).

The PNGs are build output and are gitignored, along with the raw captures they were made from (`store/screenshots/raw/`). The captions are in `store/screenshots.json`.

How they were made 2026-10-19 on 1.1.4: a Release build on the `AppStore iPhone 6.9` (iPhone 17 Pro Max) and `AppStore iPad 13` (iPad Pro 13" M5) simulators, status bar pinned to 9:41 with full battery, dark appearance. The saved data was written before launch by `store/seed/reseed.sh`: sound off, the guide seen, Maya and Leo selected (the shared roster's profiles), and three weeks of stats and achievements from `store/seed/generate.mjs`, which plays 120 real rounds with the app's own engine, CPU AI, stats engine and achievement catalog (a 28-37 versus record, 24 of 33 achievements), so every number on screen is one the app produced. Gameplay shots are on the Large grid.

A live round can't be steered by simulator taps (a tick is 110 ms), so the gameplay came from a screenshot-only build: a temporary patch in `useSnakeState.ts`, active only when `EXPO_PUBLIC_STORE_AUTOPILOT=1`, steers the human snakes with the app's own Hard CPU AI. For the iPad the same flag also raised `CPU_FLOOD_FILL_CAP` (`src/utils/snakeAi.ts`) from 900 to 6000 cells, since the iPad board was bigger than the CPU's food search and the snake otherwise circled without finding food (fixed in the game since: the food search now covers the whole board, so a reshoot only needs the steering patch). The patch was never committed; everything on screen is the real game rendering. Captures are `simctl io screenshot` stills (video recording dropped frames on a busy Mac). The compositor puts each capture under its caption in Fredoka SemiBold (the app's display font) on one dark green for the whole set.

The shots: 01 a long Solo snake, 02 a 2 Player round (Maya vs Leo), 03 Solo in Pillars, 04 Solo with every powerup on (a pickup on the board and a held Sidewind badge in the corner), 05 the face-to-face 2 Player loadout, 06 a Solo game over with New High Score on iPhone and the per-seat 2 Player result cards on iPad (rounds there are too long to wait for a crash), 07 the Stats and Achievements screen.

To redo them:

1. `node store/seed/generate.mjs` (writes `store/seed/seed.json`, gitignored)
2. Apply the autopilot steering patch, build with `EXPO_PUBLIC_STORE_AUTOPILOT=1` (the skill's `sim-build.sh`), install on both simulators (`sim-setup.sh --app`), then revert the patch
3. `store/seed/reseed.sh <udid> '<settings json>' '<selection json>'` before each shot (for example `'{"gridSizeTier":"large","arenaVariant":"pillars"}' '{"1":null,"2":null}'` for 03), play from Home, and save stills into `store/screenshots/raw/<iphone|ipad>/<name>.png`
4. The skill's `compose.mjs store/screenshots.json`

## Header and search results art (uploaded by hand, optional, iOS 27+)

`store/screenshots/header.png` (3840 x 1646) and `store/screenshots/search.png` (3840 x 2560), gitignored like the screenshots, made by `node store/creative/build.mjs`:

- **Header:** the live game board, full bleed, drawn by the app's own Skia board at 4K: `store/creative/capture-board.mjs` loaded the screenshot-only web export (`EXPO_PUBLIC_STORE_AUTOPILOT=1 WEB_BASE_URL=/snake npx expo export -p web`, served locally) at `/snake/game?mode=solo&p1Color=%232E7D32` in headless Chrome at 762 x 327 and a 5.04 pixel ratio, and the frame with the head and food in the safe area was kept as `store/screenshots/raw/header-board.png`. No words: the app's name sits right under it.
- **Search results:** "Classic Snake / Solo, Vs CPU, or 2 Player. No ads." beside the Solo capture (`store/screenshots/raw/iphone/01-solo.png`) in a phone, on the screenshots' green, in Fredoka.

Each comes with `-safe.png` (the safe area from Apple's templates outlined) and `-384.png` (about a search card's size on a phone). Upload in the version's Product Page Information > Header and Search Results (Header, then Search Results), then check both with Preview. The header has no words, so it can go on every localization; the search image's words are English, so it goes on English only. They're reviewed with the version, or on their own through Asset Library.

## Set by hand in App Store Connect

**App Privacy:** "No, we don't collect data from this app" (Data Not Collected). Nothing leaves the device except the Expo update check, which carries no personal data (the app version, platform and a random installation ID used to serve the right update), and there is no tracking, so no App Tracking Transparency prompt either. This matches the privacy policy at https://games.infinitetoken.com/privacy. Revisit it if analytics, crash reporting, ads or accounts are ever added.

**App Review Information:** sign-in not required. Contact: name, email and phone (the phone stays out of `store.config.json`, which is public). Notes:

> No account or sign-in is needed, and there are no in-app purchases or ads.
>
> The app turns its own screen using the motion sensor, so the system orientation stays portrait and the app runs full screen on iPad. Turn the device to see the landscape layout. Lock Orientation is in Settings (the cog on the Home screen).
>
> 2 Player is two people on one device at the same time: each player swipes in their own half of the screen, sitting face to face. Vs CPU is under 1 Player: pick a CPU snake (Garter, Rattler or King Cobra) for player 2 before tapping Ready.
>
> A match pauses when the app goes to the background and stays paused until a player taps Resume.
>
> Player profiles are shared through an App Group with other Tastic games by the same developer, if any are installed. No profile, progress or other game data leaves the device.
>
> On first launch a three-card How to Play guide appears. Tap Skip to go straight to the game.

**Content Rights:** yes, the app contains third-party content, and the rights are covered: the display font is Fredoka (SIL Open Font License 1.1) and the icons are Material Design Icons (Pictogrammers, Apache 2.0, through `@expo/vector-icons`). The sound effects are treated as the app's own (the repo README lists the audio as original); confirm that before answering.

**License Agreement:** Apple's standard EULA (the default). A custom one only matters for subscriptions, accounts or user content, none of which this app has.

**Pricing and Availability:** Free (0.00 USD base price), every country or region except China mainland (needs a government game approval number) and Vietnam (needs a game license from a local company), the same as SolitaireTastic. Apple Silicon Mac and Apple Vision Pro availability unticked: the app has never been run on a Mac (no accelerometer, untested window sizing) or a Vision Pro. Distribution method Public. No In-App Purchases, Subscriptions, Game Center or Growth & Marketing items.

**Export compliance:** already answered by `ITSAppUsesNonExemptEncryption: false` in `app.json`, so App Store Connect doesn't ask.

**Accessibility (optional):** Dark Interface can be claimed for iPhone and iPad (the app follows the system appearance). Nothing else until each feature has been checked on a device. Apple asks per feature (VoiceOver, Larger Text, Dark Interface, Reduced Motion and so on), and a claim that doesn't hold up is worse than none.

**Version release:** manual (you press Release), so the Tastic games can go live together.

## Shipping a version

1. `npm run verify`
2. `jrd ship build production`
3. `eas submit -p ios --profile production` (uploads the build to TestFlight)
4. `eas metadata:push`
5. Upload the screenshots, and the header and search art, if they changed
6. In App Store Connect: pick the build, fill in anything new above, and Add for Review
