/**
 * Shaded set pieces painted with the figure painter: the tall structures that
 * frame each side of the screen, and props that stand on the ground.
 * Frames are designed for a 180 px tall screen and scaled to the real one.
 */
import type { Painter } from '../pixel/painter';
import { R, hex, rampOf } from '../pixel/palette';
import type { Ramp } from '../pixel/palette';

export type FrameStyle = 'wall' | 'gantry' | 'trunk' | 'cliff' | 'hull' | 'pillar' | 'column';
export type PropStyle = 'brazier' | 'lamp' | 'crystals' | 'eggs' | 'candles' | 'shrine';

/** Width of a frame in design units (180 tall). */
export const FRAME_WIDTH = 66;

/** `side` = 1 for the left edge (structure hugs x = 0), -1 for the right edge. */
export function paintFrame(p: Painter, style: FrameStyle, side: 1 | -1, accent: number) {
  const X = (x: number) => (side === 1 ? x : FRAME_WIDTH - x);
  const acc = rampOf(accent, 0.9);
  switch (style) {
    case 'wall': return wall(p, X, acc);
    case 'gantry': return gantry(p, X);
    case 'trunk': return trunk(p, X);
    case 'cliff': return cliff(p, X);
    case 'hull': return hull(p, X);
    case 'pillar': return pillar(p, X, acc);
    case 'column': return column(p, X, acc);
  }
}

function arch(x0: number, x1: number, y0: number, y1: number): [number, number][] {
  const mid = (x0 + x1) / 2, hw = (x1 - x0) / 2, sh = y0 + hw * 1.3;
  const pts: [number, number][] = [[x0, y1], [x0, sh]];
  for (let k = 1; k < 8; k++) { const a = (k / 8) * (Math.PI / 2); pts.push([x0 + hw * (1 - Math.cos(a)), sh - (sh - y0) * Math.sin(a)]); }
  pts.push([mid, y0]);
  for (let k = 7; k > 0; k--) { const a = (k / 8) * (Math.PI / 2); pts.push([x1 - hw * (1 - Math.cos(a)), sh - (sh - y0) * Math.sin(a)]); }
  pts.push([x1, sh], [x1, y1]);
  return pts;
}

/** Stained glass inside an arch, lit from behind. */
function glass(p: Painter, X: (x: number) => number, x0: number, x1: number, y0: number, y1: number) {
  const GL = [hex('#d07a2c'), hex('#e8a848'), hex('#9a2c2c'), hex('#f2c870')];
  const mid = (x0 + x1) / 2;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!p.covered(X(x), y)) continue;
      if (Math.abs(x + 0.5 - mid) < 1 || (y - y0) % 8 === 0) continue;
      const pane = (Math.floor((y - y0) / 8) + (x < mid ? 0 : 1)) % 3;
      let col = GL[pane]!;
      if ((x * 7 + y * 13) % 11 === 0) col = GL[3]!;
      p.glow(X(x), y, y > y1 - 8 ? [col[0] * 0.65, col[1] * 0.65, col[2] * 0.65] : col);
    }
  }
}

function banner(p: Painter, X: (x: number) => number, x0: number, y0: number, w: number, h: number, cloth: Ramp) {
  p.cap(X(x0 - 3), y0 - 1, X(x0 + w + 3), y0 - 1, 1.2, 1.2, R.gold);
  const pts: [number, number][] = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0 + w - 4, y0 + h + 6], [x0 + w / 2 + 1, y0 + h + 1], [x0 + w / 2 - 3, y0 + h + 8], [x0 + 4, y0 + h + 1], [x0, y0 + h + 6]];
  p.poly(pts.map(([x, y]) => [X(x), y] as [number, number]), cloth, { rim: 1, rimRamp: R.gold, normal: (x) => [Math.sin(x * 0.75) * 0.6, 0, 1], grime: 0.06 });
  const cx = X(x0 + w / 2), cy = y0 + h * 0.4;
  p.ell(cx, cy, 5.5, 5.5, R.gold);
  p.ell(cx, cy, 3.8, 3.8, cloth, { bias: -0.15 });
  for (const [dx, dy] of [[0, -3], [0, 3], [-3, 0], [3, 0], [0, 0], [-2, -2], [2, 2], [2, -2], [-2, 2]]) p.dot(cx + dx!, cy + dy!, R.gold[dx || dy ? 3 : 4]!, { noLine: true });
}

