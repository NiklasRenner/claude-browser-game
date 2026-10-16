/**
 * The player's officer. Armor sets the silhouette (a long coat at first,
 * full plate at the end), the division sets the colour of the sash or cloak
 * and a piece of kit, and the weapon sits in the front hand.
 *
 *   security  crest on the helm, red
 *   science   a caged lantern familiar floating at the shoulder, blue
 *   engineer  a backpack with an exhaust and a glowing antenna, amber
 */
import { DIVISIONS, getArmor } from '../../core';
import type { DivisionId } from '../../core';
import type { Painter } from '../pixel/painter';
import { R, fromInt, glowOf, rampOf } from '../pixel/palette';
import type { Ramp } from '../pixel/palette';
import { beat } from './figure';
import type { Figure, Pose } from './figure';
import { RIGS, SHEETS } from './sheet-data';
import { tinted } from './sheets';
import type { Frame } from './sheets';
import { drawWeapon, isMelee, restAngle, weaponShape } from './weapons';

/** 0 duty coat · 1 field jacket · 2 armored vest · 3 envirosuit · 4 arctic hardsuit · 5 power armor. */
const TIERS: Record<string, number> = {
  duty_uniform: 0, field_jacket: 1, composite_vest: 2, thermal_envirosuit: 3, arctic_hardsuit: 4, aegis_power_armor: 5,
};

function tierOf(armorId: string): number {
  if (armorId in TIERS) return TIERS[armorId]!;
  const block = getArmor(armorId).block;
  return block >= 12 ? 5 : block >= 9 ? 4 : block >= 7 ? 2 : block >= 4 ? 1 : 0;
}

/** Main armor material per tier. */
const PLATE: Ramp[] = [R.coat, R.coat, R.iron, rampOf(0x9a6a44, 0.9), rampOf(0xb8c4d0, 0.95), R.iron];

