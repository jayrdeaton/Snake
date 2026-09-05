import { useAccelerometerOrientation } from '@tastic/split-screen'
import { StyleSheet, View } from 'react-native'
import { Icon } from 'react-native-paper'

import { SNAKE_POWERUP_ICONS } from '@/constants/snake'
import { SnakeEntity } from '@/types'

export interface SnakePowerupHudProps {
  snakes: SnakeEntity[]
}

const BADGE_SIZE = 30

// Both snakes' held item is always visible to both — there's no realistic way to hide it anyway on
// a single shared screen where each snake's own zone is already fully visible to the other (same as
// a rival's held item being visible in Mario Kart). The item's TYPE is the only thing that's a
// mystery (see SnakeBoardCanvas.tsx's Pickups layer) — once held, it's revealed here. Kept
// deliberately understated (small, low-opacity, no per-snake color) — this is a quiet reference, not
// something that should compete for attention with the board itself. Mirrors LightCycles'
// PowerupHud.tsx's identical HeldItemBadge.
function HeldItemBadge({ heldPowerup }: { heldPowerup: SnakeEntity['heldPowerup'] }) {
  return <View style={styles.badge}>{heldPowerup && <Icon source={SNAKE_POWERUP_ICONS[heldPowerup]} size={16} color='rgba(255,255,255,0.85)' />}</View>
}

// Corner-positioned held-item badge per snake, mirroring LightCycles' PowerupHud.tsx. Corner picked
// per snake from the live orientationMode/p1OnRight — the same "is this seat on the right"
// convention SnakeBoardCanvas.tsx's wallPath and TouchInputLayer.tsx's zone split already use — so
// each badge always sits in that snake's own zone rather than a side fixed regardless of how the
// device is physically being held. In faceToFace, column doesn't matter (each snake's zone spans
// the full width): snake 1 stays bottom, snake 2 stays top, regardless of p1OnRight. Solo mode
// (snakes.length === 1) simply has no snake 2 to render a second badge for.
export function SnakePowerupHud({ snakes }: SnakePowerupHudProps) {
  const { orientationMode, p1OnRight } = useAccelerometerOrientation()
  const snake1 = snakes.find((s) => s.id === 1)
  const snake2 = snakes.find((s) => s.id === 2)
  const isFaceToFace = orientationMode === 'faceToFace'
  const snake1OnRightSide = !isFaceToFace && p1OnRight
  const snake2OnLeftSide = !isFaceToFace && !p1OnRight

  return (
    <>
      {snake1 && (
        <View pointerEvents='none' style={snake1OnRightSide ? styles.bottomRight : styles.bottomLeft}>
          <HeldItemBadge heldPowerup={snake1.heldPowerup} />
        </View>
      )}
      {snake2 && (
        <View pointerEvents='none' style={snake2OnLeftSide ? styles.topLeft : styles.topRight}>
          <HeldItemBadge heldPowerup={snake2.heldPowerup} />
        </View>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 1,
    height: BADGE_SIZE,
    justifyContent: 'center',
    opacity: 0.7,
    width: BADGE_SIZE
  },
  bottomLeft: { bottom: 12, left: 12, position: 'absolute' },
  bottomRight: { bottom: 12, position: 'absolute', right: 12 },
  topLeft: { left: 12, position: 'absolute', top: 12 },
  topRight: { position: 'absolute', right: 12, top: 12 }
})
