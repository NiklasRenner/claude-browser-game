/** Visual effects: particle bursts, projectiles and floating DOM text. */
import * as THREE from 'three';
import type { Tweens } from './tween';
import { easeInOutSine } from './tween';

export class Effects {
  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private overlay: HTMLElement,
    private tweens: Tweens,
  ) {}

  /** Floating text anchored to a 3D point (damage numbers, MISS, etc.). */
  popText(at: THREE.Vector3, text: string, className: string) {
    if (this.tweens.speed === 0) return;
    const el = document.createElement('div');
    el.className = `pop ${className}`;
    el.textContent = text;
    const p = at.clone().project(this.camera);
    el.style.left = `${((p.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - p.y) / 2) * 100}%`;
    el.style.animationDuration = `${1.1 / this.tweens.speed}s`;
    this.overlay.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 3000);
  }

  /** Sphere of particles flying outwards from a point. */
  burst(at: THREE.Vector3, color: number, count = 24, speed = 3, life = 0.6, gravity = -4): Promise<void> {
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      positions.set([at.x, at.y, at.z], i * 3);
      velocities.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize()
        .multiplyScalar(speed * (0.5 + Math.random())));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.14, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    let last = 0;
    return this.tweens.run(life, (t) => {
      const dt = (t - last) * life;
      last = t;
      const p = geo.attributes.position!;
      for (let i = 0; i < count; i++) {
        const v = velocities[i]!;
        v.y += gravity * dt;
        p.setXYZ(i, p.getX(i) + v.x * dt, p.getY(i) + v.y * dt, p.getZ(i) + v.z * dt);
      }
      p.needsUpdate = true;
      mat.opacity = 1 - t;
      if (t >= 1) {
        this.scene.remove(points);
        geo.dispose();
        mat.dispose();
      }
    }, (t) => t);
  }

  /** Glowing orb that flies from one point to another. */
  async projectile(from: THREE.Vector3, to: THREE.Vector3, color: number, seconds = 0.35) {
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.18, 1),
      new THREE.MeshBasicMaterial({ color }),
    );
    const light = new THREE.PointLight(color, 6, 4);
    orb.add(light);
    this.scene.add(orb);
    await this.tweens.run(seconds, (t) => {
      orb.position.lerpVectors(from, to, t);
      orb.position.y += Math.sin(t * Math.PI) * 0.6;
    }, easeInOutSine);
    this.scene.remove(orb);
    orb.geometry.dispose();
    (orb.material as THREE.Material).dispose();
    light.dispose();
  }

  /** Expanding ground ring (casting, buffs, level-up). */
  ring(at: THREE.Vector3, color: number, radius = 1.4, seconds = 0.6): Promise<void> {
    const geo = new THREE.RingGeometry(0.7, 0.85, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(at).setY(0.05);
    this.scene.add(ring);
    return this.tweens.run(seconds, (t) => {
      ring.scale.setScalar(0.3 + t * radius);
      mat.opacity = 1 - t;
      if (t >= 1) {
        this.scene.remove(ring);
        geo.dispose();
        mat.dispose();
      }
    });
  }
}
