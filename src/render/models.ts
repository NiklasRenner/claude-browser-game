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

export function buildHero(classId: ClassId, weaponId: string, armorId: string): Figure {
  const b = new Builder();
  const cls = CLASSES[classId];
  const weapon = getWeapon(weaponId);
  const armor = getArmor(armorId);
  const armorTint = new THREE.Color(cls.color).lerp(new THREE.Color(0x9aa3b5), Math.min(0.6, armor.block / 20));
  const outfit = material(armorTint.getHex(), { metalness: armor.block > 6 ? 0.5 : 0.1 });
  const dark = material(0x2b2f3a);
  const skin = material(SKIN);
  const weaponColor = ELEMENT_COLORS[weapon.element];

  // Legs & torso.
  b.box(0.22, 0.7, 0.24, dark, 0, 0.35, 0.15);
  b.box(0.22, 0.7, 0.24, dark, 0, 0.35, -0.15);
  b.box(0.42, 0.72, 0.62, outfit, 0, 1.06, 0);
  b.box(0.44, 0.1, 0.64, material(0x6b4a2b), 0, 0.76, 0);
  // Head.
  b.sphere(0.25, skin, 0, 1.66, 0);
  b.sphere(0.035, material(0x1b1b1b), 0.22, 1.7, 0.09, 0);
  b.sphere(0.035, material(0x1b1b1b), 0.22, 1.7, -0.09, 0);
  // Arms: the front (camera-side) arm holds the weapon.
  b.box(0.18, 0.62, 0.18, outfit, 0.05, 1.08, -0.42);
  const arm = new THREE.Group();
  arm.position.set(0.05, 1.36, 0.42);
  b.group.add(arm);
  b.box(0.18, 0.62, 0.18, outfit, 0, -0.28, 0, arm);
  b.sphere(0.1, skin, 0.02, -0.62, 0, 0, arm);

  if (classId === 'warrior') {
    b.sphere(0.27, material(0x9aa3b5, { metalness: 0.7, roughness: 0.35 }), -0.02, 1.74, 0, 1).scale.set(1, 0.75, 1);
    b.box(0.5, 0.14, 0.2, material(0x9aa3b5, { metalness: 0.7 }), 0, 1.4, 0.38); // pauldrons
    b.box(0.5, 0.14, 0.2, material(0x9aa3b5, { metalness: 0.7 }), 0, 1.4, -0.38);
    const blade = glow(weaponColor, weapon.element === 'physical' ? 0.15 : 0.9);
    b.box(0.08, 1.0, 0.04, blade, 0.15, -0.95, 0.04, arm).rotation.z = -0.15;
    b.box(0.08, 0.06, 0.32, material(0xc9a227, { metalness: 0.8 }), 0.06, -0.5, 0.04, arm);
  } else if (classId === 'mage') {
    b.cone(0.32, 0.7, outfit, -0.03, 2.05, 0, 7).rotation.z = 0.2;
    b.cylinder(0.36, 0.36, 0.05, outfit, 0, 1.78, 0);
    b.cylinder(0.04, 0.04, 1.7, material(0x7a5230), 0.05, -0.55, 0.04, arm);
    b.sphere(0.13, glow(weaponColor, 1.8), 0.05, 0.34, 0.04, 1, arm);
    b.cone(0.38, 0.6, outfit, 0, 0.35, 0, 8); // robe skirt
  } else {
    b.sphere(0.29, outfit, -0.05, 1.7, 0, 1).scale.set(1, 1, 0.95); // hood
    b.sphere(0.25, skin, 0.06, 1.64, 0, 1);
    b.box(0.3, 0.12, 0.5, material(0x2b2f3a), 0.05, 1.56, 0); // mask
    const blade = glow(weaponColor, weapon.element === 'physical' ? 0.2 : 1);
    b.box(0.06, 0.55, 0.03, blade, 0.12, -0.8, 0.04, arm).rotation.z = -0.35;
    b.box(0.06, 0.45, 0.03, blade, 0.12, 0.7, -0.5).rotation.z = 0.6;
  }

  return b.figure((body, t) => {
    body.position.y = Math.sin(t * 2.2) * 0.03;
    arm.rotation.z = Math.sin(t * 2.2) * 0.06 + 0.15;
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
