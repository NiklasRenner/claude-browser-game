/**
 * Per-location backdrops: ground, sky, props, lighting and ambient particles.
 * Prop placement uses the core's seeded RNG so every location always looks the same.
 *
 * Keys: 'ship' (the hub, aboard the Meridian) or a mission id.
 */
import * as THREE from 'three';
import { Rng, getMission } from '../core';

export interface Lighting {
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sunColor: number;
  sun: number;
  rimColor: number;
  rim: number;
}

export interface Environment {
  group: THREE.Group;
  sky: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  lighting: Lighting;
  update(dt: number, time: number): void;
}

const SHIP_PALETTE = { sky: 0x05070f, ground: 0x2a313d, fog: 0x0a0f1c };

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...opts });
}
function glowMat(color: number, intensity = 1.8, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, ...opts });
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}

// ─── Sky ───────────────────────────────────────────────────────────────────

function skyDome(top: number, bottom: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(90, 32, 16);
  const colors: number[] = [];
  const a = new THREE.Color(top);
  const b = new THREE.Color(bottom);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / 90, 0, 1);
    const c = b.clone().lerp(a, Math.pow(t, 0.55));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

/** Star field on the upper hemisphere; `opacity` lets daytime skies show only a few. */
function stars(rng: Rng, count: number, opacity: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = rng.next() * Math.PI * 2;
    const y = 0.05 + rng.next() * 0.95;
    const r = Math.sqrt(1 - y * y);
    positions.set([Math.cos(theta) * r * 85, y * 85, Math.sin(theta) * r * 85], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.35, transparent: true, opacity, fog: false, depthWrite: false, sizeAttenuation: true,
  }));
}

/** A planet or moon hanging in the sky, optionally with rings and an atmosphere halo. */
function celestial(parent: THREE.Object3D, opts: {
  pos: [number, number, number]; radius: number; color: number; shade?: number; ring?: number; halo?: number;
}) {
  const g = new THREE.Group();
  g.position.set(...opts.pos);
  const geo = new THREE.SphereGeometry(opts.radius, 32, 16);
  // Fake day/night terminator with vertex colours.
  const light = new THREE.Color(opts.color);
  const dark = new THREE.Color(opts.shade ?? 0x05070f);
  const colors: number[] = [];
  const p = geo.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((p.getX(i) * -0.7 + p.getY(i) * 0.7) / opts.radius * 0.8 + 0.5, 0, 1);
    const c = dark.clone().lerp(light, t);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  if (opts.halo) {
    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(opts.radius * 1.08, 32, 16),
      new THREE.MeshBasicMaterial({ color: opts.halo, transparent: true, opacity: 0.25, side: THREE.BackSide, fog: false, blending: THREE.AdditiveBlending }),
    ));
  }
  if (opts.ring) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(opts.radius * 1.4, opts.radius * 2.1, 64),
      new THREE.MeshBasicMaterial({ color: opts.ring, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false }),
    );
    ring.rotation.set(1.2, 0.3, 0.2);
    g.add(ring);
  }
  parent.add(g);
  return g;
}

// ─── Ground ────────────────────────────────────────────────────────────────

