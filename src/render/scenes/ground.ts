/** The ground the fighters stand on, in perspective toward a vanishing point at the horizon. */
import { bayer, fbm, hash, noise } from '../pixel/noise';
import { hex, mix } from '../pixel/palette';
import type { RGB } from '../pixel/palette';
import type { Layer } from './layer';

export interface GroundSpec {
  style: 'flagstone' | 'rock' | 'snow' | 'deck' | 'resin' | 'moss';
  /** Dark to light, 5 or 6 shades. */
  shades: string[];
  /** Puddles (or ice) and what glints in them. */
  pools?: { col: string; glint: string; amount: number };
  /** Glowing seams in the cracks (lava, bioluminescence). */
  seams?: string;
  /** Colour the far ground fades into. */
  haze: string;
  /** Stone railing along the horizon. */
  railing?: boolean;
}

export function paintGround(L: Layer, g: GroundSpec, horizon: number) {
  const S = g.shades.map(hex), top = S.length - 1;
  const VX = L.W / 2, MORT: RGB = mix(S[0]!, [0, 0, 0], 0.5);
  const haze = hex(g.haze), seam = g.seams ? hex(g.seams) : null;
  const pools = g.pools && { col: hex(g.pools.col), glint: hex(g.pools.glint), amount: g.pools.amount };
  const k = 200 / L.H; // keep tile size steady across screen sizes
  for (let y = horizon; y < L.H; y++) {
    const dz = (y - horizon) * k + 5, v = 300 / dz, dv = (300 / (dz * dz)) * k;
    for (let x = 0; x < L.W; x++) {
      const row = Math.floor(v), off = (row & 1) * 0.5;
      const u = ((x - VX) * 2 * k) / dz + off, du = (2 * k) / dz;
      const tu = Math.floor(u), fu = u - tu, fv = v - row;
      const n = fbm(x / 6, y / 2.5, 2);
      let idx = 2 + Math.round((n - 0.5) * 1.8 + bayer(x, y) * 0.6);
      let col: RGB | null = null, em = false;
      switch (g.style) {
        case 'flagstone':
        case 'moss': {
          if (fu < du || fv < dv) { col = MORT; break; }
          idx = 1 + Math.floor(hash(tu, row) * 2.4) + (fv > 1 - dv * 1.2 ? 1 : 0) + Math.round((n - 0.5) * 1.8 + bayer(x, y) * 0.6);
          if (Math.abs(noise(u * 3 + 9, v * 3) - 0.5) < 0.025) idx = 0;
          if (g.style === 'moss' && fbm(x / 14 + 3, y / 5, 3) > 0.55) col = mix(S[Math.max(0, Math.min(top, idx))]!, [40, 70, 34], 0.55);
          break;
        }
        case 'deck': {
          const pu = u * 0.5, tu2 = Math.floor(pu), fu2 = pu - tu2;
          if (fu2 < du * 0.5 || fv < dv) { col = MORT; break; }
          if (row % 3 === 0 && Math.floor(fu2 * 20) % 2 === 0) { idx = 0; break; }
          idx = 2 + (fv > 1 - dv * 1.2 ? 1 : 0) + Math.round((n - 0.5) * 1.4 + bayer(x, y) * 0.5) - (hash(tu2, row) < 0.2 ? 1 : 0);
          if ((fu2 < du * 2.5 || fu2 > 1 - du * 2) && (fv < dv * 2.5 || fv > 1 - dv * 2)) idx = top;
          break;
        }
        case 'rock': {
          const c1 = Math.abs(noise(u * 1.4 + 3, v * 1.4) - 0.5), c2 = Math.abs(noise(u * 3 + 11, v * 3 + 5) - 0.5);
          idx = 1 + Math.round(n * 2.6 + bayer(x, y) * 0.6);
          if (c1 < 0.022) { col = seam && hash(Math.floor(u * 2), Math.floor(v * 2)) < 0.5 ? seam : MORT; em = col === seam; }
          else if (c2 < 0.02) idx = 0;
          break;
        }
        case 'snow': {
          const drift = fbm(x / 40 + 1, y / 6, 3);
          idx = 2 + Math.round((drift - 0.5) * 3 + (y - horizon) / (L.H - horizon) * 1.5 + bayer(x, y) * 0.7);
          if (hash(x, y) < 0.004) idx = top;
          break;
        }
        case 'resin': {
          const vein = Math.abs(fbm(x / 18 + 7, y / 5, 3) - 0.5);
          idx = 1 + Math.round(n * 2.4 + bayer(x, y) * 0.6);
          if (vein < 0.012) { col = seam && hash(x >> 2, y >> 1) < 0.4 ? seam : MORT; em = col === seam; }
          break;
        }
      }
      if (!col) col = S[Math.max(0, Math.min(top, idx))]!;
      if (pools && !em && fbm(x / 30 + 5, (y - horizon) / 6 + 2, 3) > 1 - pools.amount) {
        col = pools.col;
        if (hash(x, y) < 0.16) col = pools.glint;
        if ((y & 1) && hash(x >> 2, y) < 0.3) col = mix(pools.col, pools.glint, 0.3);
      }
      const fade = Math.max(0, 1 - (y - horizon) / 12);
      if (fade > 0 && !em) col = mix(col, haze, Math.round(fade * 3 + bayer(x, y)) / 4);
      L.put(x, y, col, em);
    }
  }
  if (g.railing) paintRailing(L, horizon, S);
}

/** A stone balustrade along the horizon (with a few broken balusters). */
function paintRailing(L: Layer, horizon: number, S: RGB[]) {
  const top = S.length - 1, y0 = horizon - 18;
  for (let x = 0; x < L.W; x++) {
    L.put(x, y0, S[top]!); L.put(x, y0 + 1, S[top - 1]!); L.put(x, y0 + 2, S[top - 2]!); L.put(x, y0 + 3, S[2]!); L.put(x, y0 + 4, S[0]!);
    for (let y = y0 + 14; y <= horizon; y++) L.put(x, y, y === y0 + 14 ? S[top - 1]! : y === y0 + 15 ? S[top - 2]! : S[1]!);
    if (hash(x, 3) < 0.08) L.put(x, y0 + 1, S[2]!);
  }
  const prof = [2, 3, 4, 4, 3, 2, 2, 3, 4];
  for (let bx = 4; bx < L.W; bx += 8) {
    if (hash(bx, 11) < 0.12) {
      for (let y = y0 + 11; y < y0 + 14; y++) for (let x = bx - 1; x <= bx + 2; x++) L.put(x, y, x <= bx ? S[3]! : S[1]!);
      continue;
    }
    prof.forEach((hw, k) => {
      const y = y0 + 5 + k;
      L.put(bx - Math.floor(hw / 2) - 1, y, S[0]!);
      for (let x = bx - Math.floor(hw / 2); x < bx + Math.ceil(hw / 2); x++) L.put(x, y, x < bx ? S[3]! : S[1]!);
      L.put(bx + Math.ceil(hw / 2), y, S[0]!);
    });
  }
}
