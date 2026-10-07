import type { ControlScheme, SnakeId } from '@/types'
import { assignControlScheme, resolveControlSchemeActivate, resolveControlSchemeDirection } from '@/utils/keyboardControls'

describe('resolveControlSchemeDirection', () => {
  it('returns null for the mouse scheme regardless of key', () => {
    expect(resolveControlSchemeDirection({ key: 'w', code: 'KeyW' }, 'mouse')).toBeNull()
    expect(resolveControlSchemeDirection({ key: 'ArrowUp', code: 'ArrowUp' }, 'mouse')).toBeNull()
  })

  it('resolves wasd by key, case-insensitively', () => {
    expect(resolveControlSchemeDirection({ key: 'w', code: 'KeyW' }, 'wasd')).toBe('up')
    expect(resolveControlSchemeDirection({ key: 'S', code: 'KeyS' }, 'wasd')).toBe('down')
    expect(resolveControlSchemeDirection({ key: 'a', code: 'KeyA' }, 'wasd')).toBe('left')
    expect(resolveControlSchemeDirection({ key: 'd', code: 'KeyD' }, 'wasd')).toBe('right')
  })

  it('resolves arrows by key', () => {
    expect(resolveControlSchemeDirection({ key: 'ArrowUp', code: 'ArrowUp' }, 'arrows')).toBe('up')
    expect(resolveControlSchemeDirection({ key: 'ArrowDown', code: 'ArrowDown' }, 'arrows')).toBe('down')
  })

  it('resolves ijkl by key', () => {
    expect(resolveControlSchemeDirection({ key: 'i', code: 'KeyI' }, 'ijkl')).toBe('up')
    expect(resolveControlSchemeDirection({ key: 'l', code: 'KeyL' }, 'ijkl')).toBe('right')
  })

  it('ignores a key from a different scheme', () => {
    expect(resolveControlSchemeDirection({ key: 'w', code: 'KeyW' }, 'arrows')).toBeNull()
    expect(resolveControlSchemeDirection({ key: 'ArrowUp', code: 'ArrowUp' }, 'wasd')).toBeNull()
  })

  // Numpad is matched by .code (physical key location), not .key (the character produced) — see
  // keyboardControls.ts's own NUMPAD_KEY_MAP comment for why: .key flips between a digit and an
  // arrow-key name depending on NumLock state, while .code stays 'NumpadN' regardless.
  describe('numpad', () => {
    it('resolves the numpad direction cluster by code', () => {
      expect(resolveControlSchemeDirection({ key: '8', code: 'Numpad8' }, 'numpad')).toBe('up')
      expect(resolveControlSchemeDirection({ key: '2', code: 'Numpad2' }, 'numpad')).toBe('down')
      expect(resolveControlSchemeDirection({ key: '4', code: 'Numpad4' }, 'numpad')).toBe('left')
      expect(resolveControlSchemeDirection({ key: '6', code: 'Numpad6' }, 'numpad')).toBe('right')
    })

    it('still resolves with NumLock off, where .key becomes an arrow name but .code stays Numpad8', () => {
      expect(resolveControlSchemeDirection({ key: 'ArrowUp', code: 'Numpad8' }, 'numpad')).toBe('up')
    })

    it('does not trigger on the top-row digit keys, which report Digit8 rather than Numpad8', () => {
      expect(resolveControlSchemeDirection({ key: '8', code: 'Digit8' }, 'numpad')).toBeNull()
    })
  })
})

describe('resolveControlSchemeActivate', () => {
  it('returns false for the mouse scheme regardless of key', () => {
    expect(resolveControlSchemeActivate({ key: 'q', code: 'KeyQ' }, 'mouse')).toBe(false)
  })

  it('resolves each scheme’s own activate key, case-insensitively where applicable', () => {
    expect(resolveControlSchemeActivate({ key: 'q', code: 'KeyQ' }, 'wasd')).toBe(true)
    expect(resolveControlSchemeActivate({ key: 'Q', code: 'KeyQ' }, 'wasd')).toBe(true)
    expect(resolveControlSchemeActivate({ key: ' ', code: 'Space' }, 'arrows')).toBe(true)
    expect(resolveControlSchemeActivate({ key: 'u', code: 'KeyU' }, 'ijkl')).toBe(true)
  })

  it('ignores a key from a different scheme', () => {
    expect(resolveControlSchemeActivate({ key: 'q', code: 'KeyQ' }, 'arrows')).toBe(false)
    expect(resolveControlSchemeActivate({ key: ' ', code: 'Space' }, 'wasd')).toBe(false)
  })

  // Numpad's activate key is matched by .code, not .key, for the identical NumLock-independence
  // reason resolveControlSchemeDirection's own numpad handling is — see keyboardControls.ts.
  describe('numpad', () => {
    it('resolves NumpadEnter regardless of what .key reports', () => {
      expect(resolveControlSchemeActivate({ key: 'Enter', code: 'NumpadEnter' }, 'numpad')).toBe(true)
    })

    it('does not trigger on the main-keyboard Enter key, which reports a different code', () => {
      expect(resolveControlSchemeActivate({ key: 'Enter', code: 'Enter' }, 'numpad')).toBe(false)
    })

    it('does not trigger on any of the numpad direction cluster keys', () => {
      expect(resolveControlSchemeActivate({ key: '8', code: 'Numpad8' }, 'numpad')).toBe(false)
    })
  })
})

describe('assignControlScheme', () => {
  it('sets only that seat when the scheme is free', () => {
    expect(assignControlScheme({ 1: 'mouse', 2: 'wasd' }, 1, 'arrows')).toEqual({ 1: 'arrows', 2: 'wasd' })
  })

  // 1 Player's /loadout shows only seat 1's picker, with no takenValue, so this is reachable there.
  // Without the swap both seats kept WASD, and in 2 Player every WASD key went to seat 1.
  it("swaps when seat 1 picks seat 2's scheme", () => {
    expect(assignControlScheme({ 1: 'mouse', 2: 'wasd' }, 1, 'wasd')).toEqual({ 1: 'wasd', 2: 'mouse' })
  })

  it("swaps when seat 2 picks seat 1's scheme", () => {
    expect(assignControlScheme({ 1: 'ijkl', 2: 'numpad' }, 2, 'ijkl')).toEqual({ 1: 'numpad', 2: 'ijkl' })
  })

  it('leaves both seats alone when a seat re-picks its own scheme', () => {
    expect(assignControlScheme({ 1: 'mouse', 2: 'wasd' }, 2, 'wasd')).toEqual({ 1: 'mouse', 2: 'wasd' })
  })

  it('never leaves two seats on one scheme, from any distinct starting pair', () => {
    const schemes: ControlScheme[] = ['mouse', 'wasd', 'arrows', 'ijkl', 'numpad']
    for (const a of schemes) {
      for (const b of schemes) {
        if (a === b) continue
        for (const seat of [1, 2] as SnakeId[]) {
          for (const scheme of schemes) {
            const controlScheme = assignControlScheme({ 1: a, 2: b }, seat, scheme)
            expect(controlScheme[seat]).toBe(scheme)
            expect(controlScheme[1]).not.toBe(controlScheme[2])
          }
        }
      }
    }
  })
})