function ground(color: number, rng: Rng, roughness = 0.6): THREE.Mesh {
  const geo = new THREE.CircleGeometry(45, 56);
  geo.rotateX(-Math.PI / 2);
  const base = new THREE.Color(color);
  const colors: number[] = [];
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const c = base.clone().offsetHSL(0, 0, (rng.next() - 0.5) * 0.07);
    colors.push(c.r, c.g, c.b);
    if (Math.hypot(pos.getX(i), pos.getZ(i)) > 8) pos.setY(i, rng.next() * roughness);
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

// ─── Particles ─────────────────────────────────────────────────────────────

interface ParticleSpec {
  count: number;
  color: number;
  size: number;
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

// ─── Props ─────────────────────────────────────────────────────────────────

/** Alien flora: a curved stalk with a glowing bulb. */
function bulbTree(parent: THREE.Object3D, x: number, z: number, s: number, stalk: number, bulb: number, rng: Rng) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rng.next() * Math.PI * 2;
  const segs = 4;
  let px = 0, py = 0;
  const lean = (rng.next() - 0.5) * 0.5;
  for (let i = 0; i < segs; i++) {
    const h = 0.9 * s;
    const seg = mesh(new THREE.CylinderGeometry(0.1 * s * (1 - i * 0.15), 0.14 * s * (1 - i * 0.15), h, 6), mat(stalk), px, py + h / 2, 0, g);
    seg.rotation.z = lean * (i + 1) * 0.4;
    px += Math.sin(-seg.rotation.z) * h;
    py += Math.cos(seg.rotation.z) * h;
  }
  const cap = mesh(new THREE.IcosahedronGeometry(0.55 * s, 1), glowMat(bulb, 0.9, { flatShading: true }), px, py + 0.2 * s, 0, g);
  cap.scale.y = 0.75;
  // Drooping fronds under the bulb.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const f = mesh(new THREE.ConeGeometry(0.12 * s, 0.9 * s, 4), mat(stalk), px + Math.cos(a) * 0.4 * s, py - 0.15 * s, Math.sin(a) * 0.4 * s, g);
    f.rotation.set(Math.sin(a) * 2.6, 0, -Math.cos(a) * 2.6);
  }
  parent.add(g);
}

function mushroom(parent: THREE.Object3D, x: number, z: number, s: number, color: number) {
  mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 0.9 * s, 6), mat(0xd8d0c0), x, 0.45 * s, z, parent);
  const cap = mesh(new THREE.SphereGeometry(0.6 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), glowMat(color, 0.5, { flatShading: true }), x, 0.85 * s, z, parent);
  cap.scale.y = 0.6;
}

function rock(parent: THREE.Object3D, x: number, z: number, s: number, color: number, rng: Rng) {
  const r = mesh(new THREE.DodecahedronGeometry(s, 0), mat(color), x, s * 0.5, z, parent);
  r.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
  r.scale.y = 0.6 + rng.next() * 0.6;
}

/** Prefab outpost dome with an antenna and a blinking beacon. */
function outpost(parent: THREE.Object3D, x: number, z: number, s: number, hull: number, light: number) {
  mesh(new THREE.SphereGeometry(1.4 * s, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(hull, { metalness: 0.4, roughness: 0.5 }), x, 0, z, parent);
  mesh(new THREE.CylinderGeometry(1.45 * s, 1.5 * s, 0.25 * s, 16), mat(0x3a4250, { metalness: 0.5 }), x, 0.12 * s, z, parent);
  mesh(new THREE.BoxGeometry(0.5 * s, 0.6 * s, 0.1), glowMat(light, 1.2), x, 0.45 * s, z + 1.38 * s, parent);
  mesh(new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 1.6 * s, 5), mat(0x9aa3b5, { metalness: 0.7 }), x + 0.6 * s, 1.8 * s, z, parent);
  return mesh(new THREE.IcosahedronGeometry(0.1 * s, 0), glowMat(0xff3b3b, 3), x + 0.6 * s, 2.65 * s, z, parent);
}

// ─── Builders ──────────────────────────────────────────────────────────────

type Updater = (dt: number, t: number) => void;

