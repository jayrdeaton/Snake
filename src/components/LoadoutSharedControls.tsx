import { IconButton } from '@rific/feedback-press'
import { MenuOption, PopoverHost, SectionedDropdown, usePopoverHost } from '@tastic/hud'
import { StyleSheet, View } from 'react-native'

import { SnakeArenaVariant, SnakePowerupType, SnakeSpeedTier } from '@/types'

interface Props {
  // Shared popover host — see PlayerSetupPanel's identical `host` prop. loadout.tsx always passes
  // its own controlsHost here, in every game mode: this row sits in the same near/bottom zone as
  // seat 1's own panel, so board options need to be mutually exclusive with seat 1's color/profile
  // picker (only one of them can be open at a time), and — just as importantly — seat 1's
  // press-away overlay only watches controlsHost.openId, so a dropdown opened on any *other* host
  // would be invisible to it and never close on an outside tap. Omit only if some future caller
  // genuinely wants this row fully independent (own host, own press-away wiring it'd have to
  // provide itself).
  host?: PopoverHost
  // Static obstacle layout for the round's board (see utils/arenas.ts) — bundled into the same
  // popover as the fullScreen/wrapEdges toggles below (see this component's own 'board'
  // SectionedDropdown) rather than getting its own trigger, mirroring LightCycles' identical
  // 'arena' trigger shape (a leading single-select section, plus the existing bundled toggles as a
  // second section in the same popover).
  arenaVariant: SnakeArenaVariant
  arenaOptions: MenuOption<SnakeArenaVariant>[]
  onArenaChange: (value: SnakeArenaVariant) => void
  // Two board options, bundled in one bare-boolean-to-multiselect section — same technique
  // LightCycles' own extendIntoSafeArea/wrapEdges bundle uses, and for the same reason: both are
  // simple board-shape toggles, not distinct settings that need visually separating from each
  // other. Presence in the section's own value array is each toggle's on/off state.
  wrapEdges: boolean
  wrapEdgesOption: MenuOption<'wrapEdges'>
  onWrapEdgesChange: (value: boolean) => void
  // Same shape as wrapEdges immediately above — see gameSlice.ts's own fullScreen comment for what
  // it actually does.
  fullScreen: boolean
  fullScreenOption: MenuOption<'fullScreen'>
  onFullScreenChange: (value: boolean) => void
  // Per-round tick speed (see constants/snake.ts's SNAKE_SPEED_TIER_INTERVAL_MS) — its own trigger,
  // matching LightCycles' identical 'speed' SectionedDropdown.
  speedTier: SnakeSpeedTier
  speedOptions: MenuOption<SnakeSpeedTier>[]
  onSpeedChange: (value: SnakeSpeedTier) => void
  // Which powerup types can spawn this round — "off" is simply an empty array (see gameSlice.ts's
  // own enabledPowerups comment), so this one multi-select control covers both at once rather than
  // needing a separate on/off toggle alongside it. Matches LightCycles' identical 'powerups'
  // trigger.
  enabledPowerups: SnakePowerupType[]
  powerupOptions: MenuOption<SnakePowerupType>[]
  onPowerupsChange: (value: SnakePowerupType[]) => void
  // Both one-shot actions on the settings above as a whole, not a value with a "current state" to
  // show — rendered as plain IconButtons in their own row above the trigger row (not a
  // SectionedDropdown trigger itself, which would misleadingly suggest a selected value to land
  // on). Optional (and always passed as a pair) — loadout.tsx's own showMetaInSharedBand case
  // renders these itself, inline in its merged back/dice/reset/settings header row, so this
  // component leaves its own row out entirely rather than showing the same two actions twice.
  onRandomize?: () => void
  onReset?: () => void
  accentColor: string
  mutedColor: string
  onAccentColor?: string
  dark: boolean
}

// Always-upright row of shared (not per-seat) settings in the loadout screen. Shares seat 1's
// popover host (passed in by loadout.tsx in every game mode — see the `host` prop above) rather
// than owning an independent one, so this row participates in seat 1's mutual-exclusivity and
// press-away wiring the same way its own panel does. Pruned down to just one trigger — Snake's two
// board options (wrapEdges, fullScreen) share the one dropdown, promoted here from SettingsDialog's
// own former "BOARD" section (see that file's own comment) to match BoxHockey's/AirHockey's/
// LightCycles' identical cross-app convention of keeping per-round board options in loadout, not
// settings.
export const LOADOUT_SHARED_CONTROLS_IDS = ['board', 'speed', 'powerups']

