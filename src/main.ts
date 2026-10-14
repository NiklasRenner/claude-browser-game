import { GameController, localStorageAdapter } from './game/controller';
import { Stage } from './render/stage';
import { UI } from './ui/ui';
import { chooseAction } from './core';
import type { Action } from './core';

declare const __DEV__: boolean;

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const overlay = document.querySelector<HTMLElement>('#fx')!;
const uiRoot = document.querySelector<HTMLElement>('#ui')!;

const game = new GameController(localStorageAdapter());

// The 3D stage is optional: if WebGL is unavailable the game is still fully playable.
let stage: Stage | null = null;
try {
  stage = new Stage(canvas, overlay);
  const s = stage;
  game.setAnimator((events, before, after) => s.animate(events, before, after));
  game.subscribe(() => { if (!game.busy) s.sync(game.state); });
} catch (err) {
  console.warn('3D view disabled:', err);
  document.body.classList.add('no-webgl');
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
  webgl: stage !== null,
};
(window as unknown as { __qf: typeof api }).__qf = api;
if (__DEV__) console.info('Starward dev build — window.__qf is available.');
