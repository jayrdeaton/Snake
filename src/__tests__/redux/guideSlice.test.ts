import { createReturningPlayerMigrate, type GuidePersistedState } from '@tastic/hud/guide'

import { GUIDE_VERSION } from '@/constants/guide'
import reducer, { guideActions, LEGACY_STORAGE_KEYS, selectGuideVersionSeen } from '@/redux/guideSlice'
import { store } from '@/redux/store'

const REHYDRATE = 'persist/REHYDRATE'

// A stand-in for AsyncStorage holding only the given keys.
function storageWith(entries: Record<string, string>) {
  return { getItem: (key: string) => Promise.resolve(entries[key] ?? null) }
}

// What a player's first launch of a guide build ends at: redux-persist found no root store
// (`undefined`), ran it through the migrate, then dispatched REHYDRATE with the result.
async function versionSeenAfterFirstLaunch(entries: Record<string, string>) {
  const migrated = await createReturningPlayerMigrate(storageWith(entries), LEGACY_STORAGE_KEYS)(undefined, -1)
  return reducer(undefined, { type: REHYDRATE, key: 'root', payload: migrated }).versionSeen
}

// The factory's own behavior is covered in @tastic/hud's tests; this only pins this app's binding of
// it: GUIDE_VERSION is what an existing player is stamped with, the persist key it listens for is
// store.ts's own ('root'), the slice is mounted (and therefore rehydrated) under `guide`, and a player
// with no root store but keys a shipped build wrote is grandfathered too.
describe('guideSlice', () => {
  it('starts a fresh install as never seen, so the guide auto-shows on Home', () => {
    const state = reducer(undefined, { type: REHYDRATE, key: 'root', payload: undefined })
    expect(state.versionSeen).toBe(0)
  })

  it('stamps a player who already had the app with the current version, so an update never nags them', () => {
    const state = reducer(undefined, { type: REHYDRATE, key: 'root', payload: { theme: {}, game: {}, profiles: [] } })
    expect(state.versionSeen).toBe(GUIDE_VERSION)
  })

  it('records the version on finish or skip, and reads back from the root state under `guide`', () => {
    const state = reducer(undefined, guideActions.markSeen(GUIDE_VERSION))

    expect(state.versionSeen).toBe(GUIDE_VERSION)
    expect(selectGuideVersionSeen({ guide: state })).toBe(GUIDE_VERSION)
  })

  it('is mounted in the real root store under `guide`', () => {
    expect(store.getState().guide).toEqual({ versionSeen: 0 })
    expect(selectGuideVersionSeen(store.getState())).toBe(0)
  })
})

describe('LEGACY_STORAGE_KEYS', () => {
  it("lists this app's own namespaced keys", () => {
    expect(LEGACY_STORAGE_KEYS.length).toBeGreaterThan(0)
    for (const key of LEGACY_STORAGE_KEYS) expect(key).toMatch(/^snake\.[a-z]/)
  })

  it('grandfathers a player with no root store but a key a shipped build wrote', async () => {
    await expect(versionSeenAfterFirstLaunch({ [LEGACY_STORAGE_KEYS[0]]: '{}' })).resolves.toBe(GUIDE_VERSION)
  })

  it('still treats a player with none of those keys as a fresh install', async () => {
    await expect(versionSeenAfterFirstLaunch({})).resolves.toBe(0)
  })

  // store.ts isn't restructured for this: its persistConfig is read off the persistReducer call it
  // makes, in a fresh module registry with that one function swapped for a recorder and AsyncStorage
  // swapped for a fake this test controls.
  it('is wired into the real persistConfig as its migrate', async () => {
    type Migrate = (state: GuidePersistedState, version: number) => Promise<GuidePersistedState>
    const entries: Record<string, string> = {}
    let config: { key?: string; migrate?: Migrate } | undefined

    jest.isolateModules(() => {
      jest.doMock('@react-native-async-storage/async-storage', () => storageWith(entries))
      jest.doMock('redux-persist', () => ({
        ...jest.requireActual('redux-persist'),
        persistStore: () => ({}),
        persistReducer: (persistConfig: typeof config, reducer: unknown) => {
          config = persistConfig
          return reducer
        }
      }))
      require('@/redux/store')
    })

    expect(config?.key).toBe('root')
    expect(config?.migrate).toEqual(expect.any(Function))
    await expect(config?.migrate?.(undefined, -1)).resolves.toBeUndefined()
    entries[LEGACY_STORAGE_KEYS[LEGACY_STORAGE_KEYS.length - 1]] = '{}'
    await expect(config?.migrate?.(undefined, -1)).resolves.toEqual({ _persist: { version: -1, rehydrated: false } })
  })
})
