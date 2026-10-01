import { DirectionKeysHint, SeatDevicesHint, SwipeHint } from '@tastic/hud/guide'
import type { ReactElement } from 'react'

import { getGuideSteps } from '@/constants/guideSteps'
import { defaultGameState } from '@/redux/gameSlice'
import type { ControlScheme, SnakeId } from '@/types'

// gameSlice's own default: seat 1 on the mouse, seat 2 on WASD.
const DEFAULT_CONTROLS = defaultGameState.controlScheme
const SCHEMES: ControlScheme[] = ['mouse', 'wasd', 'arrows', 'ijkl', 'numpad']
// Every combination, including a same-scheme pair: setControlScheme now swaps on conflict, but a
// save made before that change can still hold one, and the copy must stay within its limits there.
const ALL_CONTROLS: Record<SnakeId, ControlScheme>[] = SCHEMES.flatMap((a) => SCHEMES.map((b) => ({ 1: a, 2: b })))
// The fleet's own phrase for each scheme in the desktop two-player sentence.
const PHRASE: Record<ControlScheme, string> = { mouse: 'the mouse', wasd: 'WASD', arrows: 'the arrow keys', ijkl: 'IJKL', numpad: 'the numpad' }

function textOf(touch: boolean, controls = DEFAULT_CONTROLS) {
  return getGuideSteps({ touch, controls })
    .map((step) => `${step.title} ${step.body}`)
    .join(' ')
}

