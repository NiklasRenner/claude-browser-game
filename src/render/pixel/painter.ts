/**
 * The pixel painter: draws a figure from simple shaded parts (ellipses,
 * capsules, polygons, rectangles) into a small pixel buffer, then bakes it
 * into a sprite with a dark outline, thin lines where parts overlap, a rim
 * light and an optional hit flash or dissolve.
 *
 * Each part gets a surface normal (a ball, a tube, a flat plate…) and is lit
 * from the upper left. The brightness picks a shade from the part's ramp with
 * ordered dithering at the band edges, which is what makes it read as
 * hand-shaded pixel art rather than a tiny 3D render.
 *
 * Coordinates go through a transform (origin + scale), so a figure is written
 * once in its own units, feet at (0, 0) and up being negative y, and drawn at
 * any size.
 */
import { bayer, hash } from './noise';
import type { RGB, Shades } from './palette';
import { hex } from './palette';

export interface PartOpts {
  /** Shifts the lighting: negative = in shadow (parts on the far side), positive = lit. */
  bias?: number;
  /** Dither strength at shade boundaries (default 0.6). */
  dither?: number;
  /** Chance per pixel of a darker speck: dirt, rust, wear. */
  grime?: number;
  seed?: number;
  /** <1 flattens a rounded part (armor plates); default 1. */
  flat?: number;
  /** Width in pixels of an edge band drawn with `rimRamp` (trim). */
  rim?: number;
  rimRamp?: Shades;
  /** No dark line where this part overlaps earlier parts (decals, seams). */
  noLine?: boolean;
  /** Surface normal per pixel for polygons (cloth folds); default faces the viewer, tilted by nx/ny. */
  normal?: (x: number, y: number) => readonly [number, number, number];
  nx?: number;
  ny?: number;
  /** Rectangles: bevelled edge width. */
  bevel?: number;
}

export interface FinishOpts {
  outline?: RGB | false;
  /** Strength of the line where a part overlaps an earlier one (0 = none). */
  inner?: number;
  /** Rim light on edges facing this direction (e.g. [0, -1] = lit from above). */
  rimDir?: readonly [number, number];
  rimCol?: RGB;
  rimAmt?: number;
  /** 0..1 white flash (taking a hit). */
  flash?: number;
  flashCol?: RGB;
  /** 0..1 fraction of pixels gone (crumbling to ash). */
  dissolve?: number;
}

const OUTLINE: RGB = [8, 6, 11];
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
// Light from the upper left, a little toward the viewer.
const LIGHT = (() => { const v = [-0.5, -0.72, 0.48], l = Math.hypot(...v); return v.map((a) => a / l) as [number, number, number]; })();

function shade(rp: Shades, nx: number, ny: number, nz: number, x: number, y: number, o: PartOpts): RGB {
  if (rp.length === 1) return rp[0]!;
  const l = Math.hypot(nx, ny, nz) || 1;
  const d = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / l;
  const v = Math.max(0, d) * 0.92 + 0.1 + (o.bias ?? 0);
  let f = v * (rp.length - 1) + bayer(x, y) * (o.dither ?? 0.6);
  if (o.grime && hash(x * 3 + 7, y * 5 + (o.seed ?? 0)) < o.grime) f -= 1;
  const i = Math.round(f);
  return rp[i < 0 ? 0 : i >= rp.length ? rp.length - 1 : i]!;
}

