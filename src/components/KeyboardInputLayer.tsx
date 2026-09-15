import { useVibration } from '@rific/feedback-press'
import { applyControlInversion, isEffectiveTurn } from '@tastic/input'
import { useEffect } from 'react'
import { Platform } from 'react-native'

import { useSnakeSounds } from '@/hooks/useSnakeSounds'
import { ControlScheme, Direction, SnakeId } from '@/types'
import { resolveControlSchemeActivate, resolveControlSchemeDirection } from '@/utils/keyboardControls'

export interface KeyboardInputLayerProps {
  enabled: boolean
  humanPlayers: SnakeId[]
  controlScheme: Record<SnakeId, ControlScheme>
  onTurn: (snakeId: SnakeId, direction: Direction) => void
  // Always safe to wire regardless of whether powerups are even enabled this round — activate()
  // itself no-ops when the snake holds nothing (see snakeEngine.ts's applySnakePowerupActivation).
  onActivate: (snakeId: SnakeId) => void
  // Whether each seat's own controls are currently Mesmerized (see types/index.ts's
  // SnakeControlEffect) — a mesmerized seat's resolved key direction is inverted before onTurn ever
  // sees it, mirroring TouchInputLayer.tsx's identical prop.
  controlInverted: Record<SnakeId, boolean>
  // Each snake's current (committed) heading, straight from game state — used to gate the turn
  // sound/haptic on isEffectiveTurn, so continuing straight or reversing 180° (both of which
  // applySnakeTurnIntent silently no-ops in snakeEngine.ts) doesn't fire feedback for a turn that
  // never actually happens. Mirrors LightCycles' TouchInputLayer.web.tsx's identical prop and its
  // own keydown listener's identical isEffectiveTurn check below.
  currentDirections: Record<SnakeId, Direction>
}

// Web-only, and purely additive on top of TouchInputLayer's own always-on swipe zones (which
// already handle mouse-drag on web via react-native-gesture-handler's own web support — see that
// file) — this never disables them, mirroring LightCycles' TouchInputLayer.web.tsx, where keyScheme
// only ever picks *which keys* move a seat, not *whether* pointer input still works too. A seat left
// on 'mouse' (the default — see gameSlice.ts) is simply never given a key mapping here at all.
//
// Self-gates on Platform.OS inside the effect rather than needing a `.web.tsx` sibling file the way
// TouchInputLayer.tsx/LightCycles' own TouchInputLayer.tsx do — there's no native counterpart for
// this component to keep in sync with, since RNGH already covers native input entirely on its own,
// so a plain runtime check is all a second file split would buy here. Deliberately NOT also gated on
// useIsTouchPrimaryDevice: that only hides PlayerSetupPanel's *picker* on a touch-primary device
// (selecting a scheme there is pointless if you're swiping), but a touch-primary web device (an iPad
// in Safari, say) can still have a physical keyboard attached, so the listener itself stays live
// regardless — exactly mirroring LightCycles' TouchInputLayer.web.tsx, which carries no touch-primary
// check of its own either.
export default function KeyboardInputLayer({ enabled, humanPlayers, controlScheme, onTurn, onActivate, controlInverted, currentDirections }: KeyboardInputLayerProps) {
  const { playTurn } = useSnakeSounds()
  const { selection } = useVibration()

  useEffect(() => {
    if (!enabled || Platform.OS !== 'web') return

    const handleKeyDown = (e: KeyboardEvent) => {
      for (const snakeId of humanPlayers) {
        if (resolveControlSchemeActivate(e, controlScheme[snakeId])) {
          e.preventDefault()
          onActivate(snakeId)
          return
        }
        const direction = resolveControlSchemeDirection(e, controlScheme[snakeId])
        if (!direction) continue
        e.preventDefault()
        const invertedDirection = applyControlInversion(direction, controlInverted[snakeId])
        onTurn(snakeId, invertedDirection)
        if (isEffectiveTurn(invertedDirection, currentDirections[snakeId])) {
          playTurn()
          selection()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, humanPlayers, controlScheme, onTurn, onActivate, controlInverted, currentDirections, playTurn, selection])

  return null
}
