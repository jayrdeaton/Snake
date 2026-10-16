import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka'
import MaskedView from '@react-native-masked-view/masked-view'
import { Provider, themeActions, type ThemeSettings, useThemeBridgeProps } from '@rific/auto-paper'
import * as ExpoBlur from 'expo-blur'
import { useFonts } from 'expo-font'
import { type ReactNode, useCallback } from 'react'
import { shallowEqual, useDispatch, useSelector } from 'react-redux'

import { type RootState } from '@/redux/store'
import { markSplashReady, useSplashReady } from '@/utils/splashGate'

export type ThemeProps = {
  children: ReactNode
}

// The app-wide display typeface, fed to auto-paper's own `fontFamily` prop below so every Paper
// typography variant reskins to it in one place - swapping fonts later only means changing this.
const DISPLAY_FONT_FAMILY = 'Fredoka_600SemiBold'

export const Theme = ({ children }: ThemeProps) => {
  const settings = useSelector((state: RootState) => state.theme, shallowEqual)
  const dispatch = useDispatch()
  const onChange = useCallback((s: ThemeSettings) => dispatch(themeActions.initialize(s)), [dispatch])
  // A one-shot callback, not a boolean, so there's nothing for useSplashReady to watch. This marks
  // the 'theme' gate (see src/utils/splashGate.ts) directly instead.
  const onReady = useCallback(() => markSplashReady('theme'), [])
  // Any react-native-paper component with a string icon prop (Appbar.Action, Button icon=, etc.,
  // see the demo screens under src/app/demos for examples) renders through this exact font, which
  // @expo/vector-icons doesn't preload: each Icon instance mounts blank and independently kicks
  // off its own Font.loadAsync, swapping in the real glyph only once that resolves. Loading it here
  // and marking the 'fonts' gate ready only once it resolves means every icon this app will ever
  // show is already loaded by the time the splash lifts, instead of popping in a beat later. A failed
  // load also counts as ready: `fontsLoaded` stays false forever after an error, which would leave the
  // splash up for good, so the app opens on the system fallback font instead.
  const [fontsLoaded, fontError] = useFonts({ ...MaterialCommunityIcons.font, [DISPLAY_FONT_FAMILY]: Fredoka_600SemiBold })
  useSplashReady('fonts', fontsLoaded || !!fontError)

  const bridgeProps = useThemeBridgeProps({ initialValue: settings, onChange, onReady })

  // maskedView is what lets auto-paper's FadingScrollView fade scrolling rows out at their edges on
  // iOS/Android (the Settings sheet's and Rules' rows above Done, @tastic/profile's dropdown lists
  // above Manage); without it they just scroll with a hard edge. Web needs nothing.
  // statusBar={false}: auto-paper renders no React Native StatusBar (here or in Appbar.Header). The
  // status bar is set per screen (_layout.tsx's useRotationAwareStatusBar), and with @tastic/core's
  // config plugin on, a mounted StatusBar logs an error (a red box in a dev build).
  return (
    <Provider {...bridgeProps} expoBlur={ExpoBlur} maskedView={MaskedView} fontFamily={DISPLAY_FONT_FAMILY} statusBar={false}>
      {children}
    </Provider>
  )
}