export const makeCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export class Painter {
  w = 0;
  h = 0;
  /** The finished sprite and its glowing pixels only (for bloom). */
  readonly canvas: HTMLCanvasElement;
  readonly glowCanvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private gg: CanvasRenderingContext2D;
  private c = new Uint8ClampedArray(0);
  private part = new Int32Array(0);
  private emissive = new Uint8Array(0);
  private filled = new Uint8Array(0);
  private noLine = new Uint8Array(4096);
  private k = 0;
  private ox = 0;
  private oy = 0;
  private s = 1;

  constructor(w: number, h: number) {
    this.canvas = makeCanvas(1, 1);
    this.glowCanvas = makeCanvas(1, 1);
    this.g = this.canvas.getContext('2d')!;
    this.gg = this.glowCanvas.getContext('2d')!;
    this.resize(w, h);
  }

  resize(w: number, h: number) {
    w = Math.max(1, Math.ceil(w));
    h = Math.max(1, Math.ceil(h));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.canvas.width = this.glowCanvas.width = w;
    this.canvas.height = this.glowCanvas.height = h;
    this.c = new Uint8ClampedArray(w * h * 4);
    this.part = new Int32Array(w * h);
    this.emissive = new Uint8Array(w * h);
    this.filled = new Uint8Array(w * h);
  }

  /** Clears the buffer and puts local (0, 0) at buffer pixel (ox, oy), `s` buffer pixels per unit. */
  begin(ox: number, oy: number, s = 1) {
    this.c.fill(0);
    this.part.fill(0);
    this.emissive.fill(0);
    this.noLine.fill(0, 0, Math.min(this.noLine.length, this.k + 2));
    this.k = 0;
    this.ox = ox; this.oy = oy; this.s = s;
  }

  /** Local → buffer coordinates. */
  X(x: number) { return this.ox + x * this.s; }
  Y(y: number) { return this.oy + y * this.s; }

  private nextPart(o?: PartOpts) {
    this.k++;
    if (this.k >= this.noLine.length) {
      const grown = new Uint8Array(this.noLine.length * 2);
      grown.set(this.noLine);
      this.noLine = grown;
    }
    if (o?.noLine) this.noLine[this.k] = 1;
  }

  private put(x: number, y: number, col: RGB, em = false) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x, j = i * 4;
    this.c[j] = col[0]; this.c[j + 1] = col[1]; this.c[j + 2] = col[2]; this.c[j + 3] = 255;
    this.part[i] = this.k;
    this.emissive[i] = em ? 1 : 0;
  }

  /** Is there paint at a local point (after transform)? Used to keep details on a body. */
  covered(x: number, y: number): boolean {
    const bx = Math.round(this.X(x)), by = Math.round(this.Y(y));
    if (bx < 0 || by < 0 || bx >= this.w || by >= this.h) return false;
    return this.c[(by * this.w + bx) * 4 + 3]! > 0;
  }

  /**
   * A ready-made bitmap (a sprite frame) with its top-left at local (x, y),
   * scaled by the transform with nearest-neighbour sampling. Pixels set in
   * `glow` are emissive. It is one part, so it gets the outline, rim light,
   * flash and dissolve like painted figures.
   */
  /**
   * `clip` = [cx, cy, r] in image pixels: only that disc is drawn (e.g. a fist
   * re-drawn over the weapon it holds).
   */
  image(img: { w: number; h: number; rgba: Uint8ClampedArray; glow: Uint8Array }, x: number, y: number, clip?: readonly [number, number, number]) {
    this.nextPart({ noLine: true });
    const X0 = Math.round(this.X(x)), Y0 = Math.round(this.Y(y));
    const W = Math.max(1, Math.round(img.w * this.s)), H = Math.max(1, Math.round(img.h * this.s));
    for (let j = 0; j < H; j++) {
      const sy = Math.min(img.h - 1, Math.floor(j / this.s));
      for (let i = 0; i < W; i++) {
        const sx = Math.min(img.w - 1, Math.floor(i / this.s)), k = sy * img.w + sx;
        if (img.rgba[k * 4 + 3]! < 128) continue;
        if (clip && (sx - clip[0]) ** 2 + (sy - clip[1]) ** 2 > clip[2] ** 2) continue;
        this.put(X0 + i, Y0 + j, [img.rgba[k * 4]!, img.rgba[k * 4 + 1]!, img.rgba[k * 4 + 2]!], img.glow[k] === 1);
      }
    }
  }

  /** One glowing pixel (eyes, runes, embers): unaffected by outlines and lighting, feeds the bloom. */
  glow(x: number, y: number, col: RGB | string) {
    this.nextPart({ noLine: true });
    this.put(this.X(x), this.Y(y), typeof col === 'string' ? hex(col) : col, true);
  }

  /** One solid pixel. */
  dot(x: number, y: number, col: RGB, o?: PartOpts) {
    this.nextPart(o);
    this.put(this.X(x), this.Y(y), col);
  }

  /** A one-pixel line (chains, cables, stitching). */
  line(x1: number, y1: number, x2: number, y2: number, col: RGB | ((i: number) => RGB), o?: PartOpts & { glow?: boolean }) {
    this.nextPart(o?.glow ? { noLine: true } : o);
    const ax = this.X(x1), ay = this.Y(y1), bx = this.X(x2), by = this.Y(y2);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let i = 0; i <= n; i++) {
      this.put(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, typeof col === 'function' ? col(i) : col, o?.glow);
    }
  }

  /** Ellipse, shaded as a dome (or flatter with `flat`). */
  ell(cx: number, cy: number, rx: number, ry: number, rp: Shades, o: PartOpts = {}) {
    this.nextPart(o);
    const X = this.X(cx), Y = this.Y(cy), RX = Math.max(0.5, rx * this.s), RY = Math.max(0.5, ry * this.s);
    const fl = o.flat ?? 1, rw = o.rim ?? 0;
    for (let y = Math.floor(Y - RY); y <= Math.ceil(Y + RY); y++) {
      for (let x = Math.floor(X - RX); x <= Math.ceil(X + RX); x++) {
        const dx = (x + 0.5 - X) / RX, dy = (y + 0.5 - Y) / RY, d = dx * dx + dy * dy;
        if (d > 1) continue;
        let use = rp;
        if (rw && o.rimRamp) {
          const ix = (x + 0.5 - X) / Math.max(0.5, RX - rw), iy = (y + 0.5 - Y) / Math.max(0.5, RY - rw);
          if (ix * ix + iy * iy > 1) use = o.rimRamp;
        }
        this.put(x, y, shade(use, dx * fl, dy * fl, Math.sqrt(1 - d), x, y, o));
      }
    }
  }

  /** Capsule (limbs, tubes, blades): a tapered tube between two points with round ends. */
  cap(x1: number, y1: number, x2: number, y2: number, r1: number, r2: number, rp: Shades, o: PartOpts = {}) {
    this.nextPart(o);
    const ax = this.X(x1), ay = this.Y(y1), bx = this.X(x2), by = this.Y(y2);
    const ra = Math.max(0.5, r1 * this.s), rb = Math.max(0.5, r2 * this.s);
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-6, m = Math.max(ra, rb) + 1, fl = o.flat ?? 1;
    for (let y = Math.floor(Math.min(ay, by) - m); y <= Math.ceil(Math.max(ay, by) + m); y++) {
      for (let x = Math.floor(Math.min(ax, bx) - m); x <= Math.ceil(Math.max(ax, bx) + m); x++) {
        const px = x + 0.5, py = y + 0.5;
        let t = ((px - ax) * vx + (py - ay) * vy) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const r = ra + (rb - ra) * t, ex = px - (ax + vx * t), ey = py - (ay + vy * t), d2 = ex * ex + ey * ey;
        if (d2 > r * r) continue;
        const use = o.rim && o.rimRamp && Math.sqrt(d2) > r - o.rim ? o.rimRamp : rp;
        this.put(x, y, shade(use, (ex / r) * fl, (ey / r) * fl, Math.sqrt(1 - d2 / (r * r)), x, y, o));
      }
    }
  }

  /** Filled polygon (cloth, plates, wings). Points are local [x, y] pairs. */
  poly(pts: readonly (readonly [number, number])[], rp: Shades, o: PartOpts = {}) {
    this.nextPart(o);
    const P = pts.map(([x, y]) => [this.X(x), this.Y(y)] as const);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [a, b] of P) { x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
    const inside = (px: number, py: number) => {
      let c = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [xi, yi] = P[i]!, [xj, yj] = P[j]!;
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        if (!inside(x + 0.5, y + 0.5)) continue;
        let use = rp;
        if (o.rim && o.rimRamp && (!inside(x + 1.5, y + 0.5) || !inside(x - 0.5, y + 0.5) || !inside(x + 0.5, y + 1.5) || !inside(x + 0.5, y - 0.5))) use = o.rimRamp;
        const n = o.normal ? o.normal(x, y) : [o.nx ?? 0, o.ny ?? 0, 1] as const;
        this.put(x, y, shade(use, n[0], n[1], n[2], x, y, o));
      }
    }
  }

  /** Axis-aligned box, optionally with bevelled edges. */
  rect(x: number, y: number, w: number, h: number, rp: Shades, o: PartOpts = {}) {
    this.nextPart(o);
    const X0 = Math.round(this.X(x)), Y0 = Math.round(this.Y(y));
    const W = Math.max(1, Math.round(w * this.s)), H = Math.max(1, Math.round(h * this.s)), b = o.bevel ?? 0;
    for (let j = Y0; j < Y0 + H; j++) {
      for (let i = X0; i < X0 + W; i++) {
        let nx = o.nx ?? 0, ny = o.ny ?? 0;
        if (b) {
          if (j < Y0 + b) ny = -0.9;
          else if (j >= Y0 + H - b) ny = 0.9;
          else if (i < X0 + b) nx = -0.9;
          else if (i >= X0 + W - b) nx = 0.9;
        }
        this.put(i, j, shade(rp, nx, ny, 1, i, j, o));
      }
    }
  }

  /** Bakes the buffer into `canvas` (and its glowing pixels into `glowCanvas`). */
  finish(o: FinishOpts = {}) {
    const { w, h, c, part, emissive: e, noLine: nl, filled: A } = this;
    const out = new Uint8ClampedArray(c);
    for (let i = 0; i < w * h; i++) A[i] = c[i * 4 + 3]! && !(o.dissolve && hash(i * 7 + 3, 91) < o.dissolve) ? 1 : 0;
    const ol = o.outline === false ? null : o.outline ?? OUTLINE;
    const tint = (j: number, col: RGB, t: number) => {
      out[j] = out[j]! + (col[0] - out[j]!) * t;
      out[j + 1] = out[j + 1]! + (col[1] - out[j + 1]!) * t;
      out[j + 2] = out[j + 2]! + (col[2] - out[j + 2]!) * t;
    };
    const inner = o.inner ?? 0.6;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, j = i * 4;
        if (A[i]) {
          if (e[i]) continue;
          const k = part[i]!;
          if (inner > 0 && !nl[k]) {
            for (const [dx, dy] of N4) {
              const xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
              const ii = yy * w + xx;
              if (A[ii] && !e[ii] && part[ii]! < k) { tint(j, ol ?? OUTLINE, inner); break; }
            }
          }
          if (o.rimDir && o.rimCol) {
            const xx = x + o.rimDir[0], yy = y + o.rimDir[1];
            if (xx < 0 || yy < 0 || xx >= w || yy >= h || !A[yy * w + xx]) tint(j, o.rimCol, o.rimAmt ?? 0.3);
          }
          if (o.flash) tint(j, o.flashCol ?? [255, 248, 236], o.flash);
        } else {
          out[j + 3] = 0;
          if (!ol) continue;
          for (const [dx, dy] of N4) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h || !A[yy * w + xx]) continue;
            out[j] = ol[0]; out[j + 1] = ol[1]; out[j + 2] = ol[2]; out[j + 3] = 255;
            break;
          }
        }
      }
    }
    this.g.putImageData(new ImageData(out, w, h), 0, 0);
    const em = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      if (!e[i] || !A[i]) continue;
      em[i * 4] = c[i * 4]!; em[i * 4 + 1] = c[i * 4 + 1]!; em[i * 4 + 2] = c[i * 4 + 2]!; em[i * 4 + 3] = 255;
    }
    this.gg.putImageData(new ImageData(em, w, h), 0, 0);
  }
}
