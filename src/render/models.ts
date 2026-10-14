/**
 * Procedural low-poly figures built from primitives — no asset files needed.
 * Every figure faces +X; the stage rotates monsters to face the hero.
 */
import * as THREE from 'three';
import { CLASSES, getArmor, getWeapon } from '../core';
import type { ClassId, MonsterLook } from '../core';
import { ELEMENT_COLORS } from '../game/elements';

export interface Figure {
  /** Placed in the world by the stage. */
  root: THREE.Group;
  /** Animated by attacks / knockbacks (offset from root). */
  body: THREE.Group;
  /** World-space height used to place floating text. */
  height: number;
  /** Per-frame idle motion. */
  idle(time: number): void;
  /** Materials that flash when hit. */
  materials: THREE.MeshStandardMaterial[];
}

const SKIN = 0xf0c9a0;

function material(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0.05, ...opts });
}

function glow(color: number, intensity = 1.6) {
  return material(color, { emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
}

class Builder {
  readonly group = new THREE.Group();
  readonly materials: THREE.MeshStandardMaterial[] = [];

  add(geometry: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, x = 0, y = 0, z = 0, parent: THREE.Object3D = this.group) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (!this.materials.includes(mat)) this.materials.push(mat);
    return mesh;
  }

  box(w: number, h: number, d: number, mat: THREE.MeshStandardMaterial, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
    return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  }

  sphere(r: number, mat: THREE.MeshStandardMaterial, x = 0, y = 0, z = 0, detail = 1, parent?: THREE.Object3D) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), mat, x, y, z, parent);
  }

  cone(r: number, h: number, mat: THREE.MeshStandardMaterial, x = 0, y = 0, z = 0, segments = 6, parent?: THREE.Object3D) {
    return this.add(new THREE.ConeGeometry(r, h, segments), mat, x, y, z, parent);
  }

  cylinder(rt: number, rb: number, h: number, mat: THREE.MeshStandardMaterial, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, 7), mat, x, y, z, parent);
  }

  eyes(x: number, y: number, spread: number, size: number, color = 0xfff4c2) {
    const m = glow(color, 2);
    this.sphere(size, m, x, y, spread, 0);
    this.sphere(size, m, x, y, -spread, 0);
  }

  figure(idle: (body: THREE.Group, t: number) => void): Figure {
    const root = new THREE.Group();
    root.add(this.group);
    const height = new THREE.Box3().setFromObject(this.group).max.y;
    return { root, body: this.group, height, idle: (t) => idle(this.group, t), materials: this.materials };
  }
}

// ─── Hero ──────────────────────────────────────────────────────────────────

type WeaponShape = 'pistol' | 'rifle' | 'cannon' | 'emitter' | 'wrench' | 'lance' | 'blade';
const WEAPON_SHAPES: Record<string, WeaponShape> = {
  sonic_emitter: 'emitter', mag_wrench: 'wrench', ion_lance: 'lance', singularity_edge: 'blade',
  plasma_cannon: 'cannon', cryo_carbine: 'rifle', photon_rifle: 'rifle', stasis_projector: 'rifle', nova_rifle: 'rifle',
};

