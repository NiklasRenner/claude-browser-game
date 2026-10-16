/**
 * Draws a location from its layers (see SceneLayer in locations.ts), back to
 * front, at a given screen width. Painted parts are painted once into their
 * own canvases (cached, so moving one thing in the editor only repaints that
 * thing); sprites and moving effects are drawn every frame.
 */
import { Painter } from '../pixel/painter';
import { makeCanvas } from '../pixel/painter';
import { bayer, fbm, hash } from '../pixel/noise';
import { R, hex, mix } from '../pixel/palette';
import type { RGB } from '../pixel/palette';
import { framesOf } from '../sprites/sheets';
import { SHEETS } from '../sprites/sheet-data';
import { Ambient } from './ambient';
import { paintGround } from './ground';
import { Layer } from './layer';
import { locationOf } from './locations';
import type { Layout, Location, SceneLayer } from './locations';
import { FEET, HORIZON, SCENE_H, shiftX } from './scale';
import { paintEclipse, paintMoon, paintSky } from './sky';
import { paintHaze, paintRank } from './skyline';
import { FRAME_WIDTH, paintFrame, paintProp } from './structures';

export interface Backdrop {
  readonly horizon: number;
  readonly feet: number;
  readonly rim: RGB;
  /** Draws every layer, back to front; `fighters` draws the figures where their layer is. */
  draw(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, t: number, dt: number, fighters: () => void): void;
}

export interface Box { x: number; y: number; w: number; h: number }

/** A painted prop's canvas: 40 × 50, standing at (20, 46). */
const PROP_W = 40, PROP_H = 50;

/** The size of a placed layer (sprite, prop, body), or null for the others. */
export function spotSize(loc: Location, l: SceneLayer): { w: number; h: number } | null {
  if (l.part === 'sprite') return { w: SHEETS[l.sheet].w, h: SHEETS[l.sheet].h };
  if (l.part === 'prop') return { w: PROP_W, h: PROP_H };
  if (l.part === 'body' && loc.body) return { w: loc.body.r * 2, h: loc.body.r * 2 };
  return null;
}

/** Where a placed layer is on a screen W wide. */
export function layerBox(loc: Location, l: SceneLayer, W: number): Box | null {
  const size = spotSize(loc, l);
  if (!size || !('x' in l)) return null;
  return { x: l.x + shiftX(l.x, size.w, l.pinned, W), y: l.y, ...size };
}

/** A short name for a layer (editor lists). */
export function layerName(loc: Location, l: SceneLayer): string {
  switch (l.part) {
    case 'sprite': return l.sheet;
    case 'prop': return `prop: ${l.style}`;
    case 'body': return loc.body?.kind ?? 'body';
    case 'skyline': return `skyline ${l.rank + 1}: ${loc.skyline[l.rank]?.style ?? '?'}`;
    case 'frame': return `frame ${l.side}: ${loc.frames[l.side === 'left' ? 0 : 1]}`;
    case 'sky-fx': return 'sky effects';
    case 'weather': return 'weather & fog';
    default: return l.part;
  }
}

/** For the scene editor: an unsaved layout. */
export interface BackdropOptions { layout?: Layout }

// Painted parts, by what they depend on; dropped when the location or width changes.
const painted = new Map<string, { img: HTMLCanvasElement; glow: HTMLCanvasElement; flame?: [number, number] }>();
let paintedFor = '';

export function buildBackdrop(key: string, W: number, H: number, opts: BackdropOptions = {}): Backdrop {
  const loc = locationOf(key, opts.layout);
  const horizon = HORIZON, feet = FEET;
  if (paintedFor !== `${key}@${W}x${H}`) { painted.clear(); paintedFor = `${key}@${W}x${H}`; }

  const paint = (l: SceneLayer) => {
    const id = JSON.stringify(l);
    let c = painted.get(id);
    if (!c) {
      c = paintPart(loc, l, W, H) ?? undefined;
      if (!c) return null;
      painted.set(id, c);
    }
    return c;
  };
  const layers = loc.layers;
  // Fires burn on the props that have them (drawn by the weather layer).
  const flames: [number, number][] = [];
  for (const l of layers) {
    const f = l.part === 'prop' ? paint(l)?.flame : undefined;
    if (f) flames.push(f);
  }
  const ambient = new Ambient(loc.ambient, W, H, horizon, flames);
  const haze = hex(loc.haze);
  return {
    horizon,
    feet,
    rim: loc.rim,
    draw(ctx, glow, t, dt, fighters) {
      const flicker = 0.8 + Math.sin(t * 5.3) * 0.08 + Math.sin(t * 13) * 0.04;
      for (const l of layers) {
        glow.globalAlpha = l.part === 'sky' || l.part === 'body' ? 1 : flicker;
        if (l.part === 'fighters') { glow.globalAlpha = 1; fighters(); continue; }
        if (l.part === 'sky-fx') { glow.globalAlpha = 1; ambient.drawSky(ctx, glow, t, dt); continue; }
        if (l.part === 'weather') { glow.globalAlpha = 1; ambient.drawFront(ctx, glow, t, dt); continue; }
        if (l.part === 'sprite') { drawSprite(ctx, glow, l, W, t, haze); continue; }
        const c = paint(l);
        if (!c) continue;
        ctx.drawImage(c.img, 0, 0);
        glow.drawImage(c.glow, 0, 0);
      }
      glow.globalAlpha = 1;
    },
  };
}

