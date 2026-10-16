/** A full-screen pixel layer being painted, with a matching glow layer for bloom. */
import { makeCanvas } from '../pixel/painter';
import type { RGB } from '../pixel/palette';

export class Layer {
  readonly img: HTMLCanvasElement;
  readonly glow: HTMLCanvasElement;
  private data: ImageData;
  private gdata: ImageData;

  constructor(readonly W: number, readonly H: number) {
    this.img = makeCanvas(W, H);
    this.glow = makeCanvas(W, H);
    this.data = new ImageData(W, H);
    this.gdata = new ImageData(W, H);
  }

  /** Sets a pixel; `em` also lights it in the glow layer. */
  put(x: number, y: number, col: RGB, em = false) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const j = (y * this.W + x) * 4, d = this.data.data;
    d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = 255;
    if (em) {
      const g = this.gdata.data;
      g[j] = col[0]; g[j + 1] = col[1]; g[j + 2] = col[2]; g[j + 3] = 255;
    }
  }

  /** Mixes a colour into what's already there (fog, light pools). */
  blend(x: number, y: number, col: RGB, a: number) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H || a <= 0) return;
    const j = (y * this.W + x) * 4, d = this.data.data;
    if (!d[j + 3]) { d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = Math.round(a * 255); return; }
    d[j] = d[j]! + (col[0] - d[j]!) * a;
    d[j + 1] = d[j + 1]! + (col[1] - d[j + 1]!) * a;
    d[j + 2] = d[j + 2]! + (col[2] - d[j + 2]!) * a;
  }

  /** Writes the painted pixels to the canvases. Call once, then draw sprites on top with `ctx`. */
  commit() {
    this.img.getContext('2d')!.putImageData(this.data, 0, 0);
    this.glow.getContext('2d')!.putImageData(this.gdata, 0, 0);
  }

  get ctx() { return this.img.getContext('2d')!; }
  get gctx() { return this.glow.getContext('2d')!; }
}
