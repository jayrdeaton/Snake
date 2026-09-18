import { useGatedAudioPool } from '@rific/feedback-press/audio'

// Relative, not the @/ alias — see useDefaultSounds.ts's own comment on why static asset requires
// in this codebase stick to plain relative paths. Same six retro-pack clips ./sounds/useRetroSounds.ts
// requires, duplicated here rather than imported from it: that hook's own useAudioPool calls stay
// ungated — kept plain/always-audible for a since-removed sound-pack audition screen (useFeedbackSounds.ts,
// deleted as dead code) — so it can't be reused for gated in-game SFX too.
const RETRO_BLIP_SOUND = require('../../assets/sounds/retroBlip.wav')
const RETRO_TICK_SOUND = require('../../assets/sounds/retroTick.wav')
const RETRO_BLIP_REVERSE_SOUND = require('../../assets/sounds/retroBlipReverse.wav')
const RETRO_JUMP_SOUND = require('../../assets/sounds/retroJump.wav')
const RETRO_LASER_SOUND = require('../../assets/sounds/retroLaser.wav')
const RETRO_POWERUP_SOUND = require('../../assets/sounds/retroPowerup.wav')

// Game SFX, gated on the app's own sound-enabled setting via @rific/feedback-press/audio's
// useGatedAudioPool (useAudioPool + a useSoundSettings `enabled` check, generalized into one hook)
// — the same hook AirHockey/BoxHockey/Pong/LightCycles's own useGameSound.ts all thinly re-export
// and call directly per clip. This file used to hand-roll that same gate itself, once per exposed
// function, before useGatedAudioPool existed to generalize it away (LightCycles' own
// useGameSound.ts did too, until it migrated to this same hook — no longer a useful comparison to
// call out here since its gating no longer differs from this file's). No new audio assets: each
// function just points at whichever existing retro-pack clip reads best for that moment —
//   playTurn          -> retroBlip.wav         (short, cheap enough to fire every swipe)
//   playEat           -> retroPowerup.wav      (growth/score feedback reads as a small power-up)
//   playGameOver      -> retroLaser.wav        (a bigger one-shot for the round actually ending)
//   playCountdownTick -> retroTick.wav         (already literally named for this)
//   playCountdownGo   -> retroJump.wav         (a more energetic cue than tick, distinct for "GO!")
//   playActivate      -> retroBlipReverse.wav  (the one previously-unused clip in the pack —
//                                                reads as a deliberate, distinct "use item" beat
//                                                rather than an ordinary turn's plain blip)
//   playPickup        -> retroJump.wav         (reused from playCountdownGo — an upbeat "got it!"
//                                                cue; the two never fire in overlapping contexts,
//                                                so reusing the clip reads fine — sharing one
//                                                useGatedAudioPool call between both names keeps
//                                                this a single pool, not two independent ones)
export function useSnakeSounds() {
  const playTurn = useGatedAudioPool(RETRO_BLIP_SOUND)
  const playEat = useGatedAudioPool(RETRO_POWERUP_SOUND)
  const playGameOver = useGatedAudioPool(RETRO_LASER_SOUND)
  const playCountdownTick = useGatedAudioPool(RETRO_TICK_SOUND)
  const playCountdownGo = useGatedAudioPool(RETRO_JUMP_SOUND)
  const playActivate = useGatedAudioPool(RETRO_BLIP_REVERSE_SOUND)
  const playPickup = playCountdownGo

  return { playTurn, playEat, playGameOver, playCountdownTick, playCountdownGo, playActivate, playPickup }
}
