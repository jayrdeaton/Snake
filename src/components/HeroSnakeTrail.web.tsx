// Web needs a different loading strategy than native: @shopify/react-native-skia's `Skia` object
// is bound to `global.CanvasKit` once, at module-import time (see its own Skia.web.ts —
// `export const Skia = JsiSkApi(global.CanvasKit)`). HeroSnakeTrailCanvas.tsx imports `Skia` at
// its own top level, so if that module is ever required before CanvasKit's wasm binary has
// loaded, `Skia` is permanently bound to `undefined` — no amount of gating the render afterwards
// fixes it, because the binding already happened. `WithSkiaWeb` sidesteps this the way Shopify's
// docs say to: `getComponent` is a *dynamic* import, so HeroSnakeTrailCanvas.tsx isn't required
// (and Skia isn't bound) until after `LoadSkiaWeb()` — which WithSkiaWeb calls first — has
// resolved. Mirrors SnakeBoard.web.tsx exactly.
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web'

import type { HeroSnakeTrailProps } from './HeroSnakeTrailCanvas'

export function HeroSnakeTrail(props: HeroSnakeTrailProps) {
  return <WithSkiaWeb<HeroSnakeTrailProps> getComponent={() => import('./HeroSnakeTrailCanvas').then((m) => ({ default: m.HeroSnakeTrail }))} componentProps={props} />
}
