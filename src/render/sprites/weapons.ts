/**
 * Held weapons, drawn in the officer's hand. Each is laid out along the aim
 * direction (`at(u, v)`: u forward from the grip, v to the side), so the same
 * drawing works for any angle of a swing or recoil.
 */
import { getWeapon } from '../../core';
import { ELEMENT_COLORS } from '../../game/elements';
import type { Painter } from '../pixel/painter';
import { R, glowOf } from '../pixel/palette';
import type { RGB } from '../pixel/palette';
import { along } from './figure';

export type WeaponShape = 'pistol' | 'needler' | 'flechette' | 'rifle' | 'driver' | 'repeater' | 'cannon' | 'emitter' | 'wrench' | 'lance' | 'blade';

const SHAPES: Record<string, WeaponShape> = {
  sonic_emitter: 'emitter', mag_wrench: 'wrench', ion_lance: 'lance', singularity_edge: 'blade',
  plasma_cannon: 'cannon', cryo_carbine: 'rifle', photon_rifle: 'rifle', stasis_projector: 'rifle', nova_rifle: 'rifle',
  corrosive_needler: 'needler', flechette_pistol: 'flechette', mass_driver: 'driver', pulse_repeater: 'repeater',
};

export function weaponShape(weaponId: string): WeaponShape {
  return SHAPES[weaponId] ?? (getWeapon(weaponId).style === 'ranged' ? 'pistol' : 'wrench');
}

/** Melee weapons are swung; everything else is aimed. */
export const isMelee = (shape: WeaponShape) => shape === 'wrench' || shape === 'lance' || shape === 'blade';

/** How the hand holds it at rest: aim angle (radians, 0 = forward, negative = up). */
export function restAngle(shape: WeaponShape): number {
  return shape === 'lance' ? -0.55 : isMelee(shape) ? -1.05 : 0;
}

/** Glow colour for a weapon's energy parts; kinetic weapons get a dim amber pilot light instead. */
function energy(weaponId: string): RGB {
  const el = getWeapon(weaponId).element;
  return el === 'kinetic' ? [214, 140, 60] : glowOf(ELEMENT_COLORS[el]);
}

/**
 * Draws the weapon with its grip at (hx, hy), aimed at `angle`. `t` drives
 * shimmer and spin; `charge` (0..1) brightens it while attacking. `size` stretches
 * it (lengths only) for bigger figures.
 */
