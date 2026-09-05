import { LabeledDropdownOption, MenuOption, usePopoverHost } from '@tastic/hud'
import { render } from '@testing-library/react-native'

import { ControlScheme } from '@/types'

import { CpuDifficultyChoice, PlayerSetupPanel, PlayerSetupPanelProps } from '../../components/PlayerSetupPanel'

const DIFFICULTY_OPTIONS: LabeledDropdownOption<CpuDifficultyChoice>[] = [
  { value: 'none', label: 'None' },
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' }
]

const CONTROL_SCHEME_OPTIONS: MenuOption<ControlScheme>[] = [
  { value: 'mouse', label: 'Mouse' },
  { value: 'wasd', label: 'WASD' },
  { value: 'arrows', label: 'Arrows' },
  { value: 'ijkl', label: 'IJKL' },
  { value: 'numpad', label: 'Numpad' }
]

// PlayerSetupPanel's own `host` prop needs a real, stateful PopoverHost — a static
// {openId, toggle, close} object can't actually open a popover on press, since toggle() would
// have nowhere to write the new openId. This harness supplies the same hook loadout.tsx itself
// uses. (Opening a popover itself isn't exercised by these tests — @tastic/hud's own
// useAutoAlign gates a popover's content on a real native layout measurement that never resolves
// under react-test-renderer, so there's no reliable way to assert on popover *contents* here; only
// the always-mounted trigger UI is checked.)
function Harness(props: Omit<PlayerSetupPanelProps, 'host'>) {
  const host = usePopoverHost()
  return <PlayerSetupPanel {...props} host={host} />
}

describe('PlayerSetupPanel', () => {
  it('renders a human seat without crashing', async () => {
    await expect(render(<Harness idPrefix='p1' color='#3B82F6' onColorChange={() => {}} swatches={[]} isHuman dark={false} />)).resolves.toBeDefined()
  })

  it('shows a difficulty-picker trigger (not a profile picker) for a non-human seat, labeled with the current difficulty', async () => {
    const { getByText } = await render(<Harness idPrefix='p2' color='#EF4444' onColorChange={() => {}} swatches={[]} isHuman={false} dark={false} cpuDifficulty='normal' cpuDifficultyOptions={DIFFICULTY_OPTIONS} onCpuDifficultyChange={() => {}} />)
    expect(getByText('NORMAL')).toBeTruthy()
  })

  // isCpuNone keeps the color/icon picker body visible once "None" is picked (an X in place of the
  // usual robot — see PlayerSetupPanel's own comment) rather than going blank next to a real seat's
  // full-height panel. @tastic/hud's InlineColorPicker has no accessible role/label of its own to
  // query directly (see the harness comment above) — the X icon itself isn't asserted on here, but
  // the trigger's own background color (the `color` prop, passed straight through unmodified) is,
  // as a proxy for "the color picker actually rendered" at all.
  it('keeps the difficulty trigger reachable and the color picker body visible once "None" is picked', async () => {
    const { getByText, toJSON } = await render(<Harness idPrefix='p2' color='#EF4444' onColorChange={() => {}} swatches={[]} isHuman={false} dark={false} cpuDifficulty='none' cpuDifficultyOptions={DIFFICULTY_OPTIONS} onCpuDifficultyChange={() => {}} />)
    expect(getByText('NONE')).toBeTruthy()
    expect(JSON.stringify(toJSON())).toContain('#EF4444')
  })

  // showControlScheme also requires Platform.OS === 'web' (see that component's own comment), which
  // this suite runs under natively rather than mocking (no precedent for overriding Platform.OS
  // elsewhere in this app's — or LightCycles' own — test suite, and @tastic/hud's popover contents
  // aren't reachable under react-test-renderer regardless — see the harness comment above), so these
  // two just guard the prop wiring itself against a crash rather than asserting the picker's own
  // visibility.
  it('renders a human seat with a control scheme selected without crashing', async () => {
    await expect(render(<Harness idPrefix='p1' color='#3B82F6' onColorChange={() => {}} swatches={[]} isHuman dark={false} controlScheme='wasd' onControlSchemeChange={() => {}} controlSchemeOptions={CONTROL_SCHEME_OPTIONS} otherControlScheme='arrows' />)).resolves.toBeDefined()
  })

  it('renders a non-human (CPU) seat without crashing when control-scheme props are simply omitted', async () => {
    await expect(render(<Harness idPrefix='p2' color='#EF4444' onColorChange={() => {}} swatches={[]} isHuman={false} dark={false} cpuDifficulty='normal' cpuDifficultyOptions={DIFFICULTY_OPTIONS} onCpuDifficultyChange={() => {}} />)).resolves.toBeDefined()
  })
})