function wall(p: Painter, X: (x: number) => number, acc: Ramp) {
  p.poly([[X(0), 0], [X(50), 0], [X(50), 180], [X(0), 180]], R.iron, { bias: -0.26, grime: 0.12, seed: 3 });
  for (const y of [28, 76, 122, 154]) {
    p.poly([[X(0), y], [X(50), y], [X(50), y + 1], [X(0), y + 1]], R.iron, { bias: -0.6, noLine: true });
    for (let x = 3; x < 48; x += 6) { p.dot(X(x), y - 2, R.iron[3]!, { noLine: true }); p.dot(X(x), y + 2, R.iron[3]!, { noLine: true }); }
  }
  p.poly(arch(8, 40, 30, 72).map(([x, y]) => [X(x), y] as [number, number]), R.stone, { bias: 0.15, grime: 0.15 });
  p.poly(arch(11, 37, 34, 70).map(([x, y]) => [X(x), y] as [number, number]), R.void);
  glass(p, X, 11, 37, 34, 70);
  p.cap(X(48), 0, X(48), 180, 5, 5, R.iron, { bias: -0.05, grime: 0.12 });
  for (const y of [18, 58, 104, 146]) p.ell(X(48), y, 6.6, 2, R.iron, { flat: 0.6 });
  p.cap(X(58), 0, X(58), 120, 3, 3, R.rust, { grime: 0.18 });
  p.cap(X(58), 120, X(64), 130, 3, 3, R.rust, { grime: 0.18 });
  p.cap(X(0), 84, X(54), 84, 2.6, 2.6, R.rust, { grime: 0.2 });
  banner(p, X, 6, 90, 26, 40, acc);
  for (let y = 0; y < 26; y++) p.dot(X(38), y, R.iron[y % 3 === 0 ? 1 : 3]!, { noLine: true });
}

function gantry(p: Painter, X: (x: number) => number) {
  p.cap(X(36), 0, X(36), 180, 2.6, 2.6, R.iron, { bias: -0.15 });
  p.cap(X(58), 0, X(58), 180, 2.6, 2.6, R.iron, { bias: -0.15 });
  for (let k = 0; k < 4; k++) p.cap(X(36), 8 + k * 40, X(58), 48 + k * 40, 1.1, 1.1, R.rust, { bias: -0.1 });
  for (const y of [60, 106]) p.poly([[X(26), y], [X(66), y], [X(66), y + 4], [X(26), y + 4]], R.iron, { ny: -0.2 });
  for (let y = 64; y < 74; y++) p.dot(X(40), y, R.iron[y & 1 ? 1 : 3]!, { noLine: true });
  p.ell(X(40), 78, 3.6, 4.8, R.iron, { bias: -0.1 });
  for (let y = 75; y < 82; y++) for (let x = 38; x < 43; x++) if (x !== 40) p.glow(X(x), y, y < 78 ? '#ffd27a' : '#e88a34');
}

function trunk(p: Painter, X: (x: number) => number) {
  const bark = R.wood;
  p.poly([[X(0), 0], [X(30), 0], [X(26), 50], [X(34), 110], [X(30), 150], [X(52), 180], [X(0), 180]], bark,
    { normal: (x, y) => [Math.sin(x * 0.5 + y * 0.05) * 0.7, 0, 1], grime: 0.15 });
  for (const [x1, y1, x2, y2, r] of [[20, 140, 50, 176, 4], [10, 150, 30, 180, 3], [24, 60, 56, 30, 3.5], [56, 30, 66, 34, 2]] as const) p.cap(X(x1), y1, X(x2), y2, r, r * 0.6, bark, { grime: 0.12 });
  // Moss and glowing fungus.
  const moss = rampOf(0x3a5a2a, 0.9);
  for (const [x, y] of [[22, 40], [28, 96], [18, 130]] as const) p.ell(X(x), y, 6, 3, moss, { flat: 0.6, grime: 0.2 });
  for (const [x, y] of [[29, 104], [31, 108], [27, 112], [33, 150]] as const) { p.ell(X(x), y, 2.2, 1.2, rampOf(0x40e0c0), { flat: 0.3 }); p.glow(X(x), y, '#8affe8'); }
  // Vines.
  for (const x0 of [40, 48, 58]) for (let y = 30; y < 30 + (x0 % 7) * 9 + 30; y++) p.dot(X(x0 + Math.round(Math.sin(y * 0.2) * 1.2)), y, moss[(y >> 1) % 2 ? 1 : 2]!, { noLine: true });
}

