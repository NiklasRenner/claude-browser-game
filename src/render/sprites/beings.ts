/** Non-animal body plans: blob, humanoid, husk, elemental, golem, wraith, wisp. All face left. */
import { FIRE, R } from '../pixel/palette';
import { along, beat } from './figure';
import { eyes, lunge } from './kit';
import type { Body } from './kit';

/** A mound of living ooze with things floating inside it (Protoplasm). */
export const blob: Body = {
  left: 22, right: 22, height: 30, size: 1.3,
  draw(p, { t, attack }, k) {
    const l = lunge(attack);
    const wob = Math.sin(t * 2.2);
    const rx = 15 + wob * 1.2 + l * 3, ry = 11 - wob * 0.8 + l * 2;
    p.ell(-l * 4, -ry, rx, ry, k.body, { bias: 0.08, grime: 0.03 });
    p.ell(-l * 4 - 2, -ry - 1, rx * 0.6, ry * 0.55, k.accent, { noLine: true, bias: 0.2, dither: 1 });
    // A skull and some bones drifting inside.
    const sx = 3 + Math.sin(t * 0.7) * 3 - l * 4, sy = -ry + Math.cos(t * 0.6) * 2;
    p.ell(sx, sy, 2.6, 2.2, R.bone, { noLine: true, bias: -0.2 });
    p.dot(sx - 1, sy, R.bone[0]!, { noLine: true });
    p.dot(sx + 1, sy, R.bone[0]!, { noLine: true });
    p.line(sx + 4, sy + 4, sx + 8, sy + 2, R.bone[2]!, { noLine: true });
    for (let i = 0; i < 4; i++) {
      const y = -((t * 4 + i * 5) % (ry * 1.6)) - 2, x = -8 + i * 5 - l * 4;
      if (p.covered(x, y)) p.glow(x, y, k.glow);
    }
    eyes(p, t, [[-9 - l * 6, -ry - 2], [-6 - l * 6, -ry - 3], [-12 - l * 6, -ry + 1]], k.glow);
    for (const x of [-12, -4, 7]) p.cap(x, -2, x - 1, 1 + Math.round(Math.sin(t * 3 + x)), 1.2, 0.7, k.body, { noLine: true });
  },
};

