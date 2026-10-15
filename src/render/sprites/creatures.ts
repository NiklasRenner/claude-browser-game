/** Animal body plans: beast, brute, flyer, serpent, dragon, insect. All face left. */
import { R } from '../pixel/palette';
import { beat } from './figure';
import { eyes, lunge } from './kit';
import type { Body } from './kit';

/** Four-legged hunter (hounds, the Thornhide Behemoth). Features: spikes, tusks. */
export const beast: Body = {
  left: 36, right: 30, height: 40, size: 1.2,
  draw(p, { t, attack }, k) {
    const b = beat(t, 2);
    const l = lunge(attack);
    const hx = -l * 5, hy = l * 2;
    const step = (ph: number) => Math.round(Math.sin(t * 2 + ph) * 0.8);
    // Tail.
    const sw = Math.sin(t * 2.4) * 2;
    p.cap(17, -23 + b, 24, -27 + sw, 2.4, 1.6, k.body);
    p.cap(24, -27 + sw, 28, -24 + sw, 1.6, 0.8, k.body);
    // Far legs.
    p.cap(-11, -18, -14 + hx * 0.3, -9, 3.4, 2.8, k.dark, { bias: -0.2 });
    p.cap(-14 + hx * 0.3, -9, -13 + hx * 0.3, -1, 2.6, 2.2, k.dark, { bias: -0.2 });
    p.cap(12, -18, 16, -10 + step(1), 4, 3, k.dark, { bias: -0.2 });
    p.cap(16, -10 + step(1), 13, -1, 2.8, 2.2, k.dark, { bias: -0.2 });
    // Body, haunch, shoulder.
    p.ell(2, -21 + b, 16, 9, k.body, { flat: 0.8, grime: 0.12 });
    p.ell(12, -21 + b, 7.5, 8, k.body, { flat: 0.8 });
    p.ell(-9 + hx * 0.4, -21 + b, 8, 9, k.body, { flat: 0.8, grime: 0.08 });
    for (let x = -4; x <= 8; x += 4) p.line(x, -19 + b, x + 2, -14 + b, k.dark[1]!, { noLine: true });
    if (k.has('spikes')) {
      for (let i = 0; i < 6; i++) {
        const x = -12 + i * 5, y = -29 + b + (i === 0 || i === 5 ? 2 : 0);
        p.poly([[x - 2, y + 2], [x + 2.5, y - 4 - (i % 2) * 2], [x + 3, y + 3]], k.accent, { nx: -0.3 });
      }
    }
    // Neck and head, thrust forward when it bites.
    p.cap(-13 + hx * 0.6, -24 + b + hy * 0.5, -20 + hx, -22 + b + hy, 5, 4.2, k.body);
    p.ell(-22 + hx, -21 + b + hy, 6, 5, k.body, { flat: 0.85, grime: 0.08 });
    const open = l * 3;
    p.cap(-23 + hx, -17 + b + hy, -30 + hx, -15 + b + hy + open, 2.2, 1.6, k.dark);
    for (let x = -29; x <= -24; x += 2) p.dot(x + hx, -17 + b + hy + open * 0.5, R.bone[4]);
    p.cap(-24 + hx, -21 + b + hy, -31 + hx, -19 + b + hy, 3, 2.2, k.body, { bias: 0.05 });
    p.poly([[-20 + hx, -25 + b + hy], [-17 + hx, -31 + b + hy], [-16 + hx, -24 + b + hy]], k.dark);
    if (k.has('tusks')) {
      p.cap(-27 + hx, -16 + b + hy, -32 + hx, -22 + b + hy, 1.5, 0.6, R.bone);
      p.cap(-23 + hx, -16 + b + hy, -27 + hx, -23 + b + hy, 1.3, 0.5, R.bone);
    }
    eyes(p, t, [[-24 + hx, -23 + b + hy], [-26 + hx, -23 + b + hy]], k.glow);
    // Near legs.
    p.cap(-7 + hx * 0.4, -17, -10 + hx * 0.5, -8, 3.6, 3, k.body);
    p.cap(-10 + hx * 0.5, -8, -9 + hx * 0.5, -1, 2.8, 2.4, k.body);
    p.cap(15, -16, 18, -9 + step(2), 4.2, 3.2, k.body);
    p.cap(18, -9 + step(2), 15, -1, 3, 2.4, k.body);
    for (const x of [-12 + hx * 0.5, 12]) for (let d = 0; d < 3; d++) p.dot(x + d, 0, R.bone[3]);
  },
};

