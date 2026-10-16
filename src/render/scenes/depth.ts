/**
 * The scene's perspective, so everything placed in it has a consistent size.
 *
 * The ground is a flat plane seen from eye height: something standing on it
 * looks smaller the closer its base is to the horizon, in proportion. The
 * fighters stand on one line (FEET) and fix the scale there: the officer is
 * 1.8 m and 82 px tall, so PX_PER_M pixels per metre at depth 1. At depth d
 * (0.5 = twice as far, 2 = half as far) a metre is d × PX_PER_M pixels and the
 * base stands d of the way from the horizon down to the fighters' line.
 *
 * Sprites keep their native pixel size (pixel art shouldn't be resampled), so
 * a piece's depth follows from its size: a 0.9 m barrel drawn 33 px tall stands
 * at depth 33 / (0.9 × PX_PER_M) = 0.8, a little behind the fighters. To bring
 * something nearer, generate it bigger.
 */

/**
 * The scene's size in art pixels: always SCENE_H tall, between MIN_W and MAX_W
 * wide (the stage scales it up by whole pixels and adds bars beyond that).
 */
export const SCENE_H = 180;
export const MIN_W = 320;
export const MAX_W = 384;

/**
 * Where something placed at fraction x of the narrowest scene stands in a scene
 * W wide: everything keeps its spot around the centre, and a wider scene only
 * shows a little more at the sides.
 */
export const sceneX = (W: number, x: number) => Math.round(W / 2 + (x - 0.5) * MIN_W);

/** The fighters' feet, as a fraction of the screen height. */
export const FEET = 0.73;

/** Pixels per metre on the fighters' line: the officer, 1.8 m tall, is 82 px. */
export const PX_PER_M = 82 / 1.8;

/** How far away something of this pixel height and real height (metres) stands: 1 = the fighters' line, smaller = farther. */
export const depthOf = (px: number, metres: number) => px / (metres * PX_PER_M);

/** Where the base of something at this depth stands on screen. */
export const groundY = (depth: number, horizon: number, feet: number) => Math.round(horizon + depth * (feet - horizon));
