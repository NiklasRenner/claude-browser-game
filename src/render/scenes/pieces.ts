/**
 * Set pieces drawn from PixelLab sprite sheets (scripts/sprites.py), on top of
 * the painted scene: shrines, barrels, a distant ruin, a lantern on a chain.
 * They keep their native pixel size (like the figures) and animate from their
 * sheet. Sheets load in the background; until one has, its piece is skipped.
 */
import { makeCanvas } from '../pixel/painter';
import { hex, mix } from '../pixel/palette';
import { framesOf } from '../sprites/sheets';
import type { Frame } from '../sprites/sheets';
import type { SheetId } from '../sprites/sheet-data';

export interface Piece {
  sheet: SheetId;
  /** Horizontal position, as a fraction of the screen width (the piece's centre). */
  x: number;
  /**
   * Where it stands: 'ground' on the prop line (in front, near the edges), 'horizon' on the far shore
   * (faded into the haze by `haze`), 'hang' from a chain whose top is at `y` (fraction of the height).
   */
  at: 'ground' | 'horizon' | 'hang';
  y?: number;
  /** Frames per second of its loop (default 6). */
  fps?: number;
  /** How much of the location's haze colour it takes on (0..1), for distant pieces. */
  haze?: number;
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

export class Pieces {
  private baked = new Map<Piece, Baked>();

  constructor(private list: Piece[], private W: number, private H: number, private horizon: number, private propY: number, private haze: string) {}

  draw(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, t: number) {
    for (const p of this.list) {
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
        // A slow pendulum on a chain from above the screen edge.
        const top = Math.round(this.H * (p.y ?? 0.2));
        const sway = Math.round(Math.sin(t * 1.1) * 1.5);
        x += sway;
        ctx.fillStyle = '#1a1612';
        for (let yy = 0; yy < top; yy += 2) ctx.fillRect(cx + Math.round((sway * yy) / Math.max(1, top)), yy, 1, 1);
        y = top;
      } else {
        y = (p.at === 'horizon' ? this.horizon + 4 : this.propY) - b.h;
      }
      ctx.drawImage(b.img[k]!, x, y);
      glow.drawImage(b.glow[k]!, x, y);
    }
  }
}