/** Hulking ape on its knuckles (Tundra Brute). Feature: horns. */
export const brute: Body = {
  left: 30, right: 22, height: 62,
  draw(p, { t, attack }, k) {
    const b = beat(t, 1.6);
    const l = lunge(attack);
    // Slam: the near fist rises, then comes down hard.
    const up = attack > 0 && attack < 0.35 ? attack / 0.35 : 0;
    const fx = -16 - l * 6, fy = -12 - up * 30 + (attack >= 0.35 ? 0 : 0);
    // Far arm and legs.
    p.cap(8, -44 + b, 6, -28, 5, 4.2, k.dark, { bias: -0.2 });
    p.cap(6, -28, 3, -9, 4.2, 3.6, k.dark, { bias: -0.2 });
    p.ell(3, -6, 4.4, 4, k.dark, { bias: -0.15 });
    p.cap(7, -22, 10, -11, 5.4, 4.4, k.dark, { bias: -0.2 });
    p.cap(10, -11, 9, -2, 4.4, 4, k.dark, { bias: -0.2 });
    p.poly([[4, -3], [14, -3], [15, 0], [3, 0]], k.dark);
    // Hunched torso with a shaggy back.
    p.ell(5, -36 + b, 12.5, 12.5, k.body, { flat: 0.75, grime: 0.12 });
    for (let i = 0; i < 6; i++) {
      const x = -2 + i * 3.5, y = -48 + b + Math.abs(i - 2) * 1.5;
      p.poly([[x - 2, y + 4], [x + 1, y - 3], [x + 3, y + 4]], k.dark, { bias: 0.1, noLine: true });
    }
    p.ell(-1, -30 + b, 7, 7.5, k.accent, { flat: 0.6, bias: -0.05 });
    // Near leg.
    p.cap(-1, -22, -4, -11, 5.6, 4.6, k.body);
    p.cap(-4, -11, -3, -2, 4.6, 4, k.body);
    p.poly([[-9, -3], [1, -3], [2, 0], [-10, 0]], k.body);
    // Near arm, the big one.
    p.cap(-6, -44 + b, -14 - l * 3, -28 - up * 14, 5.6, 4.8, k.body, { grime: 0.08 });
    p.cap(-14 - l * 3, -28 - up * 14, fx, fy, 4.8, 4.2, k.body);
    p.ell(fx, fy + 2, 5, 4.6, k.accent, { grime: 0.15 });
    for (let d = 0; d < 3; d++) p.dot(fx - 3 + d * 2, fy + 6, R.bone[3]);
    // Head, thrust forward over the arm.
    const hx = -15 - l * 2;
    p.ell(hx, -43 + b, 6.5, 6, k.accent, { flat: 0.85 });
    p.rect(hx - 6, -47 + b, 10, 2, k.dark, { bevel: 1 });
    p.cap(hx - 2, -38 + b, hx - 6, -38 + b + l * 2, 2.4, 2, k.dark);
    for (const x of [-5, -3]) p.dot(hx + x, -39 + b, R.bone[4]);
    eyes(p, t, [[hx - 4, -45 + b], [hx - 1, -45 + b]], k.glow);
    if (k.has('horns')) {
      p.cap(-12, -48 + b, -8, -53 + b, 2, 1.4, R.bone);
      p.cap(-8, -53 + b, -10, -58 + b, 1.4, 0.5, R.bone);
      p.cap(-18, -48 + b, -21, -54 + b, 1.8, 1.2, R.bone, { bias: 0.1 });
      p.cap(-21, -54 + b, -18, -58 + b, 1.2, 0.4, R.bone);
    }
  },
};

