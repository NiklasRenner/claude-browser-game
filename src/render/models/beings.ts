/**
 * Other hostiles: oozes, armed humanoids, nanite husks, plasma elementals,
 * rock golems, wraiths and wisps. Each returns its idle and attack animation.
 */
import * as THREE from 'three';
import type { HostileLook, LookFeature } from '../../core';
import { Builder, glow, material, metal, shade } from './builder';
import type { Rig } from './creatures';

type Has = (f: LookFeature) => boolean;

// ─── Ooze ──────────────────────────────────────────────────────────────────

export function blob(b: Builder, look: HostileLook): Rig {
  const goo = material(look.color, { transparent: true, opacity: 0.78, roughness: 0.15, flatShading: false, emissive: look.color, emissiveIntensity: 0.15 });
  const core = glow(look.accent, 1.2);
  const body = b.joint([0, 0.55, 0]);
  b.ball(0.7, goo, [0, 0, 0], body, 16).scale.set(1, 0.78, 1);
  const nucleus = b.ball(0.2, core, [0, -0.02, 0], body, 8);
  const bubbles = Array.from({ length: 6 }, (_, i) => b.ball(0.05 + (i % 3) * 0.02, material(0xffffff, { transparent: true, opacity: 0.5 }), [0, 0, 0], body, 5));
  // Pseudopods along the ground.
  const pods = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const p = b.joint([Math.cos(a) * 0.55, -0.32, Math.sin(a) * 0.55], body);
    b.ball(0.18, goo, [0, 0, 0], p, 8).scale.set(1.4, 0.5, 1);
    return p;
  });
  // Eye stalks.
  const stalks = [0.18, -0.18].map((z) => {
    const s = b.joint([0.32, 0.35, z], body);
    b.cylinder(0.03, 0.04, 0.3, goo, [0, 0.15, 0], s, 5);
    b.ball(0.07, material(0xf8f8f0), [0, 0.33, 0], s, 7);
    b.ball(0.035, material(0x111111), [0.05, 0.34, 0], s, 5);
    return s;
  });
  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      const s = Math.sin(t * 3);
      body.scale.set(1 + s * 0.05 + strike * 0.2, 1 - s * 0.07 - strike * 0.15, 1 + s * 0.05);
      nucleus.position.set(Math.sin(t * 0.8) * 0.12, Math.sin(t * 1.3) * 0.08, Math.cos(t * 0.8) * 0.12);
      bubbles.forEach((bb, i) => {
        const u = ((t * 0.25 + i / bubbles.length) % 1);
        bb.position.set(Math.sin(i * 2.1) * 0.35, -0.4 + u * 0.8, Math.cos(i * 1.7) * 0.35);
        bb.scale.setScalar(Math.sin(u * Math.PI));
      });
      pods.forEach((p, i) => { p.scale.setScalar(1 + Math.sin(t * 2 + i * 1.3) * 0.2); });
      stalks.forEach((st, i) => { st.rotation.x = Math.sin(t * 1.7 + i * 2) * 0.3; st.rotation.z = -0.2 - Math.sin(t * 1.1 + i) * 0.15; });
    },
  };
}

// ─── Humanoids (raiders, marauders, the admiral, leeches) ──────────────────

