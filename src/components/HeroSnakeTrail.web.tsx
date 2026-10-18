// Web needs a different loading strategy than native: @shopify/react-native-skia's `Skia` object
// is bound to `global.CanvasKit` once, at module-import time (see its own Skia.web.ts -
// `export const Skia = JsiSkApi(global.CanvasKit)`). HeroSnakeTrailCanvas.tsx imports `Skia` at
// its own top level, so if that module is ever required before CanvasKit's wasm binary has
// loaded, `Skia` is permanently bound to `undefined` - no amount of gating the render afterwards
// fixes it, because the binding already happened. A dynamic import is the one thing that defers
// module evaluation to runtime, so HeroSnakeTrailCanvas.tsx (and therefore Skia) is only imported
// after hud's loadSkiaWeb() has resolved and set global.CanvasKit for real. The lazy component is
// created once, at module scope, so its identity never changes between renders. Mirrors
// SnakeBoard.web.tsx exactly.
import { loadSkiaWeb } from '@tastic/hud/skia'
import { lazy, Suspense } from 'react'

import type { HeroSnakeTrailProps } from './HeroSnakeTrailCanvas'

const LazyHeroSnakeTrail = lazy(() => loadSkiaWeb().then(() => import('./HeroSnakeTrailCanvas').then((m) => ({ default: m.HeroSnakeTrail }))))

export function HeroSnakeTrail(props: HeroSnakeTrailProps) {
  return (
    <Suspense fallback={null}>
      <LazyHeroSnakeTrail {...props} />
    </Suspense>
  )
}