/** Bat-winged glider. Feature: tail. */
export const flyer: Body = {
  left: 30, right: 30, height: 34, hover: 16, size: 1.25,
  draw(p, { t, attack }, k) {
    const flap = Math.sin(t * (attack ? 18 : 7));
    const l = lunge(attack);
    const ox = -l * 8, oy = l * 4;
    const wy = flap * 8;
    const wing = (side: number, ramp: typeof k.body, bias: number) => {
      const tip: [number, number] = [ox + side * 26, oy - 22 - wy * side * side];
      const mid: [number, number] = [ox + side * 15, oy - 26 - wy * 0.6];
      p.poly([[ox + side * 3, oy - 22], mid, tip, [ox + side * 22, oy - 12 - wy * 0.5], [ox + side * 15, oy - 15 - wy * 0.3], [ox + side * 9, oy - 11], [ox + side * 3, oy - 14]], ramp,
        { bias, normal: (x) => [Math.sin(x * 0.6) * 0.5, -0.3, 1], grime: 0.06 });
      p.line(ox + side * 3, oy - 22, ...mid, k.dark[0]!, { noLine: true });
      p.line(...mid, ...tip, k.dark[0]!, { noLine: true });
      p.line(...mid, ox + side * 15, oy - 15 - wy * 0.3, k.dark[1]!, { noLine: true });
    };
    wing(1, k.dark, -0.15);
    if (k.has('tail')) {
      p.cap(ox + 4, oy - 13, ox + 12, oy - 4 + Math.sin(t * 3) * 2, 1.6, 0.8, k.body);
      p.poly([[ox + 11, oy - 5], [ox + 15, oy - 4], [ox + 12, oy - 1]], k.accent);
    }
    p.ell(ox, oy - 17, 6, 7, k.body, { grime: 0.15 });
    p.ell(ox - 4, oy - 23, 4.6, 4.2, k.body);
    p.poly([[ox - 7, oy - 25], [ox - 6, oy - 32], [ox - 3, oy - 26]], k.body, { bias: 0.1 });
    p.poly([[ox - 3, oy - 26], [ox, oy - 32], [ox + 1, oy - 25]], k.dark);
    eyes(p, t, [[ox - 6, oy - 23], [ox - 4, oy - 23]], k.glow);
    p.dot(ox - 7, oy - 20, R.bone[4]);
    p.dot(ox - 5, oy - 20, R.bone[4]);
    p.cap(ox - 2, oy - 11, ox - 4, oy - 6, 1.2, 0.8, k.dark);
    p.cap(ox + 2, oy - 11, ox + 3, oy - 6, 1.2, 0.8, k.dark);
    wing(-1, k.body, 0.05);
  },
};

/** Rearing snake (Frost Serpent). */
export const serpent: Body = {
  left: 30, right: 26, height: 62,
  draw(p, { t, attack }, k) {
    const l = lunge(attack);
    const sway = Math.sin(t * 1.4) * 2;
    // Coils on the ground.
    p.ell(10, -5, 15, 5.5, k.dark, { flat: 0.7, bias: -0.1 });
    p.ell(4, -8, 12, 5, k.body, { flat: 0.7 });
    p.ell(14, -9, 8, 4, k.body, { flat: 0.7, bias: 0.05 });
    // The rising neck, segment by segment.
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) {
      const s = i / 8;
      pts.push([2 - s * 14 + Math.sin(s * 3 + t * 1.4) * 4 * (1 - s) + sway * s - l * 10 * s * s, -10 - s * 44 + l * 6 * s * s]);
    }
    for (let i = 0; i < 8; i++) {
      const r = 5.5 - i * 0.35;
      p.cap(...pts[i]!, ...pts[i + 1]!, r, r - 0.35, k.body, { grime: 0.06 });
      p.cap(pts[i]![0] - r * 0.45, pts[i]![1], pts[i + 1]![0] - r * 0.45, pts[i + 1]![1], r * 0.45, r * 0.4, k.accent, { noLine: true, bias: 0.1 });
    }
    const [hx, hy] = pts[8]!;
    // Hood frill and head.
    p.poly([[hx + 2, hy - 2], [hx + 9, hy - 9], [hx + 8, hy + 2], [hx + 11, hy + 6], [hx + 2, hy + 6]], k.accent, { normal: (x) => [Math.sin(x) * 0.4, 0, 1], bias: -0.1 });
    p.ell(hx - 2, hy, 6, 4.6, k.body, { flat: 0.85 });
    p.cap(hx - 4, hy + 1, hx - 11, hy + 2, 3.4, 2.2, k.body, { bias: 0.08 });
    p.cap(hx - 4, hy + 4, hx - 10, hy + 4 + l * 4, 2, 1.4, k.dark);
    p.dot(hx - 9, hy + 3, R.bone[4]);
    p.dot(hx - 7, hy + 3, R.bone[4]);
    eyes(p, t, [[hx - 5, hy - 1], [hx - 3, hy - 1]], k.glow);
    if (Math.sin(t * 3) > 0.3) p.line(hx - 11, hy + 3, hx - 15, hy + 4 + Math.sin(t * 9), [200, 60, 80]);
  },
};

