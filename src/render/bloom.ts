/**
 * Bloom: everything drawn into the glow canvas is shrunk (which blurs it) in
 * three steps and added back over the scene, so glowing pixels bleed light.
 */
import { makeCanvas } from './pixel/painter';

/** How much each blur step shrinks the glow layer, and how strongly the last two are added back. */
const STEPS = [2, 4, 8];
const STRENGTH = [0, 0.55, 0.45];

export class Bloom {
  private steps = STEPS.map(() => makeCanvas(1, 1));

  resize(W: number, H: number) {
    this.steps.forEach((c, i) => { c.width = Math.ceil(W / STEPS[i]!); c.height = Math.ceil(H / STEPS[i]!); });
  }

  /** Adds the blurred `glow` canvas over `ctx` (both W × H). */
  apply(ctx: CanvasRenderingContext2D, glow: HTMLCanvasElement, W: number, H: number) {
    let src = glow;
    for (const c of this.steps) {
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = true;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(src, 0, 0, c.width, c.height);
      src = c;
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    this.steps.forEach((c, i) => {
      if (!STRENGTH[i]) return;
      ctx.globalAlpha = STRENGTH[i]!;
      ctx.drawImage(c, 0, 0, W, H);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
  }
}