export function humanoid(b: Builder, look: HostileLook, boss: boolean, has: Has): Rig {
  const main = material(look.color, { roughness: 0.6 });
  const dark = material(shade(look.color, 0.55));
  const accent = material(look.accent, { roughness: 0.5 });
  const armorMat = metal(shade(look.color, 1.2));
  const pale = has('tendrils');
  const skin = material(pale ? 0xd8d0dc : 0xb88a6a, { roughness: 0.6 });
  const hips = b.joint([0, 0.95, 0]);
  const legs = [0.13, -0.13].map((z) => {
    const hip = b.joint([0, 0, z], hips);
    const knee = b.limb(hip, 0.44, 0.1, dark, 0.09);
    const ankle = b.limb(knee, 0.42, 0.085, dark, 0.075);
    b.box([0.3, 0.13, 0.16], material(0x15161a), [0.06, -0.05, 0], ankle);
    if (has('armor') || boss) b.box([0.1, 0.18, 0.15], armorMat, [0.09, 0.05, 0], knee);
    return { hip, knee };
  });
  const torso = b.joint([0, 1.0, 0]);
  b.cylinder(0.27, 0.21, 0.55, main, [0, 0.28, 0], torso, 8).scale.set(0.72, 1, 1);
  b.box([0.24, 0.08, 0.44], accent, [0, 0.0, 0], torso); // belt
  if (has('armor')) {
    b.box([0.1, 0.4, 0.42], armorMat, [0.16, 0.3, 0], torso);
    b.box([0.1, 0.38, 0.4], armorMat, [-0.16, 0.3, 0], torso);
  }
  if (has('coat')) {
    // Long coat with tails and gold epaulettes.
    b.cylinder(0.24, 0.36, 0.75, main, [-0.02, -0.18, 0], torso, 8).scale.set(0.75, 1, 1);
    for (const z of [0.31, -0.31]) b.box([0.16, 0.05, 0.14], glow(look.accent, 0.6), [0, 0.56, z], torso);
    for (let i = 0; i < 4; i++) b.ball(0.022, glow(look.accent, 1), [0.19, 0.42 - i * 0.12, 0.05], torso, 4);
  }
  // Leech: tendrils from the back that writhe (three segments each).
  const tendrils = pale ? Array.from({ length: 4 }, (_, i) => {
    const segs = [b.joint([-0.15, 0.4 - i * 0.08, (i - 1.5) * 0.12], torso)];
    for (let k = 0; k < 3; k++) {
      b.cylinder(0.035 - k * 0.008, 0.05 - k * 0.01, 0.3, main, [0, -0.15, 0], segs[k]!, 5);
      segs.push(b.joint([0, -0.3, 0], segs[k]!));
    }
    return segs;
  }) : [];
  // Head.
  const neck = b.joint([0, 0.62, 0], torso);
  b.cylinder(0.07, 0.08, 0.12, skin, [0, -0.03, 0], neck, 6);
  const head = b.joint([0, 0.05, 0], neck);
  b.ball(0.16, skin, [0, 0.12, 0], head, 10).scale.set(0.95, 1.1, 0.9);
  b.eyes(0.13, 0.14, 0.055, 0.025, boss ? look.accent : 0xff4040, head);
  if (has('helmet')) {
    b.ball(0.185, armorMat, [-0.01, 0.15, 0], head, 9).scale.set(1, 1.05, 0.98);
    b.box([0.04, 0.07, 0.25], glow(look.accent, 1.5), [0.16, 0.13, 0], head); // visor
  } else if (has('coat')) {
    b.cylinder(0.2, 0.2, 0.05, dark, [0, 0.27, 0], head, 10); // officer's cap
    b.cylinder(0.15, 0.17, 0.12, main, [0, 0.33, 0], head, 10);
    b.box([0.03, 0.04, 0.08], glow(look.accent, 1.2), [0.16, 0.32, 0], head);
  } else if (!pale) {
    b.ball(0.165, material(0x2a1e16), [-0.02, 0.18, 0], head, 8).scale.set(1, 0.8, 0.95);
  }
  if (boss && !has('coat')) for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.cone(0.04, 0.16, glow(look.accent, 1.2), [Math.cos(a) * 0.12, 0.48, Math.sin(a) * 0.12], head, 4);
  }
  // Arms with gear.
  const arms = [0.28, -0.28].map((z, i) => {
    const shoulder = b.joint([0, 0.5, z], torso);
    b.ball(0.1, has('armor') ? armorMat : main, [0, 0, 0], shoulder, 7);
    const elbow = b.limb(shoulder, 0.3, 0.075, main, 0.065);
    const wrist = b.limb(elbow, 0.28, 0.065, pale ? skin : dark, 0.055);
    b.ball(0.065, pale ? skin : material(0x1e1f24), [0, -0.05, 0], wrist, 6);
    const hand = b.joint([0, -0.08, 0], wrist);
    if (i === 0 && has('baton')) {
      b.cylinder(0.03, 0.03, 0.5, metal(0x3a3e46), [0, -0.2, 0], hand, 6);
      b.cylinder(0.035, 0.035, 0.14, glow(look.accent, 1.6), [0, -0.4, 0], hand, 6);
    }
    if (i === 0 && has('blade')) {
      b.box([0.04, 0.85, 0.1], glow(look.accent, 1.1), [0, -0.5, 0], hand);
      b.box([0.14, 0.04, 0.12], metal(0x2a2c30), [0, -0.07, 0], hand);
    }
    if (i === 0 && has('staff')) {
      b.cylinder(0.025, 0.025, 1.7, metal(0x2a2c30), [0, -0.3, 0], hand, 6);
      b.ball(0.09, glow(look.accent, 2), [0, 0.6, 0], hand, 6);
    }
    if (i === 1 && has('shield')) {
      const sh = b.box([0.06, 0.7, 0.48], metal(shade(look.color, 1.4)), [0.06, -0.05, 0.06], wrist);
      sh.rotation.z = -1.9; // stays upright in the guard pose below
      b.box([0.02, 0.5, 0.06], glow(look.accent, 1.3), [0.04, 0, 0], sh);
    }
    return { shoulder, elbow };
  });
  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      const breath = Math.sin(t * 2);
      torso.scale.set(1 + breath * 0.01, 1 + breath * 0.01, 1 + breath * 0.015);
      torso.rotation.z = (pale ? -0.3 : -0.04) - strike * 0.2;
      head.rotation.y = Math.sin(t * 0.5) * 0.2;
      head.rotation.z = pale ? 0.25 : 0;
      legs.forEach(({ hip, knee }, i) => { hip.rotation.z = 0.12 + (i ? -0.04 : 0.04); knee.rotation.z = -0.22; });
      const [front, back] = arms as [typeof arms[0], typeof arms[0]];
      front.shoulder.rotation.z = 0.3 + Math.sin(t * 2) * 0.04 + strike * 1.7;
      front.elbow.rotation.z = 0.6 - strike * 0.5;
      back.shoulder.rotation.z = (has('shield') ? 0.5 : 0.15) + Math.sin(t * 2 + 1) * 0.03;
      back.shoulder.rotation.y = has('shield') ? -0.35 : 0;
      back.elbow.rotation.z = has('shield') ? 1.4 : 0.2;
      tendrils.forEach((segs, i) => segs.forEach((s, k) => {
        s.rotation.z = (k === 0 ? -0.5 : 0.25) + Math.sin(t * 2.5 - k * 0.8 + i) * 0.35 + strike * (k === 0 ? 1.6 : 0);
        s.rotation.x = Math.sin(t * 1.7 + i * 1.3 + k) * 0.3;
      }));
    },
  };
}