/** Winged wyrm (Glacius). Feature: spikes. */
export const dragon: Body = {
  left: 44, right: 40, height: 84,
  draw(p, { t, attack }, k) {
    const b = beat(t, 1.2);
    const l = lunge(attack);
    const flap = Math.sin(t * 1.4) * 3;
    // Far wing, raised behind.
    p.poly([[4, -40 + b], [14, -78 + flap], [34, -72 + flap], [30, -58], [36, -48], [22, -44], [26, -36], [10, -32]], k.dark,
      { bias: -0.15, normal: (x) => [Math.sin(x * 0.5) * 0.5, -0.2, 1], grime: 0.05 });
    p.line(4, -40 + b, 14, -78 + flap, k.dark[0]!, { noLine: true });
    p.line(14, -78 + flap, 30, -58, k.dark[0]!, { noLine: true });
    p.line(14, -78 + flap, 22, -44, k.dark[0]!, { noLine: true });
    // Tail sweeping to the right.
    const ts = Math.sin(t * 1.1) * 3;
    p.cap(18, -14, 30, -10 + ts * 0.5, 6, 4, k.body);
    p.cap(30, -10 + ts * 0.5, 38, -4 + ts, 4, 2, k.body);
    p.poly([[37, -5 + ts], [42, -10 + ts], [41, -1 + ts]], k.accent);
    // Far legs, body, near hind leg.
    p.cap(-8, -16, -12, -2, 4, 3.2, k.dark, { bias: -0.2 });
    p.cap(14, -18, 16, -2, 5, 4, k.dark, { bias: -0.2 });
    p.ell(4, -22 + b, 18, 12, k.body, { flat: 0.8, grime: 0.08 });
    p.ell(2, -17 + b, 12, 6, k.accent, { flat: 0.6, bias: 0.05 });
    p.cap(12, -20, 18, -8, 6.5, 5, k.body);
    p.cap(18, -8, 15, -1, 4.5, 3.6, k.body);
    p.poly([[10, -3], [20, -3], [21, 0], [9, 0]], k.body);
    // Neck rising to the head, which drops forward to breathe.
    const hx = -26 - l * 8, hy = -58 + l * 10 + b;
    p.cap(-8, -28 + b, -18, -44 + b + l * 4, 7, 5.5, k.body, { grime: 0.06 });
    p.cap(-18, -44 + b + l * 4, hx + 4, hy + 2, 5.5, 4.6, k.body);
    p.cap(-11, -26 + b, -21, -42 + b + l * 4, 3, 2.5, k.accent, { noLine: true, bias: 0.1 });
    if (k.has('spikes')) {
      for (let i = 0; i < 6; i++) {
        const s = i / 5, x = -6 - s * 18, y = -34 - s * 22 + b + l * 4 * s;
        p.poly([[x, y], [x + 3, y - 6], [x + 4, y + 1]], k.accent);
      }
    }
    p.ell(hx, hy, 7, 5.6, k.body, { flat: 0.85 });
    p.cap(hx - 3, hy + 1, hx - 13, hy + 2, 3.6, 2.4, k.body, { bias: 0.08 });
    p.cap(hx - 3, hy + 4, hx - 12, hy + 5 + l * 5, 2.2, 1.6, k.dark);
    for (const [x1, y1, x2, y2] of [[hx + 3, hy - 4, hx + 12, hy - 12], [hx, hy - 4, hx + 6, hy - 13]] as const) p.cap(x1, y1, x2, y2, 1.6, 0.5, R.bone);
    eyes(p, t, [[hx - 5, hy - 2], [hx - 3, hy - 2]], k.glow);
    if (l > 0.3) for (let i = 0; i < 6; i++) p.glow(hx - 13 - i * 2, hy + 3 + ((i * 7) % 3) - 1, k.glow);
    // Near foreleg and folded near wing.
    p.cap(-10, -18, -14, -8, 4.6, 3.8, k.body);
    p.cap(-14, -8, -12, -1, 3.8, 3.2, k.body);
    for (let d = 0; d < 3; d++) p.dot(-16 + d * 2, 0, R.bone[3]);
    p.poly([[-2, -36 + b], [8, -48 + flap * 0.5], [22, -40], [16, -34], [20, -28], [4, -28]], k.body,
      { normal: (x) => [Math.sin(x * 0.6) * 0.5, -0.2, 1], bias: 0.05 });
    p.line(-2, -36 + b, 8, -48 + flap * 0.5, k.dark[1]!, { noLine: true });
    p.line(8, -48 + flap * 0.5, 16, -34, k.dark[1]!, { noLine: true });
  },
};

