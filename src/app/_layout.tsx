import { getViewRotation, OrientationProvider, useOrientationState } from '@tastic/core'
import { Stack } from 'expo-router'
import { DeviceMotion } from 'expo-sensors'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'

import { Providers } from '@/components/Providers'
import { UpdateDialog } from '@/components/UpdateDialog'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { ProfilesProvider } from '@/hooks/useProfiles'

SplashScreen.preventAutoHideAsync()
SplashScreen.setOptions({ duration: 500, fade: true })

// Hides the OS status bar whenever content elsewhere is visually rotated (see @tastic/core's
// getViewRotation/@tastic/split-screen's FakeLandscapeView) — matches BoxHockey's/LightCycles'/
// AirHockey's identical RotationAwareStatusBar. /game additionally hides it unconditionally
// regardless (see its own <StatusBar hidden />), so this only actually matters on /index,
// /loadout, and /profiles.
function RotationAwareStatusBar() {
  const { orientationMode, p1OnRight, upsideDown } = useOrientationState()
  const rotation = getViewRotation(orientationMode, p1OnRight, upsideDown)
  return <StatusBar hidden={rotation !== 0} />
}

const RootNavigator = () => {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // gestureEnabled: false — iOS's native swipe-back gesture otherwise fights
        // TouchInputLayer's own swipe-to-turn Pan gestures on /game. Same rationale as
        // LightCycles' root _layout.tsx (confirmed there on-device): the OS gesture wins,
        // silently kicking the player back to the title screen mid-round instead of turning
        // their snake. The title screen has nothing to swipe back to either way, and /game's
        // own game-over dialog is the way back out once a round ends.
        gestureEnabled: false
      }}
    >
      {/* (tabs) removed — that group's directory was already deleted in an earlier phase, and
      this app has no tab bar; its real screens are the title screen, the loadout screen (1
      Player/2 Player — see loadout.tsx), the game itself, and profile management. */}
      <Stack.Screen name='index' />
      <Stack.Screen name='loadout' />
      <Stack.Screen name='game' />
      <Stack.Screen name='profiles' />
    </Stack>
  )
}

const RootLayout = () => {
  return (
    <Providers>
      {/* UpdateDialog is mounted here, as a sibling of OrientationProvider, so it sits inside
      Providers' own <ToastProvider> tree (Providers.tsx renders <ToastProvider>{children}
      <Toaster .../></ToastProvider>) and its onError -> toast wiring has a real useToast() context
      to call into. It replaces the old bare useUpdater() call this function used to make directly
      — that call had no UI of its own (useUpdater's default is a native Alert.alert prompt, a
      hard no-op on web); this renders a themed ConfirmDialog instead, via @tastic/hud's own
      UpdateDialog, which now owns the useUpdater() instance end to end. */}
      <UpdateDialog />
      {/* Mounted once, here, above the navigator — not inside Providers.tsx itself. Providers.tsx
      is the generic, game-agnostic Expo-Starter provider stack (Redux/theme/feedback/scroll-view)
      that a future non-split-screen spinoff from the same starter would still want as-is;
      OrientationProvider is specific to this app's face-to-face/side-by-side Vs CPU and 2 Player
      modes, so it lives alongside the navigator it actually serves instead of inside that shared
      abstraction. Matches LightCycles' own root _layout.tsx, which mounts it the same way for the
      same reason: a single app-lifetime sensor subscription is what makes the committed
      orientation survive screen navigation (index -> game and back), instead of each screen's own
      hook instance restarting from a default guess on every mount. */}
      {/* @tastic/core's own OrientationProvider never imports expo-sensors itself — a real
      top-level import there would force every consumer of the package (even one with zero
      interest in tilt tracking) to have expo-sensors installed, or Metro fails to resolve it.
      This app genuinely wants live tilt tracking, so it does its own real import and hands the
      resolved module in via this prop. */}
      <OrientationProvider deviceMotion={DeviceMotion}>
        {/* GameStatsProvider wraps ProfilesProvider, not the other way around, so its own
        AsyncStorage-backed achievements/stats load starts immediately and independently — it has
        no lazy-initializer race of its own to guard against (see useGameStats.tsx), so it must
        stay outside the 'profiles' splash gate ProfilesProvider wraps its children in below.
        Everything ProfilesProvider actually renders (RootNavigator, and every screen it owns,
        /loadout included) sits inside that gate instead. */}
        <GameStatsProvider>
          <ProfilesProvider>
            <RootNavigator />
          </ProfilesProvider>
        </GameStatsProvider>
        <RotationAwareStatusBar />
      </OrientationProvider>
    </Providers>
  )
}

export default RootLayout
