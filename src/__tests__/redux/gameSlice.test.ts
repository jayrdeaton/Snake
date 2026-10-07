import { REHYDRATE } from 'redux-persist'

import gameReducer, { defaultGameState } from '@/redux/gameSlice'

// gameSlice's own REHYDRATE merge: redux-persist replaces the slice wholesale, so a save from before
// a field existed must come back with that field's default rather than undefined.
describe('gameSlice rehydrate', () => {
  it('keeps the saved seat colors', () => {
    const restored = gameReducer(defaultGameState, { type: REHYDRATE, payload: { game: { lastCpuColor: '#123456', profileOverride: { 1: '#abcdef', 2: null } } } })
    expect(restored.lastCpuColor).toBe('#123456')
    expect(restored.profileOverride).toEqual({ 1: '#abcdef', 2: null })
  })

  it('backfills a field missing from an older save with its default', () => {
    const legacy = gameReducer(defaultGameState, { type: REHYDRATE, payload: { game: { lastCpuColor: '#123456' } } })
    expect(legacy.lastCpuColor).toBe('#123456')
    expect(legacy.profileOverride).toEqual(defaultGameState.profileOverride)
  })
})
