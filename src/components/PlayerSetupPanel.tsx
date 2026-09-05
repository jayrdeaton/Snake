import { SeedColor } from '@rific/auto-paper'
import { ControlSchemePicker, InlineColorPicker, LabeledDropdown, LabeledDropdownOption, MenuOption, PopoverHost, ReadyButton, usePopoverHost } from '@tastic/hud'
import { Profile, ProfilePicker } from '@tastic/profile'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'

import { CpuDifficulty } from '@/redux/gameSlice'
import { ControlScheme } from '@/types'

// 'none' is a Snake-specific extension beyond a plain CpuDifficulty — this seat's own "no CPU at
// all" choice (see loadout.tsx's 1-Player flow), never persisted as a difficulty preference (see
// that file's own comment on why).
export type CpuDifficultyChoice = CpuDifficulty | 'none'

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
  // Web-only (see showControlScheme below) — no meaning on a touch/swipe-controlled device. Mirrors
  // LightCycles' LobbyPlayerPanel keyScheme/onKeySchemeChange/otherKeyScheme trio, renamed for
  // Snake's own ControlScheme (which adds 'mouse'/'numpad' — see types/index.ts).
  controlScheme?: ControlScheme
  onControlSchemeChange?: (scheme: ControlScheme) => void
  controlSchemeOptions?: MenuOption<ControlScheme>[]
  // The other seat's current scheme, if any — passed straight through as SectionedDropdown's
  // takenValue so it stays in the options list (rather than filtered out) but renders disabled, same
  // "shown, not removed" treatment takenColor gets above. Only ever meaningful in 2 Player, the only
  // mode with two human seats potentially sharing one desktop's keyboard/mouse (see loadout.tsx).
  otherControlScheme?: ControlScheme
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
  // CPU slots only (see isHuman) — the same "trigger sits above the color picker" slot
  // ProfilePicker uses for a human seat's name, just for picking who's actually driving the CPU
  // (or that there is no CPU at all) instead of who you are.
  cpuDifficulty?: CpuDifficultyChoice
  cpuDifficultyOptions?: LabeledDropdownOption<CpuDifficultyChoice>[]
  onCpuDifficultyChange?: (value: CpuDifficultyChoice) => void
}

