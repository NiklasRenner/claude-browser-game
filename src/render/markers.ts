/**
 * What the stage draws on and around the figures, every frame: their shadows,
 * the target ring and arrow, and lasting ability effects (a shield dome, a
 * target mark, the holo-decoy's afterimage).
 */
import { center, head } from './actor';
import type { Actor } from './actor';
import { dome, reticle } from './ability-fx';
import { FX_COLORS } from './fx';
import { bayer } from './pixel/noise';
import { makeCanvas } from './pixel/painter';

type Ctx = CanvasRenderingContext2D;

/** A dithered oval on the ground under a figure (fainter under hovering ones). */
export function drawShadow(ctx: Ctx, a: Actor) {
  const f = a.figure, rx = Math.round(((f.left + f.right) / 2) * f.scale * 0.55), ry = 2;
  const cx = Math.round(a.x + a.ox), cy = a.y + 1;
  ctx.fillStyle = `rgba(0,0,0,${f.hover ? 0.35 : 0.55})`;
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d <= 1 && (d < 0.6 || bayer(x, y) < 0.1)) ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
}

const TARGET_LIGHT = '#fff2c8', TARGET = '#e2b25e', TARGET_EDGE = '#08060a';

/** A dashed, turning ring on the ground under the current target. */
export function drawTargetRing(ctx: Ctx, glow: Ctx, a: Actor, t: number) {
  const rx = Math.round(((a.figure.left + a.figure.right) / 2) * a.figure.scale * 0.7);
  for (let k = 0; k < Math.PI * 2; k += 1 / rx) {
    if (Math.sin(k * 6 + t * 3) < -0.3) continue;
    const px = Math.round(a.x + a.ox + Math.cos(k) * rx), py = Math.round(a.y + 1 + Math.sin(k) * 3);
    ctx.fillStyle = TARGET_LIGHT; ctx.fillRect(px, py, 1, 1);
    glow.fillStyle = TARGET; glow.fillRect(px, py, 1, 1);
  }
}

/** A bobbing arrow over the current target's head. */
export function drawTargetArrow(ctx: Ctx, glow: Ctx, a: Actor, t: number) {
  const top = Math.round(head(a, 10)[1]) + Math.round(Math.sin(t * 4) * 1.5);
  const mx = Math.round(a.x + a.ox);
  for (let r = 0; r < 5; r++) {
    for (let x = -4 + r; x <= 4 - r; x++) {
      const edge = Math.abs(x) === 4 - r || r === 0;
      ctx.fillStyle = edge ? TARGET_EDGE : r === 1 ? TARGET_LIGHT : TARGET;
      ctx.fillRect(mx + x, top + r, 1, 1);
    }
  }
  glow.fillStyle = TARGET;
  glow.fillRect(mx - 2, top + 1, 5, 2);
}

/** Lasting ability effects on a figure: a shield dome while shielded, a target mark while marked. */
export function drawLasting(ctx: Ctx, glow: Ctx, a: Actor, t: number) {
  if (a.dissolve > 0.5 || a.fall) return;
  const height = a.figure.height * a.figure.scale;
  if (a.statuses.has('shield')) dome(ctx, glow, center(a), height, 2, FX_COLORS.shield, t);
  if (a.statuses.has('marked')) reticle(ctx, glow, center(a), 9 + Math.sin(t * 3), FX_COLORS.laser, t);
}

let holoCanvas: HTMLCanvasElement | null = null;

/** Holo-decoy: a cyan, scanlined copy of the sprite at (x, y), flickering a step behind the figure. */
export function drawHoloDecoy(ctx: Ctx, glow: Ctx, a: Actor, x: number, y: number, t: number) {
  const src = a.painter.canvas, holo = (holoCanvas ??= makeCanvas(1, 1));
  if (holo.width !== src.width || holo.height !== src.height) { holo.width = src.width; holo.height = src.height; }
  const g = holo.getContext('2d')!;
  g.clearRect(0, 0, holo.width, holo.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#6ee8ff';
  g.fillRect(0, 0, holo.width, holo.height);
  g.globalCompositeOperation = 'destination-out';
  for (let row = Math.floor(t * 20) % 3; row < holo.height; row += 3) g.fillRect(0, row, holo.width, 1);
  g.globalCompositeOperation = 'source-over';
  const hx = x - 10 * a.facing + Math.round(Math.sin(t * 2) * 2);
  ctx.globalAlpha = 0.45 + Math.sin(t * 9) * 0.1;
  ctx.drawImage(holo, hx, y);
  ctx.globalAlpha = 1;
  glow.globalAlpha = 0.35;
  glow.drawImage(holo, hx, y);
  glow.globalAlpha = 1;
}
