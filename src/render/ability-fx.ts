/**
 * How abilities look: a cast on the caster (charging a weapon, painting a
 * target, raising a shield...), then how their strikes travel (a fireball,
 * a beam, lightning, a lobbed grenade, a strike from orbit...). The stage
 * (stage.ts) plays them from the battle events; everything here is drawing
 * with the effects layer (fx.ts), in scene pixels.
 */
import type { Effects } from './fx';
import { bayer } from './pixel/noise';
import { css, mix } from './pixel/palette';
import type { RGB } from './pixel/palette';
import { easeInOutSine, easeOutCubic } from './tween';

type Pt = [number, number];
type Ctx = CanvasRenderingContext2D;

/** What happens on the caster when the ability is used. */
export type Cast = 'charge' | 'aim' | 'laser' | 'inject' | 'dome' | 'holo' | 'repair' | 'regen' | 'uplink';
/** How its strikes reach the target. */
export type Travel = 'heavy' | 'fireball' | 'swarm' | 'beam' | 'lightning' | 'grenade' | 'pulses' | 'orbital' | 'barrage';

export const ABILITY_LOOKS: Record<string, { cast?: Cast; travel?: Travel }> = {
  overcharge: { cast: 'charge', travel: 'heavy' },
  target_painter: { cast: 'laser' },
  combat_stim: { cast: 'inject' },
  plasma_burst: { travel: 'fireball' },
  nanite_swarm: { travel: 'swarm' },
  cryo_beam: { travel: 'beam' },
  personal_shield: { cast: 'dome' },
  deflector_field: { cast: 'dome' },
  regen_field: { cast: 'regen' },
  field_repair: { cast: 'repair' },
  holo_decoy: { cast: 'holo' },
  photon_grenade: { travel: 'grenade' },
  cryo_grenade: { travel: 'grenade' },
  ion_storm: { travel: 'lightning' },
  photon_pulse: { travel: 'pulses' },
  orbital_strike: { cast: 'uplink', travel: 'orbital' },
  exploit_weakness: { cast: 'aim', travel: 'heavy' },
  overload: { cast: 'charge', travel: 'heavy' },
  suppressive_fire: { travel: 'barrage' },
};

const WHITE: RGB = [255, 255, 255];
const SHIELD: RGB = [120, 200, 255];
const HEAL: RGB = [125, 255, 138];
const LASER: RGB = [255, 60, 50];

function dot(ctx: Ctx, glow: Ctx, x: number, y: number, col: RGB, lit = true) {
  const c = css(col);
  ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  if (lit) { glow.fillStyle = c; glow.fillRect(Math.round(x), Math.round(y), 1, 1); }
}

function line(ctx: Ctx, glow: Ctx, a: Pt, b: Pt, col: RGB, width = 1, from = 0, to = 1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.max(1, Math.hypot(dx, dy));
  for (let d = len * from; d <= len * to; d++) {
    const x = a[0] + (dx * d) / len, y = a[1] + (dy * d) / len;
    for (let w = 0; w < width; w++) dot(ctx, glow, x, y + w - Math.floor(width / 2), w === Math.floor(width / 2) ? mix(col, WHITE, 0.6) : col);
  }
}

// ─── Casts ─────────────────────────────────────────────────────────────────

/**
 * The cast on the caster. `at`: the caster's body centre; `hand`: where the weapon is (muzzle or fist);
 * `target`: the current target's centre; `height`: the caster's height in pixels.
 */