// ─── Nanite husk (a robotic skeleton) ──────────────────────────────────────

export function husk(b: Builder, look: HostileLook): Rig {
  const frame = metal(look.color, { roughness: 0.3 });
  const dark = metal(shade(look.color, 0.45));
  const core = glow(look.accent, 2);
  const hips = b.joint([0, 0.95, 0]);
  b.box([0.14, 0.1, 0.36], dark, [0, 0, 0], hips);
  const legs = [0.13, -0.13].map((z) => {
    const hip = b.joint([0, 0, z], hips);
    const knee = b.limb(hip, 0.45, 0.05, frame);
    b.ball(0.06, core, [0, 0, 0], knee, 5);
    const ankle = b.limb(knee, 0.42, 0.045, frame);
    b.box([0.24, 0.06, 0.12], dark, [0.06, -0.03, 0], ankle);
    return { hip, knee };
  });
  const torso = b.joint([0, 1.0, 0]);
  b.cylinder(0.04, 0.04, 0.5, dark, [0, 0.25, 0], torso, 6); // spine
  for (let i = 0; i < 4; i++) b.torus(0.15 - Math.abs(i - 1.5) * 0.02, 0.018, frame, [0, 0.18 + i * 0.1, 0], torso).rotation.x = Math.PI / 2; // ribs
  const heart = b.ball(0.08, core, [0, 0.33, 0], torso, 6);
  b.box([0.2, 0.08, 0.5], frame, [0, 0.52, 0], torso); // shoulder bar
  const head = b.joint([0, 0.66, 0], torso);
  b.box([0.22, 0.2, 0.18], frame, [0.02, 0.06, 0], head);
  b.box([0.08, 0.05, 0.16], core, [0.13, 0.08, 0], head); // eye slit
  b.box([0.1, 0.05, 0.14], dark, [0.08, -0.06, 0], head); // jaw
  b.cylinder(0.006, 0.006, 0.2, dark, [-0.03, 0.25, 0.06], head, 3);
  const arms = [0.27, -0.27].map((z) => {
    const shoulder = b.joint([0, 0.52, z], torso);
    b.ball(0.06, core, [0, 0, 0], shoulder, 5);
    const elbow = b.limb(shoulder, 0.32, 0.04, frame);
    const wrist = b.limb(elbow, 0.3, 0.035, frame);
    // Drill arm on the front side.
    if (z > 0) {
      b.cylinder(0.08, 0.08, 0.1, dark, [0, -0.04, 0], wrist, 6);
      const drill = b.cone(0.07, 0.3, metal(0xc8ccd4), [0, -0.24, 0], wrist, 6);
      drill.rotation.x = Math.PI;
      return { shoulder, elbow, drill };
    }
    for (const dz of [-0.03, 0.03]) b.box([0.02, 0.12, 0.02], frame, [0.02, -0.06, dz], wrist);
    return { shoulder, elbow, drill: null };
  });
  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      const twitch = Math.sin(t * 13) > 0.92 ? 0.08 : 0;
      head.rotation.y = Math.sin(t * 0.7) * 0.3 + twitch;
      head.rotation.z = -0.1 + twitch;
      torso.rotation.z = -0.12 - strike * 0.25;
      heart.scale.setScalar(1 + Math.max(0, Math.sin(t * 4)) * 0.4);
      legs.forEach(({ hip, knee }) => { hip.rotation.z = 0.15; knee.rotation.z = -0.3; });
      arms.forEach(({ shoulder, elbow, drill }, i) => {
        shoulder.rotation.z = (i ? 0.2 : 0.5) + Math.sin(t * 1.8 + i) * 0.06 + (drill ? strike * 1.3 : 0);
        elbow.rotation.z = 0.5;
        if (drill) drill.rotation.y = t * (6 + strike * 30);
      });
    },
  };
}

