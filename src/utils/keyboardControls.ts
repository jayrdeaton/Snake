import { resolveSchemeDirection } from '@tastic/input'

import { ControlScheme, Direction } from '@/types'

// The one shared entry point KeyboardInputLayer routes every keydown through. 'mouse' (the scheme
// with no keys of its own — see types/index.ts's own ControlScheme doc) always resolves to null,
// same as any keydown that doesn't match the given seat's own scheme; every other scheme is a
// KeyScheme, resolved by @tastic/input's own resolveSchemeDirection (which already knows numpad's
// NumLock-independent .code quirk — see that package's own doc).
export function resolveControlSchemeDirection(event: Pick<KeyboardEvent, 'key' | 'code'>, scheme: ControlScheme): Direction | null {
  if (scheme === 'mouse') return null
  return resolveSchemeDirection(event, scheme)
}

// Powerup activation key per scheme — one unused-by-movement key per layout, mirroring
// LightCycles' identical ACTIVATE_KEYS map (wasd/arrows/ijkl match its exact choices) plus a 4th
// entry for numpad, the one scheme LightCycles has no equivalent of. 'mouse' has no key of its own
// (a stationary click/tap already becomes the activate gesture in TouchInputLayer.tsx instead).
const ACTIVATE_KEYS: Record<'wasd' | 'arrows' | 'ijkl', string> = { wasd: 'q', arrows: ' ', ijkl: 'u' }

// Numpad's activate key is checked by `.code`, not `.key` — unlike the other three schemes'
// plain letter/space keys, a numpad DIGIT's own `.key` value flips depending on NumLock state
// (the exact quirk @tastic/input's own resolveSchemeDirection already works around for movement —
// see that package's own doc). NumpadEnter's `.code` has no such ambiguity and isn't part of any
// reasonable numpad direction mapping, so it's a safe, always-available activate key.
export function resolveControlSchemeActivate(event: Pick<KeyboardEvent, 'key' | 'code'>, scheme: ControlScheme): boolean {
  if (scheme === 'mouse') return false
  if (scheme === 'numpad') return event.code === 'NumpadEnter'
  return event.key.toLowerCase() === ACTIVATE_KEYS[scheme]
}