/** Two-legged foe: raiders, marauders, leeches, the Hollow Admiral. Features: helmet, baton, blade, shield, armor, coat, staff, tendrils. */
export const humanoid: Body = {
  left: 30, right: 26, height: 66,
  draw(p, { t, attack }, k) {
    const U = beat(t, 2, 1);
    const l = lunge(attack);
    const hem = (i: number) => Math.round(Math.sin(t * 2.3 + i * 1.9) * 1.2);
    const armor = k.has('armor');
    const coat = k.has('coat');
    const cloth = coat ? k.body : k.dark;
    // Tendrils writhing out of the back.
    if (k.has('tendrils')) {
      for (let i = 0; i < 4; i++) {
        const ph = t * 1.6 + i * 1.7;
        const pts: [number, number][] = [[4, -46 + U + i * 3]];
        for (let s = 1; s <= 5; s++) pts.push([4 + s * 4 + Math.sin(ph + s) * 2.5, -46 + U + i * 3 - s * (3 - i) + Math.cos(ph + s * 0.8) * 3]);
        for (let s = 0; s < 5; s++) p.cap(...pts[s]!, ...pts[s + 1]!, 1.8 - s * 0.3, 1.5 - s * 0.3, k.dark, { bias: -0.1 });
        p.glow(...pts[5]!, k.glow);
      }
    }
    // Coat tails or cloak behind.
    p.poly([[12, -52 + U], [0, -54 + U], [3, -26], [4, -2 + hem(0)], [8, -4], [12, -1 + hem(1)], [16, -5], [19, -2 + hem(2)], [21, -10], [20, -30], [17, -44]], cloth,
      { normal: (x, y) => [Math.sin(x * 0.9 + y * 0.03 + t * 0.6) * 0.6, -0.1, 1], grime: 0.06, bias: -0.06, rim: coat ? 1 : 0, rimRamp: R.gold });
    // Far arm (holds the staff).
    const staff = k.has('staff');
    p.cap(9, -47 + U, 13, -37 + U, 3.4, 3, k.dark, { bias: -0.16 });
    p.cap(13, -37 + U, staff ? 13 : 11, staff ? -33 + U : -28 + U, 3, 2.8, k.dark, { bias: -0.16 });
    if (staff) {
      p.cap(14, -76, 14, 0, 1.2, 1.2, R.wood);
      p.ell(14, -79, 3.2, 3.2, R.iron, { bias: -0.2 });
      p.glow(14, -79, k.glow); p.glow(14, -80, [255, 255, 255]); p.glow(13, -79, k.glow); p.glow(15, -79, k.glow);
      p.ell(13, -32 + U, 2.4, 2.4, R.bone);
    }
    // Legs.
    const legs = armor ? k.accent : k.dark;
    p.cap(3, -24, 7, -13, 4.4, 4, legs, { bias: -0.18 });
    p.cap(7, -13, 8, -3, 4, 3.6, R.leather, { bias: -0.18 });
    p.poly([[14, -5], [3, -5], [1, 0], [15, 0]], R.leather, { bias: -0.15 });
    // Torso.
    p.ell(0, -40 + U, 9, 10.5, armor ? k.accent : k.body, { flat: 0.72, grime: 0.08, rim: armor ? 1 : 0, rimRamp: R.iron });
    p.rect(-6, -33 + U, 13, 7, armor ? k.accent : k.body, { bevel: 1 });
    p.rect(-7, -26, 15, 3, R.leather, { bevel: 1 });
    p.glow(-3, -42 + U, k.glow);
    if (coat) {
      for (let y = -46; y <= -30; y += 4) p.dot(-4, y + U, R.gold[3]!, { noLine: true });
      p.ell(-9, -48 + U, 4, 2.2, R.gold, { flat: 0.5 });
      p.ell(9, -48 + U, 4, 2.2, R.gold, { flat: 0.5, bias: -0.2 });
    }
    if (armor) p.ell(10, -48 + U, 7, 6, k.accent, { rim: 1.3, rimRamp: R.iron, flat: 0.55, bias: -0.1 });
    // Near leg.
    p.cap(-4, -24, -8, -13, 4.4, 4, legs);
    p.cap(-8, -13, -9, -3, 4, 3.6, R.leather);
    p.poly([[-3, -5], [-12, -5], [-16, -2], [-16, 0], [-3, 0]], R.leather);
    // Head.
    if (k.has('helmet')) {
      p.ell(-2, -58 + U, 5.6, 6.2, R.iron, { flat: 0.85, grime: 0.06 });
      p.poly([[-3, -62 + U], [-8, -61 + U], [-8.5, -55 + U], [-5, -53 + U], [-2.5, -56 + U]], R.iron, { nx: -0.35, bias: 0.1 });
      for (let x = -7; x <= -4; x++) p.glow(x, -59 + U, k.glow);
      if (armor) p.cap(-1, -64 + U, 6, -66 + U, 2, 1.2, k.accent);
    } else {
      // Hood with a dark face and burning eyes.
      p.ell(-1, -58 + U, 5.8, 6.6, cloth, { bias: 0.08 });
      p.ell(-4, -57 + U, 3.2, 4, R.void, { noLine: true });
      eyes(p, t, [[-5, -58 + U], [-3, -58 + U]], k.glow);
      if (coat) {
        p.poly([[-12, -63 + U], [10, -64 + U], [8, -61 + U], [-10, -61 + U]], R.coat, { bias: 0.1 });
        p.poly([[-5, -63 + U], [-2, -71 + U], [5, -70 + U], [6, -63 + U]], R.coat, { bias: 0.05 });
        p.rect(-4, -65 + U, 9, 1, R.gold, { noLine: true });
      }
    }
    // Near arm and what it holds.
    const swing = attack < 0.3 ? attack / 0.3 : 1 - (attack - 0.3) / 0.7;
    const angle = Math.PI + 1.05 + (attack > 0 ? (attack < 0.3 ? 0.55 * swing : 0.55 - ((attack - 0.3) / 0.7) * 2.3) : Math.sin(t * 1.1) * 0.03);
    const hx = -16 - l * 4, hy = -33 + U - (attack < 0.3 ? swing * 7 : 0);
    p.cap(-9, -47 + U, (hx - 9) / 2 - 3, (hy - 47) / 2 + 2, 3.6, 3.2, armor ? k.accent : cloth);
    if (armor) p.ell(-10, -48 + U, 7.6, 6.6, k.accent, { rim: 1.4, rimRamp: R.iron, flat: 0.55, grime: 0.05 });
    p.cap((hx - 9) / 2 - 3, (hy - 47) / 2 + 2, hx, hy, 3.2, 2.8, armor ? k.accent : cloth);
    const at = along(hx, hy, angle);
    if (k.has('blade')) {
      p.cap(...at(-4, 0), ...at(2, -0), 1.1, 1.1, R.leather);
      p.cap(...at(2, -4), ...at(2, 4), 1.1, 1.1, R.iron);
      p.cap(...at(3, 0), ...at(28, 0), 1.8, 0.6, R.steel, { flat: 0.45 });
      for (let u = 8; u <= 24; u += 4) p.glow(...at(u, 0), k.glow);
    } else if (k.has('baton')) {
      p.cap(...at(-2, 0), ...at(13, 0), 1.4, 1.3, R.iron);
      p.glow(...at(13, 0), k.glow);
      if (Math.sin(t * 9) > 0.5) p.glow(...at(14, 1), [255, 255, 255]);
    } else if (!staff) {
      for (const v of [-1.5, 0, 1.5]) p.cap(...at(0, v), ...at(5, v * 1.6), 0.6, 0.4, R.bone, { noLine: true });
    }
    p.ell(hx, hy, 2.6, 2.4, armor ? R.iron : R.leather);
    if (k.has('shield')) {
      const sx = -15 - l * 3, sy = -34 + U;
      p.poly([[sx - 5, sy - 12], [sx + 4, sy - 12], [sx + 5, sy + 4], [sx, sy + 10], [sx - 6, sy + 4]], R.iron, { rim: 1, rimRamp: k.accent, nx: -0.25, grime: 0.08 });
      p.ell(sx - 0.5, sy - 2, 2.2, 2.2, k.accent);
      p.glow(sx - 0.5, sy - 2, k.glow);
    }
  },
};

