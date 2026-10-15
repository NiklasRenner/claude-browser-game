/** Paints a figure into a painter sized to fit it. */
import type { FinishOpts, Painter } from '../pixel/painter';
import type { Figure, Pose } from './figure';

const MARGIN = 3;

/** Returns where the figure's feet are inside the painter's canvas. */
export function paintFigure(p: Painter, f: Figure, pose: Pose, finish: FinishOpts = {}): { ax: number; ay: number } {
  const s = f.scale;
  p.resize((f.left + f.right) * s + MARGIN * 2, f.height * s + MARGIN * 2);
  const ax = Math.round(f.left * s + MARGIN), ay = Math.round(f.height * s + MARGIN);
  p.begin(ax, ay, s);
  f.draw(p, pose);
  p.finish(finish);
  return { ax, ay };
}
