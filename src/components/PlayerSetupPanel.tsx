import { SeedColor } from '@rific/auto-paper'
import { InlineColorPicker, PopoverHost, ReadyButton, usePopoverHost } from '@tastic/hud'
import { Profile, ProfilePicker } from '@tastic/profile'
import { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

export interface PlayerSetupPanelProps {
  // Namespaces this panel's popover id so two panels can safely share one host (see `host` below)
  // without their ids colliding.
  idPrefix: string
  // Shared popover host, when this panel's color picker should be mutually exclusive with another
  // panel's (Vs CPU: only one human is ever driving both slots, so having both YOU's and CPU's
  // pickers open at once is just clutter, not a useful simultaneous-edit case). Omit to fall back
  // to this panel's own independent host — the 2 Player case, where two real people editing at
  // once is the point.
  host?: PopoverHost
  label?: string
  color: string
  onColorChange: (hex: string) => void
  swatches: SeedColor[]
  // The other snake's current color — stays visible in the swatch grid but disabled, rather than
  // removed from it entirely. Unless allowSwapTaken is set — see InlineColorPicker's own doc.
  takenColor?: string
  allowSwapTaken?: boolean
  isHuman: boolean
  ready?: boolean
  onToggleReady?: () => void
  dark: boolean
  // Vs CPU only has one human player, so the loadout screen renders its Ready toggle standalone,
  // centered below both slots, instead of embedded in this panel.
  showReadyButton?: boolean
  profiles?: Profile[]
  selectedProfileId?: string | null
  takenProfileId?: string | null
  // What the name trigger shows before any profile's selected — this seat's own 'P1'/'P2' (see
  // ProfilePicker's own doc for why it's never "Player", the menu's own row for that state).
  // Required whenever profiles is provided, since the trigger always needs some idle text.
  guestLabel?: string
  onProfileSelect?: (profile: Profile | null) => void
  // Navigates to the profile-management screen — only ever provided for seat 1 (see ProfilePicker's
  // own doc for why: seat 2's rotated zone can't host a working text keyboard).
  onManageProfiles?: () => void
}

// One panel per snake slot in the loadout screen: a name label (tap to switch profiles or create
// one, human slots only — falls back to the plain `label` text below when profiles isn't wired
// in), a color picker (interactive for both human and CPU slots), and a Ready toggle for human
// slots only. Owns its own popover host shared by its own color/profile picker unless a `host` is
// passed in to share with another panel instead. Mirrors AirHockey's identically-shaped
// PlayerSetupPanel.tsx — no control-scheme row here either: both snakes use the same swipe/touch
// input, so there's no per-seat input preference to pick.
export function PlayerSetupPanel({ idPrefix, host, label, color, onColorChange, swatches, takenColor, allowSwapTaken, isHuman, ready, onToggleReady, dark, showReadyButton = true, profiles, selectedProfileId, takenProfileId, guestLabel, onProfileSelect, onManageProfiles }: PlayerSetupPanelProps) {
  const ownHost = usePopoverHost()
  const popover = host ?? ownHost
  const ownPopoverOpen = popover.openId?.startsWith(`${idPrefix}-`) ?? false
  const showProfilePicker = isHuman && profiles !== undefined && !!onProfileSelect
  // The color button's own tag display (see InlineColorPicker) — read live from the selected
  // profile rather than snapshotted at selection time, since there's no other editing surface for
  // it on this screen at all (see app/profiles.tsx's ProfilesManager, the only place a tag is
  // actually typed).
  const selectedProfile = profiles?.find((p) => p.id === selectedProfileId) ?? null
  // Pre-fills the seat's own color from the selected profile, once, at selection time — this is
  // what actually makes the seat's own picker *feel* like "this profile's color" — it stays fully
  // editable afterward (freely repainting your own snake for one match shouldn't silently redefine
  // what that profile is remembered as; editing the saved color itself is Manage's own job — see
  // app/profiles.tsx's ProfilesManager).
  const handleProfileSelect = useCallback(
    (profile: Profile | null) => {
      onProfileSelect?.(profile)
      if (profile) onColorChange(profile.color)
    },
    [onProfileSelect, onColorChange]
  )

  return (
    <View style={[styles.panel, ownPopoverOpen && styles.panelOpen]}>
      {showProfilePicker ? (
        <ProfilePicker idPrefix={idPrefix} host={popover} profiles={profiles!} selectedId={selectedProfileId ?? null} takenId={takenProfileId} color={color} dark={dark} guestLabel={guestLabel ?? 'GUEST'} onSelect={handleProfileSelect} onManage={onManageProfiles} />
      ) : (
        label && (
          <Text variant='labelSmall' style={{ color }}>
            {label}
          </Text>
        )
      )}

      {/* Human slots (which, in 2 Player mode, is both of them) show the selected profile's own
      tag when it has one, falling back to a face; Vs CPU's CPU slot always falls back to a robot
      (no profile concept there at all) — this is what actually distinguishes "you" from "the CPU"
      now, not a fixed icon. */}
      <InlineColorPicker id={`${idPrefix}-color`} host={popover} value={color} onChange={onColorChange} swatches={swatches} takenValue={takenColor} allowSwapTaken={allowSwapTaken} dark={dark} tag={isHuman ? selectedProfile?.tag : undefined} icon={isHuman ? 'face-man' : 'robot'} />

      {isHuman && showReadyButton && onToggleReady && <ReadyButton color={color} ready={ready ?? false} onToggleReady={onToggleReady} />}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    gap: 12
  },
  // See SectionedDropdown's anchorOpen comment (AirHockey/BoxHockey) — this panel is a sibling of
  // the other snake's panel in loadout.tsx, so a popover escaping this panel's bounds needs the
  // panel itself elevated, not just the popover content, to paint above a later sibling.
  panelOpen: {
    zIndex: 100
  }
})
