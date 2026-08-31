# Snake

A classic Snake game, built with Expo. Three ways to play on one shared board:

- **Solo** — the classic, no-rival apple-eating game.
- **Vs CPU** — one human snake and one bot snake sharing the board.
- **2 Player** — local pass-and-play, two human snakes sharing the board.

Snakes grow as they eat a shared apple and lose on colliding with a wall (or, with the
**Wrap Edges** setting on, wrap around instead), themselves, or the other snake.

Bootstrapped from Expo-Starter (Redux + redux-persist, `@rific/*` packages) plus a
Skia-based board renderer and the `@tastic/*` input and split-screen packages shared
with LightCycles.

## Getting Started

```bash
npm install
npm run start        # Expo Go
npm run client       # dev client
npm run reset        # clear cache + start
```

### Validation

```bash
npm run lint
npm run typecheck
npm run test
```
