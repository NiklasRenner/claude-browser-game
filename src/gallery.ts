/**
 * Model gallery (dist/gallery.html): every officer kit and every hostile side
 * by side, idling, so art changes can be judged at a glance. `npm run gallery`
 * screenshots it to test-results/gallery.png.
 *
 * URL options: ?t=<seconds> freezes the animation clock (for stable screenshots);
 * ?only=heroes|hostiles shows just one group (bigger).
 */
import * as THREE from 'three';
import { DIVISIONS, HOSTILES } from './core';
import type { DivisionId } from './core';
import { buildHero, buildHostile } from './render/models';
import type { Figure } from './render/models';

const canvas = document.querySelector<HTMLCanvasElement>('#gallery')!;
const labels = document.querySelector<HTMLElement>('#labels')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setScissorTest(true);

interface Cell { label: string; figure: Figure; scene: THREE.Scene; camera: THREE.PerspectiveCamera }

function stageFor(figure: Figure, label: string): Cell {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2130);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3226, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-3, 6, 4);
  sun.castShadow = true;
  const rim = new THREE.DirectionalLight(0xb8c8ff, 1.4);
  rim.position.set(2, 4, -6);
  scene.add(sun, rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshStandardMaterial({ color: 0x2a3344 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor, figure.root);
  // Turn 3/4 towards the camera (figures face +X), then frame the whole figure.
  figure.root.rotation.y = -0.6;
  figure.idle(0);
  const box = new THREE.Box3().setFromObject(figure.root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const dist = Math.max(size.y * 1.25, size.x * 0.9, size.z * 0.9, 1.6) * 1.9;
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(center.x + dist * 0.15, center.y + dist * 0.25, center.z + dist);
  camera.lookAt(center.x, center.y * 0.95, center.z);
  return { label, figure, scene, camera };
}

const params = new URLSearchParams(location.search);
const only = params.get('only');
const cells: Cell[] = [];
const kits: [string, string][] = [['starter', 'duty_uniform'], ['mid', 'composite_vest'], ['top', 'aegis_power_armor']];
const topWeapon: Record<DivisionId, string> = { security: 'plasma_cannon', science: 'stasis_projector', engineer: 'singularity_edge' };
for (const id of only === 'hostiles' ? [] : Object.keys(DIVISIONS) as DivisionId[]) {
  for (const [tier, armor] of kits) {
    const weapon = tier === 'starter' ? DIVISIONS[id].startWeapon : tier === 'mid' ? 'ion_lance' : topWeapon[id];
    cells.push(stageFor(buildHero(id, weapon, armor), `${DIVISIONS[id].name} · ${tier}`));
  }
}
for (const h of only === 'heroes' ? [] : Object.values(HOSTILES)) cells.push(stageFor(buildHostile(h.look, !!h.boss), `${h.name}${h.boss ? ' ★' : ''}`));

const cols = only === 'heroes' ? 5 : 8;
const rows = Math.ceil(cells.length / cols);
labels.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
labels.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
labels.innerHTML = cells.map((c) => `<div>${c.label}</div>`).join('');

const frozen = params.get('t');
const clock = new THREE.Clock();
function frame() {
  const w = canvas.clientWidth;
  const hgt = canvas.clientHeight;
  renderer.setSize(w, hgt, false);
  const cw = w / cols;
  const ch = hgt / rows;
  const t = frozen !== null ? Number(frozen) : clock.getElapsedTime();
  cells.forEach((c, i) => {
    const x = (i % cols) * cw;
    const y = hgt - (Math.floor(i / cols) + 1) * ch;
    renderer.setViewport(x, y, cw, ch);
    renderer.setScissor(x, y, cw, ch);
    c.camera.aspect = cw / ch;
    c.camera.updateProjectionMatrix();
    c.figure.idle(t + i * 0.37);
    renderer.render(c.scene, c.camera);
  });
}
renderer.setAnimationLoop(frame);
(window as unknown as { galleryReady: boolean }).galleryReady = true;
