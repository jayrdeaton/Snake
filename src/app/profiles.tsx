import { defaultColors, useAutoPaperTheme } from '@rific/auto-paper'
import { IconButton } from '@rific/feedback-press'
import { ProfilesManager } from '@tastic/profile'
import { router } from 'expo-router'
import { StyleSheet, View } from 'react-native'

import { useProfiles } from '@/hooks/useProfiles'

// A real routed screen — reachable only from seat 1's dropdown (see ProfilePicker's own doc for
// why seat 2 can't host this: its zone is 180°-rotated in face-to-face mode, and the OS keyboard
// doesn't rotate with it). Reads useProfiles() directly rather than taking it as props from
// loadout.tsx — there's nothing left for that screen to thread through once this is its own
// destination. Mirrors Pong's/AirHockey's identically-shaped app/profiles.tsx — createProfile here
// takes just {name, color, tag}, since Snake's Profile is the package's own base type, unmodified.
export default function ProfilesScreen() {
  const { dark } = useAutoPaperTheme()
  const bg = dark ? '#000000' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : '#000000'
  const { profiles, createProfile, updateProfile, deleteProfile } = useProfiles()

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ProfilesManager profiles={profiles} defaultColor={defaultColors[0].value} onCreate={(patch) => createProfile(patch)} onSave={(id, patch) => updateProfile(id, patch)} onDelete={(id) => deleteProfile(id)} headerLeft={<IconButton icon='arrow-left' iconColor={fg} size={24} onPress={() => router.back()} accessibilityLabel='Back' />} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
})
