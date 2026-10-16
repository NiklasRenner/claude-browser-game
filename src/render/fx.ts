/**
 * Battle effects in pixel space: particle bursts, projectiles, bolts,
 * sword arcs, ground rings, and floating DOM text (damage numbers etc.).
 * Every effect runs on the stage's tweens, so `speed(0)` skips them.
 */
import { bayer } from './pixel/noise';
import { css, mix } from './pixel/palette';
import type { RGB } from './pixel/palette';
import type { Tweens } from './tween';
import { easeInOutSine } from './tween';

interface Particle { x: number; y: number; vx: number; vy: number; g: number; life: number; age: number; col: RGB; glow: boolean }
type Ctx = CanvasRenderingContext2D;
type Drawable = (ctx: Ctx, glow: Ctx) => void;

/** Effect colours used in more than one place (element and status colours are in src/game/elements.ts). */
export const FX_COLORS = {
  white: [255, 255, 255],
  shield: [120, 200, 255],
  heal: [125, 255, 138],
  energy: [122, 184, 255],
  laser: [255, 60, 50],
  gold: [255, 211, 77],
  /** Warm white (equipping). */
  cream: [255, 241, 194],
  /** A critical hit's sword arc. */
  crit: [255, 220, 140],
  /** Pale dust (hostiles condensing out of the dark). */
  dust: [216, 200, 168],
} as const satisfies Record<string, RGB>;
const WHITE = FX_COLORS.white;

/** One pixel on the scene, and (if `lit`) on the glow layer too, so it blooms. */
export function plot(ctx: Ctx, glow: Ctx, x: number, y: number, col: RGB | string, lit = true) {
  const c = typeof col === 'string' ? col : css(col);
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1);
  if (lit) { glow.fillStyle = c; glow.fillRect(x, y, 1, 1); }
}

export class Effects {
  private particles: Particle[] = [];
  private live = new Set<Drawable>();

  constructor(private overlay: HTMLElement, private tweens: Tweens, private toPage: (x: number, y: number) => [number, number]) {}