export function LoadoutSharedControls({ host: sharedHost, arenaVariant, arenaOptions, onArenaChange, wrapEdges, wrapEdgesOption, onWrapEdgesChange, fullScreen, fullScreenOption, onFullScreenChange, speedTier, speedOptions, onSpeedChange, enabledPowerups, powerupOptions, onPowerupsChange, onRandomize, onReset, accentColor, mutedColor, onAccentColor, dark }: Props) {
  const ownHost = usePopoverHost()
  const host = sharedHost ?? ownHost
  // See PlayerSetupPanel's identical ownPopoverOpen comment — elevating this row for *any* open
  // popover on a shared host (rather than only its own) would tie it with whichever sibling panel
  // actually has the open popover, letting DOM order wrongly decide which one paints on top.
  const ownPopoverOpen = host.openId !== null && LOADOUT_SHARED_CONTROLS_IDS.includes(host.openId)
  // Same fg convention as every other component keying off a `dark` prop — full-contrast, unlike
  // mutedColor/accentColor above, which are tuned for a TriggerGauge's own unselected/selected
  // states rather than a plain icon button. Matches BoxHockey's/AirHockey's/LightCycles' identical
  // actionsRow.
  const fg = dark ? '#FFFFFF' : '#000000'

  return (
    <View style={[styles.container, ownPopoverOpen && styles.containerOpen]}>
      {onRandomize && onReset && (
        <View style={styles.actionsRow}>
          <IconButton icon='dice-multiple' iconColor={fg} size={18} onPress={onRandomize} accessibilityLabel='Randomize match settings' />
          <IconButton icon='restore' iconColor={fg} size={18} onPress={onReset} accessibilityLabel='Reset match settings to defaults' />
        </View>
      )}

      <View style={styles.row}>
        {/* Board/map settings first, in one bundled popover: a single-select section for the arena
        layout itself, plus a multi-select section (two rows, one toggle each) for the unrelated
        (but similarly board-shape-ish) fullScreen/wrapEdges toggles — same technique the powerups
        trigger below uses for its own array<->boolean semantics, just two possible members instead
        of six. Mirrors LightCycles' identical 'arena' SectionedDropdown shape. */}
        <SectionedDropdown
          id='board'
          host={host}
          icon='crop-square'
          accessibilityLabel='Board'
          sections={[
            { kind: 'single', id: 'arenaVariant', options: arenaOptions, value: arenaVariant, onChange: onArenaChange },
            {
              kind: 'multi',
              id: 'boardToggles',
              options: [fullScreenOption, wrapEdgesOption],
              value: [...(fullScreen ? [fullScreenOption.value] : []), ...(wrapEdges ? [wrapEdgesOption.value] : [])],
              onChange: (value) => {
                onFullScreenChange(value.includes(fullScreenOption.value))
                onWrapEdgesChange(value.includes(wrapEdgesOption.value))
              }
            }
          ]}
          accentColor={accentColor}
          mutedColor={mutedColor}
          onAccentColor={onAccentColor}
          dark={dark}
        />

        <SectionedDropdown id='speed' host={host} icon='speedometer' accessibilityLabel='Speed' sections={[{ kind: 'single', id: 'speed', options: speedOptions, value: speedTier, onChange: onSpeedChange }]} accentColor={accentColor} mutedColor={mutedColor} onAccentColor={onAccentColor} dark={dark} />

        <SectionedDropdown id='powerups' host={host} icon='flash' accessibilityLabel={`Powerups ${enabledPowerups.length > 0 ? 'on' : 'off'}`} sections={[{ kind: 'multi', id: 'powerups', options: powerupOptions, value: enabledPowerups, onChange: onPowerupsChange, allClear: true }]} accentColor={accentColor} mutedColor={mutedColor} onAccentColor={onAccentColor} dark={dark} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Above the trigger row — small, secondary-weight (size 18 vs. the trigger's own icon size) so
  // Randomize/Reset read as quick actions on the setting below rather than a second setting of
  // equal standing. On top (not below) to match loadout.tsx's own showMetaInSharedBand header row,
  // which folds these same two actions in with back/settings above the trigger there too.
  actionsRow: {
    flexDirection: 'row',
    gap: 12
  },
  container: {
    alignItems: 'center',
    gap: 4
  },
  // See SectionedDropdown's anchorOpen comment — this whole column is itself a sibling of the
  // player panels in loadout.tsx, and React Native Web's per-view stacking contexts mean a popover
  // escaping the row below needs this wrapper elevated, not just the popover content, to paint
  // above a later sibling panel.
  containerOpen: {
    zIndex: 100
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'center'
  }
})
