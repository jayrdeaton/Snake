import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka'
import { Provider, themeActions, type ThemeSettings } from '@rific/auto-paper'
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
// typography variant reskins to it in one place — swapping fonts later only means changing this.
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
  // show is already loaded by the time the splash lifts, instead of popping in a beat later.
  const [fontsLoaded] = useFonts({ ...MaterialCommunityIcons.font, [DISPLAY_FONT_FAMILY]: Fredoka_600SemiBold })
  useSplashReady('fonts', fontsLoaded)

  return (
    <Provider expoBlur={ExpoBlur} fontFamily={DISPLAY_FONT_FAMILY} initialValue={settings} onChange={onChange} onReady={onReady}>
      {children}
    </Provider>
  )
}
