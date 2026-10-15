/**
 * The player's officer: a jointed figure in a division-coloured duty uniform.
 * Armor tiers add a vest, then pauldrons and pads, then a helmet; each
 * division carries its own kit. Idles with breathing, blinking and glances.
 */
import * as THREE from 'three';
import { DIVISIONS, getArmor, getWeapon } from '../../core';
import type { DivisionId } from '../../core';
import { Builder, glow, material, metal, shade } from './builder';
import type { Figure } from './builder';
import { buildWeapon } from './weapons';

/** Per-division look: skin, hair and the kit they carry. */
const LOOKS: Record<DivisionId, { skin: number; hair: number; hairStyle: 'buzz' | 'part' | 'messy' }> = {
  security: { skin: 0xc68a62, hair: 0x1d1612, hairStyle: 'buzz' },
  science: { skin: 0xf0c9a0, hair: 0x5a3a22, hairStyle: 'part' },
  engineer: { skin: 0x8e5f42, hair: 0xb4532a, hairStyle: 'messy' },
};

/** Armor plate colour per suit. */
const ARMOR_TINT: Record<string, number> = {
  field_jacket: 0x6b5a46, composite_vest: 0x59616e, thermal_envirosuit: 0xc8692e,
  arctic_hardsuit: 0xdfe6ee, aegis_power_armor: 0x8f97a6,
};

const TWO_HANDED = new Set(['photon_rifle', 'cryo_carbine', 'stasis_projector', 'nova_rifle', 'plasma_cannon', 'mass_driver', 'pulse_repeater']);