export function playCast(fx: Effects, cast: Cast, col: RGB, at: Pt, hand: Pt, target: Pt, height: number): Promise<void> {
  switch (cast) {
    case 'charge': {
      // Energy gathering into the weapon, then a flare.
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 10, life = 0.35;
        fx.spark(hand[0] + Math.cos(a) * r, hand[1] + Math.sin(a) * r, (-Math.cos(a) * r) / life, (-Math.sin(a) * r) / life, mix(col, WHITE, Math.random() * 0.6), life);
      }
      return fx.run(0.4, (k, ctx, glow) => {
        const r = Math.round(1 + k * 3);
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r && bayer(x, y) < k + 0.3) dot(ctx, glow, hand[0] + x, hand[1] + y, x || y ? col : WHITE);
      });
    }
    case 'aim': {
      // A small reticle closing in on the target.
      return fx.run(0.35, (k, ctx, glow) => reticle(ctx, glow, target, 14 - 8 * k, [255, 210, 120], k * 1.5));
    }
    case 'laser': {
      // A flickering red line from the weapon to the target, then the mark locks on.
      return fx.run(0.5, (k, ctx, glow) => {
        if (Math.sin(k * 60) > -0.3) line(ctx, glow, hand, target, LASER, 1, 0, Math.min(1, k * 3));
        if (k > 0.35) reticle(ctx, glow, target, 12 - 6 * (k - 0.35) / 0.65, LASER, k * 2);
      });
    }
    case 'inject': {
      // A stim to the chest: a green flash and crosses rising.
      for (let i = 0; i < 6; i++) crossRise(fx, at[0] + (Math.random() - 0.5) * 18, at[1] + Math.random() * 10, i * 0.06);
      return fx.run(0.45, (k, ctx, glow) => {
        const r = 3 + k * 8;
        for (let a = 0; a < Math.PI * 2; a += 0.4) if (bayer(Math.round(a * 10), 0) + 0.3 > k) dot(ctx, glow, at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r, HEAL);
      });
    }
    case 'regen': {
      // A field of rising motes around the caster.
      for (let i = 0; i < 40; i++) {
        fx.spark(at[0] + (Math.random() - 0.5) * 30, at[1] + height * 0.45 - Math.random() * 6, (Math.random() - 0.5) * 4, -20 - Math.random() * 30, mix(HEAL, WHITE, Math.random() * 0.5), 0.6 + Math.random() * 0.5);
      }
      return fx.ring(at[0], at[1] + height * 0.5, HEAL, 24, 0.6);
    }
    case 'repair': {
      // Welding sparks over the suit.
      return fx.run(0.6, (k) => {
        if (Math.random() < 0.6) {
          const x = at[0] + (Math.random() - 0.5) * 14, y = at[1] + (Math.random() - 0.5) * height * 0.5;
          for (let i = 0; i < 4; i++) fx.spark(x, y, (Math.random() - 0.5) * 60, -Math.random() * 40, Math.random() < 0.5 ? [255, 210, 120] : WHITE, 0.25, 120);
        }
        void k;
      });
    }
    case 'dome': {
      // A hex-patterned dome rising around the caster (it stays while the shield holds: see drawShield).
      return fx.run(0.5, (k, ctx, glow) => dome(ctx, glow, at, height, k, SHIELD));
    }
    case 'holo': {
      // Scanlines sweeping over the caster, then the decoy splits off (see the stage's afterimage).
      return fx.run(0.45, (k, ctx, glow) => {
        const top = at[1] - height / 2, y = top + height * k;
        for (let x = -12; x <= 12; x++) if ((x + Math.round(y)) % 2 === 0) dot(ctx, glow, at[0] + x, y, [140, 240, 255]);
      });
    }
    case 'uplink': {
      // Calling the ship: a beacon flashing on the target, a thin guide line from above.
      return fx.run(0.6, (k, ctx, glow) => {
        reticle(ctx, glow, target, 10, [255, 200, 90], k * 3);
        if (Math.sin(k * 40) > 0) line(ctx, glow, [target[0], 0], target, [255, 220, 150], 1, 0, k);
      });
    }
  }
}

/** Corner brackets around a point (a target lock); `spin` turns them a little. */
export function reticle(ctx: Ctx, glow: Ctx, at: Pt, r: number, col: RGB, spin = 0) {
  const R = Math.round(r);
  for (let i = 0; i < 4; i++) {
    const a = spin * 0.5 + (i * Math.PI) / 2 + Math.PI / 4;
    const cx = at[0] + Math.cos(a) * R, cy = at[1] + Math.sin(a) * R;
    const sx = Math.cos(a) > 0 ? -1 : 1, sy = Math.sin(a) > 0 ? -1 : 1;
    for (let d = 0; d < 3; d++) { dot(ctx, glow, cx + sx * d, cy, col); dot(ctx, glow, cx, cy + sy * d, col); }
  }
  dot(ctx, glow, at[0], at[1], col);
}