/** A painted part on a full-size canvas pair (null for parts drawn every frame, or a missing body). */
function paintPart(loc: Location, l: SceneLayer, W: number, H: number) {
  const L = new Layer(W, H);
  let flame: [number, number] | undefined;
  switch (l.part) {
    case 'sky': paintSky(L, loc.sky, HORIZON); break;
    case 'body': {
      const b = loc.body, box = layerBox(loc, l, W);
      if (!b || !box) return null;
      const cx = box.x + b.r, cy = box.y + b.r;
      if (b.kind === 'moon') paintMoon(L, cx, cy, b.r, b.col);
      else if (b.kind === 'eclipse') paintEclipse(L, cx, cy, b.r, b.col);
      else paintPlanet(L, cx, cy, b.r, hex(b.col));
      break;
    }
    case 'skyline': { const r = loc.skyline[l.rank]; if (r) paintRank(L, r, HORIZON); break; }
    case 'haze': paintHaze(L, HORIZON, loc.haze, Math.round(HORIZON * 0.25)); break;
    case 'nave': paintNave(L, HORIZON); break;
    case 'ground': paintGround(L, loc.ground, HORIZON); break;
    case 'vignette': return { img: buildVignette(W, H), glow: makeCanvas(1, 1) };
    case 'frame': case 'prop': break;
    default: return null;
  }
  L.commit();
  if (l.part === 'frame') {
    // Scaled to the screen height, hugging its edge.
    const s = H / SCENE_H, fw = Math.ceil(FRAME_WIDTH * s), side = l.side === 'left' ? 1 : -1;
    const inset = Math.max(0, fw - Math.round(W * 0.2));
    const fp = new Painter(fw, H);
    fp.begin(0, 0, s);
    paintFrame(fp, loc.frames[side === 1 ? 0 : 1], side, loc.accent);
    fp.finish({ inner: 0.5, rimDir: [side, 0], rimCol: loc.rim, rimAmt: 0.18 });
    const x = side === 1 ? -inset : W - fw + inset;
    L.ctx.drawImage(fp.canvas, x, 0);
    L.gctx.drawImage(fp.glowCanvas, x, 0);
  }
  if (l.part === 'prop') {
    const box = layerBox(loc, l, W)!;
    const pp = new Painter(PROP_W, PROP_H);
    pp.begin(20, 46, 1);
    const f = paintProp(pp, l.style, loc.accent);
    pp.finish({ inner: 0.5 });
    L.ctx.drawImage(pp.canvas, box.x, box.y);
    L.gctx.drawImage(pp.glowCanvas, box.x, box.y);
    if (f) flame = [box.x + 20 + f[0], box.y + 46 + f[1]];
  }
  return { img: L.img, glow: L.glow, flame };
}

// Sprite frames as canvases: mirrored and fogged as asked. Cached per sheet and look.
const baked = new Map<string, { img: HTMLCanvasElement[]; glow: HTMLCanvasElement[] }>();

function drawSprite(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, l: Extract<SceneLayer, { part: 'sprite' }>, W: number, t: number, haze: RGB) {
  const frames = framesOf(l.sheet);
  if (!frames) return;
  const fog = Math.max(0, Math.min(1, l.fog ?? 0));
  const key = `${l.sheet}|${l.flip ? 1 : 0}|${fog}|${haze.join(',')}`;
  let b = baked.get(key);
  if (!b) {
    b = { img: [], glow: [] };
    for (const f of frames) {
      const c = makeCanvas(f.w, f.h), g = makeCanvas(f.w, f.h);
      const d = new ImageData(f.w, f.h), gd = new ImageData(f.w, f.h);
      for (let y = 0; y < f.h; y++) {
        for (let x = 0; x < f.w; x++) {
          const i = y * f.w + (l.flip ? f.w - 1 - x : x), o = (y * f.w + x) * 4;
          if (f.rgba[i * 4 + 3]! < 128) continue;
          const lit = f.glow[i] === 1;
          const col = mix([f.rgba[i * 4]!, f.rgba[i * 4 + 1]!, f.rgba[i * 4 + 2]!], haze, lit ? fog * 0.4 : fog);
          d.data.set([col[0], col[1], col[2], 255], o);
          if (lit) gd.data.set([col[0], col[1], col[2], 255], o);
        }
      }
      c.getContext('2d')!.putImageData(d, 0, 0);
      g.getContext('2d')!.putImageData(gd, 0, 0);
      b.img.push(c);
      b.glow.push(g);
    }
    baked.set(key, b);
  }
  const k = Math.floor(t * (l.fps ?? 6)) % b.img.length;
  const x = l.x + shiftX(l.x, frames[0]!.w, l.pinned, W);
  ctx.drawImage(b.img[k]!, x, l.y);
  glow.drawImage(b.glow[k]!, x, l.y);
}

