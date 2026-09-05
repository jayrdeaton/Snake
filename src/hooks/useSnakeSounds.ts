import { useSoundSettings } from '@rific/feedback-press'
import { useCallback } from 'react'

import { useRetroSounds } from './sounds/useRetroSounds'

// Wraps Expo-Starter's existing retro sound pack (hooks/sounds/useRetroSounds.ts) with the app's
// own sound-enabled setting, gated exactly the way LightCycles' useGameSound.ts gates its gameplay
// SFX calls: useAudioPool (what useRetroSounds itself calls under the hood) has no enabled-check of
// its own by design — see that hook's own doc comment — so every exposed play function here checks
// `settings.enabled` itself before firing. No new audio assets: each function just points at
// whichever existing retro-pack clip reads best for that moment —
//   playTurn           -> retro-blip.wav         (short, cheap enough to fire every swipe)
//   playEat             -> retro-powerup.wav      (growth/score feedback reads as a small power-up)
//   playGameOver         -> retro-laser.wav        (a bigger one-shot for the round actually ending)
//   playCountdownTick    -> retro-tick.wav         (already literally named for this)
//   playCountdownGo      -> retro-jump.wav         (a more energetic cue than tick, distinct for "GO!")
//   playActivate         -> retro-blip-reverse.wav (the one previously-unused clip in the pack —
//                                                    reads as a deliberate, distinct "use item"
//                                                    beat rather than an ordinary turn's plain blip)
//   playPickup           -> retro-jump.wav         (reused from playCountdownGo — an upbeat "got
//                                                    it!" cue; the two never fire in overlapping
//                                                    contexts, so reusing the clip reads fine)
export function useSnakeSounds() {
  const { settings } = useSoundSettings()
  const { playRetroBlip, playRetroBlipReverse, playRetroTick, playRetroJump, playRetroLaser, playRetroPowerup } = useRetroSounds()

  const playTurn = useCallback(() => {
    if (settings.enabled) playRetroBlip()
  }, [settings.enabled, playRetroBlip])

  const playEat = useCallback(() => {
    if (settings.enabled) playRetroPowerup()
  }, [settings.enabled, playRetroPowerup])

  const playGameOver = useCallback(() => {
    if (settings.enabled) playRetroLaser()
  }, [settings.enabled, playRetroLaser])

  const playCountdownTick = useCallback(() => {
    if (settings.enabled) playRetroTick()
  }, [settings.enabled, playRetroTick])

  const playCountdownGo = useCallback(() => {
    if (settings.enabled) playRetroJump()
  }, [settings.enabled, playRetroJump])

  const playActivate = useCallback(() => {
    if (settings.enabled) playRetroBlipReverse()
  }, [settings.enabled, playRetroBlipReverse])

  const playPickup = useCallback(() => {
    if (settings.enabled) playRetroJump()
  }, [settings.enabled, playRetroJump])

  return { playTurn, playEat, playGameOver, playCountdownTick, playCountdownGo, playActivate, playPickup }
}
