// Shared between HeroTitle.tsx and HeroSnakeTrailCanvas.tsx. Deliberately has zero
// @shopify/react-native-skia import — HeroTitle.tsx is loaded eagerly (it's the home route), and
// any *value* import reaching into HeroSnakeTrailCanvas.tsx from there would drag Skia's `Skia`
// binding (which attaches to global.CanvasKit at module-evaluation time) into that eager bundle
// too, defeating HeroSnakeTrail.web.tsx's whole reason for existing (see that file). Type-only
// imports of WordBox are fine (erased at compile time); this file exists for the *values* below.

export interface WordBox {
  x: number
  y: number
  width: number
  height: number
}

// Extra canvas margin around the measured word box so the loop and its rounded corners can sit
// clear of the Skia surface's own edge without getting clipped. Sized to clear more than just the
// loop path itself: the head silhouette bulges up to ~6px past the path centerline (its own
// half-width plus outline stroke), which is wider than the body stroke's own half-width — so the
// margin has to cover the head's worst case, not the thinner body, or the head clips whenever it's
// tracing the loop's left/right edges (where "sideways" is horizontal). See
// HERO_TRAIL_MARGIN_SIDE/TOP/BOTTOM below for the (smaller, purely cosmetic) gap between the loop
// and the word itself — this pad stacks on top of that gap, it doesn't replace it.
export const HERO_CANVAS_PAD = 28

// Breathing room between the letters and the loop the snake travels, on every side — unlike
// LightCycles' two-word HeroTitleTrails (which leaves one seam-facing side untouched so two loops
// can sit edge to edge), Snake has just the one word/one loop, so all four sides get the same gap.
export const HERO_TRAIL_MARGIN_TOP = 14
export const HERO_TRAIL_MARGIN_BOTTOM = 14
export const HERO_TRAIL_MARGIN_SIDE = 18

// Rounded corners — a real snake has no sharp 90-degree turns, unlike LightCycles' own
// grid-based light-trail loop (see that file's own comment on why its corners are sharp).
export const HERO_TRAIL_CORNER_RADIUS = 20
