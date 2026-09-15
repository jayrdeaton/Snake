import { Drawer } from '@rific/drawer'
import { FeedbackPressProvider, hapticActions, type HapticSettings, soundActions, type SoundSettings } from '@rific/feedback-press'
import { scrollViewActions, type ScrollViewSettings, ScrollViewSettingsProvider } from '@rific/scroll-view'
import { type HistoryContainerProps, HistoryModal, Toaster, ToastProvider } from '@rific/toaster'
import { useEdgeGestureGuard } from '@tastic/edge-guard'
import * as Haptics from 'expo-haptics'
import React, { useCallback } from 'react'
import { useWindowDimensions } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import * as RNPaper from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as ReduxProvider, useDispatch, useSelector } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import { useDefaultSounds } from '@/hooks/sounds/useDefaultSounds'
import { persistor, type RootState, store } from '@/redux/store'

import { Theme } from './Theme'

export type ProvidersProps = { children: React.ReactNode }

const HistoryDrawerContainer = ({ children, onClose, visible }: HistoryContainerProps) => {
  const { height } = useWindowDimensions()
  return (
    <Drawer open={visible} onClose={onClose} side='bottom' height={height * 0.85}>
      {children}
    </Drawer>
  )
}

const FeedbackBridge = ({ children }: ProvidersProps) => {
  const haptic = useSelector((state: RootState) => state.haptic)
  const sound = useSelector((state: RootState) => state.sound)
  const dispatch = useDispatch()
  const onChange = useCallback((s: HapticSettings) => dispatch(hapticActions.initialize(s)), [dispatch])
  const onSoundChange = useCallback((s: SoundSettings) => dispatch(soundActions.initialize(s)), [dispatch])
  const { playClick, playPop } = useDefaultSounds()
  return (
    <FeedbackPressProvider initialValue={haptic} onChange={onChange} paper={RNPaper} soundInitialValue={sound} onSoundChange={onSoundChange} sound={{ selection: playClick, notification: playPop }}>
      {children}
    </FeedbackPressProvider>
  )
}

// Mounted once, permanently, same as FeedbackBridge/ScrollViewBridge below — not scoped to the
// game screen. deferBottomEdgeGestures (gameSlice) is the persisted user preference; activelyPlaying
// (liveplaySlice, deliberately blacklisted from redux-persist — see that slice's own doc) is
// game.tsx's own report of whether a round is actually in progress right now. Combining both here,
// in the one place @tastic/edge-guard's hook is ever called, is what keeps Edge Guard both a real
// opt-in AND scoped to actual gameplay, without needing the hook itself mounted/unmounted per screen.
const EdgeGuardBridge = ({ children }: ProvidersProps) => {
  const deferBottomEdgeGestures = useSelector((state: RootState) => state.game.deferBottomEdgeGestures)
  const activelyPlaying = useSelector((state: RootState) => state.liveplay.activelyPlaying)
  useEdgeGestureGuard(deferBottomEdgeGestures && activelyPlaying)
  return <>{children}</>
}

const ScrollViewBridge = ({ children }: ProvidersProps) => {
  const scrollView = useSelector((state: RootState) => state.scrollView)
  const dispatch = useDispatch()
  const onChange = useCallback((settings: ScrollViewSettings) => dispatch(scrollViewActions.initialize(settings)), [dispatch])
  return (
    <ScrollViewSettingsProvider onChange={onChange} initialValue={scrollView}>
      {children}
    </ScrollViewSettingsProvider>
  )
}

export const Providers = ({ children }: ProvidersProps) => {
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
                        <Toaster historyModal={<HistoryModal Container={HistoryDrawerContainer} />} />
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
