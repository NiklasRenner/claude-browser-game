/**
 * Held weapons. Built inside the hand joint, whose local −Y axis points out of
 * the hand (along the forearm), so a weapon "extends" towards −Y.
 */
import type * as THREE from 'three';
import { getWeapon } from '../../core';
import { ELEMENT_COLORS } from '../../game/elements';
import { Builder, glow, metal } from './builder';

type Shape = 'pistol' | 'needler' | 'flechette' | 'rifle' | 'driver' | 'repeater' | 'cannon' | 'emitter' | 'wrench' | 'lance' | 'blade';

const SHAPES: Record<string, Shape> = {
  sonic_emitter: 'emitter', mag_wrench: 'wrench', ion_lance: 'lance', singularity_edge: 'blade',
  plasma_cannon: 'cannon', cryo_carbine: 'rifle', photon_rifle: 'rifle', stasis_projector: 'rifle', nova_rifle: 'rifle',
  corrosive_needler: 'needler', flechette_pistol: 'flechette', mass_driver: 'driver', pulse_repeater: 'repeater',
};

/** Returns a spinner to animate (rotary barrels), if the weapon has one. */
export function buildWeapon(b: Builder, hand: THREE.Group, weaponId: string): THREE.Object3D | null {
  const weapon = getWeapon(weaponId);
  const shape = SHAPES[weaponId] ?? (weapon.style === 'ranged' ? 'pistol' : 'wrench');
  const energy = ELEMENT_COLORS[weapon.element];
  const dark = metal(0x262a33);
  const steel = metal(0x9aa6b8);
  const accent = metal(0x4a5262);
  const tip = glow(energy, weapon.element === 'kinetic' ? 0.5 : 1.8);
  const cell = glow(energy, weapon.element === 'kinetic' ? 0.35 : 1.2);
  const grip = (len = 0.14) => b.box([0.1, len, 0.07], dark, [-0.06, -0.02, 0], hand).rotateZ(0.25);
  switch (shape) {
    case 'pistol':
      grip();
      b.box([0.12, 0.36, 0.08], dark, [0, -0.2, 0], hand);
      b.box([0.06, 0.26, 0.09], cell, [0.05, -0.18, 0], hand);
      b.cylinder(0.035, 0.04, 0.08, tip, [0, -0.41, 0], hand);
      return null;
    case 'needler':
      grip();
      b.box([0.11, 0.34, 0.08], accent, [0, -0.2, 0], hand);
      for (const z of [-0.055, 0.055]) b.cylinder(0.03, 0.03, 0.16, cell, [0.07, -0.14, z], hand);
      b.cylinder(0.022, 0.03, 0.14, tip, [0, -0.43, 0], hand);
      return null;
    case 'flechette':
      grip();
      b.box([0.14, 0.26, 0.12], dark, [0, -0.16, 0], hand);
      for (const [x, z] of [[0.03, 0.03], [0.03, -0.03], [-0.03, 0]] as const) {
        b.cylinder(0.022, 0.022, 0.22, steel, [x, -0.38, z], hand);
      }
      b.box([0.05, 0.12, 0.13], tip, [0.07, -0.12, 0], hand);
      return null;
    case 'rifle':
      b.box([0.12, 0.3, 0.09], dark, [-0.02, 0.18, 0], hand); // stock
      b.box([0.13, 0.62, 0.1], dark, [0, -0.2, 0], hand);
      b.box([0.06, 0.34, 0.11], cell, [0.07, -0.16, 0], hand); // energy cell
      b.cylinder(0.04, 0.04, 0.22, steel, [0.1, -0.12, 0], hand).rotateX(0); // scope body
      b.box([0.08, 0.04, 0.04], steel, [0.1, -0.02, 0], hand);
      b.cylinder(0.035, 0.045, 0.32, accent, [0, -0.66, 0], hand);
      b.cylinder(0.05, 0.05, 0.05, tip, [0, -0.84, 0], hand);
      return null;
    case 'driver':
      b.box([0.12, 0.28, 0.1], dark, [-0.02, 0.16, 0], hand);
      b.box([0.15, 0.4, 0.12], accent, [0, -0.12, 0], hand);
      for (const z of [-0.045, 0.045]) b.box([0.05, 0.9, 0.025], steel, [0, -0.72, z], hand); // rails
      for (const y of [-0.45, -0.7, -0.95]) b.box([0.06, 0.03, 0.12], tip, [0, y, 0], hand);
      return null;
    case 'repeater': {
      b.box([0.12, 0.26, 0.1], dark, [-0.02, 0.15, 0], hand);
      b.box([0.15, 0.36, 0.14], accent, [0, -0.12, 0], hand);
      const spinner = b.joint([0, -0.32, 0], hand);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.cylinder(0.025, 0.025, 0.4, steel, [Math.cos(a) * 0.045, -0.2, Math.sin(a) * 0.045], spinner);
      }
      b.cylinder(0.08, 0.08, 0.04, tip, [0, -0.38, 0], spinner);
      return spinner;
    }
    case 'cannon':
      b.box([0.14, 0.24, 0.11], dark, [-0.03, 0.12, 0], hand);
      b.cylinder(0.12, 0.14, 0.8, dark, [0, -0.32, 0], hand, 10);
      for (const y of [-0.2, -0.36, -0.52]) b.torus(0.135, 0.022, cell, [0, y, 0], hand).rotateX(Math.PI / 2);
      b.cylinder(0.1, 0.12, 0.06, tip, [0, -0.74, 0], hand, 10);
      return null;
    case 'emitter': {
      b.cylinder(0.04, 0.05, 0.42, steel, [0, -0.16, 0], hand);
      b.box([0.08, 0.14, 0.1], accent, [0.04, -0.08, 0], hand);
      const dish = b.cone(0.17, 0.12, tip, [0, -0.42, 0], hand, 12);
      dish.rotation.x = Math.PI;
      b.torus(0.12, 0.015, glow(energy, 1), [0, -0.46, 0], hand).rotateX(Math.PI / 2);
      return null;
    }
    case 'wrench':
      b.cylinder(0.03, 0.035, 0.6, steel, [0.03, -0.24, 0], hand);
      b.box([0.08, 0.14, 0.07], dark, [0.03, 0.02, 0], hand);
      b.box([0.22, 0.09, 0.08], steel, [0.03, -0.56, 0], hand);
      b.box([0.06, 0.12, 0.08], steel, [0.12, -0.64, 0], hand);
      b.box([0.05, 0.08, 0.09], tip, [-0.06, -0.62, 0], hand);
      return null;
    case 'lance':
      b.cylinder(0.03, 0.03, 1.9, dark, [0.03, -0.25, 0], hand);
      b.cylinder(0.045, 0.045, 0.12, steel, [0.03, 0.1, 0], hand);
      for (const y of [-0.95, -1.05]) b.torus(0.05, 0.012, cell, [0.03, y, 0], hand).rotateX(Math.PI / 2);
      b.cone(0.07, 0.36, tip, [0.03, -1.36, 0], hand, 4).rotation.x = Math.PI;
      return null;
    case 'blade':
      b.box([0.06, 0.18, 0.06], dark, [0, 0.02, 0], hand);
      b.box([0.16, 0.04, 0.12], steel, [0, -0.08, 0], hand); // guard
      b.box([0.035, 0.9, 0.11], tip, [0, -0.56, 0], hand);
      b.box([0.02, 0.9, 0.03], glow(0xffffff, 1.2), [0.01, -0.56, 0], hand);
      return null;
  }
}