/** Builds the held weapon inside the arm group. The arm's local −Y axis points out of the hand. */
function buildWeapon(b: Builder, arm: THREE.Group, weaponId: string) {
  const weapon = getWeapon(weaponId);
  const shape = WEAPON_SHAPES[weaponId] ?? (weapon.style === 'ranged' ? 'pistol' : 'wrench');
  const color = ELEMENT_COLORS[weapon.element];
  const body = material(0x2a2f38, { metalness: 0.6, roughness: 0.4 });
  const trim = material(0x9aa6b8, { metalness: 0.7, roughness: 0.3 });
  const tip = glow(color, weapon.element === 'kinetic' ? 0.6 : 1.8);
  const hand = -0.64;
  switch (shape) {
    case 'pistol':
      b.box(0.1, 0.42, 0.1, body, 0, hand - 0.16, 0, arm); // barrel
      b.box(0.12, 0.14, 0.09, body, -0.1, hand + 0.02, 0, arm); // grip
      b.box(0.11, 0.06, 0.11, tip, 0, hand - 0.38, 0, arm);
      break;
    case 'rifle':
      b.box(0.12, 0.85, 0.12, body, 0, hand - 0.28, 0, arm);
      b.box(0.08, 0.3, 0.14, trim, 0.09, hand - 0.2, 0, arm); // energy cell
      b.box(0.14, 0.3, 0.1, body, 0, hand + 0.2, 0, arm); // stock
      b.box(0.13, 0.08, 0.13, tip, 0, hand - 0.72, 0, arm);
      break;
    case 'cannon':
      b.cylinder(0.12, 0.15, 0.9, body, 0, hand - 0.3, 0, arm);
      b.cylinder(0.16, 0.16, 0.18, trim, 0, hand - 0.05, 0, arm);
      b.cylinder(0.1, 0.1, 0.06, tip, 0, hand - 0.77, 0, arm);
      break;
    case 'emitter': {
      b.cylinder(0.05, 0.05, 0.5, trim, 0, hand - 0.18, 0, arm);
      const dish = b.cone(0.16, 0.14, tip, 0, hand - 0.46, 0, 10, arm);
      dish.rotation.x = Math.PI;
      break;
    }
    case 'wrench':
      b.box(0.06, 0.6, 0.06, trim, 0.04, hand - 0.22, 0, arm);
      b.box(0.2, 0.1, 0.08, trim, 0.04, hand - 0.52, 0, arm);
      b.box(0.06, 0.12, 0.08, tip, 0.12, hand - 0.6, 0, arm);
      break;
    case 'lance':
      b.cylinder(0.035, 0.035, 1.9, body, 0.05, hand - 0.2, 0, arm);
      b.cone(0.08, 0.32, tip, 0.05, hand - 1.3, 0, 4, arm).rotation.x = Math.PI;
      break;
    case 'blade':
      b.box(0.06, 0.18, 0.06, body, 0, hand - 0.02, 0, arm);
      b.box(0.04, 0.95, 0.12, tip, 0, hand - 0.6, 0, arm);
      break;
  }
  return weapon.style === 'ranged';
}

