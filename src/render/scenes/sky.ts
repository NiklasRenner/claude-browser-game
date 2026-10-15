/** Skies: banded gradient with drifting cloud texture, stars, moons and eclipses. */
import { bayer, fbm, hash } from '../pixel/noise';
import { hex, mix } from '../pixel/palette';
import type { RGB } from '../pixel/palette';
import type { Layer } from './layer';

export interface SkySpec {
  /** Top to horizon. */
  bands: string[];
  /** 0..1 how cloudy. */
  clouds: number;
  /** A coloured glow in the sky (around a rift, a sun, a city's light). */
  tint?: { x: number; y: number; r: number; col: string };
  stars?: number;
}

export function paintSky(L: Layer, s: SkySpec, horizon: number) {
  const bands = s.bands.map(hex);
  const tint = s.tint && { x: s.tint.x * L.W, y: s.tint.y * horizon, r: s.tint.r * L.W, col: hex(s.tint.col) };
  for (let y = 0; y < horizon; y++) {
    for (let x = 0; x < L.W; x++) {
      const cl = fbm(x / 46 + 11, y / 12 + 3, 4);
      const t = Math.pow(y / horizon, 1.25);
      const f = t * (bands.length - 1.2) + (cl - 0.5) * 2.8 * s.clouds + bayer(x, y) * 0.8;
      let col: RGB = bands[Math.max(0, Math.min(bands.length - 1, Math.round(f)))]!;
      if (tint) {
        const d = Math.hypot((x - tint.x) / 1.25, y - tint.y);
        if (d < tint.r) {
          const a = Math.pow(1 - d / tint.r, 1.5) * (0.35 + cl * 0.6);
          col = mix(col, tint.col, Math.round(a * 6 + bayer(x, y)) / 6);
        }
      }
      if (s.stars && t < 0.75 && hash(x, y * 3) < s.stars * (1 - t)) col = mix(col, [230, 226, 240], 0.35 + hash(y, x) * 0.6);
      L.put(x, y, col);
    }
  }
}

/** A pale moon with craters and a soft halo. */
export function paintMoon(L: Layer, cx: number, cy: number, r: number, color: string) {
  const base = hex(color);
  for (let y = -r - 3; y <= r + 3; y++) {
    for (let x = -r - 3; x <= r + 3; x++) {
      const d = Math.hypot(x, y);
      if (d > r) {
        if (d < r + 3 && bayer(x, y) + 0.5 < (r + 3 - d) / 5) L.blend(cx + x, cy + y, base, 0.25);
        continue;
      }
      const lit = 0.55 + (-x - y) / (r * 3) + (fbm(x / 4 + 5, y / 4) - 0.5) * 0.6;
      const q = Math.round(lit * 4 + bayer(x, y)) / 4;
      L.put(cx + x, cy + y, mix([20, 20, 30], base, Math.max(0.15, Math.min(1, q))), true);
    }
  }
}

/** A black disc with a burning corona. */
export function paintEclipse(L: Layer, cx: number, cy: number, r: number, corona: string) {
  const c = hex(corona);
  for (let y = -r - 6; y <= r + 6; y++) {
    for (let x = -r - 6; x <= r + 6; x++) {
      const d = Math.hypot(x, y);
      if (d <= r) L.put(cx + x, cy + y, [6, 4, 8]);
      else if (d < r + 6) {
        const a = 1 - (d - r) / 6 + (hash(Math.round(Math.atan2(y, x) * 8), 3) - 0.5) * 0.5;
        if (a > 0.75) L.put(cx + x, cy + y, mix(c, [255, 250, 220], 0.4), true);
        else if (a + bayer(x, y) * 0.5 > 0.35) L.put(cx + x, cy + y, c, true);
      }
    }
  }
}
