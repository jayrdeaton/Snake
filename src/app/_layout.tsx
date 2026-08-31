import { useUpdater } from '@rific/updater'
import { AccelerometerOrientationProvider } from '@tastic/split-screen'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'

import { Providers } from '@/components/Providers'
import { ProfilesProvider } from '@/hooks/useProfiles'

SplashScreen.preventAutoHideAsync()
SplashScreen.setOptions({ duration: 500, fade: true })

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
      this app has no tab bar; its real screens are the title screen, the loadout screen (Vs
      CPU/2 Player only — see loadout.tsx), the game itself, and profile management. */}
      <Stack.Screen name='index' />
      <Stack.Screen name='loadout' />
      <Stack.Screen name='game' />
      <Stack.Screen name='profiles' />
    </Stack>
  )
}

const RootLayout = () => {
  useUpdater()

  return (
    <Providers>
      {/* Mounted once, here, above the navigator — not inside Providers.tsx itself. Providers.tsx
      is the generic, game-agnostic Expo-Starter provider stack (Redux/theme/feedback/scroll-view)
      that a future non-split-screen spinoff from the same starter would still want as-is;
      AccelerometerOrientationProvider is specific to this app's face-to-face/side-by-side Vs
      CPU and 2 Player modes, so it lives alongside the navigator it actually serves instead of
      inside that shared abstraction. Matches LightCycles' own root _layout.tsx, which mounts it
      the same way for the same reason: a single app-lifetime sensor subscription is what makes
      the committed orientation survive screen navigation (index -> game and back), instead of
      each screen's own hook instance restarting from a default guess on every mount. */}
      <AccelerometerOrientationProvider>
        <ProfilesProvider>
          <RootNavigator />
        </ProfilesProvider>
      </AccelerometerOrientationProvider>
    </Providers>
  )
}

export default RootLayout