// ─── Plasma elemental ──────────────────────────────────────────────────────

export function elemental(b: Builder, look: HostileLook): Rig {
  const outer = glow(look.color, 1.3, { transparent: true, opacity: 0.85 });
  const inner = glow(look.accent, 2.4);
  const body = b.joint([0, 1.0, 0]);
  const flames = Array.from({ length: 7 }, (_, i) => {
    const f = b.joint([Math.cos(i * 0.9) * 0.12, -0.25 + i * 0.12, Math.sin(i * 0.9) * 0.12], body);
    b.cone(0.3 - i * 0.03, 0.55, i % 2 ? inner : outer, [0, 0, 0], f, 5);
    return f;
  });
  const head = b.joint([0.05, 0.75, 0], body);
  b.ball(0.2, outer, [0, 0, 0], head, 7);
  b.eyes(0.16, 0.02, 0.07, 0.04, 0xffffff, head);
  const arms = [0.32, -0.32].map((z) => {
    const a = b.joint([0, 0.45, z], body);
    b.cone(0.1, 0.5, outer, [0, -0.25, 0], a, 5).rotation.x = Math.PI;
    b.ball(0.08, inner, [0, -0.5, 0], a, 5);
    return a;
  });
  const embers = Array.from({ length: 8 }, () => b.ball(0.035, inner, [0, 0, 0], body, 0));
  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      body.position.y = 1.0 + Math.sin(t * 2.2) * 0.08;
      flames.forEach((f, i) => {
        f.rotation.y = t * (1.5 + i * 0.2);
        f.scale.set(1, 1 + Math.sin(t * 9 + i * 1.7) * 0.15, 1);
      });
      arms.forEach((a, i) => { a.rotation.z = 0.4 + Math.sin(t * 3 + i) * 0.2 + strike * 1.6; a.rotation.x = (i ? -1 : 1) * 0.3; });
      embers.forEach((e, i) => {
        const u = (t * 0.4 + i / embers.length) % 1;
        const a = i * 0.8 + t;
        e.position.set(Math.cos(a) * (0.45 + u * 0.2), -0.3 + u * 1.4, Math.sin(a) * (0.45 + u * 0.2));
        e.scale.setScalar(1 - u);
      });
      head.scale.setScalar(1 + strike * 0.2);
    },
  };
}