/** Emaciated machine-corpse with a drill for a hand (Nanite Husk). */
export const husk: Body = {
  left: 30, right: 22, height: 64,
  draw(p, { t, attack }, k) {
    const U = beat(t, 1.7);
    const l = lunge(attack);
    const twitch = Math.sin(t * 13) > 0.92 ? 1 : 0;
    // Cables trailing from the spine.
    for (let i = 0; i < 3; i++) {
      p.line(6, -50 + U + i * 4, 12 + i * 2, -36 + i * 6 + Math.round(Math.sin(t * 2 + i)), R.iron[1]!);
      p.glow(12 + i * 2, -36 + i * 6 + Math.round(Math.sin(t * 2 + i)), k.glow);
    }
    // Far limbs.
    p.cap(6, -48 + U, 10, -36 + U, 2.2, 1.8, k.dark, { bias: -0.2 });
    p.cap(10, -36 + U, 7, -26 + U, 1.8, 1.4, k.dark, { bias: -0.2 });
    for (const d of [-1, 1]) p.line(7, -26 + U, 6 + d * 2, -22 + U, k.dark[2]!);
    p.cap(4, -24, 8, -13, 2.6, 2.2, k.dark, { bias: -0.2 });
    p.cap(8, -13, 5, -2, 2.2, 1.8, k.dark, { bias: -0.2 });
    p.poly([[10, -2], [2, -3], [1, 0], [10, 0]], k.dark);
    // Pelvis, spine, ribcage.
    p.ell(1, -25, 6, 3.4, k.body, { flat: 0.7 });
    p.cap(1, -26, -1 + twitch, -44 + U, 2, 2.4, k.body);
    p.ell(-1, -40 + U, 7, 8, k.dark, { flat: 0.6, bias: -0.3 });
    for (let i = 0; i < 4; i++) p.cap(-7, -45 + U + i * 3.2, 5, -44 + U + i * 3.2, 0.9, 0.9, k.body, { bias: 0.1 });
    p.glow(-1, -40 + U, k.glow);
    // Near leg.
    p.cap(-2, -24, -6, -13, 2.6, 2.2, k.body);
    p.cap(-6, -13, -3, -2, 2.2, 1.8, k.body);
    p.poly([[-9, -2], [0, -3], [1, 0], [-10, 0]], k.body);
    // Skull-like head.
    const hx = -5 - l * 3 + twitch;
    p.ell(hx, -54 + U, 5, 5.6, k.body, { flat: 0.85, grime: 0.15 });
    p.rect(hx - 5, -51 + U, 6, 3, R.iron, { bevel: 1 });
    for (let x = -4; x <= 0; x += 2) p.dot(hx + x, -50 + U, R.iron[0]!, { noLine: true });
    p.ell(hx - 2, -55 + U, 1.8, 1.8, R.void, { noLine: true });
    p.glow(hx - 2, -55 + U, k.glow);
    p.dot(hx + 2, -55 + U, R.void[0]!, { noLine: true });
    // Drill arm.
    const ax = -18 - l * 8, ay = -34 + U - l * 2;
    p.cap(-6, -48 + U, -12, -40 + U, 2.4, 2.2, k.body);
    p.cap(-12, -40 + U, ax + 4, ay, 2.6, 3.2, R.iron);
    const spin = Math.floor(t * (attack ? 30 : 6)) % 3;
    p.poly([[ax + 4, ay - 3.5], [ax - 8, ay], [ax + 4, ay + 3.5]], R.steel, { nx: 0.1 });
    for (let i = 0; i < 3; i++) {
      const u = 1 + ((i * 3 + spin) % 9);
      p.line(ax + 4 - u, ay - 3 + u * 0.3, ax + 3 - u, ay + 3 - u * 0.3, R.steel[1]!, { noLine: true });
    }
  },
};