function buildShip(group: THREE.Group, rng: Rng, updaters: Updater[]) {
  // Deck: dark plating with a glowing grid.
  const deck = mesh(new THREE.CircleGeometry(13, 48), mat(0x232a36, { metalness: 0.5, roughness: 0.45 }), 0, 0.01, -1, group);
  deck.rotation.x = -Math.PI / 2;
  const grid = new THREE.GridHelper(26, 26, 0x2fd6ff, 0x1a3a50);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.25;
  grid.position.set(0, 0.02, -1);
  group.add(grid);

  // Curved observation window: frame pillars on an arc, open to space between them.
  const frame = mat(0x9aa6b8, { metalness: 0.6, roughness: 0.35 });
  const R = 10.5;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    const x = Math.cos(a) * R * 1.5;
    const z = Math.sin(a) * R - 1;
    const pillar = mesh(new THREE.BoxGeometry(0.35, 7, 0.5), frame, x, 3.5, z, group);
    pillar.rotation.y = -a + Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.12, 6, 0.1), glowMat(0x2fd6ff, 1.2), x, 3.5, z + 0.26, group).rotation.y = pillar.rotation.y;
  }
  // Window sill and header beam as thin arcs.
  for (const [y, h] of [[0.35, 0.7], [7.1, 0.5]] as const) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R, h / 2, 4, 48, Math.PI), frame);
    arc.rotation.x = Math.PI / 2;
    arc.scale.set(1.5, 1, 1);
    arc.position.set(0, y, -1);
    arc.rotation.z = Math.PI;
    group.add(arc);
  }

  // Consoles with glowing screens.
  for (const [x, z, ry] of [[-6.5, -4.5, 0.5], [6.8, -4.2, -0.5], [-8.5, -1.5, 0.9]] as const) {
    const c = new THREE.Group();
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    mesh(new THREE.BoxGeometry(1.8, 1, 0.8), mat(0x3a4454, { metalness: 0.5 }), 0, 0.5, 0, c);
    const screen = mesh(new THREE.BoxGeometry(1.6, 0.05, 0.6), glowMat(rng.pick([0x2fd6ff, 0xffa53b, 0x6cff9a]), 1.3), 0, 1.05, 0.05, c);
    screen.rotation.x = -0.45;
    group.add(c);
  }

  // Holo-table with a rotating wireframe planet.
  mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.9, 12), mat(0x3a4454, { metalness: 0.6 }), 4.3, 0.45, -2.2, group);
  mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 24), glowMat(0x2fd6ff, 1.5), 4.3, 0.92, -2.2, group);
  const holo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 2),
    new THREE.MeshBasicMaterial({ color: 0x5fe8ff, wireframe: true, transparent: true, opacity: 0.7 }),
  );
  holo.position.set(4.3, 1.75, -2.2);
  group.add(holo);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.85, 1.6, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2fd6ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.set(4.3, 1.75, -2.2);
  cone.rotation.x = Math.PI;
  group.add(cone);
  updaters.push((_dt, t) => { holo.rotation.y = t * 0.6; holo.rotation.x = Math.sin(t * 0.4) * 0.2; });

  // The view: a blue-green world and a distant moon.
  const planet = celestial(group, { pos: [-24, 6, -60], radius: 22, color: 0x3f8fd8, halo: 0x7fd0ff });
  celestial(group, { pos: [30, 26, -70], radius: 3, color: 0xc9c2b8 });
  updaters.push((_dt, t) => { planet.rotation.y = t * 0.01; });
  group.add(stars(rng, 700, 0.9));
}