describe('getGuideSteps', () => {
  it.each([
    ['touch', true],
    ['desktop', false]
  ])('gives the %s guide three complete, illustrated cards', (_name, touch) => {
    for (const controls of ALL_CONTROLS) {
      const steps = getGuideSteps({ touch, controls })

      expect(steps).toHaveLength(3)
      for (const step of steps) {
        // Title Case, per the fleet copy convention ("Two Players, One Phone").
        expect(step.title).toMatch(/^[A-Z]\S*(?: [A-Z]\S*)*$/)
        // A card a casual player reads in a glance, not a wall of text.
        expect(step.body.length).toBeLessThanOrEqual(90)
        expect(`${step.title} ${step.body}`).not.toMatch(/\u2014/)
        // The pager sizes every page to the tallest, so a card without art leaves a visible gap.
        expect(step.art).toBeDefined()
      }
    }
  })

  it('states the rule the game never prints: walls and every snake, your own included, are deadly, and with two snakes the first crash loses', () => {
    for (const touch of [true, false]) {
      const [, rules] = getGuideSteps({ touch, controls: DEFAULT_CONTROLS })
      // Read by Solo players too (it shows on Home, before a mode is picked), who have no win at
      // all, so the headline can't promise one and the versus rule has to be scoped.
      expect(rules.title).toBe("Don't Crash")
      expect(rules.title).not.toMatch(/win/i)
      expect(rules.body).toMatch(/wall/i)
      expect(rules.body).toMatch(/even your own/i)
      expect(rules.body).toMatch(/With two snakes, the first to crash loses/)
    }
  })

  it('teaches swiping on touch, never keys or the mouse, and only says "your own half" on the two-player card (it is not true solo)', () => {
    const [steer, , twoPlayer] = getGuideSteps({ touch: true, controls: DEFAULT_CONTROLS })

    expect(steer.body).toMatch(/swipe/i)
    expect(steer.body).not.toMatch(/half/i)
    expect((steer.art as ReactElement).type).toBe(SwipeHint)
    expect((steer.art as ReactElement<{ pointer?: string }>).props.pointer).not.toBe('mouse')
    expect(twoPlayer.title).toBe('Two Players, One Phone')
    expect(twoPlayer.body).toMatch(/your own half/i)
    expect(textOf(true)).not.toMatch(/\b(press|key|keys|mouse|drag)\b/i)
  })

  it('never tells a desktop player to swipe', () => {
    for (const controls of ALL_CONTROLS) {
      expect(textOf(false, controls)).not.toMatch(/swipe/i)
    }
  })

  it("teaches a mouse seat to drag (seat 1's default), with hud's mouse SwipeHint", () => {
    const [steer, , twoPlayer] = getGuideSteps({ touch: false, controls: DEFAULT_CONTROLS })

    expect(steer.body).toMatch(/^Drag the mouse/)
    expect((steer.art as ReactElement).type).toBe(SwipeHint)
    expect((steer.art as ReactElement<{ pointer?: string; direction?: string }>).props).toMatchObject({ pointer: 'mouse', direction: 'up' })
    // Not "One Keyboard": player 1 is on the mouse.
    expect(twoPlayer.title).toBe('Two Players, One Computer')
    expect(twoPlayer.body).toBe('Player 1 uses the mouse, player 2 uses WASD. Drag in your own half.')
  })

  it('words the desktop two-player card with the fleet template for every pairing', () => {
    for (const controls of ALL_CONTROLS) {
      const [, , twoPlayer] = getGuideSteps({ touch: false, controls })
      const mice = [controls[1], controls[2]].filter((scheme) => scheme === 'mouse').length

      expect(twoPlayer.title).toBe(mice > 0 ? 'Two Players, One Computer' : 'Two Players, One Keyboard')
      if (mice === 2) expect(twoPlayer.body).toBe('Both players use the mouse. Drag in your own half.')
      else expect(twoPlayer.body).toBe(`Player 1 uses ${PHRASE[controls[1]]}, player 2 uses ${PHRASE[controls[2]]}.${mice > 0 ? ' Drag in your own half.' : ' Change them before a match.'}`)
      expect(twoPlayer.body.length).toBeLessThanOrEqual(90)
      // Nothing on screen is labeled loadout, and the guide first shows on Home, before that screen.
      expect(textOf(false, controls)).not.toMatch(/loadout|lobby/i)
    }
    expect(textOf(true)).not.toMatch(/loadout|lobby/i)
  })

  it("draws hud's SeatDevicesHint with each seat's own device", () => {
    const devices = (controls: Record<SnakeId, ControlScheme>) => (getGuideSteps({ touch: false, controls })[2].art as ReactElement<{ devices?: unknown }>).props.devices
    const [, , twoPlayer] = getGuideSteps({ touch: false, controls: DEFAULT_CONTROLS })

    expect((twoPlayer.art as ReactElement).type).toBe(SeatDevicesHint)
    expect(devices({ 1: 'mouse', 2: 'wasd' })).toEqual(['mouse', 'keyboard'])
    expect(devices({ 1: 'numpad', 2: 'mouse' })).toEqual(['keyboard', 'mouse'])
    expect(devices({ 1: 'ijkl', 2: 'arrows' })).toEqual(['keyboard', 'keyboard'])
  })

  it("names the keys each seat actually uses, and draws seat 1's own caps", () => {
    const [steer, , twoPlayer] = getGuideSteps({ touch: false, controls: { 1: 'ijkl', 2: 'arrows' } })

    expect(steer.body).toBe('Press a direction key and your snake turns that way.')
    expect((steer.art as ReactElement).type).toBe(DirectionKeysHint)
    expect((steer.art as ReactElement<{ labels?: unknown }>).props.labels).toEqual({ up: 'I', left: 'J', down: 'K', right: 'L' })
    expect(twoPlayer.title).toBe('Two Players, One Keyboard')
    expect(twoPlayer.body).toBe('Player 1 uses IJKL, player 2 uses the arrow keys. Change them before a match.')

    const [numpadSteer] = getGuideSteps({ touch: false, controls: { 1: 'numpad', 2: 'wasd' } })
    expect((numpadSteer.art as ReactElement<{ labels?: unknown }>).props.labels).toEqual({ up: '8', left: '4', down: '2', right: '6' })
    const [arrowsSteer] = getGuideSteps({ touch: false, controls: { 1: 'arrows', 2: 'wasd' } })
    // Arrow keys are drawn as arrow icons, not letters.
    expect((arrowsSteer.art as ReactElement<{ labels?: unknown }>).props.labels).toBeUndefined()
  })
})