export function buildHero(classId: ClassId, weaponId: string, armorId: string): Figure {
  const b = new Builder();
  const cls = CLASSES[classId];
  const armor = getArmor(armorId);
  const division = material(cls.color);
  const dark = material(0x1c2028);
  const skin = material(SKIN);
  const plate = material(new THREE.Color(0x8a94a6).lerp(new THREE.Color(cls.color), 0.25).getHex(), { metalness: 0.6, roughness: 0.35 });

  // Legs, boots, torso. Division colour on the upper body, dark trousers and yoke.
  b.box(0.22, 0.7, 0.24, dark, 0, 0.35, 0.15);
  b.box(0.22, 0.7, 0.24, dark, 0, 0.35, -0.15);
  b.box(0.26, 0.12, 0.28, material(0x0e1014), 0.02, 0.06, 0.15);
  b.box(0.26, 0.12, 0.28, material(0x0e1014), 0.02, 0.06, -0.15);
  b.box(0.42, 0.72, 0.62, division, 0, 1.06, 0);
  b.box(0.44, 0.2, 0.64, dark, 0, 1.36, 0); // shoulder yoke
  b.box(0.44, 0.08, 0.64, dark, 0, 0.74, 0); // belt
  b.cone(0.06, 0.14, glow(0xd8e2f0, 0.6), 0.22, 1.2, 0.16, 3).rotation.z = -Math.PI / 2; // insignia
  // Head and hair.
  b.sphere(0.25, skin, 0, 1.66, 0);
  b.sphere(0.26, material(0x2a1e16), -0.06, 1.74, 0, 1).scale.set(0.9, 0.7, 1);
  b.sphere(0.035, material(0x1b1b1b), 0.22, 1.68, 0.09, 0);
  b.sphere(0.035, material(0x1b1b1b), 0.22, 1.68, -0.09, 0);

  // Armor tiers add plating and eventually a helmet.
  if (armor.block >= 7) {
    b.box(0.46, 0.5, 0.66, plate, 0.01, 1.12, 0);
    b.box(0.3, 0.14, 0.24, plate, 0, 1.44, 0.38);
    b.box(0.3, 0.14, 0.24, plate, 0, 1.44, -0.38);
  } else if (armor.block >= 4) {
    b.box(0.44, 0.45, 0.64, material(0x4a4f5a), 0.005, 1.12, 0);
  }
  if (armor.block >= 9) {
    b.sphere(0.3, plate, -0.02, 1.7, 0, 1);
    b.box(0.08, 0.12, 0.4, glow(0x5fe8ff, 1.4), 0.26, 1.68, 0);
  }

  // Class gear.
  if (classId === 'security') {
    b.box(0.08, 0.3, 0.5, dark, -0.24, 1.08, 0); // back holster plate
  } else if (classId === 'science') {
    b.box(0.04, 0.1, 0.12, glow(0x5fe8ff, 2), 0.25, 1.7, 0.11); // headset eyepiece
    b.box(0.2, 0.04, 0.04, material(0x9aa6b8), 0.12, 1.75, 0.2);
    b.box(0.18, 0.3, 0.38, material(0x3a4454), -0.3, 1.1, 0); // sensor pack
  } else {
    b.cylinder(0.06, 0.06, 0.06, glow(0xffa53b, 0.8), 0.2, 1.84, 0.08).rotation.z = Math.PI / 2; // goggles
    b.cylinder(0.06, 0.06, 0.06, glow(0xffa53b, 0.8), 0.2, 1.84, -0.08).rotation.z = Math.PI / 2;
    for (const z of [-0.2, 0, 0.2]) b.box(0.12, 0.14, 0.12, material(0x5a4a3a), 0.2, 0.72, z); // tool pouches
  }

  // Arms: the front (camera-side) arm holds the weapon.
  b.box(0.18, 0.62, 0.18, division, 0.05, 1.08, -0.42);
  const arm = new THREE.Group();
  arm.position.set(0.05, 1.36, 0.42);
  b.group.add(arm);
  b.box(0.18, 0.62, 0.18, division, 0, -0.28, 0, arm);
  b.sphere(0.1, skin, 0.02, -0.62, 0, 0, arm);
  const ranged = buildWeapon(b, arm, weaponId);
  const aim = ranged ? 1.35 : 0.15;

  return b.figure((body, t) => {
    body.position.y = Math.sin(t * 2.2) * 0.03;
    arm.rotation.z = aim + Math.sin(t * 2.2) * (ranged ? 0.03 : 0.06);
  });
}

// ─── Monsters ──────────────────────────────────────────────────────────────

