/**
 * Animal-like hostiles: quadrupeds, brutes, bats, serpents, dragons and
 * insects. Each returns its idle and attack animation.
 */
import * as THREE from 'three';
import type { HostileLook, LookFeature } from '../../core';
import { Builder, glow, material, shade } from './builder';

export interface Rig {
  idle(t: number): void;
  attack(k: number): void;
}

type Has = (f: LookFeature) => boolean;

const ivory = () => material(0xf1e6cc, { roughness: 0.5 });

// ─── Quadruped (hounds, behemoths) ─────────────────────────────────────────

export function beast(b: Builder, look: HostileLook, boss: boolean, has: Has): Rig {
  const fur = material(look.color);
  const belly = material(shade(look.color, 1.25));
  const dark = material(shade(look.color, 0.55));
  const accent = material(look.accent);

  const torso = b.joint([0, 0.95, 0]);
  b.capsule(0.36, 0.75, fur, [0, 0, 0], torso, 8).rotation.z = Math.PI / 2;
  b.ball(0.42, fur, [0.42, 0.06, 0], torso, 9).scale.set(1, 1, 0.92); // chest
  b.capsule(0.28, 0.6, belly, [0.05, -0.16, 0], torso, 7).rotation.z = Math.PI / 2;
  // Neck and head with an opening jaw.
  const neck = b.joint([0.62, 0.2, 0], torso);
  b.cylinder(0.2, 0.26, 0.4, fur, [0.12, 0.08, 0], neck).rotation.z = -1.0;
  const head = b.joint([0.3, 0.22, 0], neck);
  b.box([0.42, 0.32, 0.34], fur, [0.1, 0, 0], head);
  b.box([0.3, 0.16, 0.24], dark, [0.38, -0.06, 0], head); // snout
  b.ball(0.05, material(0x111111), [0.53, -0.02, 0], head, 6); // nose
  const jaw = b.joint([0.18, -0.13, 0], head);
  b.box([0.34, 0.08, 0.2], dark, [0.14, -0.02, 0], jaw);
  for (const z of [0.07, -0.07]) b.cone(0.025, 0.08, ivory(), [0.28, 0.05, z], jaw, 4);
  for (const z of [0.12, -0.12]) b.cone(0.07, 0.18, fur, [-0.02, 0.22, z], head, 4).rotation.x = z > 0 ? -0.3 : 0.3; // ears
  b.eyes(0.29, 0.07, 0.11, 0.045, 0xffd84a, head);
  if (has('tusks') || boss) for (const z of [0.12, -0.12]) b.cone(0.04, 0.26, ivory(), [0.4, -0.08, z], head, 5).rotation.z = -2.2;
  if (has('horns')) for (const z of [0.1, -0.1]) b.cone(0.05, 0.3, accent, [0.0, 0.26, z], head, 5).rotation.z = 0.5;
  // Back ridge.
  if (has('spikes') || boss) {
    for (let i = 0; i < (boss ? 9 : 6); i++) {
      const x = -0.5 + i * (boss ? 0.14 : 0.18);
      b.cone(boss ? 0.09 : 0.06, boss ? 0.42 : 0.26, accent, [x, 0.34, 0], torso, 4).rotation.z = -0.25;
    }
  }
  if (boss) for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.cone(0.05, 0.22, accent, [-0.3 + Math.cos(a) * 0.4, 0.05 + Math.sin(a) * 0.25, Math.sin(a * 3) * 0.33], torso, 4)
      .rotation.set(Math.sin(a) * 0.8, 0, Math.cos(a) * 0.8);
  }
  // Tail: three segments that sway.
  const tail = [b.joint([-0.75, 0.1, 0], torso)];
  for (let i = 0; i < 3; i++) {
    const seg = tail[i]!;
    b.cylinder(0.07 - i * 0.018, 0.09 - i * 0.02, 0.28, fur, [-0.14, 0, 0], seg).rotation.z = Math.PI / 2;
    tail.push(b.joint([-0.28, 0, 0], seg));
  }
  // Legs: upper + lower with a paw.
  const legs = ([[0.45, 0.22], [0.45, -0.22], [-0.48, 0.22], [-0.48, -0.22]] as const).map(([x, z]) => {
    const hip = b.joint([x, 0.92, z]);
    const knee = b.limb(hip, 0.42, 0.11, fur, 0.085);
    const ankle = b.limb(knee, 0.4, 0.075, dark, 0.06);
    b.box([0.2, 0.08, 0.16], dark, [0.05, -0.02, 0], ankle);
    for (const dz of [-0.05, 0, 0.05]) b.cone(0.02, 0.07, ivory(), [0.16, -0.03, dz], ankle, 4).rotation.z = -Math.PI / 2;
    return { hip, knee, front: x > 0 };
  });

  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      const breath = Math.sin(t * 2.6);
      torso.position.y = 0.95 + breath * 0.02 - strike * 0.08;
      torso.rotation.z = strike * -0.12;
      torso.scale.set(1, 1 + breath * 0.02, 1 + breath * 0.025);
      neck.rotation.z = Math.sin(t * 0.9) * 0.08 - strike * 0.35;
      head.rotation.y = Math.sin(t * 0.5) * 0.15;
      jaw.rotation.z = -0.08 - Math.max(0, Math.sin(t * 1.3)) * 0.06 - strike * 0.55;
      tail.forEach((s, i) => { s.rotation.y = Math.sin(t * 3 - i * 0.6) * 0.25; s.rotation.z = 0.25 - i * 0.05; });
      for (const { hip, knee, front } of legs) {
        hip.rotation.z = (front ? -0.12 : 0.18) + (front ? strike * 0.5 : -strike * 0.2);
        knee.rotation.z = front ? 0.25 : -0.3;
      }
    },
  };
}