  /** Floating text at a scene point (damage numbers, MISS, ability names…). */
  popText(x: number, y: number, text: string, className: string) {
    if (this.tweens.speed === 0) return;
    const el = document.createElement('div');
    el.className = `pop ${className}`;
    el.textContent = text;
    const [px, py] = this.toPage(x, y);
    el.style.left = `${Math.round(px)}px`;
    el.style.top = `${Math.round(py)}px`;
    el.style.animationDuration = `${1.1 / this.tweens.speed}s`;
    this.overlay.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 3000);
  }

  /** Pixels flying out from a point. `gravity` is in px/s² (negative rises). */
  burst(x: number, y: number, col: RGB, count = 18, speed = 50, life = 0.5, gravity = 60) {
    if (this.tweens.speed === 0) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.2, g: gravity, life: life * (0.6 + Math.random() * 0.8), age: 0,
        col: Math.random() < 0.25 ? mix(col, WHITE, 0.6) : col, glow: true,
      });
    }
  }

  /** Grey flakes drifting up (something crumbling to ash). */
  ash(x: number, y: number, w: number, h: number) {
    if (this.tweens.speed === 0) return;
    for (let i = 0; i < 40; i++) {
      this.particles.push({ x: x + (Math.random() - 0.5) * w, y: y - Math.random() * h, vx: (Math.random() - 0.5) * 10, vy: -8 - Math.random() * 14, g: 0,
        life: 1 + Math.random(), age: 0, col: Math.random() < 0.5 ? [90, 85, 96] : [140, 133, 146], glow: false });
    }
  }

  /** A glowing orb that flies from one point to another (arcing `arc` pixels high), trailing sparks. */
  projectile(from: [number, number], to: [number, number], col: RGB, seconds = 0.35, arc = 12): Promise<void> {
    const shades = [css(mix(col, WHITE, 0.8)), css(col), css(mix(col, [0, 0, 0], 0.4))];
    return this.run(seconds, (k, ctx, glow) => {
      const x = from[0] + (to[0] - from[0]) * k, y = from[1] + (to[1] - from[1]) * k - Math.sin(k * Math.PI) * arc;
      for (let yy = -2; yy <= 2; yy++) {
        for (let xx = -2; xx <= 2; xx++) {
          const d = Math.hypot(xx, yy);
          if (d <= 2.4) plot(ctx, glow, x + xx, y + yy, shades[d < 1 ? 0 : d < 1.8 ? 1 : 2]!);
        }
      }
      if (Math.random() < 0.8) this.spark(x, y, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, col, 0.35);
    }, easeInOutSine);
  }

  /** A fast straight streak (ranged weapon fire). */
  bolt(from: [number, number], to: [number, number], col: RGB, seconds = 0.12): Promise<void> {
    const hot = css(mix(col, WHITE, 0.7)), c = css(col);
    this.burst(from[0], from[1], col, 5, 25, 0.15, 0);
    return this.run(seconds, (k, ctx, glow) => {
      const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
      const head = k * len, tail = Math.max(0, head - 14);
      for (let d = tail; d <= head; d++) {
        const x = Math.round(from[0] + (dx * d) / len), y = Math.round(from[1] + (dy * d) / len);
        ctx.fillStyle = glow.fillStyle = d > head - 4 ? hot : c;
        ctx.fillRect(x, y, 1, 1);
        glow.fillRect(x, y - 1, 1, 3);
      }
    });
  }

  /** A sword arc across a target. */
  slash(x: number, y: number, col: RGB, r = 14, seconds = 0.35): Promise<void> {
    const cols = [css(mix(col, WHITE, 0.85)), css(mix(col, WHITE, 0.4)), css(col)];
    return this.run(seconds, (k, ctx, glow) => {
      const sweep = Math.min(1, k * 2.2), fade = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
      const a0 = -2.3, a1 = a0 + 3.2 * sweep;
      for (let i = 0; i < 40; i++) {
        const tail = i / 39;
        if (tail < 1 - fade) continue;
        const a = a0 + (a1 - a0) * tail;
        for (let w = 0; w < 3; w++) {
          const px = Math.round(x + Math.cos(a) * (r - w)), py = Math.round(y + Math.sin(a) * (r - w) * 0.8);
          ctx.fillStyle = cols[Math.min(2, w + (tail < 0.4 ? 1 : 0))]!; ctx.fillRect(px, py, 1, 1);
          glow.fillStyle = cols[1]!; glow.fillRect(px, py, 1, 1);
        }
      }
    });
  }

  /** A dithered ellipse expanding on the ground (casting, buffs, level-up). */
  ring(x: number, y: number, col: RGB, radius = 22, seconds = 0.6): Promise<void> {
    const c = css(col), bright = css(mix(col, WHITE, 0.6));
    return this.run(seconds, (k, ctx, glow) => {
      const r = 4 + radius * k;
      for (let a = 0; a < Math.PI * 2; a += 1 / r) {
        const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r * 0.3);
        if (bayer(px, py) + 0.5 < k * 1.1) continue;
        ctx.fillStyle = Math.sin(a * 9) > 0.6 ? bright : c; ctx.fillRect(px, py, 1, 1);
        glow.fillStyle = c; glow.fillRect(px, py, 1, 1);
      }
    });
  }

  /**
   * A custom effect: `paint(k, ctx, glow)` every frame for `seconds`, k going 0 → 1 (eased).
   * For effects built elsewhere (ability visuals, see ability-fx.ts).
   */
  run(seconds: number, paint: (k: number, ctx: Ctx, glow: Ctx) => void, ease: (t: number) => number = (t) => t): Promise<void> {
    let k = 0;
    const draw: Drawable = (ctx, glow) => paint(k, ctx, glow);
    this.live.add(draw);
    return this.tweens.run(seconds, (t) => { k = t; if (t >= 1) this.live.delete(draw); }, ease);
  }

  /** One particle (see burst for the units). */
  spark(x: number, y: number, vx: number, vy: number, col: RGB, life = 0.4, gravity = 0) {
    if (this.tweens.speed === 0) return;
    this.particles.push({ x, y, vx, vy, g: gravity, life, age: 0, col, glow: true });
  }

  draw(ctx: Ctx, glow: Ctx, dt: number) {
    for (const d of this.live) d(ctx, glow);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += dt;
      if (p.age >= p.life) { this.particles.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.age / p.life, x = Math.round(p.x), y = Math.round(p.y);
      if (k > 0.6 && bayer(x, y) + 0.5 < (k - 0.6) / 0.4) continue;
      const c = css(p.col);
      ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1);
      if (p.glow) { glow.fillStyle = c; glow.fillRect(x, y, 1, 1); }
    }
  }
}