export function drawWeapon(p: Painter, weaponId: string, hx: number, hy: number, angle: number, t: number, charge: number, size = 1) {
  const shape = weaponShape(weaponId);
  const base = along(hx, hy, angle);
  const at = (u: number, v = 0) => base(u * size, v * size);
  const glow = energy(weaponId);
  const hot = charge > 0.2;
  const grip = () => p.cap(...at(0, 0), ...at(-1, 3), 1.1, 1, R.leather);
  switch (shape) {
    case 'pistol':
      grip();
      p.cap(...at(-1, -1), ...at(7, -1), 1.6, 1.4, R.iron);
      p.dot(...at(2, -2), R.gold[3], { noLine: true });
      p.glow(...at(8, -1), glow);
      return;
    case 'needler':
      grip();
      p.cap(...at(-1, -1), ...at(7, -1), 1.5, 1.3, R.iron);
      p.line(...at(1, -3), ...at(9, -3), glow, { glow: true });
      p.glow(...at(9, -1), glow);
      return;
    case 'flechette':
      grip();
      p.cap(...at(-1, -1), ...at(5, -1), 2.3, 2.1, R.iron);
      for (const v of [-2, 0]) p.line(...at(6, v - 0.5), ...at(10, v - 0.5), R.steel[3]);
      p.dot(...at(1, -2), glow, { noLine: true });
      return;
    case 'rifle':
      p.cap(...at(-8, 1), ...at(-1, -1), 1.6, 1.5, R.wood);
      grip();
      p.cap(...at(-1, -1), ...at(12, -1), 1.8, 1.6, R.iron);
      p.cap(...at(12, -1), ...at(17, -1), 0.9, 0.8, R.steel);
      for (let u = 2; u <= 8; u += 2) p.glow(...at(u, -3), glow);
      p.glow(...at(18, -1), glow);
      return;
    case 'driver':
      p.cap(...at(-7, 1), ...at(17, -1), 2.3, 2.0, R.iron, { grime: 0.08 });
      grip();
      p.line(...at(5, -3.5), ...at(20, -3.5), R.steel[3]);
      p.line(...at(5, 1.5), ...at(20, 1.5), R.steel[2]);
      for (let u = 6; u <= 16; u += 3) p.dot(...at(u, -1), R.gold[3], { noLine: true });
      return;
    case 'repeater': {
      p.ell(...at(1, 3), 2.6, 2.6, R.gold);
      p.cap(...at(-5, 0), ...at(10, -1), 2.5, 2.3, R.iron);
      grip();
      p.cap(...at(10, -1), ...at(16, -1), 1.7, 1.6, R.steel, { flat: 0.6 });
      const spin = Math.floor(t * (hot ? 30 : 3)) % 3;
      for (let k = 0; k < 3; k++) p.line(...at(11, -2 + ((k + spin) % 3) * 1.2), ...at(16, -2 + ((k + spin) % 3) * 1.2), R.steel[1], { noLine: true });
      p.glow(...at(17, -1), glow);
      return;
    }
    case 'cannon':
      p.cap(...at(-9, -2), ...at(14, -2), 3.3, 3.0, R.iron, { grime: 0.08 });
      for (const u of [-4, 4, 11]) p.cap(...at(u, -5.2), ...at(u, 1.2), 0.8, 0.8, R.gold, { noLine: true });
      grip();
      p.ell(...at(15, -2), 1.6, 2.6, R.iron, { bias: -0.3 });
      p.glow(...at(15, -2), glow);
      p.glow(...at(15, -3), hot ? [255, 255, 255] : glow);
      return;
    case 'emitter':
      grip();
      p.cap(...at(-1, -1), ...at(6, -1), 1.4, 1.4, R.gold);
      p.poly([at(6, -2.5), at(11, -5), at(11, 3), at(6, 0.5)], R.gold, { nx: 0.3 });
      for (const u of [8, 10]) p.glow(...at(u, -1 + Math.sin(t * 6 + u)), glow);
      return;
    case 'wrench':
      p.cap(...at(-3, 0), ...at(13, 0), 1.1, 1.1, R.iron);
      p.cap(...at(-3, 0), ...at(1, 0), 1.3, 1.3, R.leather);
      p.poly([at(12, -3.5), at(17, -4), at(18, -1.5), at(15, -1), at(15, 1), at(18, 1.5), at(17, 4), at(12, 3.5)], R.iron, { nx: -0.2, grime: 0.1 });
      p.glow(...at(13, 0), glow);
      return;
    case 'lance':
      p.cap(...at(-14, 0), ...at(22, 0), 0.9, 0.9, R.wood);
      for (const u of [-2, 2, 20]) p.cap(...at(u, -1.2), ...at(u, 1.2), 0.7, 0.7, R.gold, { noLine: true });
      p.poly([at(22, -2.2), at(31, 0), at(22, 2.2)], R.steel, { nx: 0.2 });
      for (let u = 24; u <= 29; u += 2) p.glow(...at(u, Math.round(Math.sin(t * 20 + u))), glow);
      return;
    case 'blade': {
      const pulse = Math.sin(t * 3) > 0;
      p.cap(...at(-3, 0), ...at(2, 0), 1.1, 1.1, R.leather);
      p.ell(...at(-4.6, 0), 1.7, 1.7, R.gold);
      p.cap(...at(2, -4.6), ...at(2, 4.6), 1.2, 1.2, R.gold);
      p.cap(...at(3, 0), ...at(32, 0), 1.9, 0.6, R.steel, { flat: 0.45 });
      for (let u = 7; u <= 28; u += hot ? 1 : 4) p.glow(...at(u, 0), hot || pulse ? [255, 255, 255] : glow);
      return;
    }
  }
}