function cliff(p: Painter, X: (x: number) => number) {
  const ice = rampOf(0x9ab8d0, 0.85);
  p.poly([[X(0), 0], [X(24), 0], [X(34), 40], [X(26), 70], [X(40), 120], [X(34), 150], [X(50), 180], [X(0), 180]], R.stone,
    { normal: (x, y) => [Math.sin(y * 0.2) * 0.6, Math.cos(x * 0.3) * 0.3, 1], grime: 0.1 });
  p.poly([[X(0), 0], [X(26), 0], [X(30), 20], [X(12), 30], [X(0), 26]], ice, { nx: -0.2, grime: 0.05 });
  for (const [x, y, h] of [[26, 70, 14], [32, 74, 9], [38, 118, 12], [30, 40, 10]] as const) p.poly([[X(x - 2), y], [X(x + 2), y], [X(x), y + h]], ice, { nx: -0.3, bias: 0.2 });
  for (let y = 0; y < 180; y += 7) if ((y * 13) % 5 === 0) p.glow(X(20 + (y % 11)), y, '#cfefff');
}

function hull(p: Painter, X: (x: number) => number) {
  p.poly([[X(0), 0], [X(40), 0], [X(46), 30], [X(36), 52], [X(48), 96], [X(40), 130], [X(52), 180], [X(0), 180]], R.iron,
    { bias: -0.2, grime: 0.15, normal: (_, y) => [0, Math.sin(y * 0.35) * 0.5, 1] });
  for (let y = 10; y < 180; y += 18) p.cap(X(0), y, X(44 + Math.sin(y) * 4), y + 3, 2.2, 1.8, R.iron, { bias: 0.05 });
  for (const [x, y] of [[20, 40], [14, 92], [24, 140]] as const) {
    p.ell(X(x), y, 4, 4, R.gold, { rim: 1, rimRamp: R.iron });
    p.ell(X(x), y, 2.4, 2.4, R.void);
  }
  p.glow(X(20), 40, '#a44ccc');
  // A severed cable that sparks.
  for (let y = 52; y < 76; y++) p.dot(X(40 + Math.sin(y * 0.3) * 2), y, R.iron[1]!);
  p.glow(X(41), 76, '#d98cf0');
}

function pillar(p: Painter, X: (x: number) => number, acc: Ramp) {
  const chitin = rampOf(0x4a3a2a, 0.9);
  p.poly([[X(0), 0], [X(34), 0], [X(28), 40], [X(38), 90], [X(30), 130], [X(44), 180], [X(0), 180]], chitin,
    { normal: (x, y) => [Math.sin(x * 0.6) * 0.5, Math.sin(y * 0.5) * 0.4, 1], grime: 0.12 });
  for (let y = 8; y < 180; y += 12) p.cap(X(2), y, X(30 + Math.sin(y * 0.1) * 4), y + 2, 1.4, 1, chitin, { bias: 0.15 });
  for (const [x, y, r] of [[34, 70, 6], [40, 80, 5], [36, 150, 7], [46, 160, 5]] as const) {
    p.ell(X(x), y, r, r * 1.2, acc, { bias: 0.15, grime: 0.08 });
    p.glow(X(x - 1), y, acc[4]!);
    p.glow(X(x), y + 1, acc[4]!);
  }
}

