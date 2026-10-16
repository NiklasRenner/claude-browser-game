/**
 * The figures on the stage (the officer and the hostiles) and where things are
 * on them: where they stand, their body centre and head, where their weapon
 * is, and what a click hits. All of it is plain geometry in scene pixels, so
 * it can be tested without a canvas (tests/stage.test.ts).
 */
import type { StatusId } from '../core';
import { Painter } from './pixel/painter';
import type { Figure } from './sprites';

export type Pt = [number, number];

export interface Actor {
  figure: Figure;
  painter: Painter;
  /** Where its feet are (the middle of its base line). */
  x: number;
  y: number;
  /** Animated offsets and pose. */
  ox: number;
  oy: number;
  attack: number;
  flash: number;
  /** 0 = whole, 1 = gone (crumbled to ash). */
  dissolve: number;
  /** Lying down (defeat), radians. */
  fall: number;
  visible: boolean;
  /** Which way it faces: 1 = right (the officer), −1 = left (hostiles). */
  facing: 1 | -1;
  /** Lasting effects drawn on it: a shield dome, a holo-decoy afterimage, a target mark. */
  statuses: Set<StatusId>;
}

/** How far a fallen figure is turned (lying on its back). */
export const FALLEN = -Math.PI / 2;

/**
 * Where hostiles stand, by lineup size: [x, y] as fractions of the narrowest scene (MIN_W × SCENE_H),
 * x measured from its left edge (centred on wider screens). Hostiles are drawn in lineup order, each
 * over the one to its left, so the lineup is staggered the same way: each one a little lower (nearer)
 * than the one before.
 */
const SLOTS: Record<number, Pt[]> = {
  1: [[0.68, 0.72]],
  2: [[0.62, 0.69], [0.79, 0.75]],
  3: [[0.6, 0.67], [0.73, 0.75], [0.86, 0.8]],
};

/** Where hostile `i` of a lineup of `count` stands (see SLOTS). */
export const hostileSpot = (count: number, i: number): Pt => SLOTS[count]?.[i] ?? [0.7, 0.72];

/**
 * Where the officer stands (x as a fraction, like SLOTS). Between fights (field) he stays where he
 * fought, instead of jumping to the middle; aboard the ship he stands left of the ship's panel, by the window.
 */
export const HERO_X = { battle: 0.3, ship: 0.26, field: 0.3 };
export type View = keyof typeof HERO_X;

export function makeActor(figure: Figure, facing: 1 | -1): Actor {
  return {
    figure, painter: new Painter(1, 1), x: 0, y: 0, ox: 0, oy: 0, attack: 0, flash: 0, dissolve: 0, fall: 0, visible: true, facing,
    statuses: new Set(),
  };
}

/** The middle of its body. */
export function center(a: Actor): Pt {
  const f = a.figure, s = f.scale;
  return [a.x + a.ox + (f.right - f.left) * s * 0.15, a.y - (f.height * 0.5 + f.hover) * s];
}

/** Just above its head (`extra` pixels higher): where numbers and names pop up. */
export function head(a: Actor, extra = 4): Pt {
  const f = a.figure, s = f.scale;
  return [a.x + a.ox, a.y - (f.height * 0.85 + f.hover) * s - extra];
}

/** Where its weapon is at time `t`: the muzzle of a gun, else just in front of the body. */
export function hand(a: Actor, t: number): Pt {
  const [cx, cy] = center(a);
  return muzzle(a, t)?.at ?? [cx + 12 * a.facing, cy - 4];
}

/** A gun's muzzle at time `t` and the barrel's angle, or null for figures without a gun. */
function muzzle(a: Actor, t: number): { at: Pt; angle: number } | null {
  const m = a.figure.muzzle?.(t);
  if (!m) return null;
  const s = a.figure.scale;
  return { at: [a.x + a.ox + m[0] * s, a.y + a.oy + (m[1] - a.figure.hover) * s], angle: m[2] };
}

/**
 * A gun's shot at a target: from the muzzle, straight along the barrel to where it crosses the target's
 * middle (it can pass over or under a small one). Null for figures without a gun.
 */
export function shot(a: Actor, target: Actor, t: number): { from: Pt; to: Pt } | null {
  const m = muzzle(a, t);
  if (!m) return null;
  const tx = center(target)[0];
  return { from: m.at, to: [tx, m.at[1] + Math.tan(m.angle) * (tx - m.at[0])] };
}

/** The middle of the visible ones (where a grenade lands), or `fallback` if there are none. */
export function groupCenter(actors: Actor[], fallback: Pt): Pt {
  const pts = actors.filter((a) => a.visible).map(center);
  if (!pts.length) return fallback;
  return [pts.reduce((n, p) => n + p[0], 0) / pts.length, pts.reduce((n, p) => n + p[1], 0) / pts.length];
}

/** Index of the visible actor under a scene point (inside its body's box; nearest centre wins), or null. */
export function pickAt(actors: Actor[], x: number, y: number): number | null {
  let best: number | null = null, bestD = Infinity;
  actors.forEach((a, i) => {
    if (!a.visible) return;
    const f = a.figure, s = f.scale;
    const left = a.x - f.left * s * 0.7, right = a.x + f.right * s * 0.7, top = a.y - (f.height + f.hover) * s;
    if (x < left || x > right || y < top || y > a.y + 3) return;
    const [cx, cy] = center(a), d = Math.hypot(x - cx, y - cy);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
