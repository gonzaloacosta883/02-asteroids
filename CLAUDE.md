# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Asteroids arcade clone in plain HTML5 Canvas + vanilla JS. No dependencies, no bundler, no tests, no linter. README and in-code comments are in Spanish.

## Running

Open `index.html` in a browser, or serve locally: `npx serve .` (http://localhost:3000). There is no build step; reload the page to see changes.

## Architecture

Everything lives in `game.js` (loaded by `index.html` onto an 800×600 `<canvas id="canvas">`; `W`/`H` constants must match the canvas size). Flow:

- **Input**: global `keys` (held state) and `justPressed` (edge-triggered, consumed by calling `pressed(code)`). Use `pressed('Space')` for one-shot actions, `keys[...]` for continuous ones.
- **Entities**: classes `Ship`, `Bullet`, `Asteroid`, `Particle`, each with `update(dt)` / `draw()` and a `dead` flag. Dead entities are removed by array filtering in `update()`. Entities draw directly to the global `ctx`.
- **World is toroidal**: positions wrap via `wrap(v, max)`; particles do not wrap.
- **Game state**: module-level globals (`ship`, `bullets`, `asteroids`, `particles`, `score`, `lives`, `level`) plus a `state` string: `'playing' | 'dead' | 'gameover'`. `update(dt)` branches on `state` first; `'dead'` is a 2s respawn timer (`deadTimer`) during which asteroids keep moving.
- **Loop**: `requestAnimationFrame` with `dt` in seconds, clamped to 0.05.
- **Tuning tables**: `RADII`, `SPEEDS`, `POINTS` are indexed by asteroid size (1–3; index 0 unused). Note small asteroids score more.
- **Collisions**: circle-based via `dist()`; ship-vs-asteroid uses `a.radius * 0.82` as a forgiving hitbox and is skipped while `ship.invincible > 0`.
- Level clears when `asteroids.length === 0` → `nextLevel()` spawns `3 + level` large asteroids outside a safe radius around the center.

The README mentions power-ups and a "shooting star" asteroid type; these are not implemented in the current `game.js`.