// ─── Brute (great apes of the ice) ─────────────────────────────────────────

export function brute(b: Builder, look: HostileLook, boss: boolean, has: Has): Rig {
  const fur = material(look.color, { roughness: 0.95 });
  const skin = material(look.accent);
  const dark = material(shade(look.accent, 0.6));
  const hips = b.joint([0, 0.8, 0]);
  const legs = [0.26, -0.26].map((z) => {
    const hip = b.joint([0, 0, z], hips);
    const knee = b.limb(hip, 0.42, 0.17, fur, 0.14);
    const ankle = b.limb(knee, 0.36, 0.13, fur, 0.1);
    b.box([0.34, 0.12, 0.24], skin, [0.08, -0.05, 0], ankle);
    return { hip, knee };
  });
  const torso = b.joint([0, 0.85, 0]);
  b.ball(0.55, fur, [0.05, 0.42, 0], torso, 10).scale.set(0.95, 1.05, 1.05);
  b.ball(0.32, skin, [0.32, 0.36, 0], torso, 8).scale.set(0.6, 1, 1.15); // chest
  for (let i = 0; i < 7; i++) b.cone(0.12, 0.3, fur, [-0.3 + (i % 3) * 0.1, 0.8 - i * 0.07, (i - 3) * 0.12], torso, 4).rotation.set((i - 3) * 0.3, 0, 0.9); // shaggy back
  const head = b.joint([0.38, 0.92, 0], torso);
  b.ball(0.2, fur, [0, 0, 0], head, 8);
  b.box([0.16, 0.18, 0.24], skin, [0.14, -0.04, 0], head); // face
  b.box([0.05, 0.05, 0.26], dark, [0.21, 0.04, 0], head); // brow
  b.eyes(0.22, 0.0, 0.07, 0.03, 0x7ad0ff, head);
  const jaw = b.joint([0.12, -0.1, 0], head);
  b.box([0.14, 0.06, 0.2], dark, [0.06, -0.02, 0], jaw);
  for (const z of [0.06, -0.06]) b.cone(0.022, 0.07, ivory(), [0.1, 0.03, z], jaw, 4);
  if (has('horns') || boss) for (const z of [0.16, -0.16]) b.cone(0.06, 0.34, material(0xe8e2d0), [0, 0.12, z], head, 5).rotation.set(z > 0 ? -0.9 : 0.9, 0, 0.3);
  // Huge arms that reach the ground.
  const arms = [0.55, -0.55].map((z) => {
    const shoulder = b.joint([0.12, 0.72, z], torso);
    b.ball(0.22, fur, [0, 0, 0], shoulder, 8);
    const elbow = b.limb(shoulder, 0.55, 0.17, fur, 0.15);
    const wrist = b.limb(elbow, 0.5, 0.14, fur, 0.12);
    b.ball(0.16, skin, [0.03, -0.06, 0], wrist, 7).scale.set(1.1, 0.8, 1);
    return { shoulder, elbow };
  });
  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      const breath = Math.sin(t * 1.8);
      torso.rotation.z = -0.35 + breath * 0.03 - strike * 0.3;
      torso.scale.setScalar(1 + breath * 0.015);
      head.rotation.z = 0.3 + Math.sin(t * 0.7) * 0.06;
      head.rotation.y = Math.sin(t * 0.4) * 0.25;
      jaw.rotation.z = -0.05 - strike * 0.4 - Math.max(0, Math.sin(t * 0.9)) * 0.05;
      arms.forEach(({ shoulder, elbow }, i) => {
        shoulder.rotation.z = 0.2 + Math.sin(t * 1.8 + i) * 0.05 + strike * 2.2;
        shoulder.rotation.x = (i ? -1 : 1) * 0.15;
        elbow.rotation.z = 0.3 - strike * 0.6;
      });
      legs.forEach(({ hip, knee }) => { hip.rotation.z = 0.35; knee.rotation.z = -0.45; });
      hips.position.y = 0.72 + breath * 0.01;
      torso.position.y = 0.76 + breath * 0.01;
    },
  };
}