// ─── Golem (magma colossus) ────────────────────────────────────────────────

export function golem(b: Builder, look: HostileLook): Rig {
  const rock = material(look.color, { roughness: 0.95 });
  const rock2 = material(shade(look.color, 1.25), { roughness: 0.95 });
  const lava = glow(look.accent, 2.2);
  const chunk = (r: number, at: [number, number, number], parent: THREE.Object3D, m = rock) =>
    b.mesh(new THREE.DodecahedronGeometry(r, 0), m, at, parent);
  const hips = b.joint([0, 0.85, 0]);
  const legs = [0.35, -0.35].map((z) => {
    const hip = b.joint([0, 0, z], hips);
    chunk(0.3, [0, -0.22, 0], hip);
    chunk(0.27, [0.02, -0.62, 0], hip, rock2);
    b.ball(0.08, lava, [0.12, -0.42, 0], hip, 4);
    return hip;
  });
  const torso = b.joint([0, 0.95, 0]);
  chunk(0.62, [0, 0.5, 0], torso).scale.set(1, 1.05, 1.15);
  chunk(0.4, [0.12, 0.85, 0.3], torso, rock2);
  chunk(0.4, [0.1, 0.85, -0.3], torso, rock2);
  const coreMat = glow(look.accent, 2.5);
  const coreMesh = b.ball(0.2, coreMat, [0.5, 0.48, 0], torso, 6);
  // Glowing seams.
  for (const [y, z, r] of [[0.3, 0.2, 0.4], [0.65, -0.25, -0.5], [0.45, -0.05, 0.9]] as const) {
    b.box([0.04, 0.5, 0.06], lava, [0.58, y, z], torso).rotation.x = r;
  }
  const head = b.joint([0.25, 1.15, 0], torso);
  chunk(0.25, [0, 0, 0], head);
  b.eyes(0.2, 0.03, 0.09, 0.05, look.accent, head);
  const arms = [0.78, -0.78].map((z) => {
    const shoulder = b.joint([0.05, 0.85, z], torso);
    chunk(0.32, [0, 0, 0], shoulder, rock2);
    const elbow = b.joint([0, -0.45, 0], shoulder);
    chunk(0.26, [0, -0.2, 0], shoulder);
    chunk(0.36, [0.05, -0.2, 0], elbow).scale.set(1, 1.2, 1);
    b.ball(0.07, lava, [0.18, 0.05, 0], elbow, 4);
    return { shoulder, elbow };
  });
  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      const breath = Math.sin(t * 1.2);
      torso.rotation.z = -0.08 + breath * 0.02 - strike * 0.25;
      head.rotation.y = Math.sin(t * 0.4) * 0.15;
      coreMat.emissiveIntensity = 2.2 + Math.sin(t * 3) * 0.8;
      coreMesh.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
      lava.emissiveIntensity = 1.8 + Math.sin(t * 2.3) * 0.5;
      arms.forEach(({ shoulder, elbow }, i) => {
        shoulder.rotation.z = 0.15 + Math.sin(t * 1.2 + i) * 0.04 + strike * 1.8;
        elbow.rotation.z = 0.4 - strike * 0.3;
      });
      legs.forEach((h, i) => { h.rotation.z = 0.08 * (i ? 1 : -1); });
    },
  };
}

// ─── Wraith (phantoms, shades) ─────────────────────────────────────────────

