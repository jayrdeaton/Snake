import { applyControlInversion } from '@tastic/input'
import { useEffect } from 'react'
import { Platform } from 'react-native'

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
export default function KeyboardInputLayer({ enabled, humanPlayers, controlScheme, onTurn, onActivate, controlInverted }: KeyboardInputLayerProps) {
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
        onTurn(snakeId, controlInverted[snakeId] ? applyControlInversion(direction, true) : direction)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, humanPlayers, controlScheme, onTurn, onActivate, controlInverted])

  return null
}