/** Living fire (Plasma Sprite): a flickering body with a bright core, hovering. */
export const elemental: Body = {
  left: 24, right: 22, height: 50, hover: 6,
  draw(p, { t, attack }, k) {
    const l = lunge(attack);
    const ox = -l * 6;
    // Flame tongues rising off the body.
    for (let i = 0; i < 9; i++) {
      const x = ox - 10 + i * 2.6, h = 10 + ((i * 7) % 5) * 2 + Math.sin(t * 7 + i * 1.3) * 3;
      p.cap(x, -24, x + Math.sin(t * 5 + i) * 2, -24 - h - 10, 3.2 - (i % 3) * 0.4, 0.6, k.body, { bias: 0.25, noLine: true, dither: 1 });
    }
    p.ell(ox, -26, 10, 13, k.body, { bias: 0.25, dither: 1 });
    // Arms of flame.
    p.cap(ox - 6, -30, ox - 15 - l * 6, -26 + Math.sin(t * 3) * 2, 3.4, 1.4, k.body, { bias: 0.2 });
    p.cap(ox + 6, -30, ox + 14, -24 + Math.sin(t * 3 + 1) * 2, 3, 1.2, k.dark, { bias: 0.1 });
    // Tapering wisp below.
    p.cap(ox, -16, ox + Math.sin(t * 2) * 2, -2, 5, 1, k.body, { bias: 0.2, dither: 1 });
    // Core: emissive.
    for (let y = -32; y <= -20; y++) {
      for (let x = -5; x <= 5; x++) {
        const d = Math.hypot(x / 5, (y + 26) / 6.5);
        if (d > 1) continue;
        const v = 1 - d + Math.sin(t * 6 + x + y) * 0.1;
        p.glow(ox + x, y, v > 0.6 ? [255, 248, 216] : v > 0.3 ? k.glow : FIRE[2]!);
      }
    }
    p.dot(ox - 3, -28, [40, 10, 6]);
    p.dot(ox - 1, -28, [40, 10, 6]);
    for (let i = 0; i < 4; i++) {
      const y = -40 - ((t * 20 + i * 9) % 14);
      p.glow(ox - 6 + i * 4 + Math.sin(t * 4 + i) * 2, y, k.glow);
    }
  },
};

