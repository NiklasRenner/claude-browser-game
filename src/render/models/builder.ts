/**
 * Building blocks for the procedural low-poly figures: materials, primitive
 * helpers and joints (groups that idle/attack animations rotate).
 *
 * Conventions: every figure faces +X, Y is up, Z is the figure's left/right.
 * A figure is root (placed by the stage) → body (moved by the stage for lunges
 * and knockbacks) → pose (scaled to size, animated by the figure itself).
 */
import * as THREE from 'three';

export interface Figure {
  /** Placed in the world by the stage. */
  root: THREE.Group;
  /** Moved by the stage for attacks / knockbacks (offset from root). */
  body: THREE.Group;
  /** World-space height used to place floating text and the target marker. */
  height: number;
  /** Per-frame idle motion (`time` in seconds). */
  idle(time: number): void;
  /** Attack pose blend, 0 = idle … 1 = full strike (jaws open, weapon raised…). */
  attack(amount: number): void;
  /** Materials that flash when hit. */
  materials: THREE.MeshStandardMaterial[];
}

export type Mat = THREE.MeshStandardMaterial;

export function material(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): Mat {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0.05, ...opts });
}

/** Self-lit material for eyes, lights and energy. */
export function glow(color: number, intensity = 1.6, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): Mat {
  return material(color, { emissive: color, emissiveIntensity: intensity, roughness: 0.3, ...opts });
}

export function metal(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): Mat {
  return material(color, { metalness: 0.65, roughness: 0.35, ...opts });
}

/** A colour shifted towards black (k < 1) or white (k > 1). */
export function shade(color: number, k: number): number {
  const c = new THREE.Color(color);
  return k < 1 ? c.multiplyScalar(k).getHex() : c.lerp(new THREE.Color(0xffffff), k - 1).getHex();
}

type V3 = [number, number, number];

export class Builder {
  /** The animated, scaled group everything is built into. */
  readonly pose = new THREE.Group();
  readonly materials: Mat[] = [];

  add<T extends THREE.Object3D>(obj: T, parent: THREE.Object3D = this.pose): T {
    parent.add(obj);
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m instanceof THREE.MeshStandardMaterial && !this.materials.includes(m)) this.materials.push(m);
    });
    return obj;
  }

  mesh(geometry: THREE.BufferGeometry, mat: Mat, at: V3 = [0, 0, 0], parent?: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(...at);
    return this.add(m, parent);
  }

  box(size: V3, mat: Mat, at?: V3, parent?: THREE.Object3D) {
    return this.mesh(new THREE.BoxGeometry(...size), mat, at, parent);
  }

  sphere(r: number, mat: Mat, at?: V3, parent?: THREE.Object3D, detail = 1) {
    return this.mesh(new THREE.IcosahedronGeometry(r, detail), mat, at, parent);
  }

  /** Low-poly ball with a smooth silhouette (for heads, joints, bellies). */
  ball(r: number, mat: Mat, at?: V3, parent?: THREE.Object3D, segments = 10) {
    return this.mesh(new THREE.SphereGeometry(r, segments, Math.max(6, Math.round(segments * 0.7))), mat, at, parent);
  }

  cone(r: number, h: number, mat: Mat, at?: V3, parent?: THREE.Object3D, segments = 6) {
    return this.mesh(new THREE.ConeGeometry(r, h, segments), mat, at, parent);
  }

  cylinder(rTop: number, rBottom: number, h: number, mat: Mat, at?: V3, parent?: THREE.Object3D, segments = 8) {
    return this.mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat, at, parent);
  }

  /** Capsule centred on `at`, along Y. `len` is the straight part between the caps. */
  capsule(r: number, len: number, mat: Mat, at?: V3, parent?: THREE.Object3D, radial = 7) {
    return this.mesh(new THREE.CapsuleGeometry(r, len, 2, radial), mat, at, parent);
  }

  torus(r: number, tube: number, mat: Mat, at?: V3, parent?: THREE.Object3D) {
    return this.mesh(new THREE.TorusGeometry(r, tube, 6, 16), mat, at, parent);
  }

  /** An empty pivot for animation. */
  joint(at: V3 = [0, 0, 0], parent: THREE.Object3D = this.pose): THREE.Group {
    const g = new THREE.Group();
    g.position.set(...at);
    parent.add(g);
    return g;
  }

  /**
   * A limb segment hanging from `joint` along −Y: a capsule of total length
   * `len`. Returns the joint at its far end, for the next segment.
   */
  limb(joint: THREE.Group, len: number, r: number, mat: Mat, rEnd = r): THREE.Group {
    if (Math.abs(rEnd - r) < 1e-3) this.capsule(r, Math.max(0.001, len - 2 * r), mat, [0, -len / 2, 0], joint);
    else this.cylinder(rEnd, r, len, mat, [0, -len / 2, 0], joint, 7);
    this.ball(Math.max(r, rEnd) * 1.02, mat, [0, -len, 0], joint, 7);
    return this.joint([0, -len, 0], joint);
  }

  /** A flat triangle fan (wings, fins, membranes) from points in the XZ-ish plane. */
  membrane(points: V3[], mat: Mat, at?: V3, parent?: THREE.Object3D) {
    const verts: number[] = [];
    for (let i = 1; i < points.length - 1; i++) verts.push(...points[0]!, ...points[i]!, ...points[i + 1]!);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return this.mesh(geo, mat, at, parent);
  }

  /** Two glowing eyes at height y, spread along Z, on the +X face at depth x. */
  eyes(x: number, y: number, spread: number, size: number, color = 0xfff4c2, parent?: THREE.Object3D) {
    const m = glow(color, 2.2);
    return [this.sphere(size, m, [x, y, spread], parent, 0), this.sphere(size, m, [x, y, -spread], parent, 0)];
  }

  /**
   * Wraps everything into a Figure. `scale` sizes the pose group; the height is
   * measured from the built geometry.
   */
  figure(scale: number, idle: (t: number) => void, attack: (k: number) => void = () => {}): Figure {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    body.add(this.pose);
    this.pose.scale.setScalar(scale);
    idle(0);
    const height = new THREE.Box3().setFromObject(this.pose).max.y;
    return { root, body, height, idle, attack, materials: this.materials };
  }
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