export function heroFigure(divisionId: DivisionId, weaponId: string, armorId: string): Figure {
  const tier = tierOf(armorId);
  const shape = weaponShape(weaponId);
  const division = rampOf(DIVISIONS[divisionId].color, 0.9);
  const divGlow = glowOf(DIVISIONS[divisionId].color);
  const plate = PLATE[tier]!;
  const heavy = tier >= 4;
  const armored = tier >= 2;
  const trim = tier === 5 ? R.gold : tier === 4 ? R.steel : R.iron;
  const melee = isMelee(shape);

  const draw = (p: Painter, { t, attack: a }: Pose) => {
    const U = beat(t, 2.1);
    const hem = (i: number) => Math.round(Math.sin(t * 2.4 + i * 1.7) * 1.2);
    const limb = heavy ? 0.6 : armored ? 0.2 : -0.4;

    // Coat tails or cloak, behind everything.
    const cloth = tier === 5 ? division : tier === 3 ? rampOf(0x6a4a34, 0.8) : R.coat;
    if (tier !== 4) {
      const long = tier === 5 ? 0 : 4;
      p.poly([[-12, -52 + U], [0, -54 + U], [-3, -26], [-4, long + hem(0) - 4], [-8, long - 6], [-12, long - 3 + hem(1)], [-16, long - 7],
        [-19, long - 4 + hem(2)], [-22, long - 10], [-22, -24], [-18, -42]], cloth,
      { normal: (x, y) => [Math.sin(x * 0.95 + y * 0.03 + t * 0.7) * 0.6, -0.1, 1], grime: 0.04, bias: -0.04, rim: tier === 5 ? 0 : 1, rimRamp: division });
    }

    // Engineer's pack sits behind the shoulders.
    if (divisionId === 'engineer') {
      p.rect(-16, -56 + U, 9, 17, R.rust, { bevel: 1, grime: 0.12 });
      p.cap(-14, -56 + U, -14, -64 + U, 1.3, 1.1, R.iron);
      p.line(-10, -56 + U, -8, -70 + U, R.iron[3]);
      p.glow(-8, -71 + U, Math.sin(t * 4) > 0 ? divGlow : [255, 240, 200]);
      p.glow(-12, -48 + U, divGlow);
    }

    // Far arm.
    p.cap(-9, -47 + U, -13, -37 + U, 3.4 + limb, 3.0 + limb, armored ? plate : R.coat, { bias: -0.16 });
    p.cap(-13, -37 + U, -11, -28 + U, 3.0 + limb, 2.8 + limb, armored ? plate : R.coat, { bias: -0.16 });
    p.ell(-11, -27 + U, 2.4 + limb * 0.5, 2.4, tier >= 3 ? plate : R.leather, { bias: -0.1 });

    // Far leg.
    const legRamp = tier >= 3 ? plate : R.leather;
    p.cap(-3, -24, -7, -13, 4.6 + limb, 4.2 + limb, tier >= 2 ? plate : R.coat, { bias: -0.18, grime: 0.05 });
    p.cap(-7, -13, -8, -3, 4.1 + limb, 3.7 + limb, legRamp, { bias: -0.18 });
    if (armored) p.ell(-7, -14, 3.4, 3.4, plate, { bias: -0.1, rim: 1, rimRamp: trim });
    p.poly([[-14, -5], [-3, -5], [-1, 0], [-15, 0]], R.leather, { bias: -0.15, ny: -0.3 });

    // Far pauldron.
    if (armored) p.ell(-10, -48 + U, 7 + (heavy ? 1 : 0), 6.2 + (heavy ? 0.8 : 0), plate, { rim: 1.4, rimRamp: trim, flat: 0.55, grime: 0.05 });

    // Torso.
    p.ell(0, -40 + U, 8.5 + (heavy ? 1.5 : 0), 10.5, armored ? plate : R.coat, { flat: 0.72, grime: 0.05 });
    p.rect(-6, -33 + U, 13, 7, armored ? plate : R.coat, { bevel: 1 });
    if (tier <= 1) {
      // Coat front: division sash, brass buttons.
      p.poly([[-6, -48 + U], [-3, -49 + U], [7, -29 + U], [4, -28 + U]], division, { noLine: true, nx: -0.1 });
      for (let y = -46; y <= -32; y += 4) p.dot(2, y + U, R.gold[3], { noLine: true });
    }
    if (tier === 1) p.poly([[-9, -53 + U], [10, -52 + U], [12, -45 + U], [1, -43 + U], [-11, -45 + U]], R.leather, { rim: 1, rimRamp: R.leather, bias: 0.05 });
    if (tier === 3) {
      for (const y of [-45, -39, -33]) p.rect(-7, y + U, 15, 1, plate, { bias: -0.45, noLine: true });
      p.cap(-8, -52 + U, -15, -34 + U, 2.6, 2.6, R.iron, { bias: -0.2 }); // air tank
    }
    if (armored && tier !== 3) {
      p.ell(2, -42 + U, 3, 3, trim);
      p.ell(2, -42 + U, 1.6, 1.6, plate, { bias: -0.3 });
      p.glow(2, -42 + U, a > 0.2 ? [255, 210, 122] : divGlow);
    }

    // Belt and tabard.
    p.rect(-7, -26, 15, 3, R.leather, { bevel: 1 });
    p.rect(-2, -26, 4, 3, R.gold, { bevel: 1 });
    if (tier >= 2 && tier !== 4) {
      p.poly([[-5, -23], [6, -23], [7, -8], [4, -5], [1, -9], [-2, -5], [-6, -9]], division,
        { rim: 1, rimRamp: tier === 5 ? R.gold : division, normal: (x) => [Math.sin(x * 1.3 + 1) * 0.45, 0, 1] });
    }
    if (tier === 4) p.poly([[-7, -24], [8, -24], [9, -15], [-8, -15]], R.snow, { grime: 0.2, normal: (x) => [Math.sin(x * 1.7) * 0.4, 0, 1] });

    // Near leg.
    p.cap(4, -24, 8, -13, 4.6 + limb, 4.2 + limb, tier >= 2 ? plate : R.coat, { grime: 0.05 });
    p.cap(8, -13, 9, -3, 4.1 + limb, 3.7 + limb, legRamp);
    if (armored) p.ell(8, -14, 3.7, 3.5, plate, { rim: 1, rimRamp: trim });
    p.poly([[3, -5], [12, -5], [16, -2], [16, 0], [3, 0]], R.leather, { ny: -0.3 });

    drawHead(p, t, U, tier, divisionId, division, divGlow, plate, trim);

    // Science's familiar: a caged lantern bobbing above the far shoulder.
    if (divisionId === 'science') {
      const fy = -62 + Math.round(Math.sin(t * 1.8) * 1.5), fx = -18 + Math.round(Math.sin(t * 0.9) * 1);
      p.ell(fx, fy, 3, 3.4, R.iron, { bias: -0.2 });
      for (let k = -1; k <= 1; k++) p.glow(fx + k * (k ? 1 : 0), fy + (k ? 0 : -1), divGlow);
      p.glow(fx, fy, [235, 248, 255]);
      p.dot(fx, fy - 4, R.gold[3]);
    }

    // Near arm and weapon. Melee: wind up then swing through. Ranged: recoil.
    let angle = restAngle(shape), hx: number, hy: number;
    if (melee) {
      const w = a < 0.3 ? a / 0.3 : 1 - (a - 0.3) / 0.7;
      angle += a < 0.3 ? -0.55 * w : -0.55 + ((a - 0.3) / 0.7) * 2.3;
      if (a === 0) angle += Math.sin(t * 1.1) * 0.03;
      hx = 16 + (a > 0.3 ? ((a - 0.3) / 0.7) * 4 : 0);
      hy = -33 + U - (a < 0.3 ? (a / 0.3) * 7 : 7 - ((a - 0.3) / 0.7) * 9);
      if (shape === 'lance') { hx += 1; hy -= 4; }
    } else {
      const kick = Math.sin(Math.min(1, a) * Math.PI);
      angle -= kick * 0.3;
      hx = (shape === 'cannon' ? 15 : 17) - kick * 2;
      hy = (shape === 'cannon' ? -35 : -40) + U;
    }
    const sx = 9, sy = -47 + U, ex = (sx + hx) / 2 + (melee ? 3 : 1), ey = (sy + hy) / 2 + (melee ? 2 : 4);
    const arm = armored ? plate : R.coat;
    p.cap(sx, sy, ex, ey, 3.6 + limb, 3.2 + limb, arm);
    if (armored) {
      p.ell(10, -48 + U, 7.6 + (heavy ? 1 : 0), 6.6 + (heavy ? 1 : 0), plate, { rim: 1.5, rimRamp: trim, flat: 0.55, grime: 0.05 });
      if (tier === 5) p.ell(11, -47 + U, 2, 2, R.gold);
    } else if (tier === 1) {
      p.ell(9, -48 + U, 5, 4, R.leather, { flat: 0.6 });
    }
    p.cap(ex, ey, hx, hy, 3.2 + limb, 2.8 + limb, arm);
    drawWeapon(p, weaponId, hx, hy, angle, t, melee ? (a > 0.3 && a < 0.8 ? 1 : 0) : a);
    p.ell(hx, hy, 2.6 + limb * 0.4, 2.4, tier >= 3 ? plate : R.leather);
  };

  const cloth = fromInt(DIVISIONS[divisionId].color);
  return {
    left: 30, right: 40, height: 100, scale: 1, hover: 0,
    draw: (p, pose) => {
      const frames = tinted('officer', cloth);
      if (frames) drawSprite(p, frames, pose, weaponId);
      else draw(p, pose);
    },
  };
}

