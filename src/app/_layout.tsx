import { useAutoPaperTheme } from '@rific/auto-paper'
import { type OrientationLockSettings, OrientationProvider, RotationAwareStatusBar, useThemedRootBackground } from '@tastic/core'
import { Stack } from 'expo-router'
import { DeviceMotion } from 'expo-sensors'
import * as SplashScreen from 'expo-splash-screen'
import { type ReactNode, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { GuideHost } from '@/components/GuideHost'
import { Providers } from '@/components/Providers'
import { UpdateDialog } from '@/components/UpdateDialog'
import { GameStatsProvider } from '@/hooks/useGameStats'
import { ProfilesProvider } from '@/hooks/useProfiles'
import { gameActions } from '@/redux/gameSlice'
import type { RootState } from '@/redux/store'

SplashScreen.preventAutoHideAsync()
SplashScreen.setOptions({ fade: true, duration: 400 })

const RootNavigator = () => {
  const { dark } = useAutoPaperTheme()
  return (
    <Stack
      screenOptions={useThemedRootBackground(
        dark,
        // gestureEnabled: false — iOS's native swipe-back gesture otherwise fights
        // TouchInputLayer's own swipe-to-turn Pan gestures on /game. Same rationale as
        // LightCycles' root _layout.tsx (confirmed there on-device): the OS gesture wins,
        // silently kicking the player back to the title screen mid-round instead of turning
        // their snake. The title screen has nothing to swipe back to either way, and /game's
        // own game-over dialog is the way back out once a round ends.
        false
      )}
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

// Needs its own component (rather than reading state.game directly in RootLayout below) so
// useSelector runs INSIDE Providers' own <ReduxProvider>, not above it: RootLayout itself renders
// <Providers>, so a hook call in RootLayout's own body would run before that Redux context exists at
// all. Inside Providers also means inside its PersistGate, so the persisted lock is already
// rehydrated by the time this mounts.
//
// Lock Orientation is app-wide. freezeWhileLocked makes @tastic/core freeze its one shared
// orientation reading while the lock is on, so every consumer (each screen's useOrientationState/
// useRotation and FakeLandscapeView, the board, touch input, overlays, @tastic/hud's dialogs and
// RotationAwareStatusBar below) holds the same angle, including anything that mounts after the lock;
// no call site is handed the flag. While locked, core records the held angle as `rotation` and
// reports it through onLockChange (cleared on unlock); persisting it as lockedRotation and handing it
// back through lockInitialValue is what makes a locked relaunch open in that orientation from the
// first frame instead of portrait. The Settings dialog's toggle still just dispatches
// setLockOrientation: the provider adopts the changed lockInitialValue and reports the result back
// through onLockChange like any other lock change.
function OrientationBridge({ children }: { children: ReactNode }) {
  const lockOrientation = useSelector((state: RootState) => state.game.lockOrientation)
  const lockedRotation = useSelector((state: RootState) => state.game.lockedRotation)
  const dispatch = useDispatch()
  const onLockChange = useCallback(
    (next: OrientationLockSettings) => {
      dispatch(gameActions.setLockOrientation(next.locked))
      dispatch(gameActions.setLockedRotation(next.rotation))
    },
    [dispatch]
  )
  return (
    <OrientationProvider deviceMotion={DeviceMotion} freezeWhileLocked lockInitialValue={{ locked: lockOrientation, rotation: lockedRotation }} onLockChange={onLockChange}>
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
      — that call had no UI of its own (useUpdater's default is a native Alert.alert prompt, a
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
      {/* @tastic/core's own OrientationProvider never imports expo-sensors itself — a real
      top-level import there would force every consumer of the package (even one with zero
      interest in tilt tracking) to have expo-sensors installed, or Metro fails to resolve it.
      This app genuinely wants live tilt tracking, so it does its own real import and hands the
      resolved module in via OrientationBridge's deviceMotion prop. */}
      <OrientationBridge>
        {/* GameStatsProvider wraps ProfilesProvider, not the other way around, so its own
        AsyncStorage-backed achievements/stats load starts immediately and independently — it has
        no lazy-initializer race of its own to guard against (see useGameStats.tsx), so it must
        stay outside the 'profiles' splash gate ProfilesProvider wraps its children in below.
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
