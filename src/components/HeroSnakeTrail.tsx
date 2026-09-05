// Default/native entry point — see HeroSnakeTrail.web.tsx for why web gets its own file. Metro's
// platform extension resolution picks that one over this one when bundling for web; iOS/Android
// (and anything else) fall back to this plain re-export, since native's Skia binding is ready
// synchronously and needs none of web's lazy-load dance. Mirrors SnakeBoard.tsx exactly.
export { HeroSnakeTrail, type HeroSnakeTrailProps } from './HeroSnakeTrailCanvas'