// ─── Bat (cave gliders) ────────────────────────────────────────────────────

export function bat(b: Builder, look: HostileLook, _boss: boolean, has: Has): Rig {
  const fur = material(look.color);
  const skin = material(shade(look.color, 1.15), { side: THREE.DoubleSide, roughness: 0.6, emissive: look.accent, emissiveIntensity: 0.12 });
  const accent = material(look.accent);
  const body = b.joint([0, 1.5, 0]);
  b.ball(0.3, fur, [0, 0, 0], body, 9).scale.set(1.2, 0.9, 0.9);
  const head = b.joint([0.32, 0.12, 0], body);
  b.ball(0.2, fur, [0, 0, 0], head, 8);
  b.cone(0.09, 0.14, material(shade(look.color, 0.7)), [0.18, -0.03, 0], head, 5).rotation.z = -Math.PI / 2; // snout
  for (const z of [0.1, -0.1]) b.cone(0.08, 0.32, fur, [-0.02, 0.24, z], head, 4).rotation.x = z > 0 ? -0.35 : 0.35; // big ears
  b.eyes(0.15, 0.05, 0.08, 0.04, look.accent, head);
  for (const z of [0.04, -0.04]) b.cone(0.015, 0.06, ivory(), [0.17, -0.1, z], head, 4).rotation.z = Math.PI; // fangs
  // Membrane wings with finger bones: an arm joint and a fan of points.
  const wings = [1, -1].map((side) => {
    const shoulder = b.joint([0.02, 0.08, 0.2 * side], body);
    const pts: [number, number, number][] = [[0, 0, 0], [0.3, 0.25, 0.55 * side], [0.15, 0.1, 1.15 * side], [-0.2, -0.15, 1.05 * side], [-0.3, -0.25, 0.55 * side], [-0.25, -0.15, 0.1 * side]];
    b.membrane(pts, skin, [0, 0, 0], shoulder);
    for (const p of pts.slice(1, 4)) {
      const len = Math.hypot(...p);
      const bone = b.cylinder(0.018, 0.012, len, accent, [p[0] / 2, p[1] / 2, p[2] / 2], shoulder, 4);
      bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...p).normalize());
    }
    return { shoulder, side };
  });
  for (const z of [0.08, -0.08]) b.cone(0.03, 0.22, accent, [-0.1, -0.28, z], body, 4).rotation.z = Math.PI; // dangling claws
  if (has('tail')) b.cone(0.05, 0.4, fur, [-0.4, -0.05, 0], body, 4).rotation.z = Math.PI / 2;
  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      const flap = Math.sin(t * 11);
      body.position.y = 1.45 + Math.sin(t * 2.4) * 0.12 - flap * 0.03;
      body.rotation.z = -0.1 - strike * 0.5;
      head.rotation.z = Math.sin(t * 1.5) * 0.1;
      for (const { shoulder, side } of wings) {
        shoulder.rotation.x = side * (flap * 0.75 - 0.1);
        shoulder.rotation.z = strike * 0.4;
      }
    },
  };
}

