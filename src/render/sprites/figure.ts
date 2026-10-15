/**
 * A figure is a function that paints a character into a Painter, plus the
 * box it occupies. Figures are written in their own units with the feet at
 * (0, 0) and up being negative y; the officer faces right, hostiles face left.
 */
import type { Painter } from '../pixel/painter';

export interface Pose {
  /** Seconds, for idle motion. */
  t: number;
  /** 0..1 through an attack: wind-up, strike, recover. */
  attack: number;
}

export interface Figure {
  /** Extent in local units: left and right of the feet, and height above them. */
  left: number;
  right: number;
  height: number;
  /** Local units per screen pixel. */
  scale: number;
  /** Floats this far above the ground (local units). */
  hover: number;
  draw(p: Painter, pose: Pose): void;
}

/** A point along a direction: `u` forward, `v` to the side. */
export function along(x: number, y: number, angle: number) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  return (u: number, v = 0): [number, number] => [x + dx * u - dy * v, y + dy * u + dx * v];
}

/** Square wave for small, pixel-sized idle motion: 0 or 1. */
export const beat = (t: number, speed: number, phase = 0) => (Math.sin(t * speed + phase) > 0.2 ? 1 : 0);