/** The shield dome around an actor: `k` 0 → 1 rises; above 1 it holds and shimmers (t in seconds). */
export function dome(ctx: Ctx, glow: Ctx, at: Pt, height: number, k: number, col: RGB, t = 0) {
  const rx = height * 0.32, ry = height * 0.58, cy = at[1] + height * 0.12;
  const rise = Math.min(1, k);
  for (let a = -Math.PI; a <= 0; a += 1 / ry) {
    const y = cy + Math.sin(a) * ry, x = at[0] + Math.cos(a) * rx;
    if ((cy - y) / ry > rise) continue;
    const shimmer = Math.sin(a * 12 + t * 4) > 0.3;
    if (k >= 1 && !shimmer && bayer(Math.round(x), Math.round(y)) > 0.25) continue;
    dot(ctx, glow, x, y, shimmer ? mix(col, WHITE, 0.5) : col);
  }
  // A faint hex lattice inside, while it rises and in slow pulses.
  if (k < 1 || Math.sin(t * 2) > 0.6) {
    for (let y = -ry + 3; y < -2; y += 5) for (let x = -rx; x <= rx; x += 6) {
      const px = at[0] + x + ((Math.round(y / 5) & 1) ? 3 : 0), py = cy + y;
      if ((px - at[0]) ** 2 / rx ** 2 + (py - cy) ** 2 / ry ** 2 < 0.8 && (cy - py) / ry <= rise) dot(ctx, glow, px, py, col, false);
    }
  }
}

function crossRise(fx: Effects, x: number, y: number, delay: number) {
  void fx.run(0.6 + delay, (k, ctx, glow) => {
    const t = Math.max(0, k * (0.6 + delay) - delay) / 0.6;
    if (t <= 0) return;
    const yy = y - t * 22;
    if (t > 0.7 && bayer(Math.round(x), Math.round(yy)) + 0.5 < (t - 0.7) / 0.3) return;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) dot(ctx, glow, x + dx, yy + dy, dx || dy ? HEAL : WHITE);
  });
}

// ─── Travel ────────────────────────────────────────────────────────────────

/**
 * A strike travelling from `from` to `to` (the impact point). `first`: the first strike of this cast
 * (an AoE strikes once per target; a grenade is thrown only once). Resolves on impact.
 */
