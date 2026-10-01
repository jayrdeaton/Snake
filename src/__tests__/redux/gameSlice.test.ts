import gameReducer, { defaultGameState, gameActions, type GameSliceState } from '@/redux/gameSlice'
import type { ControlScheme, SnakeId } from '@/types'

function withControls(controls: Record<SnakeId, ControlScheme>): GameSliceState {
  return { ...defaultGameState, controlScheme: controls }
}

describe('gameSlice setControlScheme', () => {
  it('sets only that seat when the scheme is free', () => {
    const state = gameReducer(withControls({ 1: 'mouse', 2: 'wasd' }), gameActions.setControlScheme({ seat: 1, scheme: 'arrows' }))
    expect(state.controlScheme).toEqual({ 1: 'arrows', 2: 'wasd' })
  })

  // 1 Player's /loadout shows only seat 1's picker, with no takenValue, so this is reachable there.
  // Without the swap both seats kept WASD, and in 2 Player every WASD key went to seat 1.
  it("swaps when seat 1 picks seat 2's scheme", () => {
    const state = gameReducer(withControls({ 1: 'mouse', 2: 'wasd' }), gameActions.setControlScheme({ seat: 1, scheme: 'wasd' }))
    expect(state.controlScheme).toEqual({ 1: 'wasd', 2: 'mouse' })
  })

  it("swaps when seat 2 picks seat 1's scheme", () => {
    const state = gameReducer(withControls({ 1: 'ijkl', 2: 'numpad' }), gameActions.setControlScheme({ seat: 2, scheme: 'ijkl' }))
    expect(state.controlScheme).toEqual({ 1: 'numpad', 2: 'ijkl' })
  })

  it('leaves both seats alone when a seat re-picks its own scheme', () => {
    const state = gameReducer(withControls({ 1: 'mouse', 2: 'wasd' }), gameActions.setControlScheme({ seat: 2, scheme: 'wasd' }))
    expect(state.controlScheme).toEqual({ 1: 'mouse', 2: 'wasd' })
  })

  it('never leaves two seats on one scheme, from any distinct starting pair', () => {
    const schemes: ControlScheme[] = ['mouse', 'wasd', 'arrows', 'ijkl', 'numpad']
    for (const a of schemes) {
      for (const b of schemes) {
        if (a === b) continue
        for (const seat of [1, 2] as SnakeId[]) {
          for (const scheme of schemes) {
            const { controlScheme } = gameReducer(withControls({ 1: a, 2: b }), gameActions.setControlScheme({ seat, scheme }))
            expect(controlScheme[seat]).toBe(scheme)
            expect(controlScheme[1]).not.toBe(controlScheme[2])
          }
        }
      }
    }
  })
})