function buildWorld(key: string, group: THREE.Group, rng: Rng, updaters: Updater[], addParticles: (s: ParticleSpec) => void) {
  switch (key) {
    case 'veridia': {
      for (let i = 0; i < 22; i++) {
        const [x, z] = scatter(rng, 5, 14);
        bulbTree(group, x, z, 0.8 + rng.next() * 0.9, rng.pick([0x2a5a4a, 0x355f3a, 0x3a4a6a]), rng.pick([0xff5fd2, 0x5fe8ff, 0xc8ff5f, 0xffb35f]), rng);
      }
      for (let i = 0; i < 10; i++) { const [x, z] = scatter(rng, 4, 10); mushroom(group, x, z, 0.5 + rng.next() * 0.8, rng.pick([0xb06bff, 0x5fe8ff, 0xff7aa8])); }
      for (let i = 0; i < 6; i++) { const [x, z] = scatter(rng, 4, 10); rock(group, x, z, 0.3 + rng.next() * 0.4, 0x5a6a70, rng); }
      const beacon = outpost(group, -7.5, -7, 1, 0xd8dce4, 0x5fe8ff);
      updaters.push((_dt, t) => { beacon.visible = Math.sin(t * 4) > 0; });
      celestial(group, { pos: [22, 30, -70], radius: 7, color: 0xf0d8ff, shade: 0x6a8ab8 });
      celestial(group, { pos: [34, 22, -68], radius: 3, color: 0xffe0b8, shade: 0x6a8ab8 });
      addParticles({ count: 70, color: 0xe0ff8a, size: 0.08, velocity: [0, 0.08, 0], jitter: 0.4, additive: true });
      break;
    }
    case 'kethra': {
      for (let i = 0; i < 24; i++) {
        const [x, z] = scatter(rng, 5, 13);
        const s = 0.6 + rng.next() * 1.8;
        mesh(new THREE.ConeGeometry(0.35 * s, 2.2 * s, 6), mat(0x3a2620), x, 1.1 * s, z, group);
      }
      for (let i = 0; i < 6; i++) {
        const [x, z] = scatter(rng, 4, 10);
        const pool = mesh(new THREE.CircleGeometry(0.6 + rng.next() * 0.9, 10), glowMat(0xff5a1f, 1.8), x, 0.03, z, group);
        pool.rotation.x = -Math.PI / 2;
      }
      // Abandoned mining rig.
      const rig = new THREE.Group();
      rig.position.set(7, 0, -8);
      const steel = mat(0x6a6e78, { metalness: 0.6 });
      for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) mesh(new THREE.BoxGeometry(0.18, 5, 0.18), steel, x, 2.5, z, rig);
      mesh(new THREE.BoxGeometry(2.2, 0.4, 2.2), steel, 0, 5, 0, rig);
      mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 6), mat(0xffa53b, { metalness: 0.4 }), 0, 2.5, 0, rig);
      const warn = mesh(new THREE.IcosahedronGeometry(0.15, 0), glowMat(0xffa53b, 3), 0, 5.4, 0, rig);
      group.add(rig);
      updaters.push((_dt, t) => { warn.visible = Math.sin(t * 3) > -0.2; });
      const giant = celestial(group, { pos: [-18, 28, -70], radius: 18, color: 0xd88a4a, shade: 0x1a0a08, ring: 0x8a5a3a });
      updaters.push((_dt, t) => { giant.rotation.y = t * 0.02; });
      group.add(stars(rng, 400, 0.7));
      addParticles({ count: 90, color: 0xff8a3d, size: 0.08, velocity: [0, 0.6, 0], jitter: 0.3, additive: true });
      break;
    }
    case 'glacies': {
      for (let i = 0; i < 16; i++) {
        const [x, z] = scatter(rng, 6, 14);
        const h = 2 + rng.next() * 4;
        const spire = mesh(new THREE.ConeGeometry(0.5 + rng.next() * 0.6, h, 5), mat(0xd8ecff, { roughness: 0.2, metalness: 0.1 }), x, h / 2, z, group);
        spire.rotation.z = (rng.next() - 0.5) * 0.3;
      }
      for (let i = 0; i < 12; i++) {
        const [x, z] = scatter(rng, 4, 11);
        const c = mesh(new THREE.OctahedronGeometry(0.3 + rng.next() * 0.5, 0), glowMat(0x8fdcff, 0.4, { roughness: 0.1, transparent: true, opacity: 0.85 }), x, 0.5, z, group);
        c.scale.y = 1.8;
        c.rotation.z = (rng.next() - 0.5) * 0.6;
      }
      const beacon = outpost(group, 7.5, -7.5, 1.2, 0xe8eef6, 0xffa53b);
      updaters.push((_dt, t) => { beacon.visible = Math.sin(t * 4) > 0; });
      celestial(group, { pos: [-26, 24, -70], radius: 10, color: 0xf2e8ff, shade: 0x8aa0c8, ring: 0xffffff });
      addParticles({ count: 220, color: 0xffffff, size: 0.09, velocity: [0.4, -0.9, 0], jitter: 0.5 });
      break;
    }
    case 'xenith': {
      // Organic hive: curved resin spires, glowing egg clusters and hive mounds.
      const resin = mat(0x7a5a24, { roughness: 0.35, metalness: 0.1 });
      const chitin = mat(0x2e2a1c, { roughness: 0.5 });
      for (let i = 0; i < 18; i++) {
        const [x, z] = scatter(rng, 5, 14);
        const h = 2 + rng.next() * 5;
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        const segs = 4;
        let px = 0, py = 0;
        const bend = (rng.next() - 0.5) * 0.6;
        for (let k = 0; k < segs; k++) {
          const seg = mesh(new THREE.CylinderGeometry(0.15 * (segs - k), 0.2 * (segs - k + 0.6), h / segs, 6), k % 2 ? resin : chitin, px, py + h / segs / 2, 0, g);
          seg.rotation.z = bend * k * 0.5;
          px += Math.sin(-seg.rotation.z) * (h / segs);
          py += Math.cos(seg.rotation.z) * (h / segs);
        }
        g.rotation.y = rng.next() * Math.PI * 2;
        group.add(g);
      }
      const eggs: THREE.Mesh[] = [];
      for (let i = 0; i < 7; i++) {
        const [x, z] = scatter(rng, 4, 10);
        for (let k = 0; k < 3 + rng.int(0, 3); k++) {
          const egg = mesh(new THREE.SphereGeometry(0.25 + rng.next() * 0.15, 10, 8), glowMat(0xffb040, 0.6, { transparent: true, opacity: 0.85, roughness: 0.2 }),
            x + (rng.next() - 0.5) * 0.9, 0.25, z + (rng.next() - 0.5) * 0.9, group);
          egg.scale.y = 1.35;
          egg.userData.phase = rng.next() * Math.PI * 2;
          eggs.push(egg);
        }
      }
      for (let i = 0; i < 5; i++) {
        const [x, z] = scatter(rng, 7, 12);
        const mound = mesh(new THREE.SphereGeometry(1.5 + rng.next(), 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), chitin, x, 0, z, group);
        mound.scale.y = 0.8 + rng.next() * 0.6;
        mesh(new THREE.CircleGeometry(0.35, 8), glowMat(0xffb040, 1.2), x, 0.6 * mound.scale.y, z + 1.2, group);
      }
      updaters.push((_dt, t) => {
        for (const e of eggs) (e.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.45 + Math.sin(t * 1.6 + (e.userData.phase as number)) * 0.3;
      });
      celestial(group, { pos: [-20, 26, -70], radius: 9, color: 0xfff0c0, shade: 0x6a6a30 });
      addParticles({ count: 120, color: 0xffd27a, size: 0.08, velocity: [0.1, 0.25, 0], jitter: 0.6, additive: true });
      break;
    }
    case 'void_rift': {
      // Derelict hull fragments.
      const hull = mat(0x4a4458, { metalness: 0.6, roughness: 0.5 });
      for (let i = 0; i < 16; i++) {
        const [x, z] = scatter(rng, 5, 13);
        const w = 0.8 + rng.next() * 2.5;
        const h = 0.6 + rng.next() * 3.5;
        const piece = mesh(new THREE.BoxGeometry(w, h, 0.5 + rng.next()), hull, x, h / 2 - 0.2, z, group);
        piece.rotation.set((rng.next() - 0.5) * 0.6, rng.next() * 3, (rng.next() - 0.5) * 0.6);
        if (rng.chance(40)) mesh(new THREE.BoxGeometry(w * 0.6, 0.08, 0.05), glowMat(0xb48cff, 1.5), x, h * 0.6, z + 0.3, group).rotation.y = piece.rotation.y;
      }
      // Floating debris.
      const debris: THREE.Mesh[] = [];
      for (let i = 0; i < 14; i++) {
        const [x, z] = scatter(rng, 4, 12);
        const d = mesh(new THREE.TetrahedronGeometry(0.2 + rng.next() * 0.4, 0), hull, x, 2 + rng.next() * 4, z, group);
        d.userData.phase = rng.next() * Math.PI * 2;
        d.userData.baseY = d.position.y;
        debris.push(d);
      }
      // The rift itself: a dark disc in a swirling ring.
      const rift = new THREE.Group();
      rift.position.set(6, 20, -60);
      rift.add(new THREE.Mesh(new THREE.CircleGeometry(10, 48), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })));
      const swirl = new THREE.Mesh(
        new THREE.TorusGeometry(11, 1.6, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0xb48cff, fog: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
      );
      const outer = new THREE.Mesh(
        new THREE.TorusGeometry(14, 3, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0x5a2aa8, fog: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }),
      );
      rift.add(swirl, outer);
      group.add(rift);
      updaters.push((_dt, t) => {
        swirl.rotation.z = t * 0.3;
        outer.rotation.z = -t * 0.15;
        swirl.scale.setScalar(1 + Math.sin(t * 1.5) * 0.03);
        for (const d of debris) {
          d.position.y = (d.userData.baseY as number) + Math.sin(t * 0.6 + (d.userData.phase as number)) * 0.4;
          d.rotation.x += 0.003;
          d.rotation.y += 0.004;
        }
      });
      group.add(stars(rng, 600, 0.8));
      addParticles({ count: 80, color: 0xb48cff, size: 0.09, velocity: [0, 0.25, 0], jitter: 0.5, additive: true });
      break;
    }
  }
}

