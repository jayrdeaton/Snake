import { useAutoPaperTheme } from '@rific/auto-paper'
import { OrientationProvider, RotationAwareStatusBar, useThemedRootBackground } from '@tastic/core'
import { Stack } from 'expo-router'
import { DeviceMotion } from 'expo-sensors'
import * as SplashScreen from 'expo-splash-screen'
import { type ReactNode } from 'react'

import { GuideHost } from '@/components/GuideHost'
import { Providers } from '@/components/Providers'
import { UpdateDialog } from '@/components/UpdateDialog'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { ProfilesProvider } from '@/hooks/useProfiles'
import { useSettings } from '@/hooks/useSettings'

SplashScreen.preventAutoHideAsync()
SplashScreen.setOptions({ fade: true, duration: 400 })

const RootNavigator = () => {
  const { dark } = useAutoPaperTheme()
  return (
    <Stack
      screenOptions={useThemedRootBackground(
        dark,
        // gestureEnabled: false - iOS's native swipe-back gesture otherwise fights
        // TouchInputLayer's own swipe-to-turn Pan gestures on /game. Same rationale as
        // LightCycles' root _layout.tsx (confirmed there on-device): the OS gesture wins,
        // silently kicking the player back to the title screen mid-round instead of turning
        // their snake. The title screen has nothing to swipe back to either way, and /game's
        // own game-over dialog is the way back out once a round ends.
        false
      )}
    >
      {/* (tabs) removed - that group's directory was already deleted in an earlier phase, and
      this app has no tab bar; its real screens are the title screen, the loadout screen (1
      Player/2 Player - see loadout.tsx), the game itself, and profile management. */}
      <Stack.Screen name='index' />
      <Stack.Screen name='loadout' />
      <Stack.Screen name='game' />
      <Stack.Screen name='profiles' />
    </Stack>
  )
}

// Wires the persisted Lock Orientation setting into @tastic/core's OrientationProvider. Its own
// component because RootLayout renders the Redux store (inside Providers) and so can't call
// useSettings() itself. Providers' PersistGate holds rendering until the store has rehydrated, so
// lockInitialValue carries the saved lock from the very first render.
//
// freezeWhileLocked makes the lock app-wide: while settings.lockOrientation is on, the ONE shared
// orientation reading freezes for every consumer (every screen, the in-game board, hud dialogs, the
// status bar), including anything that mounts after the lock, so no call site ever takes a `locked`
// argument of its own (one would freeze on the pre-sensor default at mount). The Settings dialog
// toggle only writes settings.lockOrientation, which reaches the provider as a changed
// lockInitialValue; the provider reports the angle it froze on through onLockChange (`rotation`,
// cleared on unlock), persisted as settings.lockedRotation and handed back here so a relaunch reopens
// in the locked orientation instead of portrait.
//
// Mounted once, here, rather than per screen: one app-lifetime sensor subscription is what lets the
// committed orientation survive navigation. deviceMotion is the app's own expo-sensors import, handed
// in because @tastic/core never imports expo-sensors itself (apps without tilt tracking would
// otherwise need it installed just to bundle).
function OrientationBridge({ children }: { children: ReactNode }) {
  const { settings, setSettings } = useSettings()
  return (
    <OrientationProvider deviceMotion={DeviceMotion} freezeWhileLocked lockInitialValue={{ locked: settings.lockOrientation, rotation: settings.lockedRotation }} onLockChange={(next) => setSettings({ lockOrientation: next.locked, lockedRotation: next.rotation })}>
      {children}
    </OrientationProvider>
  )
}

const RootLayout = () => {
  return (
    <Providers>
      {/* UpdateDialog is mounted here, as a sibling of OrientationProvider, so it sits inside
      Providers' own <ToastProvider> tree (Providers.tsx renders <ToastProvider>{children}
      <Toaster .../></ToastProvider>) and its onError -> toast wiring has a real useToast() context
      to call into. It replaces the old bare useUpdater() call this function used to make directly
      - that call had no UI of its own (useUpdater's default is a native Alert.alert prompt, a
      hard no-op on web); this renders a themed ConfirmDialog instead, via @tastic/hud's own
      UpdateDialog, which now owns the useUpdater() instance end to end. */}
      <UpdateDialog />
      {/* OrientationProvider (via OrientationBridge above) is mounted once, here, above the
      navigator, not inside Providers.tsx itself. Providers.tsx is the generic, game-agnostic
      Expo-Starter provider stack (Redux/theme/feedback/scroll-view) that a future non-split-screen
      spinoff from the same starter would still want as-is; OrientationProvider is specific to
      this app's face-to-face/side-by-side Vs CPU and 2 Player modes, so it lives alongside the
      navigator it actually serves instead of inside that shared abstraction. Matches LightCycles'
      own root _layout.tsx, which mounts it the same way for the same reason: a single app-lifetime
      sensor subscription is what makes the committed orientation survive screen navigation (index
      -> game and back), instead of each screen's own hook instance restarting from a default guess
      on every mount. */}
      {/* @tastic/core's own OrientationProvider never imports expo-sensors itself - a real
      top-level import there would force every consumer of the package (even one with zero
      interest in tilt tracking) to have expo-sensors installed, or Metro fails to resolve it.
      This app genuinely wants live tilt tracking, so it does its own real import and hands the
      resolved module in via OrientationBridge's deviceMotion prop. */}
      <OrientationBridge>
        {/* GameStatsProvider wraps ProfilesProvider, not the other way around: stats come straight
        from the Redux store (already rehydrated under PersistGate), so it has nothing to wait for and
        stays outside the 'profiles' splash gate ProfilesProvider wraps its children in below.
        Everything ProfilesProvider actually renders (RootNavigator, and every screen it owns,
        /loadout included) sits inside that gate instead. */}
        <GameStatsProvider>
          <ProfilesProvider>
            {/* Wraps the navigator (rather than sitting beside it like UpdateDialog above) because
            Home's useAutoShowGuide() and the Home/loadout Settings dialogs' "How to Play" row reach
            it through context (see GuideHost's own doc). Must stay inside Providers (Redux, the
            Paper theme whose Portal the card renders through) and OrientationProvider (it reads the
            shared orientation reading to rotate the card), and inside ProfilesProvider's 'profiles' gate so it mounts
            together with Home rather than before it. */}
            <GuideHost>
              <RootNavigator />
            </GuideHost>
          </ProfilesProvider>
        </GameStatsProvider>
        {/* Hides the OS status bar whenever content elsewhere is visually rotated (see
        @tastic/core's getViewRotation/FakeLandscapeView), matching BoxHockey's/LightCycles'/
        AirHockey's use of the same shared component. /game additionally hides it unconditionally
        (see its own <StatusBar hidden />), so this only actually matters on /index, /loadout,
        /achievements and /profiles. It reads the same shared reading as the visible content, which
        OrientationBridge freezes while Lock Orientation is on, so the two can't disagree. */}
        <RotationAwareStatusBar />
      </OrientationBridge>
    </Providers>
  )
}

export default RootLayout