/** Walking mountain with lava in its cracks (Magma Colossus). */
export const golem: Body = {
  left: 32, right: 26, height: 70,
  draw(p, { t, attack }, k) {
    const b = beat(t, 1.1);
    const l = lunge(attack);
    const crack = (x1: number, y1: number, x2: number, y2: number) => {
      const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
      for (let i = 0; i <= n; i++) {
        const x = x1 + ((x2 - x1) * i) / n + (i % 3 === 1 ? 1 : 0), y = y1 + ((y2 - y1) * i) / n;
        if (p.covered(x, y)) p.glow(x, y, Math.sin(t * 3 + i * 0.7) > 0.6 ? [255, 230, 150] : k.glow);
      }
    };
    // Far arm and leg.
    p.poly([[8, -50 + b], [16, -46 + b], [17, -30], [12, -22], [6, -26]], k.dark, { bias: -0.2, grime: 0.15 });
    p.ell(12, -18, 6, 6, k.dark, { flat: 0.6, bias: -0.2 });
    p.poly([[4, -24], [14, -24], [15, -10], [16, 0], [3, 0], [5, -12]], k.dark, { bias: -0.2, grime: 0.12 });
    // Torso: a broad slab of rock.
    p.poly([[-14, -52 + b], [-4, -60 + b], [12, -58 + b], [16, -44 + b], [12, -26], [-10, -24], [-16, -36 + b]], k.body,
      { grime: 0.18, normal: (x, y) => [Math.sin(x * 0.4) * 0.4, Math.cos(y * 0.3) * 0.3, 1] });
    crack(-6, -54 + b, 0, -44 + b); crack(0, -44 + b, 6, -36); crack(0, -44 + b, -8, -32);
    // Near leg.
    p.poly([[-12, -26], [0, -26], [1, -12], [2, 0], [-14, 0], [-12, -12]], k.body, { grime: 0.15, nx: -0.15 });
    crack(-8, -22, -6, -8);
    // Head: a small boulder sunk between the shoulders.
    const hx = -8 - l * 3;
    p.poly([[hx - 6, -60 + b], [hx - 1, -66 + b], [hx + 6, -63 + b], [hx + 6, -56 + b], [hx - 5, -55 + b]], k.body, { bias: 0.08, grime: 0.12 });
    eyes(p, t, [[hx - 3, -60 + b], [hx, -60 + b]], [255, 230, 150]);
    // Near arm, swung overhead and down.
    const up = attack > 0 && attack < 0.4 ? attack / 0.4 : 0;
    const fx = -24 - l * 6, fy = -18 - up * 34;
    p.poly([[-12, -54 + b], [-20, -50 + b], [-22, -36 - up * 10], [-14, -32 - up * 6], [-8, -42 + b]], k.body, { grime: 0.15, nx: -0.2 });
    p.poly([[fx - 7, fy - 8], [fx + 5, fy - 10], [fx + 7, fy + 2], [fx + 1, fy + 8], [fx - 8, fy + 4]], k.body, { grime: 0.2, bias: 0.05 });
    crack(fx - 4, fy - 4, fx + 3, fy + 3);
    crack(-18, -48 + b, -16, -38);
  },
};