// ─── Serpent (frost serpents) ──────────────────────────────────────────────

export function serpent(b: Builder, look: HostileLook, boss: boolean, has: Has): Rig {
  const scale = material(look.color, { roughness: 0.4, metalness: 0.15 });
  const belly = material(shade(look.color, 1.35));
  const accent = material(look.accent, { roughness: 0.3 });
  const n = 13;
  const segs: THREE.Group[] = [];
  for (let i = 0; i < n; i++) {
    const g = b.joint([0, 0, 0]);
    const r = 0.21 - Math.abs(i - 3) * 0.012 - (i > 6 ? (i - 6) * 0.02 : 0);
    b.ball(r, scale, [0, 0, 0], g, 8).scale.set(1.3, 0.9, 1);
    b.ball(r * 0.85, belly, [0, -r * 0.25, 0], g, 6).scale.set(1.25, 0.6, 0.9);
    if (i % 2 === 0 && i < 11) b.cone(0.05, 0.16, accent, [0, r * 0.9, 0], g, 4); // dorsal fin spikes
    segs.push(g);
  }
  // Head on the first segment.
  const head = b.joint([0, 0, 0]);
  b.box([0.42, 0.22, 0.3], scale, [0.12, 0, 0], head);
  b.box([0.22, 0.1, 0.22], belly, [0.24, -0.08, 0], head);
  const jaw = b.joint([0.08, -0.08, 0], head);
  b.box([0.34, 0.06, 0.24], belly, [0.14, -0.03, 0], jaw);
  for (const z of [0.08, -0.08]) b.cone(0.022, 0.09, ivory(), [0.25, 0.03, z], jaw, 4);
  b.eyes(0.22, 0.08, 0.12, 0.04, 0xfff27a, head);
  for (const z of [0.15, -0.15]) b.membrane([[0, 0, 0], [-0.32, 0.22, z * 1.6], [-0.36, -0.05, z * 1.4]], material(look.accent, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), [0.02, 0.05, z * 0.3], head); // frills
  if (boss || has('horns')) for (const z of [0.08, -0.08]) b.cone(0.04, 0.3, accent, [-0.05, 0.18, z], head, 5).rotation.z = 0.9;
  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      // An S-curve that rises into the head, swaying.
      segs.forEach((g, i) => {
        const u = i / (n - 1);
        // Front third rears up; the rest lies on the ground in a slithering S.
        const x = 0.6 - u * 1.7 + strike * 0.35 * (1 - u);
        const rise = Math.max(0, 1 - u * 2);
        const y = 0.2 + rise * rise * (0.85 + strike * 0.15) + Math.sin(t * 2 - i * 0.7) * 0.02;
        const z = Math.sin(u * Math.PI * 1.6 - t * 1.4) * 0.45 * Math.min(1, u * 2.5);
        g.position.set(x, y, z);
      });
      const top = segs[0]!.position;
      head.position.set(top.x + 0.1, top.y + 0.04, top.z);
      head.rotation.z = -0.25 - strike * 0.3 + Math.sin(t * 1.3) * 0.05;
      head.rotation.y = Math.sin(t * 0.8) * 0.2;
      jaw.rotation.z = -0.1 - strike * 0.6 - Math.max(0, Math.sin(t * 1.1)) * 0.08;
    },
  };
}

