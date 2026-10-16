/** Paints a figure into a painter sized to fit it. */
import type { FinishOpts, Painter } from '../pixel/painter';
import type { Figure, Pose } from './figure';

const MARGIN = 3;

/** Returns where the figure's feet are inside the painter's canvas. */
export function paintFigure(p: Painter, f: Figure, pose: Pose, finish: FinishOpts = {}): { ax: number; ay: number } {
  const s = f.scale;
  const pad = MARGIN + (f.reach ?? 0) * s;
  p.resize((f.left + f.right) * s + pad * 2, f.height * s + pad * 2);
  const ax = Math.round(f.left * s + pad), ay = Math.round(f.height * s + pad);
  p.begin(ax, ay, s);
  f.draw(p, pose);
  p.finish(finish);
  return { ax, ay };
}
