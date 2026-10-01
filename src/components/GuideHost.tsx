import { useIsTouchPrimaryDevice, useRotation } from '@tastic/core'
import { GuideProvider } from '@tastic/hud/guide'
import { type ReactNode, useCallback, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { GUIDE_VERSION } from '@/constants/guide'
import { getGuideSteps } from '@/constants/guideSteps'
import { guideActions, selectGuideVersionSeen } from '@/redux/guideSlice'
import type { RootState } from '@/redux/store'

interface Props {
  children: ReactNode
}

// Wires @tastic/hud/guide's provider to this app: the persisted "seen" version out of Redux, this
// app's own card content, and the live physical-hold rotation. Mounted once in _layout.tsx, wrapping
// the navigator, so any screen can reach it through useGuide() (the Settings "How to Play" row) and
// useAutoShowGuide() (Home) without prop-drilling.
//
// Reads the rotation exactly the way Home (index.tsx) computes the one it hands its SettingsDialog
// (useRotation(state.game.lockOrientation)), so the guide's card, which auto-shows over Home, sits at
// the same angle that dialog does. Its Portal renders outside any FakeLandscapeView, so unlike
// on-screen content it can't inherit that rotation and has to be handed it. `children` is the stable
// element _layout passes in, so a tilt-driven re-render here never re-renders the navigator under it
// (same isolation _layout's AppRotationAwareStatusBar relies on).
//
// `controls` is the live per-seat control scheme (gameSlice's controlScheme, picked per seat in
// /loadout on desktop web), so a replayed guide names the controls each seat really uses.
export function GuideHost({ children }: Props) {
  const lockOrientation = useSelector((state: RootState) => state.game.lockOrientation)
  const rotation = useRotation(lockOrientation)
  const touch = useIsTouchPrimaryDevice()
  const controls = useSelector((state: RootState) => state.game.controlScheme)
  const seenVersion = useSelector((state: RootState) => selectGuideVersionSeen(state))
  const dispatch = useDispatch()

  const steps = useMemo(() => getGuideSteps({ touch, controls }), [touch, controls])
  const onSeen = useCallback((version: number) => dispatch(guideActions.markSeen(version)), [dispatch])

  return (
    <GuideProvider steps={steps} currentVersion={GUIDE_VERSION} seenVersion={seenVersion} onSeen={onSeen} rotation={rotation}>
      {children}
    </GuideProvider>
  )
}
