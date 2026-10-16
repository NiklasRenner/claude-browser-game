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
type Drawable = (ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D) => void;

const WHITE: RGB = [255, 255, 255];

export class Effects {
  private particles: Particle[] = [];
  private live = new Set<Drawable>();

  constructor(private overlay: HTMLElement, private tweens: Tweens, private pixelScale: () => number) {}

  /** Floating text at a scene point (damage numbers, MISS, ability names…). */
  popText(x: number, y: number, text: string, className: string) {
    if (this.tweens.speed === 0) return;
    const el = document.createElement('div');
    el.className = `pop ${className}`;
    el.textContent = text;
    const s = this.pixelScale();
    el.style.left = `${Math.round(x * s)}px`;
    el.style.top = `${Math.round(y * s)}px`;
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
    let k = 0;
    const draw: Drawable = (ctx, glow) => {
      const x = from[0] + (to[0] - from[0]) * k, y = from[1] + (to[1] - from[1]) * k - Math.sin(k * Math.PI) * arc;
      for (let yy = -2; yy <= 2; yy++) {
        for (let xx = -2; xx <= 2; xx++) {
          const d = Math.hypot(xx, yy);
          if (d > 2.4) continue;
          const c = css(d < 1 ? mix(col, WHITE, 0.8) : d < 1.8 ? col : mix(col, [0, 0, 0], 0.4));
          ctx.fillStyle = c; ctx.fillRect(Math.round(x + xx), Math.round(y + yy), 1, 1);
          glow.fillStyle = c; glow.fillRect(Math.round(x + xx), Math.round(y + yy), 1, 1);
        }
      }
      if (Math.random() < 0.8) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, g: 0, life: 0.35, age: 0, col, glow: true });
    };
    this.live.add(draw);
    return this.tweens.run(seconds, (t) => { k = t; if (t >= 1) this.live.delete(draw); }, easeInOutSine);
  }

  /** A fast straight streak (ranged weapon fire). */
  bolt(from: [number, number], to: [number, number], col: RGB, seconds = 0.12): Promise<void> {
    let k = 0;
    const draw: Drawable = (ctx, glow) => {
      const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
      const head = k * len, tail = Math.max(0, head - 14);
      for (let d = tail; d <= head; d++) {
        const x = Math.round(from[0] + (dx * d) / len), y = Math.round(from[1] + (dy * d) / len);
        const c = css(d > head - 4 ? mix(col, WHITE, 0.7) : col);
        ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1);
        glow.fillStyle = c; glow.fillRect(x, y - 1, 1, 3);
      }
    };
    this.live.add(draw);
    this.burst(from[0], from[1], col, 5, 25, 0.15, 0);
    return this.tweens.run(seconds, (t) => { k = t; if (t >= 1) this.live.delete(draw); }, (t) => t);
  }

  /** A sword arc across a target. */
  slash(x: number, y: number, col: RGB, r = 14, seconds = 0.35): Promise<void> {
    let k = 0;
    const cols = [css(mix(col, WHITE, 0.85)), css(mix(col, WHITE, 0.4)), css(col)];
    const draw: Drawable = (ctx, glow) => {
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
    };
    this.live.add(draw);
    return this.tweens.run(seconds, (t) => { k = t; if (t >= 1) this.live.delete(draw); }, (t) => t);
  }

  /** A dithered ellipse expanding on the ground (casting, buffs, level-up). */
  ring(x: number, y: number, col: RGB, radius = 22, seconds = 0.6): Promise<void> {
    let k = 0;
    const c = css(col), bright = css(mix(col, WHITE, 0.6));
    const draw: Drawable = (ctx, glow) => {
      const r = 4 + radius * k;
      for (let a = 0; a < Math.PI * 2; a += 1 / r) {
        const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r * 0.3);
        if (bayer(px, py) + 0.5 < k * 1.1) continue;
        ctx.fillStyle = Math.sin(a * 9) > 0.6 ? bright : c; ctx.fillRect(px, py, 1, 1);
        glow.fillStyle = c; glow.fillRect(px, py, 1, 1);
      }
    };
    this.live.add(draw);
    return this.tweens.run(seconds, (t) => { k = t; if (t >= 1) this.live.delete(draw); }, (t) => t);
  }

  draw(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, dt: number) {
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

  clear() {
    this.particles = [];
    this.live.clear();
  }
}