// One panel per snake slot in the loadout screen: a name label (tap to switch profiles or create
// one, human slots only — falls back to the plain `label` text below when profiles isn't wired
// in), a color picker (interactive for both human and CPU slots) plus a web-only control-scheme
// picker for human slots, and a Ready toggle for human slots only. Owns its own popover host shared
// by its own pickers unless a `host` is passed in to share with another panel instead. Mirrors
// AirHockey's identically-shaped PlayerSetupPanel.tsx aside from the control-scheme row, which has
// no AirHockey/BoxHockey equivalent (their snakes/pucks have no keyboard input at all) — it instead
// mirrors LightCycles' LobbyPlayerPanel's own keyScheme row, renamed to Snake's ControlScheme.
export function PlayerSetupPanel({ idPrefix, host, label, color, onColorChange, swatches, takenColor, allowSwapTaken, isHuman, controlScheme, onControlSchemeChange, controlSchemeOptions, otherControlScheme, ready, onToggleReady, dark, showReadyButton = true, profiles, selectedProfileId, takenProfileId, guestLabel, onProfileSelect, onManageProfiles, cpuDifficulty, cpuDifficultyOptions, onCpuDifficultyChange }: PlayerSetupPanelProps) {
  const ownHost = usePopoverHost()
  const popover = host ?? ownHost
  const ownPopoverOpen = popover.openId?.startsWith(`${idPrefix}-`) ?? false
  // Narrower than ownPopoverOpen on purpose — only true for a popover actually inside pickerRow
  // itself (color/controls), not the name/profile trigger above it or Ready below it. See
  // pickerRowOpen's own style comment for why pickerRow needs this in addition to panelOpen above.
  const pickerRowPopoverOpen = popover.openId === `${idPrefix}-color` || popover.openId === `${idPrefix}-controls`
  const showProfilePicker = isHuman && profiles !== undefined && !!onProfileSelect
  const showDifficultyPicker = !isHuman && cpuDifficulty !== undefined && cpuDifficultyOptions !== undefined && !!onCpuDifficultyChange
  // A CPU seat with "None" picked still shows its own color/icon row (an X in place of the usual
  // robot) rather than going blank — a blank seat sat visibly shorter than a real seat right next
  // to it. No Ready button of any kind belongs here either way (see isHuman below): there's no CPU
  // to ready up, disabled placeholder or not.
  const isCpuNone = !isHuman && cpuDifficulty === 'none'
  // The color button's own tag display (see InlineColorPicker) — read live from the selected
  // profile rather than snapshotted at selection time, since there's no other editing surface for
  // it on this screen at all (see app/profiles.tsx's ProfilesManager, the only place a tag is
  // actually typed).
  const selectedProfile = profiles?.find((p) => p.id === selectedProfileId) ?? null
  const mutedColor = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'

  return (
    <View style={[styles.panel, ownPopoverOpen && styles.panelOpen]}>
      {/* Selecting here only updates which profile is remembered for this seat — /loadout's own
      focus effect is what actually derives the seat's live color from that selection (or the
      guest/CPU fallback), so it stays correct across a fresh tap-select, a mount, and a return
      visit to this screen alike, instead of this panel prefilling it once and drifting from there. */}
      {showProfilePicker ? (
        <ProfilePicker idPrefix={idPrefix} host={popover} profiles={profiles!} selectedId={selectedProfileId ?? null} takenId={takenProfileId} color={color} dark={dark} guestLabel={guestLabel ?? 'GUEST'} onSelect={(profile: Profile | null) => onProfileSelect?.(profile)} onManage={onManageProfiles} />
      ) : showDifficultyPicker ? (
        <LabeledDropdown id={`${idPrefix}-difficulty`} host={popover} options={cpuDifficultyOptions!} value={cpuDifficulty!} onChange={onCpuDifficultyChange!} color={color} dark={dark} />
      ) : (
        label && (
          <Text variant='labelSmall' style={{ color }}>
            {label}
          </Text>
        )
      )}

      <View style={[styles.pickerRow, pickerRowPopoverOpen && styles.pickerRowOpen]}>
        {/* Human slots (which, in 2 Player mode, is both of them) show the selected profile's own
        tag when it has one, falling back to a face; a CPU slot falls back to a robot, or an X once
        "None" is picked — this is what actually distinguishes "you" from "the CPU" (or "no CPU at
        all") now, not a fixed icon. */}
        <InlineColorPicker id={`${idPrefix}-color`} host={popover} value={color} onChange={onColorChange} swatches={swatches} takenValue={takenColor} allowSwapTaken={allowSwapTaken} dark={dark} tag={isHuman ? selectedProfile?.tag : undefined} icon={isHuman ? 'face-man' : isCpuNone ? 'close-circle-outline' : 'robot'} />

        {/* Side by side with the color picker. @tastic/hud's ControlSchemePicker renders nothing
        of its own accord on native or a touch-primary device (keyboard has no touch-gesture
        equivalent to pick a "feel" for) — see that component's own doc — so the only gate needed
        here is isHuman (a CPU seat has no scheme to pick at all). */}
        {isHuman && controlScheme && onControlSchemeChange && controlSchemeOptions && <ControlSchemePicker id={`${idPrefix}-controls`} host={popover} value={controlScheme} onChange={onControlSchemeChange} options={controlSchemeOptions} takenValue={otherControlScheme} accentColor={color} mutedColor={mutedColor} dark={dark} />}
      </View>

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
  },
  // Same gap as `panel`'s own vertical rhythm, reused horizontally — the color and (when shown)
  // control-scheme pickers sit side by side within this row instead of stacked in the panel's own
  // column. Mirrors LightCycles' LobbyPlayerPanel pickerRow exactly.
  pickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12
  },
  // A popover is an absolutely-positioned sibling of its own trigger, not participating in normal
  // layout flow — so a tall one (e.g. the color swatch grid) can extend down far enough to overlap
  // the ReadyButton below, which paints on top of it by default DOM order since it's a later
  // sibling within `panel`. `panel`'s own panelOpen elevation only helps this panel paint above
  // OTHER panels/shared-controls (see its own comment) — it does nothing for stacking *within* this
  // panel, since React Native Web gives each View its own stacking context. This is what actually
  // fixes that: elevate pickerRow itself above its own later sibling whenever one of its popovers is
  // open. Mirrors LightCycles' LobbyPlayerPanel pickerRowOpen exactly.
  pickerRowOpen: {
    zIndex: 100
  }
})