/**
 * The rigged officer (scripts/rig.py). The body comes from the sheet: an idle
 * loop while waiting, then the attack frames played forward once. The weapon
 * is drawn by code at the frame's grip point and angle, then the fist is drawn
 * again on top so the hand closes around the grip.
 */
/** One-handed guns: held in the front hand. */
const SIDEARMS = new Set(['pistol', 'needler', 'flechette', 'emitter']);

function drawSprite(p: Painter, frames: Frame[], { t, attack: a }: Pose, weaponId: string) {
  const { ax, h } = SHEETS.officer;
  const rig = RIGS.officer;
  const melee = isMelee(weaponShape(weaponId));
  const [start, loop, count] = melee ? rig.anims.swing : rig.anims.aim;
  const strike = count - loop;
  const i = start + (a > 0 ? loop + Math.min(strike - 1, Math.floor(a * strike)) : Math.floor(t * 2.5) % loop);
  const frame = frames[i]!;
  // Long guns and melee weapons sit in the near hand (the far hand then steadies the barrel);
  // a sidearm is held out in the front hand, aimed along the near arm.
  const sidearm = !melee && SIDEARMS.has(weaponShape(weaponId));
  const [hx, hy] = (sidearm ? rig.front : rig.hands)[i]!;
  const angle = rig.hands[i]![2];
  p.image(frame, -ax, -h);
  drawWeapon(p, weaponId, hx, hy, angle, t, melee ? (a > 0.3 && a < 0.8 ? 1 : 0) : a, 1.4);
  p.image(frame, -ax, -h, [hx + ax, hy + h, 2.5]);
}

