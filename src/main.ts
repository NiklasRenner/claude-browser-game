import { GameController, localStorageAdapter } from './game/controller';
import { Stage } from './render/stage';
import { UI } from './ui/ui';
import { chooseAction } from './core';
import type { Action, GameState } from './core';

declare const __DEV__: boolean;

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const overlay = document.querySelector<HTMLElement>('#fx')!;
const uiRoot = document.querySelector<HTMLElement>('#ui')!;

const game = new GameController(localStorageAdapter());

// The stage is optional: if it fails to start, the game is still fully playable.
let stage: Stage | null = null;
try {
  stage = new Stage(canvas, overlay);
  const s = stage;
  game.setAnimator((events, before, after) => s.animate(events, before, after));
  game.subscribe(() => { if (!game.busy) s.sync(game.state); });
  // Click a hostile in the scene to target it.
  canvas.addEventListener('click', (e) => {
    const b = game.state.battle;
    const slot = s.pickHostile(e.clientX, e.clientY);
    if (!b || slot === null || slot === b.target) return;
    void game.dispatch({ type: 'target', index: slot });
  });
  canvas.addEventListener('pointermove', (e) => {
    const b = game.state.battle;
    canvas.style.cursor = b && b.hostiles.length > 1 && s.pickHostile(e.clientX, e.clientY) !== null ? 'crosshair' : '';
  });
} catch (err) {
  console.warn('Scene disabled:', err);
  document.body.classList.add('no-scene');
}

new UI(uiRoot, game);
stage?.sync(game.state);

/**
 * Test / debugging hook. The e2e suite drives the real UI through this, and
 * `__qf.speed(0)` skips animations.
 */
const api = {
  get state() { return game.state; },
  get busy() { return game.busy; },
  legal: () => game.legal(),
  dispatch: (a: Action) => game.dispatch(a),
  /** Lets the built-in bot take one action (handy for testing and demos). */
  botStep: () => game.dispatch(chooseAction(game.state)),
  speed: (n: number) => { if (stage) stage.tweens.speed = n; },
  stage: stage !== null,
  hostileScreenPoint: (slot: number) => stage?.hostileScreenPoint(slot) ?? null,
  /** Jump to any (validated) game state — handy for testing a specific fight. */
  load: (state: GameState) => game.loadState(state),
};
(window as unknown as { __qf: typeof api }).__qf = api;
if (__DEV__) console.info('Starward dev build — window.__qf is available.');
