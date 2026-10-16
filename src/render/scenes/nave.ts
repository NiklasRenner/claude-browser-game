/**
 * The ship's nave: the bridge-chapel of the Meridian. A hull of riveted steel
 * plates with ribbed girders rising into a pointed arch around a great
 * lancet window onto space, conduits along the base, a few indicator lights.
 * Gothic in shape, but built, not quarried.
 */
import { bayer, fbm, hash } from '../pixel/noise';
import { R, mix } from '../pixel/palette';
import type { RGB } from '../pixel/palette';
import type { Layer } from './layer';

/** Dark, slightly blue hull steel: 0 = seams … 5 = highlights. */
const HULL: RGB[] = [[8, 9, 13], [17, 19, 26], [26, 29, 39], [36, 40, 53], [50, 56, 72], [74, 82, 102]];
const BRASS = R.gold;

export function paintNave(L: Layer, horizon: number) {
  const W = L.W;
  const ww = Math.round(Math.min(W * 0.46, horizon * 1.3)), x0 = Math.round(W / 2 - ww / 2 + W * 0.06), x1 = x0 + ww;
  const top = Math.round(horizon * 0.1), sill = horizon - 22;
  const hw = ww / 2, shoulder = top + hw * 1.1;
  const inWindow = (x: number, y: number, grow = 0) => {
    if (y > sill + grow || x < x0 - grow || x > x1 + grow) return false;
    if (y >= shoulder) return true;
    // Pointed arch: two circular arcs meeting at the apex.
    const R2 = ww * 0.9 + grow;
    return Math.hypot(x - (x0 + ww * 0.9), y - shoulder) <= R2 && Math.hypot(x - (x1 - ww * 0.9), y - shoulder) <= R2 && y >= top - grow;
  };
  // Girders: one each side of the window, and two more out toward the edges.
  const ribs = [x0 - 9, x1 + 9, Math.round(W * 0.16), Math.round(W * 0.84)];
  const dado = horizon - 14;

  for (let y = 0; y < horizon; y++) {
    for (let x = 0; x < W; x++) {
      if (inWindow(x, y)) {
        // Mullions: three tall lights, and a transom low down, in dark iron.
        const lancet = Math.abs(((x - x0) / ww) * 3 - Math.round(((x - x0) / ww) * 3)) * (ww / 3) < 1;
        const transom = y === Math.round(shoulder + (sill - shoulder) * 0.8);
        if (lancet || transom) L.put(x, y, R.iron[1]!);
        // Faint reflections on the glass.
        else if (((x + y * 0.6) % 37 < 1.2 || (x + y * 0.6) % 41 < 0.6) && y < sill - 4) L.blend(x, y, [180, 200, 230], 0.12);
        continue;
      }
      let col: RGB;
      if (inWindow(x, y, 4)) {
        // The window's frame: a heavy steel band with rivets.
        const inner = inWindow(x, y, 1);
        col = inner ? HULL[5]! : HULL[3]!;
        if (!inner && (x * 7 + y * 3) % 9 === 0) col = BRASS[3]!;
      } else {
        col = plate(x, y, horizon);
        if (y >= dado) col = dadoCol(x, y, dado, horizon);
        // Conduits running along above the dado, with brass couplings.
        for (const [py, r] of [[dado - 5, 2], [dado - 10, 1]] as const) {
          const d = y - py;
          if (Math.abs(d) <= r) col = (x % 42 < 3) ? BRASS[d < 0 ? 4 : d > 0 ? 2 : 3]! : HULL[d < 0 ? 4 : d > 0 ? 1 : 3]!;
        }
        // Girders: a lit edge, a dark edge, rivets down the middle; they meet in an arch over the window.
        for (const rx of ribs) {
          const d = x - rx;
          if (Math.abs(d) <= 4) {
            col = d === -4 ? HULL[5]! : d === 4 ? HULL[0]! : d < 0 ? HULL[4]! : HULL[2]!;
            if (d === 0 && y % 7 === 3) col = BRASS[3]!;
          }
        }
        // The arch rib over the window.
        if (inWindow(x, y, 9) && !inWindow(x, y, 6)) col = inWindow(x, y, 7.5) ? HULL[4]! : HULL[1]!;
      }
      L.put(x, y, col);
    }
  }
  // Indicator lights scattered on the plates: amber and red, glowing.
  for (let i = 0; i < 14; i++) {
    const x = Math.round(hash(i, 3) * W), y = Math.round(18 + hash(i, 5) * (dado - 26));
    if (inWindow(x, y, 10) || ribs.some((r) => Math.abs(x - r) < 6)) continue;
    const c: RGB = hash(i, 9) < 0.7 ? [255, 176, 74] : [255, 70, 60];
    L.put(x, y, c, true);
    L.put(x + 1, y, mix(c, [0, 0, 0], 0.4), true);
  }
}

/** Riveted hull plates, darker toward the vault. */
function plate(x: number, y: number, horizon: number): RGB {
  const PH = 18, row = Math.floor(y / PH), PW = row % 2 ? 26 : 32;
  const off = (row * 13) % PW, px = Math.floor((x + off) / PW), fx = (x + off) % PW, fy = y % PH;
  if (fy === 0 || fx === 0) return HULL[0]!; // seam
  if (fy === 1) return HULL[4]!; // lit top edge
  if (fx === PW - 1 || fy === PH - 1) return HULL[1]!; // shadowed edges
  if ((fx === 2 || fx === PW - 3) && (fy === 3 || fy === PH - 3)) return HULL[5]!; // rivets
  const vault = y / horizon;
  const n = fbm(x / 18, y / 12, 2), tone = hash(px, row);
  const i = Math.round(1.4 + vault * 1.4 + tone * 0.8 + (n - 0.5) * 0.9 + bayer(x, y) * 0.5);
  return HULL[Math.max(1, Math.min(4, i))]!;
}

/** The dado along the base of the wall: a dark vented panel. */
function dadoCol(x: number, y: number, dado: number, horizon: number): RGB {
  if (y === dado) return HULL[5]!;
  if (y === dado + 1) return BRASS[2]!;
  if (y >= horizon - 2) return HULL[0]!;
  return x % 4 === 0 ? HULL[0]! : x % 4 === 1 ? HULL[3]! : HULL[1]!;
}
