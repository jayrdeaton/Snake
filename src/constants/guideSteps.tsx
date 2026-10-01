import { type DirectionKeyLabels, DirectionKeysHint, type GuideStep, type SeatDevice, SeatDevicesHint, SeatDiagram, SwipeHint } from '@tastic/hud/guide'

import { GuideSnakeCrash } from '@/components/GuideArt'
import type { ControlScheme, SnakeId } from '@/types'

type KeyControl = Exclude<ControlScheme, 'mouse'>

// How each scheme reads in a sentence. Deliberately not /loadout's CONTROL_SCHEME_OPTIONS labels
// ('Arrows', 'Numpad'), which are picker labels, not prose.
const SCHEME_PHRASE: Record<ControlScheme, string> = { mouse: 'the mouse', wasd: 'WASD', arrows: 'the arrow keys', ijkl: 'IJKL', numpad: 'the numpad' }
// What DirectionKeysHint prints on its caps for a key scheme (undefined = draw the arrow keys as
// arrows). 'mouse' has no entry: a mouse seat drags rather than pressing anything.
const KEY_CAPS: Record<KeyControl, DirectionKeyLabels | undefined> = {
  wasd: { up: 'W', left: 'A', down: 'S', right: 'D' },
  arrows: undefined,
  ijkl: { up: 'I', left: 'J', down: 'K', right: 'L' },
  numpad: { up: '8', left: '4', down: '2', right: '6' }
}

// SeatDevicesHint's device for a seat's scheme: every key scheme is the keyboard.
function seatDevice(scheme: ControlScheme): SeatDevice {
  return scheme === 'mouse' ? 'mouse' : 'keyboard'
}

// The fleet's desktop two-player sentence (the same template in every game with this card). A mouse
// seat's drags only steer inside its own half of the board in two-player (TouchInputLayer's per-seat
// zones), so that's said here, on the two-player card, and nowhere else. With no mouse seat the tail
// says where the schemes are changed instead: before a match, on the screen 1 Player and 2 Player
// open (nothing on screen is labeled loadout, and the guide first shows on Home, before the player
// has seen that screen).
function twoPlayerBody(controls: Record<SnakeId, ControlScheme>): string {
  const p1Mouse = controls[1] === 'mouse'
  const p2Mouse = controls[2] === 'mouse'
  if (p1Mouse && p2Mouse) return 'Both players use the mouse. Drag in your own half.'
  const tail = p1Mouse || p2Mouse ? ' Drag in your own half.' : ' Change them before a match.'
  return `Player 1 uses ${SCHEME_PHRASE[controls[1]]}, player 2 uses ${SCHEME_PHRASE[controls[2]]}.${tail}`
}

interface GuideStepsInput {
  // A touch screen vs. a desktop browser: a phone steers by swiping, a desktop by mouse or key.
  touch: boolean
  // Each seat's live control scheme (gameSlice's controlScheme), only read on desktop. Seats pick
  // their own in /loadout, and seat 1 defaults to 'mouse', so a replayed guide has to name the real
  // ones, not assume keys.
  controls: Record<SnakeId, ControlScheme>
}

// The three cards of Snake's how-to-play flow. Pure and hook-free so it's trivially testable;
// GuideHost feeds it useIsTouchPrimaryDevice() and the live control schemes, and memoizes the result.
//
// What's here is what a first-time player cannot work out alone (none of it is printed anywhere in
// the game): steering is absolute, not relative; walls and ANY snake are lethal, your own included;
// against a rival the first crash loses (not the lower score); and in two-player one phone is shared
// face to face. Copy rules (Jay, 2026-09-24): Title Case titles, short bodies, and only say what's
// true in every mode, since the guide shows on Home before Solo / Vs CPU / 2 Player is chosen.
// That's why the second card's headline is "Don't Crash" rather than a win condition: Solo has no
// win at all (the run just ends), so the versus rule is scoped with "With two snakes" instead.
// "Your own half" is only true with two players, so it lives on the two-player card (a lone human,
// Solo or Vs CPU, steers from the whole board: game.tsx keys TouchInputLayer's mode off the number
// of humans, which is what makes the first card true in Vs CPU too). There's no card explaining
// 1 Player vs 2 Player (those buttons are right behind the dialog), and none for powerups (off by
// default).
export function getGuideSteps({ touch, controls }: GuideStepsInput): GuideStep[] {
  const p1 = controls[1]
  const usesMouse = controls[1] === 'mouse' || controls[2] === 'mouse'

  return [
    {
      title: 'Steer Your Snake',
      body: touch ? 'Swipe up, down, left or right. Your snake turns the way you swipe.' : p1 === 'mouse' ? 'Drag the mouse up, down, left or right. Your snake turns the way you drag.' : 'Press a direction key and your snake turns that way.',
      art: touch ? <SwipeHint direction='up' /> : p1 === 'mouse' ? <SwipeHint pointer='mouse' direction='up' /> : <DirectionKeysHint labels={KEY_CAPS[p1]} />
    },
    {
      title: "Don't Crash",
      body: 'Walls and snakes, even your own, are deadly. With two snakes, the first to crash loses.',
      art: <GuideSnakeCrash />
    },
    touch
      ? {
          title: 'Two Players, One Phone',
          body: 'Sit across from each other and swipe in your own half.',
          art: <SeatDiagram />
        }
      : {
          // "One Keyboard" is only true when neither seat is on the mouse.
          title: usesMouse ? 'Two Players, One Computer' : 'Two Players, One Keyboard',
          body: twoPlayerBody(controls),
          art: <SeatDevicesHint devices={[seatDevice(controls[1]), seatDevice(controls[2])]} />
        }
  ]
}