/** Hooded spectre trailing tatters (Void Shade, Cryo Phantom). Feature: ice. */
export const wraith: Body = {
  left: 28, right: 24, height: 66, hover: 8,
  draw(p, { t, attack }, k) {
    const l = lunge(attack);
    const ox = -l * 7;
    const bob = Math.round(Math.sin(t * 1.5) * 1.5);
    // Robe that frays into wisps.
    const pts: [number, number][] = [[ox - 8, -52 + bob], [ox + 10, -52 + bob], [ox + 14, -30]];
    for (let i = 0; i <= 6; i++) {
      const x = ox + 14 - i * 4.4, tail = i % 2 ? -6 : 0;
      pts.push([x + Math.sin(t * 3 + i) * 1.5, tail + Math.round(Math.sin(t * 2.4 + i * 1.3) * 1.5) - 4]);
    }
    pts.push([ox - 14, -26]);
    p.poly(pts, k.body, { normal: (x) => [Math.sin(x * 0.8 + t) * 0.6, -0.1, 1], grime: 0.05, rim: 1, rimRamp: k.dark });
    // Far arm.
    p.cap(ox + 6, -48 + bob, ox + 12, -36 + bob, 3, 2.4, k.dark, { bias: -0.2 });
    // Hood.
    p.ell(ox - 1, -56 + bob, 7, 8, k.body, { bias: 0.08 });
    p.poly([[ox + 2, -64 + bob], [ox + 10, -60 + bob], [ox + 5, -54 + bob]], k.body);
    p.ell(ox - 4, -55 + bob, 3.8, 5, R.void, { noLine: true });
    eyes(p, t, [[ox - 6, -56 + bob], [ox - 3, -56 + bob]], k.glow);
    // Reaching arm with long claws.
    const hx = ox - 16 - l * 6, hy = -40 + bob - l * 2;
    p.cap(ox - 6, -48 + bob, hx + 3, hy, 3.4, 2.4, k.body);
    for (const v of [-2, 0, 2]) p.line(hx + 2, hy + v * 0.5, hx - 5, hy + v * 1.4 + 2, R.bone[3]!);
    if (k.has('ice')) {
      for (const [x, y, h] of [[-6, -52, 7], [-1, -55, 9], [5, -52, 6], [9, -48, 5]] as const) {
        p.poly([[ox + x - 2, y + bob], [ox + x, y - h + bob], [ox + x + 2, y + bob]], k.accent, { nx: -0.4, bias: 0.15 });
      }
      p.glow(ox - 1, -62 + bob, [230, 248, 255]);
    }
    for (let i = 0; i < 3; i++) p.glow(ox + 10 - ((t * 6 + i * 5) % 18), -6 - i * 3, k.glow);
  },
};

/** A drifting knot of light (Phase Wisp). */
export const wisp: Body = {
  left: 16, right: 16, height: 34, hover: 20, size: 1.4,
  draw(p, { t, attack }, k) {
    const l = lunge(attack);
    const ox = -l * 10;
    const r = 5 + Math.sin(t * 4) * 0.8;
    for (let y = -Math.ceil(r) - 1; y <= Math.ceil(r) + 1; y++) {
      for (let x = -Math.ceil(r) - 1; x <= Math.ceil(r) + 1; x++) {
        const d = Math.hypot(x, y) / r;
        if (d > 1.15) continue;
        const flick = Math.sin(t * 9 + x * 1.7 + y * 2.3);
        if (d > 0.85 && flick < 0) continue;
        p.glow(ox + x, -18 + y, d < 0.35 ? [255, 255, 255] : d < 0.75 ? k.glow : k.accent[3]!);
      }
    }
    // Orbiting motes and a fading tail.
    for (let i = 0; i < 5; i++) {
      const a = t * 2.4 + (i / 5) * Math.PI * 2;
      p.glow(ox + Math.cos(a) * 10, -18 + Math.sin(a) * 4, i % 2 ? k.glow : [255, 255, 255]);
    }
    for (let i = 1; i < 6; i++) if (Math.sin(t * 7 + i) > -0.3) p.glow(ox + i * 2.2, -18 + Math.sin(t * 3 + i) * 2, k.accent[4 - Math.min(3, Math.floor(i / 2))]!);
  },
};