export async function playTravel(fx: Effects, travel: Travel, col: RGB, from: Pt, to: Pt, first: boolean, group: Pt): Promise<void> {
  switch (travel) {
    case 'heavy': {
      await fx.run(0.14, (k, ctx, glow) => line(ctx, glow, from, to, col, 3, Math.max(0, k - 0.35), k));
      fx.burst(to[0], to[1], mix(col, WHITE, 0.4), 26, 70, 0.4);
      return;
    }
    case 'fireball': {
      await fx.run(0.38, (k, ctx, glow) => {
        const x = from[0] + (to[0] - from[0]) * k, y = from[1] + (to[1] - from[1]) * k - Math.sin(k * Math.PI) * 8;
        for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) {
          const d = Math.hypot(xx, yy);
          if (d <= 3.2) dot(ctx, glow, x + xx, y + yy, d < 1.2 ? WHITE : d < 2.2 ? mix(col, WHITE, 0.4) : col);
        }
        for (let i = 0; i < 3; i++) fx.spark(x - 2, y + (Math.random() - 0.5) * 4, -20 - Math.random() * 30, (Math.random() - 0.5) * 20 - 10, mix(col, [255, 240, 160], Math.random()), 0.35);
      }, easeInOutSine);
      fx.burst(to[0], to[1], col, 36, 80, 0.5, 30);
      return;
    }
    case 'swarm': {
      const motes = Array.from({ length: 22 }, () => ({ ph: Math.random() * 6, r: 2 + Math.random() * 5, lag: Math.random() * 0.3 }));
      await fx.run(0.6, (k, ctx, glow) => {
        for (const m of motes) {
          const t = Math.max(0, Math.min(1, (k - m.lag) / (1 - m.lag)));
          const x = from[0] + (to[0] - from[0]) * t + Math.cos(m.ph + k * 14) * m.r, y = from[1] + (to[1] - from[1]) * t + Math.sin(m.ph * 1.3 + k * 11) * m.r;
          dot(ctx, glow, x, y, Math.random() < 0.2 ? mix(col, WHITE, 0.5) : col);
        }
      });
      for (let i = 0; i < 20; i++) fx.spark(to[0] + (Math.random() - 0.5) * 16, to[1] + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10, 15, col, 0.6);
      return;
    }
    case 'beam': {
      await fx.run(0.4, (k, ctx, glow) => {
        const reach = Math.min(1, k * 4), fade = k > 0.75 ? (k - 0.75) / 0.25 : 0;
        line(ctx, glow, from, to, col, fade > 0.5 ? 1 : 3, 0, reach);
        if (reach >= 1 && Math.random() < 0.7) fx.spark(to[0], to[1] + (Math.random() - 0.5) * 8, -10 - Math.random() * 30, (Math.random() - 0.5) * 30, mix(col, WHITE, 0.5), 0.4);
      });
      return;
    }
    case 'lightning': {
      // A jagged bolt from above the caster's side of the sky to each target.
      const sky: Pt = [to[0] - 10 + Math.random() * 20, 8];
      await fx.run(0.32, (k, ctx, glow) => {
        let [x, y] = sky;
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          const nx = i === steps ? to[0] : sky[0] + (to[0] - sky[0]) * (i / steps) + (Math.random() - 0.5) * 10;
          const ny = sky[1] + (to[1] - sky[1]) * (i / steps);
          if (Math.sin(k * 50) > -0.5) line(ctx, glow, [x, y], [nx, ny], i % 3 ? col : WHITE);
          x = nx; y = ny;
        }
      });
      fx.burst(to[0], to[1], col, 22, 70, 0.35);
      return;
    }
    case 'grenade': {
      if (first) {
        await fx.projectile(from, group, [150, 150, 160], 0.45, 30);
        fx.burst(group[0], group[1], mix(col, WHITE, 0.3), 60, 110, 0.6, 40);
        void fx.ring(group[0], group[1] + 16, col, 40, 0.5);
      }
      fx.burst(to[0], to[1], col, 14, 50, 0.4);
      return;
    }
    case 'pulses': {
      // One searing pulse per strike (the ability strikes three times).
      await fx.run(0.12, (k, ctx, glow) => {
        const x = from[0] + (to[0] - from[0]) * k, y = from[1] + (to[1] - from[1]) * k;
        line(ctx, glow, [x - 6, y], [x, y], mix(col, WHITE, 0.3), 3);
      });
      fx.burst(to[0], to[1], mix(col, WHITE, 0.3), 14, 55, 0.3);
      return;
    }
    case 'orbital': {
      // A column of light slams down from the top of the screen.
      await fx.run(0.5, (k, ctx, glow) => {
        const w = k < 0.3 ? 1 : Math.round(2 + (1 - k) * 8);
        const bottom = to[1] + 14;
        for (let y = 0; y < bottom * Math.min(1, k * 4); y++) {
          for (let x = -w; x <= w; x++) {
            const edge = Math.abs(x) >= w - 1;
            if (edge && bayer(x, y) > 0.6) continue;
            dot(ctx, glow, to[0] + x, y, edge ? col : mix(col, WHITE, 0.7));
          }
        }
      }, easeOutCubic);
      fx.burst(to[0], to[1] + 10, mix(col, WHITE, 0.3), 60, 120, 0.7, 60);
      void fx.ring(to[0], to[1] + 14, col, 34, 0.6);
      return;
    }
    case 'barrage': {
      for (let i = 0; i < 5; i++) {
        void fx.bolt(from, [to[0] + (Math.random() - 0.5) * 8, to[1] + (Math.random() - 0.5) * 12], col, 0.09);
        await fx.run(0.04, () => {});
      }
      fx.burst(to[0], to[1], col, 16, 50, 0.3);
      return;
    }
  }
}
