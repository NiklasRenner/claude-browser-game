/**
 * Set pieces drawn from PixelLab sprite sheets (scripts/sprites.py): shrines,
 * barrels, a lantern on a chain, a distant ruin, the structures framing the
 * screen edges. They keep their native pixel size; where a piece on the ground
 * stands follows from its size and its real height (see depth.ts), so its
 * scale always matches the fighters', and it's hazed the farther it is. Far
 * ones are painted into the skyline when the backdrop is built; the rest are
 * drawn in list order, some behind the fighters and the rest in front (the
 * layout's `behind`). Sheets load in the
 * background; until one has, its piece is skipped (the stage rebuilds the
 * backdrop once they're in).
 */
import { makeCanvas } from '../pixel/painter';
import { hex, mix } from '../pixel/palette';
import { framesOf } from '../sprites/sheets';
import type { Frame } from '../sprites/sheets';
import type { SheetId } from '../sprites/sheet-data';
import { depthOf, groundY, sceneX } from './depth';
import type { Layer } from './layer';

export interface Piece {
  sheet: SheetId;
  /** Horizontal position of the piece's centre, as a fraction of the narrowest scene (see sceneX). */
  x: number;
  /**
   * 'ground': stands on the floor, at the depth its size gives (needs `height`).
   * 'far': part of the skyline, painted after skyline rank `rank`, at the depth its size gives (needs
   * `height`), hazed and dissolving into the mist at its foot.
   * 'hang': on a chain from `from` (pixels from the screen's top-left, e.g. a branch of the left edge
   * piece), `chain` pixels long.
   * 'left' / 'right': the structure framing that edge (instead of the painted frame), coming down from
   * the top of the screen and standing on the floor.
   */
  at: 'ground' | 'far' | 'hang' | 'left' | 'right';
  /** Real height in metres of what the sprite shows (its whole bounding box). */
  height?: number;
  rank?: number;
  from?: [number, number];
  chain?: number;
  /** Mirror it. */
  flip?: boolean;
  /** Frames per second of its loop (default 6). */
  fps?: number;
}

/** A piece's depth: from its sprite's height and its real height (1 = the fighters' line). */
const depthOfPiece = (p: Piece, f: { h: number }) => (p.height ? depthOf(f.h, p.height) : 1);

/** Where a piece's sprite (w × h) goes in a W × H scene: its top-left corner, and its depth. Hanging ones at rest. */
export function placePiece(p: Piece, f: { w: number; h: number }, W: number, H: number, horizon: number, feet: number) {
  const depth = depthOfPiece(p, f);
  let x: number, y: number;
  if (p.at === 'left' || p.at === 'right') {
    x = p.at === 'left' ? 0 : W - f.w;
    y = Math.min(0, H - f.h);
  } else if (p.at === 'hang') {
    const [ax, ay] = p.from ?? [sceneX(W, p.x), 0];
    x = ax - Math.floor(f.w / 2);
    y = ay + (p.chain ?? 8);
  } else {
    x = sceneX(W, p.x) - Math.floor(f.w / 2);
    y = groundY(depth, horizon, feet) - f.h;
  }
  return { x, y, w: f.w, h: f.h, depth };
}

/** Haze for something at this depth: none on the fighters' line and nearer, more the farther it is. */
const hazeAt = (depth: number) => Math.min(0.6, Math.max(0, (1 - depth) * 0.75));

/** A far piece, painted into the scene layer (first frame): hazed, and dissolving into the mist at its foot. */
export function paintFar(L: Layer, p: Piece, horizon: number, feet: number, haze: string): boolean {
  const f = framesOf(p.sheet)?.[0];
  if (!f) return false;
  const { x: x0, y: y0, depth } = placePiece(p, f, L.W, L.H, horizon, feet);
  const tint = hex(haze), base = hazeAt(depth);
  for (let j = 0; j < f.h; j++) {
    const y = y0 + j;
    // Fog thickens toward the water: the lower third fades out completely.
    const t = Math.min(1, Math.max(0, (j / f.h - 0.62) / 0.38));
    const fade = base + (1 - base) * t * t;
    if (fade > 0.97) continue;
    for (let i = 0; i < f.w; i++) {
      const k = j * f.w + (p.flip ? f.w - 1 - i : i);
      if (f.rgba[k * 4 + 3]! < 128) continue;
      const lit = f.glow[k] === 1;
      const col = mix([f.rgba[k * 4]!, f.rgba[k * 4 + 1]!, f.rgba[k * 4 + 2]!], tint, lit ? fade * 0.5 : fade);
      if (fade > 0.75) L.blend(x0 + i, y, col, (1 - fade) * 4);
      else L.put(x0 + i, y, col, lit);
    }
  }
  return true;
}

