/**
 * The scene's size, and the scale generated art is checked against.
 *
 * Size: the scene is always SCENE_H pixels tall and MIN_W–MAX_W wide (the
 * stage scales it up by whole pixels and adds bars beyond). Everything in a
 * layout is placed in the narrowest scene, MIN_W × SCENE_H; on a wider one it
 * keeps its place around the centre, or, if pinned, next to its nearest edge.
 *
 * Scale: the officer, 1.8 m tall, is 82 px on the fighters' line, so a metre
 * is PX_PER_M pixels there. Things farther back are drawn smaller: each piece
 * of art is made for a plane (its label), which says how much smaller. That's
 * only used to check generated art has a consistent size (tests/sprites.test.ts)
 * and as a guide in the scene editor; where something is drawn is up to the layout.
 */

export const SCENE_H = 180;
export const MIN_W = 320;
export const MAX_W = 384;

/** The horizon and the fighters' feet (pixels from the top). */
export const HORIZON = 101;
export const FEET = 131;

/** Pixels per metre on the fighters' line. */
const PX_PER_M = 82 / 1.8;

/** Where art is meant to go, and its scale there (1 = the fighters' line). */
export const PLANES = {
  /** In front of the fighters: framing trees and walls. */
  foreground: 1.25,
  fighters: 1,
  /** Just behind the fighters. */
  behind: 0.8,
  /** The far side of the arena. */
  background: 0.5,
  /** Across the water. */
  distant: 0.25,
  /** On the skyline. */
  horizon: 0.08,
} as const;
export type Plane = keyof typeof PLANES;

/** How tall (pixels) something this many metres tall should be drawn for its plane. */
export const expectedPx = (metres: number, plane: Plane) => metres * PX_PER_M * PLANES[plane];

/** Where the feet of something on this plane would be (a guide line in the editor). */
export const planeLine = (plane: Plane) => Math.round(HORIZON + PLANES[plane] * (FEET - HORIZON));

/** Where something at fraction x of the narrowest scene stands in a scene W wide (the fighters' spots). */
export const sceneX = (W: number, x: number) => Math.round(W / 2 + (x - 0.5) * MIN_W);

/** How far a thing at `x` (w wide, in the narrowest scene) moves right in a scene W wide. */
export function shiftX(x: number, w: number, pinned: boolean | undefined, W: number) {
  const extra = W - MIN_W;
  if (!pinned) return Math.round(extra / 2);
  return x + w / 2 < MIN_W / 2 ? 0 : extra;
}