function column(p: Painter, X: (x: number) => number, acc: Ramp) {
  // A steel pillar of the ship's hull: fluted, with banded collars.
  p.poly([[X(0), 0], [X(28), 0], [X(28), 180], [X(0), 180]], R.iron, { bias: -0.1, grime: 0.06, normal: (x) => [Math.sin(x * 0.7) * 0.6, 0, 1] });
  p.rect(X(side(X) === 1 ? 0 : 32), 0, 32, 10, R.iron, { bevel: 2 });
  for (const y of [40, 150]) p.poly([[X(0), y], [X(34), y], [X(34), y + 6], [X(0), y + 6]], R.gold, { ny: -0.3 });
  banner(p, X, 32, 18, 22, 56, acc);
  // Candelabrum.
  p.cap(X(44), 120, X(44), 160, 1, 1, R.gold);
  p.cap(X(38), 124, X(50), 124, 0.9, 0.9, R.gold);
  for (const x of [38, 44, 50]) { p.rect(X(x), 117, 1, 6, R.bone, { noLine: true }); p.glow(X(x), 116, '#ffd27a'); }
}

const side = (X: (x: number) => number) => (X(1) > X(0) ? 1 : -1);

/** A prop standing on the ground, drawn at 1:1 with its base at (0, 0). Returns where its flame is, if it has one. */
export function paintProp(p: Painter, style: PropStyle, accent: number): [number, number] | null {
  const acc = rampOf(accent);
  switch (style) {
    case 'brazier':
      p.cap(0, -22, 0, -6, 1.4, 1.6, R.iron);
      p.cap(0, -12, -8, 0, 1.2, 1.2, R.iron, { bias: -0.1 });
      p.cap(0, -12, 8, 0, 1.2, 1.2, R.iron, { bias: -0.1 });
      p.ell(0, -23, 9, 4.4, R.iron, { rim: 1.2, rimRamp: R.gold, flat: 0.7 });
      for (let x = -7; x < 8; x++) p.glow(x, -26 + (x & 1), x % 3 ? '#ff8a2a' : '#ffd070');
      return [0, -27];
    case 'lamp':
      p.cap(0, -40, 0, 0, 1.2, 1.6, R.iron);
      p.cap(0, -40, 6, -42, 1, 1, R.iron);
      p.ell(6, -37, 3, 4, R.iron, { bias: -0.2 });
      for (let y = -39; y <= -35; y++) p.glow(6, y, '#ffd27a');
      p.glow(5, -37, '#e88a34'); p.glow(7, -37, '#e88a34');
      return null;
    case 'crystals':
      for (const [x, h, w] of [[-6, 16, 3], [0, 24, 4], [6, 12, 3], [3, 8, 2]] as const) {
        p.poly([[x - w, 0], [x - w * 0.6, -h * 0.8], [x, -h], [x + w * 0.6, -h * 0.8], [x + w, 0]], acc, { nx: -0.3, bias: 0.2 });
        p.glow(x, -h + 3, acc[4]!);
      }
      return null;
    case 'eggs':
      for (const [x, r] of [[-7, 5], [2, 6.5], [9, 4]] as const) {
        p.ell(x, -r * 1.2, r, r * 1.25, acc, { bias: 0.1, grime: 0.05 });
        p.glow(x - 1, -r * 1.2, acc[4]!);
      }
      p.ell(0, 0, 14, 2.5, rampOf(0x3a2a1a), { flat: 0.3 });
      return null;
    case 'candles':
      for (const [x, h] of [[-6, 6], [-2, 10], [2, 7], [6, 4], [9, 8]] as const) {
        p.rect(x, -h, 2, h, R.bone, { bevel: 0 });
        p.glow(x, -h - 1, '#ffd27a');
      }
      return null;
    case 'shrine':
      p.rect(-8, -14, 16, 14, R.stone, { bevel: 1, grime: 0.15 });
      p.ell(0, -20, 5, 6, R.stone, { bias: 0.1 });
      p.ell(0, -21, 2.4, 3, R.void);
      p.glow(0, -21, acc[4]!);
      for (const x of [-6, 5]) { p.rect(x, -18, 1, 4, R.bone, { noLine: true }); p.glow(x, -19, '#ffd27a'); }
      return null;
  }
}