interface Baked { img: HTMLCanvasElement[]; glow: HTMLCanvasElement[]; w: number; h: number; depth: number }

function bake(p: Piece, frames: Frame[], haze: string): Baked {
  const depth = depthOfPiece(p, frames[0]!);
  const tint = hex(haze), amount = p.at === 'ground' ? hazeAt(depth) : 0;
  const img: HTMLCanvasElement[] = [], glow: HTMLCanvasElement[] = [];
  for (const f of frames) {
    const c = makeCanvas(f.w, f.h), g = makeCanvas(f.w, f.h);
    const d = new ImageData(f.w, f.h), gd = new ImageData(f.w, f.h);
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const i = y * f.w + (p.flip ? f.w - 1 - x : x), o = (y * f.w + x) * 4;
        if (f.rgba[i * 4 + 3]! < 128) continue;
        const lit = f.glow[i] === 1;
        const col = mix([f.rgba[i * 4]!, f.rgba[i * 4 + 1]!, f.rgba[i * 4 + 2]!], tint, lit ? amount * 0.4 : amount);
        d.data.set([col[0], col[1], col[2], 255], o);
        if (lit) gd.data.set([col[0], col[1], col[2], 255], o);
      }
    }
    c.getContext('2d')!.putImageData(d, 0, 0);
    g.getContext('2d')!.putImageData(gd, 0, 0);
    img.push(c);
    glow.push(g);
  }
  return { img, glow, w: frames[0]!.w, h: frames[0]!.h, depth };
}

/**
 * The pieces that aren't painted into the skyline, drawn every frame in list order (back to front):
 * the first `behind` of the location's pieces go behind the fighters, the rest in front of them.
 */
export class Pieces {
  private baked = new Map<Piece, Baked>();

  constructor(private list: Piece[], private behind: number, private W: number, private H: number, private horizon: number, private feet: number, private haze: string) {}

  /** The pieces behind the fighters (`front` false) or in front of them (`front` true). */
  draw(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, t: number, front: boolean) {
    this.list.forEach((p, i) => {
      if (p.at === 'far' || (i >= this.behind) !== front) return;
      let b = this.baked.get(p);
      if (!b) {
        const frames = framesOf(p.sheet);
        if (!frames) return;
        b = bake(p, p.at === 'left' || p.at === 'right' ? frames.slice(0, 1) : frames, this.haze);
        this.baked.set(p, b);
      }
      const k = Math.floor(t * (p.fps ?? 6)) % b.img.length;
      let { x, y } = placePiece(p, b, this.W, this.H, this.horizon, this.feet);
      if (p.at === 'hang') {
        // A slow pendulum on a chain.
        const [ax, ay] = p.from ?? [x + Math.floor(b.w / 2), 0];
        const sway = Math.round(Math.sin(t * 1.1) * 1.5);
        x += sway;
        ctx.fillStyle = '#1a1612';
        for (let yy = ay; yy < y; yy += 2) ctx.fillRect(ax + Math.round((sway * (yy - ay)) / Math.max(1, y - ay)), yy, 1, 1);
      } else if (p.at === 'ground') {
        // A soft contact shadow, so it stands in the mire instead of floating on it.
        ctx.fillStyle = 'rgba(4,8,6,0.5)';
        const cx = x + Math.floor(b.w / 2);
        const rx = Math.round(b.w * 0.45), base = y + b.h - 1;
        for (let dy = -1; dy <= 1; dy++) {
          const w = Math.round(rx * (dy === 0 ? 1 : 0.75));
          ctx.fillRect(cx - w, base + dy, w * 2, 1);
        }
      } else {
        // An edge structure: a contact shadow where it meets the floor.
        ctx.fillStyle = 'rgba(4,8,6,0.45)';
        ctx.fillRect(x + 2, y + b.h - 2, b.w - 4, 2);
      }
      ctx.drawImage(b.img[k]!, x, y);
      glow.drawImage(b.glow[k]!, x, y);
    });
  }
}
