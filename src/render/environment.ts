/**
 * Per-location backdrops: ground, sky dome, props and ambient particles.
 * Prop placement uses the core's seeded RNG so every location always looks the same.
 */
import * as THREE from 'three';
import { Rng } from '../core';

export interface Environment {
  group: THREE.Group;
  sky: number;
  fog: number;
  ground: number;
  update(dt: number, time: number): void;
}

export const TOWN_PALETTE = { sky: 0xffd9a8, ground: 0x7a9a4a, fog: 0xf3d4ae };

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...opts });
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}

function skyDome(top: number, bottom: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(80, 24, 12);
  const colors: number[] = [];
  const a = new THREE.Color(top);
  const b = new THREE.Color(bottom);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / 80, 0, 1);
    const c = b.clone().lerp(a, Math.pow(t, 0.6));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
}

function ground(color: number, rng: Rng): THREE.Mesh {
  const geo = new THREE.CircleGeometry(40, 48, 0, Math.PI * 2);
  geo.rotateX(-Math.PI / 2);
  const base = new THREE.Color(color);
  const colors: number[] = [];
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const c = base.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.06);
    colors.push(c.r, c.g, c.b);
    if (Math.hypot(pos.getX(i), pos.getZ(i)) > 8) pos.setY(i, rng.next() * 0.6);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  m.receiveShadow = true;
  return m;
}

/** Random position on a ring around the arena, biased behind the action (negative z). */
function scatter(rng: Rng, minR: number, maxR: number): [number, number] {
  const a = Math.PI + rng.next() * Math.PI + (rng.next() - 0.5) * 0.9;
  const r = minR + rng.next() * (maxR - minR);
  return [Math.cos(a) * r * 1.6, Math.sin(a) * r];
}

interface ParticleSpec {
  count: number;
  color: number;
  size: number;
  /** Velocity per second. */
  velocity: [number, number, number];
  jitter: number;
  additive?: boolean;
}

function particles(spec: ParticleSpec, rng: Rng) {
  const positions = new Float32Array(spec.count * 3);
  const phases = new Float32Array(spec.count);
  for (let i = 0; i < spec.count; i++) {
    positions[i * 3] = (rng.next() - 0.5) * 30;
    positions[i * 3 + 1] = rng.next() * 9;
    positions[i * 3 + 2] = (rng.next() - 0.7) * 20;
    phases[i] = rng.next() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: spec.color, size: spec.size, transparent: true, opacity: 0.85, depthWrite: false,
    blending: spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  const update = (dt: number, time: number) => {
    const p = geo.attributes.position!;
    for (let i = 0; i < spec.count; i++) {
      let x = p.getX(i) + (spec.velocity[0] + Math.sin(time + phases[i]!) * spec.jitter) * dt;
      let y = p.getY(i) + spec.velocity[1] * dt;
      const z = p.getZ(i) + spec.velocity[2] * dt;
      if (y < 0) y += 9;
      if (y > 9) y -= 9;
      if (x > 15) x -= 30;
      if (x < -15) x += 30;
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  };
  return { points, update };
}

function tree(parent: THREE.Object3D, x: number, z: number, s: number, leaf: number, snowy = false) {
  mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1 * s, 6), mat(0x6b4a2b), x, 0.5 * s, z, parent);
  for (let i = 0; i < 3; i++) {
    mesh(new THREE.ConeGeometry((1 - i * 0.22) * s, 1.3 * s, 7), mat(snowy && i === 2 ? 0xf4f8ff : leaf), x, (1.2 + i * 0.75) * s, z, parent);
  }
}

function rock(parent: THREE.Object3D, x: number, z: number, s: number, color: number, rng: Rng) {
  const r = mesh(new THREE.DodecahedronGeometry(s, 0), mat(color), x, s * 0.5, z, parent);
  r.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
  r.scale.y = 0.6 + rng.next() * 0.6;
}

function house(parent: THREE.Object3D, x: number, z: number, wall: number, roof: number, rng: Rng) {
  const w = 2 + rng.next() * 1.2;
  const h = 1.6 + rng.next() * 0.8;
  mesh(new THREE.BoxGeometry(w, h, 2), mat(wall), x, h / 2, z, parent);
  const r = mesh(new THREE.ConeGeometry(w * 0.82, 1.3, 4), mat(roof), x, h + 0.65, z, parent);
  r.rotation.y = Math.PI / 4;
  r.scale.z = 2 / w + 0.2;
  mesh(new THREE.BoxGeometry(0.5, 0.9, 0.05), mat(0x5a3b22), x, 0.45, z + 1.01, parent);
  const win = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb347, emissiveIntensity: 0.9 });
  mesh(new THREE.BoxGeometry(0.4, 0.4, 0.05), win, x + w * 0.28, h * 0.6, z + 1.01, parent);
}