/** Giant insect (hive drones, spitters, guards, the Brood Matriarch). Features: wings, sac, armor, crown. */
export const insect: Body = {
  left: 30, right: 30, height: 36, size: 1.45,
  draw(p, { t, attack }, k) {
    const l = lunge(attack);
    const b = beat(t, 3);
    const leg = (x: number, ph: number, ramp: typeof k.body, far: boolean) => {
      const lift = Math.round(Math.sin(t * 4 + ph));
      p.line(x, -12 + b, x - 4, -18 + lift, ramp[far ? 1 : 2]!);
      p.line(x - 4, -18 + lift, x - 7 + (far ? 2 : 0), 0, ramp[far ? 1 : 2]!);
    };
    for (const [x, ph] of [[-6, 0], [2, 2], [10, 4]] as const) leg(x + 2, ph, k.dark, true);
    // Wings, buzzing.
    if (k.has('wings')) {
      const wy = Math.sin(t * 30) * 2;
      p.poly([[0, -18 + b], [16, -34 + wy], [24, -28 + wy], [6, -16 + b]], [k.accent[2]!, k.accent[3]!, k.accent[4]!], { noLine: true, dither: 1.2, bias: 0.3 });
      p.line(0, -18 + b, 16, -34 + wy, k.accent[1]!, { noLine: true });
    }
    // Abdomen, thorax, head.
    const armor = k.has('armor');
    p.ell(16, -14 + b, 12, 8, k.body, { flat: 0.8, grime: 0.08 });
    for (let x = 8; x <= 24; x += 4) p.line(x, -21 + b, x + 1, -7 + b, k.dark[1]!, { noLine: true });
    if (k.has('sac')) {
      p.ell(22, -10 + b, 6, 5, k.accent, { bias: 0.2 });
      const pulse = Math.sin(t * 3) > 0;
      p.glow(22, -11 + b, k.glow);
      if (pulse) { p.glow(21, -10 + b, k.glow); p.glow(23, -9 + b, k.glow); }
    }
    p.ell(1, -15 + b, 7, 6, armor ? k.accent : k.body, { flat: 0.8, rim: armor ? 1 : 0, rimRamp: k.dark });
    if (armor) for (let i = 0; i < 4; i++) p.poly([[-4 + i * 3, -20 + b], [-2 + i * 3, -26 + b], [i * 3, -20 + b]], k.accent);
    const hx = -9 - l * 6;
    p.ell(hx, -15 + b, 6, 5, k.body, { flat: 0.8 });
    const snap = l * 2 + Math.sin(t * 5) * 0.6;
    p.cap(hx - 4, -12 + b, hx - 10, -10 + b - snap, 1.6, 0.7, k.dark);
    p.cap(hx - 4, -12 + b, hx - 10, -12 + b + snap + 2, 1.6, 0.7, k.dark);
    p.line(hx - 2, -19 + b, hx - 8, -26 + b + Math.sin(t * 2), k.dark[2]!);
    p.line(hx, -19 + b, hx - 3, -27 + b + Math.sin(t * 2 + 1), k.dark[2]!);
    eyes(p, t, [[hx - 3, -16 + b], [hx - 1, -16 + b]], k.glow);
    if (k.has('crown')) {
      for (let i = 0; i < 4; i++) p.poly([[hx - 4 + i * 2.5, -19 + b], [hx - 3 + i * 2.5, -25 - (i % 2) * 2 + b], [hx - 2 + i * 2.5, -19 + b]], R.gold);
      p.glow(hx - 1, -22 + b, k.glow);
    }
    for (const [x, ph] of [[-6, 1], [2, 3], [10, 5]] as const) leg(x, ph, k.body, false);
  },
};