export function buildMonster(look: MonsterLook, boss: boolean): Figure {
  const b = new Builder();
  const main = material(look.color);
  const accent = material(look.accent);
  let idle: (body: THREE.Group, t: number) => void = (body, t) => { body.position.y = Math.sin(t * 2) * 0.04; };

  switch (look.body) {
    case 'blob': {
      const blob = b.sphere(0.7, material(look.color, { transparent: true, opacity: 0.9, roughness: 0.2 }), 0, 0.55, 0, 2);
      blob.scale.set(1, 0.78, 1);
      b.sphere(0.3, accent, -0.05, 0.4, 0, 1);
      b.eyes(0.55, 0.75, 0.22, 0.09, 0x111111);
      idle = (body, t) => {
        const s = Math.sin(t * 3);
        body.scale.set(1 + s * 0.05, 1 - s * 0.07, 1 + s * 0.05);
      };
      break;
    }
    case 'beast': {
      b.box(1.4, 0.7, 0.75, main, 0, 0.95, 0);
      b.box(0.6, 0.55, 0.55, main, 0.88, 1.15, 0);
      b.box(0.35, 0.28, 0.4, accent, 1.25, 1.02, 0);
      for (const [x, z] of [[0.5, 0.25], [0.5, -0.25], [-0.5, 0.25], [-0.5, -0.25]] as const) {
        b.cylinder(0.11, 0.09, 0.65, accent, x, 0.32, z);
      }
      b.cone(0.1, 0.25, main, 0.82, 1.5, 0.18);
      b.cone(0.1, 0.25, main, 0.82, 1.5, -0.18);
      b.cone(0.1, 0.6, main, -0.85, 1.1, 0).rotation.z = 1.2;
      if (boss) {
        for (let i = 0; i < 5; i++) b.cone(0.12, 0.45, accent, -0.5 + i * 0.25, 1.45, 0).rotation.z = -0.3;
        b.cone(0.06, 0.3, material(0xfff3d6), 1.35, 0.95, 0.2).rotation.z = -1.2;
        b.cone(0.06, 0.3, material(0xfff3d6), 1.35, 0.95, -0.2).rotation.z = -1.2;
      }
      b.eyes(1.16, 1.25, 0.15, 0.06, 0xffd84a);
      idle = (body, t) => { body.position.y = Math.abs(Math.sin(t * 2.4)) * 0.05; body.rotation.z = Math.sin(t * 2.4) * 0.02; };
      break;
    }
    case 'humanoid': {
      const legs = material(new THREE.Color(look.color).multiplyScalar(0.6).getHex());
      b.box(0.24, 0.75, 0.26, legs, 0, 0.38, 0.17);
      b.box(0.24, 0.75, 0.26, legs, 0, 0.38, -0.17);
      b.box(0.5, 0.08, 0.7, accent, 0, 0.8, 0); // belt trim
      b.box(0.46, 0.8, 0.66, main, 0, 1.15, 0);
      b.sphere(0.27, main, 0, 1.8, 0);
      b.box(0.2, 0.7, 0.2, main, 0.05, 1.1, -0.46);
      b.box(0.2, 0.7, 0.2, main, 0.15, 1.1, 0.46);
      b.box(0.1, 1.0, 0.06, material(look.accent, { metalness: 0.6 }), 0.35, 0.95, 0.5).rotation.z = -0.3;
      b.box(0.1, 0.9, 0.7, accent, -0.26, 1.05, 0); // cloak
      b.eyes(0.24, 1.84, 0.1, 0.045, 0xff5555);
      if (boss) for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cone(0.06, 0.22, glow(look.accent, 1.2), Math.cos(a) * 0.2, 2.12, Math.sin(a) * 0.2);
      }
      break;
    }
    case 'flyer': {
      b.sphere(0.35, main, 0, 1.6, 0, 1);
      b.sphere(0.22, main, 0.3, 1.72, 0, 1);
      b.cone(0.07, 0.2, main, 0.3, 1.98, 0.1);
      b.cone(0.07, 0.2, main, 0.3, 1.98, -0.1);
      b.eyes(0.48, 1.76, 0.08, 0.05, look.accent);
      const wingGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.35, 0.1, 1.0), new THREE.Vector3(-0.35, 0, 0.8),
      ]);
      wingGeo.computeVertexNormals();
      const wingMat = material(look.color, { side: THREE.DoubleSide });
      const left = b.add(wingGeo, wingMat, 0, 1.65, 0.25);
      const right = b.add(wingGeo, wingMat, 0, 1.65, -0.25);
      right.scale.z = -1;
      idle = (body, t) => {
        body.position.y = Math.sin(t * 3) * 0.15;
        const flap = Math.sin(t * 14) * 0.7;
        left.rotation.x = flap;
        right.rotation.x = -flap;
      };
      break;
    }
    case 'golem': {
      const crack = glow(look.accent, 2.2);
      b.box(0.5, 0.8, 0.45, main, 0, 0.4, 0.33);
      b.box(0.5, 0.8, 0.45, main, 0, 0.4, -0.33);
      b.box(1.1, 1.1, 1.3, main, 0, 1.35, 0);
      b.box(0.55, 0.5, 0.55, main, 0.15, 2.15, 0);
      b.box(0.5, 1.2, 0.45, main, 0.1, 1.2, 0.9);
      b.box(0.5, 1.2, 0.45, main, 0.1, 1.2, -0.9);
      b.box(0.04, 0.9, 0.08, crack, 0.56, 1.35, 0.15);
      b.box(0.04, 0.5, 0.08, crack, 0.56, 1.2, -0.3).rotation.x = 0.6;
      b.box(0.04, 0.08, 0.6, crack, 0.36, 0.7, 0.9);
      b.eyes(0.43, 2.2, 0.13, 0.07, look.accent);
      idle = (body, t) => { body.rotation.z = Math.sin(t * 1.2) * 0.03; };
      break;
    }
    case 'dragon': {
      const body = b.sphere(0.6, main, 0, 1.1, 0, 1);
      body.scale.set(1.5, 0.85, 0.9);
      const neck = b.cylinder(0.18, 0.28, 0.8, main, 0.8, 1.55, 0);
      neck.rotation.z = -0.7;
      b.box(0.55, 0.32, 0.36, main, 1.2, 1.9, 0);
      b.box(0.3, 0.12, 0.3, accent, 1.38, 1.76, 0);
      b.cone(0.06, 0.35, accent, 1.0, 2.15, 0.12).rotation.z = 0.7;
      b.cone(0.06, 0.35, accent, 1.0, 2.15, -0.12).rotation.z = 0.7;
      b.cone(0.18, 1.2, main, -1.2, 0.9, 0).rotation.z = 1.7;
      for (const [x, z] of [[0.45, 0.35], [0.45, -0.35], [-0.45, 0.35], [-0.45, -0.35]] as const) {
        b.cylinder(0.12, 0.1, 0.6, main, x, 0.35, z);
      }
      const wingGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.3, 0, 0), new THREE.Vector3(-0.4, 0.5, 1.6), new THREE.Vector3(-0.7, 0, 0.6),
      ]);
      wingGeo.computeVertexNormals();
      const wingMat = material(look.accent, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
      const left = b.add(wingGeo, wingMat, 0, 1.4, 0.3);
      const right = b.add(wingGeo, wingMat, 0, 1.4, -0.3);
      right.scale.z = -1;
      b.eyes(1.4, 1.98, 0.12, 0.05, 0xfff27a);
      idle = (g, t) => {
        g.position.y = Math.sin(t * 1.6) * 0.05;
        left.rotation.x = Math.sin(t * 1.6) * 0.25 - 0.1;
        right.rotation.x = -left.rotation.x;
      };
      break;
    }
    case 'wraith': {
      b.cone(0.55, 1.7, material(look.color, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }), 0, 1.15, 0, 8)
        .rotation.x = Math.PI;
      b.sphere(0.3, material(look.color, { transparent: true, opacity: 0.9 }), 0, 2.05, 0, 1);
      b.sphere(0.24, material(0x05050a), 0.08, 2.02, 0, 1);
      b.eyes(0.28, 2.05, 0.09, 0.05, look.accent);
      b.cone(0.1, 0.9, material(look.color, { transparent: true, opacity: 0.8 }), 0.35, 1.5, 0.45).rotation.z = -1.1;
      b.cone(0.1, 0.9, material(look.color, { transparent: true, opacity: 0.8 }), 0.35, 1.5, -0.45).rotation.z = -1.1;
      idle = (body, t) => { body.position.y = 0.25 + Math.sin(t * 1.8) * 0.12; body.rotation.x = Math.sin(t * 1.3) * 0.05; };
      break;
    }
  }

  b.group.scale.setScalar(look.scale);
  const fig = b.figure(idle);
  fig.height = 2.3 * look.scale;
  return fig;
}

/** Releases GPU resources for a figure that is being removed. */
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    }
  });
}