export function buildEnvironment(key: string, palette: { sky: number; ground: number; fog: number }): Environment {
  const rng = new Rng(Array.from(key).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  const group = new THREE.Group();
  group.add(skyDome(palette.sky, palette.fog));
  group.add(ground(palette.ground, rng));
  const updaters: ((dt: number, t: number) => void)[] = [];
  const addParticles = (spec: ParticleSpec) => {
    const p = particles(spec, rng);
    group.add(p.points);
    updaters.push(p.update);
  };

  switch (key) {
    case 'town': {
      const walls = [0xe8d8b8, 0xd9c29a, 0xf0e4cc, 0xc9b28a];
      const roofs = [0xa8432f, 0x7a4a8a, 0x3f6a9a, 0x8a5a2b];
      for (let i = 0; i < 7; i++) {
        const x = -12 + i * 4 + (rng.next() - 0.5);
        house(group, x, -7 - rng.next() * 4, rng.pick(walls), rng.pick(roofs), rng);
      }
      // Fountain.
      mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.5, 12), mat(0xb8b2a6), 3.2, 0.25, -2.5, group);
      mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x5ab4e6, roughness: 0.1 }), 3.2, 0.48, -2.5, group);
      mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.3, 8), mat(0xb8b2a6), 3.2, 0.9, -2.5, group);
      for (const x of [-4.5, 6.5]) {
        mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), mat(0x2b2b2b), x, 1.2, 0.8, group);
        mesh(new THREE.IcosahedronGeometry(0.18, 0), new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc04a, emissiveIntensity: 2 }), x, 2.45, 0.8, group);
      }
      for (let i = 0; i < 6; i++) { const [x, z] = scatter(rng, 9, 14); tree(group, x, z, 0.9 + rng.next() * 0.6, 0x3f7f3a); }
      addParticles({ count: 40, color: 0xfff1c2, size: 0.06, velocity: [0.1, 0.15, 0], jitter: 0.3, additive: true });
      break;
    }
    case 'greenwood':
      for (let i = 0; i < 26; i++) { const [x, z] = scatter(rng, 5, 14); tree(group, x, z, 0.9 + rng.next() * 0.9, rng.pick([0x2f6b33, 0x3f7f3a, 0x4f8f3a])); }
      for (let i = 0; i < 8; i++) { const [x, z] = scatter(rng, 4, 10); rock(group, x, z, 0.3 + rng.next() * 0.4, 0x7d7a70, rng); }
      addParticles({ count: 60, color: 0xd8ff7a, size: 0.07, velocity: [0, 0.05, 0], jitter: 0.4, additive: true });
      break;
    case 'ashen_caves':
      for (let i = 0; i < 24; i++) {
        const [x, z] = scatter(rng, 5, 13);
        const s = 0.6 + rng.next() * 1.8;
        mesh(new THREE.ConeGeometry(0.35 * s, 2.2 * s, 6), mat(0x3a2620), x, 1.1 * s, z, group);
      }
      for (let i = 0; i < 6; i++) {
        const [x, z] = scatter(rng, 4, 10);
        const pool = mesh(new THREE.CircleGeometry(0.6 + rng.next() * 0.9, 10), new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff4400, emissiveIntensity: 1.8 }), x, 0.03, z, group);
        pool.rotation.x = -Math.PI / 2;
      }
      addParticles({ count: 90, color: 0xff8a3d, size: 0.08, velocity: [0, 0.6, 0], jitter: 0.3, additive: true });
      break;
    case 'frostpeak':
      for (let i = 0; i < 18; i++) { const [x, z] = scatter(rng, 6, 14); tree(group, x, z, 0.8 + rng.next() * 0.9, 0x2e5a4a, true); }
      for (let i = 0; i < 10; i++) {
        const [x, z] = scatter(rng, 4, 11);
        const c = mesh(new THREE.OctahedronGeometry(0.3 + rng.next() * 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x4fb4ff, emissiveIntensity: 0.4, roughness: 0.1, transparent: true, opacity: 0.85 }), x, 0.5, z, group);
        c.scale.y = 1.8;
      }
      addParticles({ count: 220, color: 0xffffff, size: 0.09, velocity: [0.4, -0.9, 0], jitter: 0.5 });
      break;
    case 'shadow_keep':
      for (let i = 0; i < 14; i++) {
        const [x, z] = scatter(rng, 5, 13);
        const h = 1 + rng.next() * 4;
        mesh(new THREE.BoxGeometry(0.9, h, 0.9), mat(0x3a3346), x, h / 2, z, group).rotation.y = rng.next();
      }
      for (let i = 0; i < 6; i++) {
        const [x, z] = scatter(rng, 6, 11);
        mesh(new THREE.ConeGeometry(0.12, 0.3, 5), new THREE.MeshStandardMaterial({ color: 0xb48cff, emissive: 0x9b59ff, emissiveIntensity: 2 }), x, 0.15, z, group);
      }
      addParticles({ count: 80, color: 0xb48cff, size: 0.09, velocity: [0, 0.25, 0], jitter: 0.5, additive: true });
      break;
  }

  return {
    group,
    sky: palette.sky,
    fog: palette.fog,
    ground: palette.ground,
    update: (dt, t) => { for (const u of updaters) u(dt, t); },
  };
}