const LIGHTING: Record<string, Lighting> = {
  ship: { hemiSky: 0xcfe6ff, hemiGround: 0x1a2030, hemi: 1.3, sunColor: 0xe8f2ff, sun: 1.8, rimColor: 0x2fd6ff, rim: 2.2 },
  veridia: { hemiSky: 0xe8fff4, hemiGround: 0x2f7a5a, hemi: 1.4, sunColor: 0xfff4e0, sun: 2.2, rimColor: 0xd8a8ff, rim: 1.2 },
  kethra: { hemiSky: 0xffb38a, hemiGround: 0x4a2d22, hemi: 1.5, sunColor: 0xff9a5a, sun: 1.6, rimColor: 0xff7a3a, rim: 3 },
  glacies: { hemiSky: 0xffffff, hemiGround: 0xa8c0d8, hemi: 1.4, sunColor: 0xffffff, sun: 2.2, rimColor: 0xb8c8ff, rim: 1.2 },
  xenith: { hemiSky: 0xfff0c0, hemiGround: 0x4a3a22, hemi: 1.4, sunColor: 0xffe0a0, sun: 2.0, rimColor: 0xffb040, rim: 2.2 },
  void_rift: { hemiSky: 0xc8a8ff, hemiGround: 0x2a2436, hemi: 1.5, sunColor: 0xc8a8ff, sun: 1.6, rimColor: 0xd0a8ff, rim: 3 },
};

export function buildEnvironment(key: string): Environment {
  const palette = key === 'ship' ? SHIP_PALETTE : getMission(key).palette;
  const rng = new Rng(Array.from(key).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  const group = new THREE.Group();
  const updaters: Updater[] = [];
  const addParticles = (spec: ParticleSpec) => {
    const p = particles(spec, rng);
    group.add(p.points);
    updaters.push(p.update);
  };

  group.add(skyDome(palette.sky, palette.fog));
  if (key === 'ship') {
    group.add(ground(palette.ground, rng, 0));
    buildShip(group, rng, updaters);
    addParticles({ count: 30, color: 0x9fe8ff, size: 0.05, velocity: [0.05, 0.05, 0], jitter: 0.2, additive: true });
  } else {
    group.add(ground(palette.ground, rng));
    buildWorld(key, group, rng, updaters, addParticles);
  }

  return {
    group,
    sky: palette.sky,
    fog: palette.fog,
    fogNear: key === 'ship' ? 16 : 14,
    fogFar: key === 'ship' ? 60 : 45,
    lighting: LIGHTING[key] ?? LIGHTING.ship!,
    update: (dt, t) => { for (const u of updaters) u(dt, t); },
  };
}
