/**
 * Distant silhouettes standing on the horizon: gothic spires, jungle trees,
 * mining rigs, ice shards, derelict hulls, hive towers. Each rank is two flat
 * tones (lit side, shadow side) plus a few lit windows or glowing pores, so it
 * reads as far away next to the fully shaded figures.
 */
import { bayer, hash, seeded } from '../pixel/noise';
import { hex, mix } from '../pixel/palette';
import type { RGB } from '../pixel/palette';
import type { Layer } from './layer';

export type SkylineStyle = 'spires' | 'trees' | 'rigs' | 'ice' | 'wrecks' | 'hive';

export interface Rank {
  style: SkylineStyle;
  /** Lit and shadow tone. */
  tones: [string, string];
  /** Objects per 100 px of width. */
  density: number;
  /** Height range as a fraction of the horizon height. */
  height: [number, number];
  /** Window / pore light colour and chance per slot. */
  lights?: { col: string; chance: number };
  seed: number;
}

type Put = (x: number, y: number, col: RGB, em?: boolean) => void;

function spire(put: Put, x: number, w: number, top: number, base: number, A: RGB, B: RGB) {
  const apex = top - Math.round(w * 1.8), cx = x + w / 2;
  for (let y = apex; y <= base; y++) {
    let hw = y < top ? ((y - apex) / (top - apex)) * (w / 2 + 0.5) : w / 2;
    if (y >= top) hw += (y > top + (base - top) * 0.45 ? 1 : 0) + (y > top + (base - top) * 0.75 ? 1 : 0);
    for (let xx = Math.floor(cx - hw); xx < Math.ceil(cx + hw); xx++) put(xx, y, xx < cx - hw * 0.25 ? A : B);
  }
  for (let y = apex - 5; y < apex; y++) put(Math.floor(cx), y, B);
  for (let y = top - 5; y < top; y++) { put(x, y, A); put(x + w - 1, y, B); }
}

function tree(put: Put, x: number, w: number, top: number, base: number, A: RGB, B: RGB, seed: number) {
  const r = seeded(seed);
  const trunk = Math.max(2, Math.round(w * 0.22));
  let cx = x + w / 2;
  for (let y = base; y > top + w * 0.3; y--) {
    cx += (r() - 0.5) * 0.8;
    const hw = trunk / 2 + (base - y < 6 ? (6 - (base - y)) * 0.7 : 0);
    for (let xx = Math.floor(cx - hw); xx <= Math.ceil(cx + hw); xx++) put(xx, y, xx < cx ? A : B);
  }
  // Canopy: overlapping lumps.
  for (let i = 0; i < 6; i++) {
    const bx = x + r() * w, by = top + r() * w * 0.4, br = w * (0.22 + r() * 0.2);
    for (let yy = -br; yy <= br; yy++) for (let xx = -br; xx <= br; xx++) {
      if (xx * xx + yy * yy * 1.6 > br * br) continue;
      put(bx + xx, by + yy, yy < -br * 0.3 && xx < 0 ? A : B);
    }
  }
  // Hanging vines.
  for (let i = 0; i < 3; i++) {
    const vx = Math.round(x + r() * w), len = 6 + r() * w * 0.6;
    for (let k = 0; k < len; k++) put(vx + Math.round(Math.sin(k * 0.4) * 0.6), top + w * 0.35 + k, B);
  }
}

function rig(put: Put, x: number, w: number, top: number, base: number, A: RGB, B: RGB, seed: number) {
  const kind = Math.floor(hash(seed, 1) * 3);
  if (kind === 0) {
    // Flat-topped mesa.
    for (let y = top; y <= base; y++) {
      const hw = w / 2 + (y - top) * 0.45;
      for (let xx = Math.floor(x + w / 2 - hw); xx < x + w / 2 + hw; xx++) put(xx, y, xx < x + w / 2 - hw * 0.3 ? A : B);
    }
  } else if (kind === 1) {
    // Lattice derrick.
    const cx = x + w / 2;
    for (let y = top; y <= base; y++) {
      const hw = ((y - top) / (base - top)) * (w / 2) + 0.5;
      put(cx - hw, y, A); put(cx + hw, y, B);
      if ((y - top) % 5 === 0) for (let xx = Math.round(cx - hw); xx <= cx + hw; xx++) put(xx, y, B);
      if ((y - top) % 5 < 5) { const d = ((y - top) % 5) / 5; put(cx - hw + d * hw * 2, y, B); }
    }
    for (let y = top - 4; y < top; y++) put(cx, y, A);
  } else {
    // Smokestack.
    const sw = Math.max(3, Math.round(w * 0.35));
    for (let y = top; y <= base; y++) for (let xx = x; xx < x + sw; xx++) put(xx, y, xx < x + sw * 0.4 ? A : B);
  }
}

