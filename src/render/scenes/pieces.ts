/**
 * Set pieces drawn from PixelLab sprite sheets (scripts/sprites.py): shrines,
 * barrels, a lantern on a chain, a distant ruin. Near ones are drawn over the
 * painted scene each frame, at their native pixel size (like the figures), and
 * animate from their sheet. Distant ones are painted into the skyline when the
 * backdrop is built, toned into the haze. Sheets load in the background; until
 * one has, its piece is skipped (the stage rebuilds the backdrop once they're in).
 */
import { makeCanvas } from '../pixel/painter';
import { hex, mix } from '../pixel/palette';
import { framesOf } from '../sprites/sheets';
import type { Layer } from './layer';
import type { Frame } from '../sprites/sheets';
import type { SheetId } from '../sprites/sheet-data';

export interface Piece {
  sheet: SheetId;
  /** Horizontal position, as a fraction of the screen width (the piece's centre). */
  x: number;
  /**
   * Where it stands: 'ground' with its base at `y` (fraction of the height; default the prop line),
   * 'hang' from a chain whose top is at `y`, or 'horizon': part of the skyline, painted after skyline
   * rank `rank`, its bottom `sink` pixels under the waterline and faded into the mist above it.
   * 'left' / 'right': the structure framing that edge of the screen (instead of the painted frame),
   * coming down from the top edge (it continues off screen) and standing on the floor; on a screen
   * shorter than the piece, it stands on the bottom edge instead.
   */
  at: 'ground' | 'horizon' | 'hang' | 'left' | 'right';
  y?: number;
  rank?: number;
  sink?: number;
  /** 'hang': hang from this point (pixels from the screen's top-left, e.g. a branch of the left edge piece) on a chain this long, instead of from the top edge. */
  from?: [number, number];
  chain?: number;
  /** Frames per second of its loop (default 6). */
  fps?: number;
  /** How much of the location's haze colour it takes on (0..1): a little for the middle distance, more far away. */
  haze?: number;
}

/** A distant piece, painted into the scene layer (first frame): hazed, and dissolving into the mist at its foot. */
export function paintDistant(L: Layer, p: Piece, horizon: number, haze: string): boolean {
  const f = framesOf(p.sheet)?.[0];
  if (!f) return false;
  const tint = hex(haze), sink = p.sink ?? 0, base = p.haze ?? 0.5;
  const x0 = Math.round(L.W * p.x - f.w / 2), y0 = horizon + sink - f.h;
  const tall = f.h - sink;
  for (let j = 0; j < f.h; j++) {
    const y = y0 + j;
    if (y >= horizon) break;
    // Fog thickens toward the water: the lower third fades out completely.
    const t = Math.min(1, Math.max(0, (j / tall - 0.62) / 0.38));
    const fade = base + (1 - base) * t * t;
    for (let i = 0; i < f.w; i++) {
      const k = j * f.w + i;
      if (f.rgba[k * 4 + 3]! < 128) continue;
      const lit = f.glow[k] === 1;
      const col = mix([f.rgba[k * 4]!, f.rgba[k * 4 + 1]!, f.rgba[k * 4 + 2]!], tint, lit ? fade * 0.5 : fade);
      if (fade > 0.97) continue;
      if (fade > 0.75) L.blend(x0 + i, y, col, (1 - fade) * 4);
      else L.put(x0 + i, y, col, lit);
    }
  }
  return true;
}

interface Baked { img: HTMLCanvasElement[]; glow: HTMLCanvasElement[]; w: number; h: number }

function bake(frames: Frame[], haze: string, amount: number): Baked {
  const tint = hex(haze);
  const img: HTMLCanvasElement[] = [], glow: HTMLCanvasElement[] = [];
  for (const f of frames) {
    const c = makeCanvas(f.w, f.h), g = makeCanvas(f.w, f.h);
    const d = new ImageData(f.w, f.h), gd = new ImageData(f.w, f.h);
    for (let i = 0; i < f.w * f.h; i++) {
      if (f.rgba[i * 4 + 3]! < 128) continue;
      const lit = f.glow[i] === 1;
      const col = mix([f.rgba[i * 4]!, f.rgba[i * 4 + 1]!, f.rgba[i * 4 + 2]!], tint, lit ? amount * 0.4 : amount);
      d.data.set([col[0], col[1], col[2], 255], i * 4);
      if (lit) gd.data.set([col[0], col[1], col[2], 255], i * 4);
    }
    c.getContext('2d')!.putImageData(d, 0, 0);
    g.getContext('2d')!.putImageData(gd, 0, 0);
    img.push(c);
    glow.push(g);
  }
  return { img, glow, w: frames[0]!.w, h: frames[0]!.h };
}

/** An edge piece drawn onto the scene canvases (once, when the backdrop is built). False if its sheet isn't in. */
export function drawEdge(ctx: CanvasRenderingContext2D, gctx: CanvasRenderingContext2D, p: Piece, W: number, H: number): boolean {
  const frames = framesOf(p.sheet);
  if (!frames) return false;
  const b = bake(frames.slice(0, 1), '#000000', 0);
  const x = p.at === 'left' ? 0 : W - b.w, y = Math.min(0, H - b.h);
  // Contact shadow where it meets the floor, then the piece.
  ctx.fillStyle = 'rgba(4,8,6,0.45)';
  ctx.fillRect(x + 2, y + b.h - 2, b.w - 4, 2);
  ctx.drawImage(b.img[0]!, x, y);
  gctx.drawImage(b.glow[0]!, x, y);
  return true;
}

export class Pieces {
  private baked = new Map<Piece, Baked>();

  constructor(private list: Piece[], private W: number, private H: number, private propY: number, private haze: string) {}

  draw(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, t: number) {
    for (const p of this.list) {
      if (p.at === 'horizon' || p.at === 'left' || p.at === 'right') continue;
      let b = this.baked.get(p);
      if (!b) {
        const frames = framesOf(p.sheet);
        if (!frames) continue;
        b = bake(frames, this.haze, p.haze ?? 0);
        this.baked.set(p, b);
      }
      const k = Math.floor(t * (p.fps ?? 6)) % b.img.length;
      const cx = Math.round(this.W * p.x);
      let x = cx - Math.floor(b.w / 2), y: number;
      if (p.at === 'hang') {
        // A slow pendulum on a chain, from a branch or from above the screen edge.
        const [ax, ay] = p.from ?? [cx, 0];
        const top = p.from ? ay + (p.chain ?? 8) : Math.round(this.H * (p.y ?? 0.2));
        const sway = Math.round(Math.sin(t * 1.1) * 1.5);
        x = ax - Math.floor(b.w / 2) + sway;
        ctx.fillStyle = '#1a1612';
        for (let yy = ay; yy < top; yy += 2) ctx.fillRect(ax + Math.round((sway * (yy - ay)) / Math.max(1, top - ay)), yy, 1, 1);
        y = top;
      } else {
        y = (p.y !== undefined ? Math.round(this.H * p.y) : this.propY) - b.h;
      }
      if (p.at === 'ground') {
        // A soft contact shadow, so it stands in the mire instead of floating on it.
        ctx.fillStyle = 'rgba(4,8,6,0.5)';
        const rx = Math.round(b.w * 0.45), base = y + b.h - 1;
        for (let dy = -1; dy <= 1; dy++) {
          const w = Math.round(rx * (dy === 0 ? 1 : 0.75));
          ctx.fillRect(cx - w, base + dy, w * 2, 1);
        }
      }
      ctx.drawImage(b.img[k]!, x, y);
      glow.drawImage(b.glow[k]!, x, y);
    }
  }
}