function buildVignette(W: number, H: number) {
  const L = new Layer(W, H);
  const d = new ImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2), r = Math.hypot(dx * 0.9, dy * 1.05);
      const a = Math.max(0, Math.min(1, (r - 0.62) / 0.6));
      d.data[(y * W + x) * 4 + 3] = (Math.round(a * 5 + bayer(x, y) * 0.9) / 5) * 150;
    }
  }
  L.img.getContext('2d')!.putImageData(d, 0, 0);
  return L.img;
}

/** A banded gas giant, lit from the upper left, with a thin glowing atmosphere. */
function paintPlanet(L: Layer, cx: number, cy: number, r: number, base: RGB) {
  for (let y = -r - 2; y <= r + 2; y++) {
    for (let x = -r - 2; x <= r + 2; x++) {
      const d = Math.hypot(x, y) / r;
      if (d > 1) {
        if (d < 1 + 2 / r && (x + y < 0)) L.put(cx + x, cy + y, mix(base, [200, 230, 255], 0.5), true);
        continue;
      }
      const nz = Math.sqrt(1 - d * d);
      const lit = Math.max(0, (-x * 0.6 - y * 0.6) / r + nz * 0.5);
      const band = fbm(x / (r * 0.6) + 3, (y / r) * 6, 3);
      const q = Math.round((lit * 0.9 + (band - 0.5) * 0.5) * 5 + bayer(x, y)) / 5;
      L.put(cx + x, cy + y, mix([6, 6, 12], mix(base, [230, 210, 180], band * 0.4), Math.max(0.05, Math.min(1, q))));
    }
  }
}

/** The ship's nave: ashlar wall, pilasters, and a great lancet window onto space. */
function paintNave(L: Layer, horizon: number) {
  const W = L.W, S = R.stone;
  const ww = Math.round(Math.min(W * 0.46, horizon * 1.3)), x0 = Math.round(W / 2 - ww / 2 + W * 0.06), x1 = x0 + ww;
  const top = Math.round(horizon * 0.1), sill = horizon - 20;
  const mid = (x0 + x1) / 2, hw = ww / 2, shoulder = top + hw * 1.1;
  const inWindow = (x: number, y: number, grow = 0) => {
    if (y > sill + grow || x < x0 - grow || x > x1 + grow) return false;
    if (y >= shoulder) return true;
    // Pointed arch: two circular arcs meeting at the apex.
    const R2 = ww * 0.9 + grow;
    return Math.hypot(x - (x0 + ww * 0.9), y - shoulder) <= R2 && Math.hypot(x - (x1 - ww * 0.9), y - shoulder) <= R2 && y >= top - grow;
  };
  for (let y = 0; y < horizon; y++) {
    for (let x = 0; x < W; x++) {
      if (inWindow(x, y)) {
        // Tracery: three lancets, two transoms, a rose at the top.
        const lancet = Math.abs(((x - x0) / ww) * 3 - Math.round(((x - x0) / ww) * 3)) * (ww / 3) < 1 && y > shoulder - hw * 0.2;
        const transom = (y === Math.round(shoulder + (sill - shoulder) * 0.45) || y === Math.round(shoulder + (sill - shoulder) * 0.8));
        const rose = Math.abs(Math.hypot(x - mid, y - (shoulder - hw * 0.35)) - hw * 0.3) < 0.8;
        if (lancet || transom || rose) L.put(x, y, R.iron[1]!);
        continue;
      }
      let col: RGB;
      if (inWindow(x, y, 3)) col = inWindow(x, y, 1) ? S[4]! : S[3]!;
      else {
        // Ashlar blocks with mortar, darker toward the vault.
        const row = Math.floor(y / 6), bx = Math.floor((x + (row & 1) * 5) / 10);
        const mortar = y % 6 === 0 || (x + (row & 1) * 5) % 10 === 0;
        const shadeY = y / horizon;
        let i = 1 + Math.round(hash(bx, row) * 1.6 + shadeY * 1.2 + bayer(x, y) * 0.6) - (fbm(x / 20, y / 20) > 0.6 ? 1 : 0);
        if (mortar) i = 0;
        col = S[Math.max(0, Math.min(4, i))]!;
      }
      // Pilasters at regular intervals.
      const pw = Math.max(8, Math.round(W * 0.03));
      for (const px of [W * 0.2, W * 0.8]) {
        if (Math.abs(x - px) < pw / 2 && !inWindow(x, y, 4)) col = x < px - pw / 4 ? S[4]! : x < px + pw / 4 ? S[3]! : S[1]!;
      }
      L.put(x, y, col);
    }
  }
}
