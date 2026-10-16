/**
 * Assembles a location into a backdrop for a given screen size: a sky layer,
 * a scene layer (skyline, ground, framing structures, props) and the moving
 * parts in between and in front. Built once per location and size.
 */
import { Painter } from '../pixel/painter';
import { bayer, fbm, hash } from '../pixel/noise';
import { R, hex, mix } from '../pixel/palette';
import type { RGB } from '../pixel/palette';
import { Ambient } from './ambient';
import { paintGround } from './ground';
import { Layer } from './layer';
import { locationOf } from './locations';
import { Pieces, drawEdge, paintDistant } from './pieces';
import { paintEclipse, paintMoon, paintSky } from './sky';
import { paintHaze, paintRank } from './skyline';
import { FRAME_WIDTH, paintFrame, paintProp } from './structures';

export interface Backdrop {
  readonly horizon: number;
  readonly rim: RGB;
  /** Sky, sky effects, skyline, ground and set pieces. */
  drawBack(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, t: number, dt: number): void;
  /** Fire, fog and weather in front of the figures, then the vignette. */
  drawFront(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, t: number, dt: number): void;
}

/** Where the horizon sits, as a fraction of the screen height. */
const HORIZON = 0.56;

/** `lift` raises the horizon (fraction of the height) for tall screens. */
export function buildBackdrop(key: string, W: number, H: number, lift = 0): Backdrop {
  const loc = locationOf(key);
  const horizon = Math.round(H * (HORIZON - lift));

  const sky = new Layer(W, H);
  paintSky(sky, loc.sky, horizon);
  const b = loc.body;
  if (b?.kind === 'moon') paintMoon(sky, Math.round(W * b.x), Math.round(horizon * b.y), b.r, b.col);
  if (b?.kind === 'eclipse') paintEclipse(sky, Math.round(W * b.x), Math.round(horizon * b.y), b.r, b.col);
  if (b?.kind === 'planet') paintPlanet(sky, Math.round(W * b.x), Math.round(horizon * b.y), Math.round(W * b.r), hex(b.col));
  sky.commit();

  const scene = new Layer(W, H);
  const distant = (loc.pieces ?? []).filter((p) => p.at === 'horizon');
  loc.skyline.forEach((rank, i) => {
    paintRank(scene, rank, horizon);
    for (const p of distant) if ((p.rank ?? loc.skyline.length - 1) === i) paintDistant(scene, p, horizon, loc.haze);
  });
  if (loc.skyline.length) paintHaze(scene, horizon, loc.haze, Math.round(horizon * 0.25));
  if (loc.interior) paintNave(scene, horizon);
  paintGround(scene, loc.ground, horizon);
  scene.commit();

  // Framing structures, scaled to the screen height and pushed outward on narrow screens.
  const s = H / 180, fw = Math.ceil(FRAME_WIDTH * s), inset = Math.max(0, fw - Math.round(W * 0.2));
  const fp = new Painter(fw, H);
  for (const side of [1, -1] as const) {
    // A generated structure for this edge, if the location has one (and its sheet is in).
    const edge = loc.pieces?.find((p) => p.at === (side === 1 ? 'left' : 'right'));
    if (edge && drawEdge(scene.ctx, scene.gctx, edge, W, H)) continue;
    fp.begin(0, 0, s);
    paintFrame(fp, loc.frames[side === 1 ? 0 : 1], side, loc.accent);
    fp.finish({ inner: 0.5, rimDir: [side, 0], rimCol: loc.rim, rimAmt: 0.18 });
    const x = side === 1 ? -inset : W - fw + inset;
    scene.ctx.drawImage(fp.canvas, x, 0);
    scene.gctx.drawImage(fp.glowCanvas, x, 0);
  }
  // Props on the ground near the edges; remember where fires burn.
  const flames: [number, number][] = [];
  const pp = new Painter(40, 50);
  const propY = Math.round(horizon + (H - horizon) * 0.42);
  for (const prop of loc.props) {
    pp.begin(20, 46, 1);
    const flame = paintProp(pp, prop.style, loc.accent);
    pp.finish({ inner: 0.5 });
    const px = Math.round(W * prop.x);
    scene.ctx.drawImage(pp.canvas, px - 20, propY - 46);
    scene.gctx.drawImage(pp.glowCanvas, px - 20, propY - 46);
    if (flame) flames.push([px + flame[0], propY + flame[1]]);
  }

  const pieces = new Pieces(loc.pieces ?? [], W, H, propY, loc.haze);
  const ambient = new Ambient(loc.ambient, W, H, horizon, flames);
  const vignette = buildVignette(W, H);
  return {
    horizon,
    rim: loc.rim,
    drawBack(ctx, glow, t, dt) {
      ctx.drawImage(sky.img, 0, 0);
      glow.drawImage(sky.glow, 0, 0);
      ambient.drawSky(ctx, glow, t, dt);
      ctx.drawImage(scene.img, 0, 0);
      glow.globalAlpha = 0.8 + Math.sin(t * 5.3) * 0.08 + Math.sin(t * 13) * 0.04;
      glow.drawImage(scene.glow, 0, 0);
      pieces.draw(ctx, glow, t);
      glow.globalAlpha = 1;
    },
    drawFront(ctx, glow, t, dt) {
      ambient.drawFront(ctx, glow, t, dt);
      ctx.drawImage(vignette, 0, 0);
    },
  };
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