// ─── Dragon (ice wyrm) ─────────────────────────────────────────────────────

export function dragon(b: Builder, look: HostileLook, boss: boolean, has: Has): Rig {
  const hide = material(look.color, { roughness: 0.45, metalness: 0.15 });
  const belly = material(shade(look.color, 1.3));
  const accent = material(look.accent, { roughness: 0.3 });
  const wingMat = material(look.accent, { side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
  const torso = b.joint([0, 1.05, 0]);
  b.ball(0.55, hide, [0, 0, 0], torso, 10).scale.set(1.5, 0.85, 0.9);
  b.ball(0.42, belly, [0.1, -0.2, 0], torso, 8).scale.set(1.4, 0.6, 0.8);
  for (let i = 0; i < 6; i++) b.cone(0.07, 0.24, accent, [-0.5 + i * 0.2, 0.45, 0], torso, 4).rotation.z = -0.3;
  // Neck chain and head.
  const neck = [b.joint([0.65, 0.2, 0], torso)];
  for (let i = 0; i < 3; i++) {
    b.ball(0.2 - i * 0.025, hide, [0.1, 0, 0], neck[i]!, 7);
    b.cone(0.04, 0.14, accent, [0.1, 0.18 - i * 0.02, 0], neck[i]!, 4);
    neck.push(b.joint([0.2, 0.08, 0], neck[i]!));
  }
  const head = neck[3]!;
  b.box([0.48, 0.26, 0.32], hide, [0.18, 0, 0], head);
  b.box([0.26, 0.12, 0.24], belly, [0.36, -0.08, 0], head);
  const jaw = b.joint([0.14, -0.12, 0], head);
  b.box([0.4, 0.07, 0.26], belly, [0.18, -0.02, 0], jaw);
  for (const z of [0.09, -0.09]) b.cone(0.025, 0.1, ivory(), [0.32, 0.04, z], jaw, 4);
  for (const z of [0.1, -0.1]) b.cone(0.05, 0.42, accent, [-0.06, 0.18, z], head, 5).rotation.set(z > 0 ? -0.3 : 0.3, 0, 1.05);
  b.eyes(0.32, 0.07, 0.13, 0.045, 0xfff27a, head);
  // Tail.
  const tail = [b.joint([-0.8, -0.05, 0], torso)];
  for (let i = 0; i < 4; i++) {
    b.ball(0.2 - i * 0.04, hide, [-0.12, 0, 0], tail[i]!, 7).scale.set(1.5, 1, 1);
    tail.push(b.joint([-0.26, 0, 0], tail[i]!));
  }
  b.cone(0.1, 0.3, accent, [-0.1, 0, 0], tail[4]!, 4).rotation.z = Math.PI / 2;
  // Legs.
  const legs = ([[0.45, 0.32], [0.45, -0.32], [-0.4, 0.34], [-0.4, -0.34]] as const).map(([x, z]) => {
    const hip = b.joint([x, 0.95, z]);
    const knee = b.limb(hip, 0.42, 0.14, hide, 0.1);
    const ankle = b.limb(knee, 0.42, 0.09, hide, 0.07);
    b.box([0.26, 0.08, 0.2], hide, [0.06, -0.02, 0], ankle);
    for (const dz of [-0.06, 0, 0.06]) b.cone(0.025, 0.09, ivory(), [0.2, -0.03, dz], ankle, 4).rotation.z = -Math.PI / 2;
    return { hip, knee, front: x > 0 };
  });
  // Wings: bony arm with a membrane.
  const wings = [1, -1].map((side) => {
    const shoulder = b.joint([0.25, 0.35, 0.3 * side], torso);
    const tipZ = (boss ? 2.0 : 1.5) * side;
    b.membrane([[0, 0, 0], [-0.1, 0.55, tipZ * 0.55], [-0.4, 0.4, tipZ], [-0.8, 0.0, tipZ * 0.85], [-0.9, -0.15, tipZ * 0.4], [-0.55, -0.1, 0.1 * side]], wingMat, [0, 0, 0], shoulder);
    b.cylinder(0.03, 0.05, Math.hypot(0.4, 0.4, tipZ), accent, [-0.2, 0.2, tipZ / 2], shoulder, 5)
      .quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.4, 0.4, tipZ).normalize());
    return { shoulder, side };
  });
  if (has('spikes')) for (let i = 0; i < 5; i++) b.cone(0.06, 0.3, material(0xeaf6ff, { transparent: true, opacity: 0.85 }), [-0.3 + i * 0.15, 0.4, (i % 2 ? 1 : -1) * 0.25], torso, 4).rotation.x = (i % 2 ? -0.5 : 0.5);
  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      const breath = Math.sin(t * 1.5);
      torso.position.y = 1.05 + breath * 0.03;
      torso.rotation.z = -strike * 0.15;
      torso.scale.set(1, 1 + breath * 0.02, 1 + breath * 0.03);
      neck.slice(0, 3).forEach((j, i) => { j.rotation.z = 0.35 - i * 0.05 + Math.sin(t * 1.2 - i * 0.4) * 0.07 - strike * 0.25; });
      head.rotation.z = -0.5 - strike * 0.2;
      head.rotation.y = Math.sin(t * 0.6) * 0.2;
      jaw.rotation.z = -0.08 - strike * 0.7;
      tail.slice(0, 4).forEach((j, i) => { j.rotation.y = Math.sin(t * 1.4 - i * 0.6) * 0.18; j.rotation.z = -0.15; });
      for (const { shoulder, side } of wings) shoulder.rotation.x = side * (Math.sin(t * 1.5) * 0.18 - 0.05 - strike * 0.4);
      for (const { hip, knee, front } of legs) { hip.rotation.z = front ? -0.15 - strike * 0.3 : 0.25; knee.rotation.z = front ? 0.3 : -0.35; }
    },
  };
}

