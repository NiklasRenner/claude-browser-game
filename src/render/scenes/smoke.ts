/**
 * A smoke plume: dark puffs rising from a fire, growing, drifting with the
 * wind and thinning out as they go, drawn fresh every frame (so it moves, and
 * there's no sprite edge to cut it off). A `smoke` layer is placed like a
 * sprite: its box is SMOKE_W × SMOKE_H times its `size`, and the fire it rises
 * from is near the bottom left of the box (the wind blows it to the right).
 */
import { makeCanvas } from '../pixel/painter';
import { bayer, hash } from '../pixel/noise';
import { mix } from '../pixel/palette';
import type { RGB } from '../pixel/palette';

export const SMOKE_W = 48;
export const SMOKE_H = 110;

/** Puffs in the air at once, and how long one takes to rise the whole way (seconds). */
const PUFFS = 22;
const RISE = 7;
/** Smoke colours: the dark body of a puff, its top lit by the sky, its outline, and the underside lit by the fire. */
const SOOT: RGB = [26, 21, 22];
const LIT: RGB = [64, 54, 52];
const EDGE: RGB = [12, 9, 10];
const FIRELIT: RGB = [110, 52, 26];

const canvases = new Map<string, { can: HTMLCanvasElement; data: ImageData }>();

/** The plume in a box w × h at time t; it fades toward the haze colour as it rises. */
export function paintSmoke(w: number, h: number, t: number, haze: RGB): HTMLCanvasElement {
  const key = `${w}x${h}`;
  let c = canvases.get(key);
  if (!c) {
    c = { can: makeCanvas(w, h), data: new ImageData(w, h) };
    canvases.set(key, c);
  }
  const { data } = c;
  data.data.fill(0);
  const scale = h / SMOKE_H;
  const sx = w * 0.3, sy = h - 4 * scale;
  // Oldest (highest) puffs first, so the younger ones below are drawn over them.
  // Each puff is born at a slightly random moment and has its own size and sideways drift (new every time it's reborn).
  const puffs = Array.from({ length: PUFFS }, (_, k) => {
    const age = t / RISE + (k + hash(k, 7) * 0.8) / PUFFS, n = Math.floor(age);
    return { k: k * 31 + n, u: age - n };
  }).sort((p, q) => q.u - p.u);
  for (const { k, u } of puffs) {
    const size = 0.7 + hash(k, 1) * 0.6, side = (hash(k, 2) - 0.5) * 2;
    // Rises, leans with the wind (faster up high), and wanders to its own side.
    const px = sx + u * u * 0.55 * w + side * (2 + u * 9) * scale;
    const py = sy - u * (h - 14 * scale) * (0.92 + hash(k, 3) * 0.16);
    const r = (4 + u * 10) * size * scale;
    // Whole puffs low down; up high they break up (dithered) and fade toward the haze.
    const density = Math.min(1, (1 - u) * 2.5);
    const tint = (c: RGB) => mix(c, haze, u * 0.25);
    const x0 = Math.max(0, Math.floor(px - r - 1)), x1 = Math.min(w - 1, Math.ceil(px + r + 1));
    const y0 = Math.max(0, Math.floor(py - r - 1)), y1 = Math.min(h - 1, Math.ceil(py + r + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - px) / r, dy = (y - py) / (r * 0.85), d = Math.hypot(dx, dy);
        if (d > 1.08) continue;
        if (density < 1 && density * (1.4 - d) < bayer(x, y)) continue;
        // Lit from above left, an outline at the rim, warm underneath while near the fire.
        const top = -(dx * 0.45 + dy * 0.9);
        let col = d > 0.92 && dy < 0.2 ? EDGE : top > 0.45 ? LIT : SOOT;
        if (dy > 0.4 && u < 0.35) col = mix(col, FIRELIT, (0.35 - u) * 2.2);
        const c2 = tint(col);
        const o = (y * w + x) * 4;
        data.data[o] = c2[0]; data.data[o + 1] = c2[1]; data.data[o + 2] = c2[2]; data.data[o + 3] = 255;
      }
    }
  }
  c.can.getContext('2d')!.putImageData(data, 0, 0);
  return c.can;
}