function shard(put: Put, x: number, w: number, top: number, base: number, A: RGB, B: RGB, seed: number) {
  const lean = (hash(seed, 2) - 0.5) * w * 0.6;
  for (let y = top; y <= base; y++) {
    const k = (y - top) / (base - top), cx = x + w / 2 + lean * (1 - k), hw = (w / 2) * Math.pow(k, 0.7) + 0.5;
    for (let xx = Math.floor(cx - hw); xx < Math.ceil(cx + hw); xx++) put(xx, y, xx < cx - hw * 0.1 ? A : B);
  }
}

function wreck(put: Put, x: number, w: number, top: number, A: RGB, B: RGB, seed: number) {
  // A broken hull adrift: tapered prow, ribs where it snapped.
  const len = w * 3, hgt = Math.max(4, w * 0.5), tilt = (hash(seed, 4) - 0.5) * 0.25;
  for (let i = 0; i < len; i++) {
    const k = i / len, hh = hgt * Math.min(1, k * 4) * (k > 0.8 && hash(i, seed) < 0.5 ? 0.6 : 1);
    const cy = top + i * tilt;
    for (let y = -hh / 2; y < hh / 2; y++) put(x + i, cy + y, y < -hh / 6 ? A : B);
  }
  for (let i = 0; i < 4; i++) {
    const rx = x + len + i * 2;
    for (let y = -hgt / 2; y < hgt / 2; y += 2) put(rx, top + len * tilt + y, B);
  }
  // Broken mast.
  for (let y = 0; y < hgt * 1.5; y++) put(x + len * 0.4, top + len * 0.4 * tilt - hgt / 2 - y, B);
}

function hiveTower(put: Put, x: number, w: number, top: number, base: number, A: RGB, B: RGB) {
  const cx = x + w / 2;
  for (let y = top; y <= base; y++) {
    const k = (y - top) / (base - top);
    const hw = (w / 2) * (0.3 + Math.sin(k * Math.PI * 0.9) * 0.7 + 0.15 * Math.sin(k * 30)) + 0.5;
    for (let xx = Math.floor(cx - hw); xx < Math.ceil(cx + hw); xx++) put(xx, y, xx < cx - hw * 0.2 ? A : B);
  }
}

/** Paints one rank of silhouettes along the horizon. */
export function paintRank(L: Layer, rank: Rank, horizon: number) {
  const r = seeded(rank.seed);
  const A = hex(rank.tones[0]), B = hex(rank.tones[1]);
  const lights = rank.lights && { col: hex(rank.lights.col), chance: rank.lights.chance };
  const n = Math.max(2, Math.round((L.W / 100) * rank.density));
  const mask = new Uint8Array(L.W * L.H);
  const put: Put = (x, y, col, em) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= L.W || y >= L.H) return;
    mask[y * L.W + x] = 1;
    L.put(x, y, col, em);
  };
  const painted = (x: number, y: number) => mask[y * L.W + x] === 1;
  for (let i = 0; i < n; i++) {
    const x = Math.round((i / n) * (L.W + 30) - 15 + (r() - 0.5) * (L.W / n));
    const h = Math.round(horizon * (rank.height[0] + r() * (rank.height[1] - rank.height[0])));
    const top = horizon - h;
    const seed = rank.seed * 31 + i;
    switch (rank.style) {
      case 'spires': spire(put, x, 4 + Math.floor(r() * 10), top, horizon, A, B); break;
      case 'trees': tree(put, x, 14 + Math.floor(r() * 18), top, horizon, A, B, seed); break;
      case 'rigs': rig(put, x, 8 + Math.floor(r() * 16), top, horizon, A, B, seed); break;
      case 'ice': shard(put, x, 5 + Math.floor(r() * 12), top, horizon, A, B, seed); break;
      case 'wrecks': wreck(put, x, 6 + Math.floor(r() * 8), Math.round(horizon * (0.25 + r() * 0.5)), A, B, seed); break;
      case 'hive': hiveTower(put, x, 8 + Math.floor(r() * 12), top, horizon, A, B); break;
    }
  }
  if (!lights) return;
  // Windows and pores: only where this rank painted.
  for (let y = 4; y < horizon - 2; y += 6) {
    for (let x = 1; x < L.W; x += 3) {
      const h = hash(x * 13 + rank.seed, y * 7);
      if (h > lights.chance || !painted(x, y) || !painted(x, y + 2) || !painted(x - 1, y)) continue;
      const tone = h < lights.chance * 0.35 ? mix(lights.col, [255, 240, 200], 0.4) : h < lights.chance * 0.6 ? lights.col : mix(lights.col, [20, 10, 10], 0.5);
      for (let k = 0; k < (rank.style === 'hive' ? 1 : 2); k++) L.put(x, y + k, tone, true);
    }
  }
}

/** A haze band over the bottom of the skyline, so far ranks fade into the distance. */
export function paintHaze(L: Layer, horizon: number, col: string, depth: number) {
  const c = hex(col);
  for (let y = horizon - depth; y < horizon; y++) {
    const a = (y - (horizon - depth)) / depth;
    for (let x = 0; x < L.W; x++) if (a * 0.8 + bayer(x, y) * 0.5 > 0.45) L.blend(x, y, c, 0.35 * a + 0.1);
  }
}