// ─── Insect (hive) ─────────────────────────────────────────────────────────

export function insect(b: Builder, look: HostileLook, _boss: boolean, has: Has): Rig {
  const shell = material(look.color, { roughness: 0.35, metalness: 0.2 });
  const joint = material(shade(look.color, 0.6));
  const accent = material(look.accent, { roughness: 0.4 });
  const glowAcc = glow(look.accent, 1.1);
  const queen = has('crown');
  const armored = has('armor');
  const thorax = b.joint([0, 0.95, 0]);
  b.ball(0.3, shell, [0, 0, 0], thorax, 8).scale.set(1.1, 0.85, 0.95);
  if (armored) b.ball(0.38, accent, [-0.02, 0.1, 0], thorax, 7).scale.set(1.1, 0.55, 1.05); // carapace plate
  // Abdomen: segmented, glowing bands; the queen's is huge.
  const abdomen = b.joint([-0.28, 0.02, 0], thorax);
  const ab = queen ? 1.9 : has('sac') ? 1.25 : 1;
  for (let i = 0; i < 4; i++) {
    const r = (0.3 - Math.abs(i - 1.3) * 0.05) * ab;
    b.ball(r, i % 2 ? shell : joint, [-0.12 - i * 0.2 * ab, -0.04 * i, 0], abdomen, 8).scale.set(0.8, 0.85, 0.9);
  }
  if (has('sac') || queen) b.ball(0.18 * ab, material(look.accent, { emissive: look.accent, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }), [-0.45 * ab, 0.02, 0], abdomen, 8);
  for (let i = 0; i < 3; i++) b.torus(0.2 * ab - i * 0.03, 0.015, glowAcc, [-0.22 - i * 0.2 * ab, -0.04 * i, 0], abdomen).rotation.y = Math.PI / 2;
  // Head with mandibles and antennae.
  const head = b.joint([0.32, 0.12, 0], thorax);
  b.ball(0.2, shell, [0.05, 0, 0], head, 8).scale.set(1.15, 0.9, 1);
  b.eyes(0.17, 0.06, 0.1, 0.06, look.accent, head);
  const mandibles = [1, -1].map((side) => {
    const m = b.joint([0.2, -0.08, 0.07 * side], head);
    b.cone(0.04, 0.26, accent, [0.11, 0, 0], m, 4).rotation.set(0, 0, -Math.PI / 2);
    return { m, side };
  });
  const antennae = [1, -1].map((side) => {
    const a = b.joint([0.12, 0.14, 0.07 * side], head);
    b.cylinder(0.01, 0.014, 0.4, joint, [0.08, 0.18, 0], a, 4).rotation.z = -0.4;
    b.ball(0.025, glowAcc, [0.17, 0.37, 0], a, 4);
    return a;
  });
  if (queen) for (let i = 0; i < 5; i++) b.cone(0.05, 0.26, glow(look.accent, 1.4), [0.0, 0.18, (i - 2) * 0.08], head, 4).rotation.x = (i - 2) * 0.2; // crown
  // Six jointed legs.
  const legs = [-1, 0, 1].flatMap((row) => [1, -1].map((side) => {
    const hip = b.joint([row * 0.18, -0.05, 0.2 * side], thorax);
    const knee = b.limb(hip, 0.4, 0.045, joint, 0.04);
    b.limb(knee, 0.5, 0.035, shell, 0.02);
    return { hip, knee, row, side };
  }));
  // Wings (spitters): translucent, buzzing.
  const wings = has('wings') ? [1, -1].map((side) => {
    const w = b.joint([0, 0.22, 0.1 * side], thorax);
    b.membrane([[0, 0, 0], [-0.5, 0.15, 0.25 * side], [-0.85, 0.05, 0.18 * side], [-0.6, -0.02, 0.04 * side]], material(0xe8fff0, { transparent: true, opacity: 0.45, side: THREE.DoubleSide }), [0, 0, 0], w);
    return { w, side };
  }) : [];
  let strike = 0;
  const lift = has('wings') ? 0.5 : 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      const breath = Math.sin(t * 3.2);
      thorax.position.y = 0.95 + lift + breath * 0.015 + (lift ? Math.sin(t * 2.5) * 0.08 : 0);
      thorax.rotation.z = (queen ? -0.15 : -0.05) - strike * 0.35;
      abdomen.rotation.z = 0.15 + breath * 0.03 + strike * 0.2;
      abdomen.scale.setScalar(1 + breath * 0.02);
      head.rotation.y = Math.sin(t * 0.9) * 0.2;
      for (const { m, side } of mandibles) m.rotation.y = side * (0.35 - Math.abs(Math.sin(t * 4)) * 0.2 + strike * 0.5);
      antennae.forEach((a, i) => { a.rotation.x = Math.sin(t * 2.3 + i) * 0.25; });
      for (const { hip, knee, row, side } of legs) {
        const step = Math.sin(t * 5 + row * 2 + (side > 0 ? 0 : Math.PI)) * 0.08;
        hip.rotation.x = side * (-1.1 + step) ;
        hip.rotation.z = row * 0.45 + (row === 1 ? -strike * 0.9 : 0);
        knee.rotation.x = side * (1.8 + (lift ? 0.6 : 0));
      }
      for (const { w, side } of wings) w.rotation.x = side * (Math.sin(t * 40) * 0.35 + 0.2);
    },
  };
}