export function wraith(b: Builder, look: HostileLook, _boss: boolean, has: Has): Rig {
  const veil = material(look.color, { transparent: true, opacity: 0.82, side: THREE.DoubleSide, emissive: look.color, emissiveIntensity: 0.25 });
  const body = b.joint([0, 1.15, 0]);
  // Tattered robe: a cone with ragged strips hanging from its hem.
  const robe = b.cone(0.55, 1.5, veil, [0, -0.15, 0], body, 9);
  robe.rotation.x = Math.PI;
  const rags = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2;
    const r = b.joint([Math.cos(a) * 0.48, -0.85, Math.sin(a) * 0.48], body);
    b.cone(0.09, 0.45, veil, [0, -0.22, 0], r, 3).rotation.x = Math.PI;
    return r;
  });
  const hood = b.joint([0.02, 0.72, 0], body);
  b.cone(0.3, 0.55, veil, [-0.03, 0.08, 0], hood, 8);
  b.ball(0.22, material(0x05050a), [0.08, -0.02, 0], hood, 8);
  b.eyes(0.24, 0.0, 0.07, 0.04, look.accent, hood);
  const arms = [0.42, -0.42].map((z) => {
    const a = b.joint([0.05, 0.45, z], body);
    b.cone(0.1, 0.8, veil, [0, -0.4, 0], a, 5).rotation.x = Math.PI;
    for (let k = 0; k < 3; k++) b.cone(0.02, 0.18, material(shade(look.color, 0.5)), [0.03, -0.85, (k - 1) * 0.04], a, 3).rotation.x = Math.PI;
    return a;
  });
  const ice = material(0xeaf6ff, { transparent: true, opacity: 0.85, emissive: 0x9fd8ff, emissiveIntensity: 0.6 });
  const shards = has('ice') ? Array.from({ length: 5 }, () => b.cone(0.05, 0.28, ice, [0, 0, 0], body, 4)) : [];
  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      body.position.y = 1.25 + Math.sin(t * 1.8) * 0.12;
      body.rotation.z = -strike * 0.3;
      body.rotation.y = Math.sin(t * 0.6) * 0.1;
      rags.forEach((r, i) => { r.rotation.x = Math.sin(t * 3 + i) * 0.25; r.rotation.z = Math.cos(t * 2.6 + i * 1.3) * 0.25; });
      arms.forEach((a, i) => { a.rotation.z = 0.5 + Math.sin(t * 1.5 + i * 2) * 0.15 + strike * 1.4; a.rotation.x = (i ? -1 : 1) * (0.2 + Math.sin(t * 1.1) * 0.1); });
      hood.rotation.z = Math.sin(t * 0.9) * 0.08 - strike * 0.2;
      shards.forEach((s, i) => {
        const a = t * 0.8 + (i / shards.length) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.75, 0.2 + Math.sin(t * 2 + i) * 0.2, Math.sin(a) * 0.75);
        s.rotation.y = t * 2;
      });
    },
  };
}

// ─── Wisp (a flickering ball of light) ─────────────────────────────────────

export function wisp(b: Builder, look: HostileLook): Rig {
  const coreMat = glow(look.accent, 3);
  const halo = material(look.color, { transparent: true, opacity: 0.4, emissive: look.color, emissiveIntensity: 1.2, flatShading: false });
  const body = b.joint([0, 1.4, 0]);
  const core = b.ball(0.16, coreMat, [0, 0, 0], body, 8);
  const shell = b.ball(0.32, halo, [0, 0, 0], body, 12);
  const rings = [0, 1, 2].map((i) => {
    const r = b.joint([0, 0, 0], body);
    b.torus(0.45 + i * 0.08, 0.012, glow(look.color, 1.6), [0, 0, 0], r).rotation.x = Math.PI / 2;
    return r;
  });
  const motes = Array.from({ length: 10 }, () => b.ball(0.03, coreMat, [0, 0, 0], body, 0));
  let strike = 0;
  return {
    attack: (k) => { strike = k; },
    idle: (t) => {
      // Flickers: occasionally blinks out of sync, like it is half elsewhere.
      const flick = Math.sin(t * 17) > 0.85 ? 0.3 : 1;
      body.position.set(Math.sin(t * 1.3) * 0.12, 1.4 + Math.sin(t * 2.1) * 0.15, Math.cos(t * 0.9) * 0.1);
      core.scale.setScalar((1 + Math.sin(t * 6) * 0.15 + strike * 0.5) * flick);
      shell.scale.setScalar(1 + Math.sin(t * 3) * 0.1);
      rings.forEach((r, i) => { r.rotation.set(t * (0.8 + i * 0.5), t * (1.1 - i * 0.3), i * 0.9); });
      motes.forEach((m, i) => {
        const a = t * (1.5 + (i % 3) * 0.4) + i;
        m.position.set(Math.cos(a) * 0.6, Math.sin(a * 1.3) * 0.4, Math.sin(a) * 0.6);
      });
    },
  };
}
