/** What a hostile body plan gets to work with: its colours and features. */
import type { LookFeature } from '../../core';
import type { Painter } from '../pixel/painter';
import type { Ramp, RGB } from '../pixel/palette';
import type { Pose } from './figure';

export interface Kit {
  /** Main hide / robe / shell. */
  body: Ramp;
  /** The same, darker (far limbs, undersides). */
  dark: Ramp;
  /** Accent as a material (plates, frills, crystals). */
  accent: Ramp;
  /** Accent as light (eyes, cracks, sacs). */
  glow: RGB;
  boss: boolean;
  has(f: LookFeature): boolean;
}

/** A body plan: its box in local units and how to paint it. All hostiles face left. */
export interface Body {
  left: number;
  right: number;
  height: number;
  hover?: number;
  /** Size multiplier on top of the hostile's own scale (small creatures are drawn at a bigger base size). */
  size?: number;
  draw(p: Painter, pose: Pose, k: Kit): void;
}

/** A pair of glowing eyes (or one), with an occasional blink. */
export function eyes(p: Painter, t: number, pts: readonly (readonly [number, number])[], col: RGB) {
  if (Math.sin(t * 0.6 + pts[0]![0]) > 0.98) return;
  for (const [x, y] of pts) p.glow(x, y, col);
}

/** Attack curve: rises to 1 at the strike (a = 0.4) and falls back. */
export const lunge = (a: number) => (a <= 0 ? 0 : a < 0.4 ? a / 0.4 : Math.max(0, 1 - (a - 0.4) / 0.6));
