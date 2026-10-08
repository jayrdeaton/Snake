import { FeedbackPressProvider, hapticActions, type HapticSettings, soundActions, type SoundSettings, useFeedbackBridgeProps } from '@rific/feedback-press'
import { scrollViewActions, type ScrollViewSettings, ScrollViewSettingsProvider } from '@rific/scroll-view'
import { Toaster, ToastProvider } from '@rific/toaster'
import { useEdgeGestureGuard } from '@tastic/edge-guard'
import * as Haptics from 'expo-haptics'
import React, { useCallback } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import * as RNPaper from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as ReduxProvider, useDispatch, useSelector } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import { useDefaultSounds } from '@/hooks/sounds/useDefaultSounds'
import { persistor, type RootState, store } from '@/redux/store'

import { Theme } from './Theme'

export type Props = { children: React.ReactNode }

const FeedbackBridge = ({ children }: Props) => {
  const haptic = useSelector((state: RootState) => state.haptic)
  const sound = useSelector((state: RootState) => state.sound)
  const dispatch = useDispatch()
  const onChange = useCallback((s: HapticSettings) => dispatch(hapticActions.initialize(s)), [dispatch])
  const onSoundChange = useCallback((s: SoundSettings) => dispatch(soundActions.initialize(s)), [dispatch])
  const { playClick, playPop } = useDefaultSounds()

  const bridgeProps = useFeedbackBridgeProps({ initialValue: haptic, onChange, soundInitialValue: sound, onSoundChange, sound: { selection: playClick, notification: playPop } })
  return (
    <FeedbackPressProvider {...bridgeProps} paper={RNPaper}>
      {children}
    </FeedbackPressProvider>
  )
}

// The one place @tastic/edge-guard's hook is called, mounted once for the app's lifetime rather than
// per screen. settings.deferBottomEdgeGestures is the player's opt-in; liveplay.activelyPlaying is
// /game's report that a live round is in progress right now (see liveplaySlice.ts). Combining them
// here keeps Edge Guard both opt-in and scoped to actual play.
const EdgeGuardBridge = ({ children }: Props) => {
  const deferBottomEdgeGestures = useSelector((state: RootState) => state.settings.deferBottomEdgeGestures)
  const activelyPlaying = useSelector((state: RootState) => state.liveplay.activelyPlaying)
  useEdgeGestureGuard(deferBottomEdgeGestures && activelyPlaying)
  return <>{children}</>
}

const ScrollViewBridge = ({ children }: Props) => {
  const scrollView = useSelector((state: RootState) => state.scrollView)
  const dispatch = useDispatch()
  const onChange = useCallback((settings: ScrollViewSettings) => dispatch(scrollViewActions.initialize(settings)), [dispatch])
  return (
    <ScrollViewSettingsProvider onChange={onChange} initialValue={scrollView}>
      {children}
    </ScrollViewSettingsProvider>
  )
}

export const Providers = ({ children }: Props) => {
  return (
    <GestureHandlerRootView>
      <SafeAreaProvider>
        <ReduxProvider store={store}>
          <PersistGate persistor={persistor}>
            <EdgeGuardBridge>
              <FeedbackBridge>
                <ScrollViewBridge>
                  <KeyboardProvider>
                    <Theme>
                      <ToastProvider haptics={Haptics} paper={RNPaper}>
                        {children}
                        {/* historyButton/clearButton off — matches AirHockey/BoxHockey/Pong/LightCycles;
                        limit is already the package's own default (3), pinned explicitly so it stays 3
                        regardless of what that default does in a future toaster version. No historyModal
                        — Snake's own history drawer (@rific/drawer-backed) was unreachable dead code now
                        that historyButton is hidden and nothing calls useToast().openHistory(); removed
                        along with the @rific/drawer dependency itself. */}
                        <Toaster historyButton={null} clearButton={null} limit={3} />
                      </ToastProvider>
                    </Theme>
                  </KeyboardProvider>
                </ScrollViewBridge>
              </FeedbackBridge>
            </EdgeGuardBridge>
          </PersistGate>
        </ReduxProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