function drawHead(p: Painter, t: number, U: number, tier: number, divisionId: DivisionId, division: Ramp, divGlow: readonly [number, number, number], plate: Ramp, trim: Ramp) {
  const blink = Math.sin(t * 0.7) > 0.985;
  const eyes = (col: readonly [number, number, number]) => { if (!blink) { p.dot(4, -58 + U, col, { noLine: true }); p.dot(6, -58 + U, col, { noLine: true }); } };
  // Collar.
  p.ell(1, -51 + U, 6, 2.8, tier === 5 ? R.gold : tier === 4 ? R.snow : division, { flat: 0.6 });
  switch (tier) {
    case 0:
    case 1: {
      // Hooded, face in shadow.
      p.ell(1, -58 + U, 5.6, 6.4, R.coat, { bias: 0.05 });
      p.ell(4, -57 + U, 3.2, 4, R.skin, { bias: -0.15 });
      eyes([20, 14, 16]);
      if (tier === 1) {
        p.rect(3, -55 + U, 5, 3, R.iron, { bevel: 1 });
        p.cap(4, -53 + U, -2, -50 + U, 0.8, 0.8, R.leather, { noLine: true });
      }
      p.poly([[-4, -64 + U], [2, -65 + U], [6, -62 + U], [3, -61 + U], [-3, -59 + U]], R.coat, { bias: 0.2 });
      return;
    }
    case 2: {
      p.ell(4, -57 + U, 3.4, 4, R.skin);
      eyes([24, 16, 18]);
      p.poly([[-5, -61 + U], [0, -65 + U], [7, -64 + U], [9, -60 + U], [5, -60 + U], [3, -58 + U], [-4, -55 + U]], plate, { rim: 1, rimRamp: trim, bias: 0.1 });
      if (divisionId === 'security') crest(p, t, U, division, -64);
      return;
    }
    case 3: {
      p.ell(2, -58 + U, 6, 6.2, plate, { flat: 0.85, grime: 0.05 });
      p.ell(5, -58 + U, 3.2, 3.4, R.iron, { bias: -0.4 });
      p.glow(5, -59 + U, [255, 190, 110]); p.glow(6, -58 + U, [230, 130, 60]); p.glow(4, -58 + U, [190, 90, 40]);
      p.cap(-3, -54 + U, -9, -50 + U, 1, 1, R.iron, { noLine: true });
      return;
    }
    case 4: {
      p.ell(0, -58 + U, 7, 7, R.snow, { grime: 0.25, bias: -0.05 });
      p.ell(3, -58 + U, 5, 5.4, plate, { flat: 0.85 });
      for (let x = 4; x <= 7; x++) p.glow(x, -59 + U, x === 7 ? [210, 245, 255] : [108, 214, 255]);
      return;
    }
    default: {
      p.ell(2, -58 + U, 5.6, 6.2, plate, { flat: 0.85, grime: 0.04 });
      p.poly([[3, -62 + U], [8, -61 + U], [8.5, -55 + U], [5, -53 + U], [2.5, -56 + U]], plate, { nx: 0.35, bias: 0.12 });
      for (let x = 4; x <= 7; x++) p.glow(x, -59 + U, x === 7 ? [255, 180, 138] : [255, 74, 42]);
      p.dot(5, -56 + U, plate[0]!, { noLine: true });
      p.dot(7, -56 + U, plate[0]!, { noLine: true });
      if (divisionId === 'security') crest(p, t, U, division, -64);
      else if (divisionId === 'science') p.glow(2, -63 + U, divGlow);
      else p.cap(-2, -63 + U, -2, -66 + U, 0.8, 0.8, R.gold);
    }
  }
}

function crest(p: Painter, t: number, U: number, division: Ramp, y: number) {
  const sw = Math.sin(t * 1.3);
  p.cap(1, y + U, -6, y - 2 + U + sw * 0.5, 2.3, 1.7, division);
  p.cap(-6, y - 2 + U + sw * 0.5, -12, y + 4 + U + sw, 1.7, 1.0, division);
}
