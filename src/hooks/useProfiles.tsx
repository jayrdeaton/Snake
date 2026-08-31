import AsyncStorage from '@react-native-async-storage/async-storage'
import { isSharedProfileStoreAvailable, loadSharedProfiles, Profile, saveSharedProfiles } from '@tastic/profile'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'

import { SnakeId } from '@/types'
import { DEFAULT_LOCAL_PROFILES_STATE, isValidLocalProfilesState, LocalProfilesState } from '@/utils/profilesValidation'

const STORAGE_KEY = 'snake.profiles'
// Same group id BoxHockey and LightCycles both declare in app.json's ios.entitlements (and any
// future @tastic game that wants into the same shared roster) — see @tastic/profile's own README
// for why only the base identity fields travel through this.
const SHARED_GROUP_ID = 'group.com.infinitetoken.tastic'

interface CreateProfileInput {
  name: string
  color: string
  tag: string
}

interface ProfilesContextValue {
  profiles: Profile[]
  lastSelected: Record<SnakeId, string | null>
  createProfile: (input: CreateProfileInput) => Profile
  updateProfile: (id: string, patch: Partial<CreateProfileInput>) => void
  // Also clears lastSelected for any seat currently pointing at this id, so /loadout immediately
  // reflects a guest seat rather than a dangling id until next reload.
  deleteProfile: (id: string) => void
  selectProfile: (seat: SnakeId, profileId: string | null) => void
}

const ProfilesContext = createContext<ProfilesContextValue | null>(null)

interface Props {
  children: ReactNode
}

function generateProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Single source of truth for saved player profiles, mounted once in _layout.tsx alongside
// AccelerometerOrientationProvider — expo-router keeps prior screens mounted, so a per-screen
// AsyncStorage-backed copy could go stale or clobber a concurrent update.
//
// Base identity fields (name/color/tag) are shared with every other @tastic game declaring the
// same App Group entitlement (see SHARED_GROUP_ID and @tastic/profile's own
// loadSharedProfiles/saveSharedProfiles) — create a profile in LightCycles, it shows up here too,
// and vice versa. Mirrors BoxHockey's/Pong's/AirHockey's identically-shaped useProfiles.tsx — no
// per-seat extension field here either, so `profiles` below is just `sharedBase` directly,
// unmodified. isSharedProfileStoreAvailable is false on Android/web and on any iOS build that
// hasn't run `expo prebuild` since the entitlement was added — `local.localBase` (only ever
// read/written in that case) keeps this screen fully usable there too, just without cross-app
// sharing.
export function ProfilesProvider({ children }: Props) {
  const [local, setLocal] = useState<LocalProfilesState>(DEFAULT_LOCAL_PROFILES_STATE)
  // null until the initial load below resolves — distinguishes "still loading" from "loaded, and
  // genuinely empty," which matters for the one-time seed-from-local migration in that same effect.
  const [sharedBase, setSharedBase] = useState<Profile[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let stored = DEFAULT_LOCAL_PROFILES_STATE
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (isValidLocalProfilesState(parsed)) stored = parsed
        }
      } catch {
        // Corrupt/stale blob or unavailable storage — DEFAULT_LOCAL_PROFILES_STATE is a complete,
        // silent fallback.
      }
      if (cancelled) return
      setLocal(stored)

      if (!isSharedProfileStoreAvailable) {
        setSharedBase(stored.localBase)
        return
      }
      const shared = await loadSharedProfiles(SHARED_GROUP_ID)
      if (cancelled) return
      // First time this build has ever seen the shared store: seed it from whatever this app
      // already had saved locally, so an upgrading user's own profiles don't just vanish because
      // nothing's been written to the shared side yet. Only when the shared roster is still
      // completely empty — once ANYTHING has been shared (by this app or another), that always
      // wins over a stale local snapshot, never merged with it (avoids resurrecting a profile
      // deleted elsewhere).
      const seeded = shared.length === 0 && stored.localBase.length > 0 ? stored.localBase : shared
      if (seeded !== shared) saveSharedProfiles(SHARED_GROUP_ID, seeded).catch(() => {})
      setSharedBase(seeded)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const persistLocal = useCallback((next: LocalProfilesState) => {
    setLocal(next)
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {})
  }, [])

  // Writes the base roster to whichever store is authoritative — the shared App Group roster when
  // available, this app's own local `localBase` fallback otherwise — and always updates the
  // in-memory sharedBase, which is the source for `profiles` below regardless of which backend it
  // actually came from.
  const persistBase = useCallback(
    (next: Profile[]) => {
      setSharedBase(next)
      if (isSharedProfileStoreAvailable) saveSharedProfiles(SHARED_GROUP_ID, next).catch(() => {})
      else persistLocal({ ...local, localBase: next })
    },
    [local, persistLocal]
  )

  const createProfile = useCallback(
    (input: CreateProfileInput) => {
      const now = Date.now()
      const profile: Profile = { id: generateProfileId(), name: input.name, color: input.color, tag: input.tag, createdAt: now, updatedAt: now }
      persistBase([...(sharedBase ?? []), profile])
      return profile
    },
    [sharedBase, persistBase]
  )

  const updateProfile = useCallback(
    (id: string, patch: Partial<CreateProfileInput>) => {
      const base = sharedBase ?? []
      persistBase(base.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)))
    },
    [sharedBase, persistBase]
  )

  const deleteProfile = useCallback(
    (id: string) => {
      persistBase((sharedBase ?? []).filter((p) => p.id !== id))
      persistLocal({
        ...local,
        lastSelected: { 1: local.lastSelected[1] === id ? null : local.lastSelected[1], 2: local.lastSelected[2] === id ? null : local.lastSelected[2] }
      })
    },
    [sharedBase, local, persistBase, persistLocal]
  )

  const selectProfile = useCallback(
    (seat: SnakeId, profileId: string | null) => {
      persistLocal({ ...local, lastSelected: { ...local.lastSelected, [seat]: profileId } })
    },
    [local, persistLocal]
  )

  return <ProfilesContext.Provider value={{ profiles: sharedBase ?? [], lastSelected: local.lastSelected, createProfile, updateProfile, deleteProfile, selectProfile }}>{children}</ProfilesContext.Provider>
}

export function useProfiles() {
  const ctx = useContext(ProfilesContext)
  if (!ctx) throw new Error('useProfiles must be used within a ProfilesProvider')
  return ctx
}