export function buildHero(divisionId: DivisionId, weaponId: string, armorId: string): Figure {
  const b = new Builder();
  const look = LOOKS[divisionId];
  const armor = getArmor(armorId);
  const weapon = getWeapon(weaponId);
  const division = material(DIVISIONS[divisionId].color, { roughness: 0.6 });
  const suit = material(0x2b3039, { roughness: 0.8 });
  const piping = material(0xc9d2de);
  const boots = material(0x121419, { roughness: 0.5 });
  const glove = material(0x2c2f36);
  const skin = material(look.skin, { roughness: 0.65 });
  const plate = metal(ARMOR_TINT[armorId] ?? 0x7a8494, { roughness: 0.4 });
  const plateDark = metal(shade(ARMOR_TINT[armorId] ?? 0x7a8494, 0.6));
  const tier = armor.block >= 12 ? 4 : armor.block >= 9 ? 3 : armor.block >= 7 ? 2 : armor.block >= 4 ? 1 : 0;

  // ── Legs ──
  const hips = b.joint([0, 0.95, 0]);
  const legs = [0.12, -0.12].map((z) => {
    const hip = b.joint([0, 0, z], hips);
    const knee = b.limb(hip, 0.43, 0.105, suit, 0.092);
    b.box([0.02, 0.36, 0.025], division, [0, -0.2, 0.1 * Math.sign(z)], hip); // seam stripe
    const ankle = b.limb(knee, 0.4, 0.088, suit, 0.075);
    b.box([0.3, 0.13, 0.15], boots, [0.06, -0.05, 0], ankle);
    b.box([0.12, 0.16, 0.16], boots, [-0.02, 0.06, 0], ankle); // boot cuff
    if (tier >= 2) b.box([0.08, 0.14, 0.14], plate, [0.08, 0.02, 0], knee); // knee pad
    return { hip, knee };
  });

  // ── Torso ──
  const spine = b.joint([0, 1.0, 0]);
  const chest = b.joint([0, 0, 0], spine);
  b.cylinder(0.25, 0.2, 0.5, suit, [0, 0.26, 0], chest, 8).scale.set(0.7, 1, 1);
  b.cylinder(0.27, 0.25, 0.17, division, [0, 0.45, 0], chest, 8).scale.set(0.74, 1, 1); // division yoke
  b.box([0.02, 0.32, 0.03], piping, [0.17, 0.25, 0.07], chest); // front piping
  b.box([0.22, 0.07, 0.42], material(0x15171c), [0, 0.0, 0], spine); // belt
  b.box([0.03, 0.06, 0.07], metal(0xd8c48a), [0.12, 0.0, 0], spine); // buckle
  // Ship emblem: a small hexagonal badge over the heart.
  b.cylinder(0.045, 0.045, 0.02, glow(0xdfe8f5, 0.5), [0.185, 0.38, 0.1], chest, 6).rotation.z = Math.PI / 2;
  b.ball(0.012, glow(DIVISIONS[divisionId].color, 1.5), [0.197, 0.38, 0.1], chest, 6);
  b.cylinder(0.075, 0.08, 0.1, skin, [0, 0.58, 0], chest, 7); // neck
  b.cylinder(0.1, 0.09, 0.06, division, [0, 0.55, 0], chest, 8); // collar

  if (tier >= 1) {
    const vest = tier >= 4 ? plate : plateDark;
    b.box([0.08, 0.34, 0.36], vest, [0.16, 0.27, 0], chest); // chest plate
    b.box([0.08, 0.32, 0.34], vest, [-0.16, 0.27, 0], chest); // back plate
    if (tier < 3) for (const z of [-0.1, 0.02]) b.box([0.06, 0.08, 0.09], material(0x3a3e46), [0.21, 0.13, z], chest); // pouches
  }
  if (tier >= 4) {
    // Powered armor: bulkier torso, backpack with glowing vents.
    b.box([0.14, 0.2, 0.46], plate, [0.15, 0.36, 0], chest);
    b.box([0.2, 0.42, 0.34], plateDark, [-0.24, 0.3, 0], chest);
    for (const z of [-0.09, 0.09]) b.cylinder(0.04, 0.05, 0.08, glow(0x5fd6ff, 2), [-0.3, 0.06, z], chest);
  }

  // ── Head ──
  const neck = b.joint([0, 0.62, 0], chest);
  const head = b.joint([0, 0.0, 0], neck);
  b.ball(0.16, skin, [0.01, 0.14, 0], head, 12).scale.set(0.95, 1.1, 0.9);
  b.ball(0.05, skin, [0.0, 0.12, 0.15], head, 6); // ears
  b.ball(0.05, skin, [0.0, 0.12, -0.15], head, 6);
  b.cone(0.03, 0.07, skin, [0.165, 0.12, 0], head, 4).rotation.z = -Math.PI / 2; // nose
  b.box([0.01, 0.015, 0.07], material(0x6b3a2e), [0.155, 0.05, 0], head); // mouth
  const eyes = new THREE.Group();
  head.add(eyes);
  for (const z of [0.055, -0.055]) {
    b.ball(0.026, material(0xf4f4f0), [0.135, 0.165, z], eyes, 6);
    b.ball(0.015, material(0x1a1410), [0.155, 0.165, z], eyes, 6);
    b.box([0.02, 0.014, 0.06], material(look.hair), [0.15, 0.205, z], head); // brows
  }
  const hair = material(look.hair, { roughness: 0.9 });
  const hairGroup = b.joint([0, 0, 0], head);
  if (look.hairStyle === 'buzz') {
    b.ball(0.162, hair, [-0.005, 0.18, 0], hairGroup, 10).scale.set(0.95, 0.85, 0.92);
  } else if (look.hairStyle === 'part') {
    b.ball(0.168, hair, [-0.02, 0.19, 0], hairGroup, 10).scale.set(0.98, 0.88, 0.95);
    b.box([0.1, 0.06, 0.2], hair, [0.09, 0.27, 0.03], hairGroup).rotation.x = 0.25; // swept fringe
  } else {
    b.ball(0.17, hair, [-0.02, 0.2, 0], hairGroup, 8).scale.set(1, 0.85, 0.96);
    for (const [x, z] of [[0.08, 0.08], [0.04, -0.09], [-0.06, 0.1], [-0.08, -0.06], [0.1, -0.01]] as const) {
      b.cone(0.05, 0.1, hair, [x, 0.33, z], hairGroup, 4).rotation.set(z * 3, 0, -x * 4);
    }
  }

  // Division kit.
  if (divisionId === 'security') {
    b.box([0.12, 0.16, 0.06], material(0x15171c), [0.02, -0.08, 0.23], spine); // holster
    b.box([0.04, 0.07, 0.04], glow(0xff4d4d, 1.2), [0.05, 0.47, -0.2], chest); // shoulder radio light
  } else if (divisionId === 'science') {
    b.box([0.02, 0.05, 0.09], glow(0x5fe8ff, 2), [0.17, 0.17, 0.08], head); // visor eyepiece
    b.box([0.17, 0.02, 0.02], metal(0x9aa6b8), [0.07, 0.2, 0.15], head);
    b.box([0.1, 0.14, 0.05], metal(0x3a4454), [0.05, -0.06, -0.23], spine); // scanner on the belt
    b.box([0.06, 0.04, 0.052], glow(0x5fe8ff, 1.2), [0.08, -0.02, -0.23], spine);
  } else {
    for (const z of [0.06, -0.06]) b.cylinder(0.045, 0.045, 0.05, glow(0xffa53b, 0.8), [0.1, 0.29, z], head, 8).rotation.z = Math.PI / 2;
    b.box([0.1, 0.03, 0.3], material(0x3a3026), [0.04, 0.29, 0], head); // goggle strap
    b.box([0.18, 0.36, 0.3], material(0x5a4a3a), [-0.22, 0.28, 0], chest); // tool pack
    b.cylinder(0.01, 0.01, 0.4, metal(0x9aa6b8), [-0.28, 0.6, -0.1], chest);
    b.ball(0.025, glow(0xffa53b, 2), [-0.28, 0.8, -0.1], chest, 6);
    for (const z of [-0.16, 0.0, 0.16]) b.box([0.1, 0.11, 0.09], material(0x6a553e), [0.1, -0.06, z], spine);
  }
  if (tier >= 3) {
    // Helmet with a glowing visor.
    b.ball(0.19, plate, [0.0, 0.17, 0], head, 10).scale.set(1, 1.05, 0.96);
    b.box([0.04, 0.07, 0.24], glow(tier >= 4 ? 0xffc040 : 0x5fe8ff, 1.6), [0.17, 0.16, 0], head);
    b.box([0.12, 0.05, 0.3], plateDark, [-0.02, 0.06, 0], head);
    eyes.visible = false;
    hairGroup.visible = false;
  }

  // ── Arms ── (front = camera side, +Z, holds the weapon)
  const arms = [0.27, -0.27].map((z) => {
    const shoulder = b.joint([0, 0.48, z], chest);
    b.ball(0.095, division, [0, 0, 0], shoulder, 8);
    if (tier >= 2) b.ball(0.12, plate, [0, 0.03, z > 0 ? 0.02 : -0.02], shoulder, 8).scale.set(1, 0.7, 1); // pauldron
    const elbow = b.limb(shoulder, 0.3, 0.07, division, 0.062);
    const wrist = b.limb(elbow, 0.27, 0.06, suit, 0.055);
    b.box([0.015, 0.05, 0.13], division, [0, 0.03, 0], wrist); // cuff stripe
    if (tier >= 2) b.box([0.09, 0.16, 0.09], plate, [0.0, 0.1, 0], wrist); // bracer
    b.ball(0.065, glove, [0, -0.05, 0], wrist, 7);
    const hand = b.joint([0, -0.07, 0], wrist);
    return { shoulder, elbow, hand };
  });
  const [front, back] = arms as [typeof arms[0], typeof arms[0]];
  const spinner = buildWeapon(b, front.hand, weaponId);

  const ranged = weapon.style === 'ranged';
  const twoHanded = TWO_HANDED.has(weaponId);
  const rest = {
    // z swings the arm forward, y turns it across the body (towards −Z for the front arm).
    front: ranged ? { z: 1.42, y: 0.18, elbow: -0.05 } : { z: 0.3, y: 0.1, elbow: 1.65 },
    back: twoHanded ? { z: 1.1, y: -0.62, elbow: 0.4 } : { z: 0.12, y: 0, elbow: 0.15 },
  };
  let strike = 0;

  const idle = (t: number) => {
    const breath = Math.sin(t * 2.1);
    b.pose.position.y = breath * 0.006;
    chest.scale.set(1 + breath * 0.012, 1 + breath * 0.008, 1 + breath * 0.014);
    // Ready stance: knees soft, weight shifting a little.
    const shift = Math.sin(t * 0.7) * 0.03;
    legs.forEach(({ hip, knee }, i) => {
      hip.rotation.z = 0.12 + (i ? -shift : shift);
      hip.rotation.x = i ? -0.05 : 0.05;
      knee.rotation.z = -0.24;
    });
    hips.position.y = 0.92;
    spine.position.y = 0.97;
    spine.rotation.z = -0.04 + shift * 0.5 - strike * 0.18;
    spine.rotation.y = strike * (ranged ? 0.1 : -0.35);
    // Glance around, blink every few seconds.
    head.rotation.y = Math.sin(t * 0.45) * 0.18 + Math.sin(t * 1.7) * 0.03;
    head.rotation.z = Math.sin(t * 0.6) * 0.04;
    eyes.scale.y = (t % 4.3) < 0.12 ? 0.15 : 1;
    // Arms: hold the weapon ready; the strike blends towards an attack pose.
    const f = rest.front;
    front.shoulder.rotation.z = f.z + Math.sin(t * 2.1) * 0.02 + strike * (ranged ? 0.08 : 1.6);
    front.shoulder.rotation.y = f.y;
    front.elbow.rotation.z = f.elbow - strike * (ranged ? 0 : 1.4);
    const k = rest.back;
    back.shoulder.rotation.z = k.z + (twoHanded ? 0 : Math.sin(t * 2.1 + 1) * 0.04);
    back.shoulder.rotation.y = k.y;
    back.elbow.rotation.z = k.elbow;
    if (spinner) spinner.rotation.y = t * (2 + strike * 30);
  };
  return b.figure(1, idle, (k) => { strike = k; });
}
