/**
 * Figure gallery (dist/gallery.html): every officer kit and every hostile
 * side by side, idling, so art changes can be judged at a glance.
 * `npm run gallery` screenshots it to test-results/gallery.png (`npm run gallery -- weapons` for the weapons).
 *
 * URL options: ?t=<seconds> freezes the clock (stable screenshots);
 * ?only=heroes|hostiles|weapons shows one group (weapons: each in the officer's hands); ?attack=<0..1> poses everyone mid-attack.
 */
import { HOSTILES, ITEMS, START_WEAPON } from './core';
import { Painter } from './render/pixel/painter';
import { heroFigure, hostileFigure, loadSheets, paintFigure } from './render/sprites';
import type { Figure } from './render/sprites';

const canvas = document.querySelector<HTMLCanvasElement>('#gallery')!;
const ctx = canvas.getContext('2d')!;
const params = new URLSearchParams(location.search);
const only = params.get('only');

interface Cell { label: string; figure: Figure; painter: Painter }
const cells: Cell[] = [];
const getName = (id: string) => ITEMS[id]?.name ?? id;
const add = (label: string, figure: Figure) => cells.push({ label, figure, painter: new Painter(1, 1) });

const kits: [string, string][] = [
  ['duty_uniform', ''], ['field_jacket', 'gauss_pistol'], ['composite_vest', 'ion_lance'],
  ['thermal_envirosuit', 'plasma_pistol'], ['arctic_hardsuit', 'mass_driver'], ['aegis_power_armor', ''],
];
/** Each armor with the starting sidearm (or its kit's weapon), then two top weapons: a heavy gun and a blade. */
const rows = ['', 'plasma_cannon', 'singularity_edge'];
if (only === 'weapons') {
  // Every weapon in the officer's hands, to check their sizes against him.
  for (const item of Object.values(ITEMS)) if (item.kind === 'weapon') add(item.name, heroFigure(item.id, 'duty_uniform'));
} else if (only !== 'hostiles') {
  for (const row of rows) {
    kits.forEach(([armor, weapon]) => {
      const w = row || weapon || START_WEAPON;
      add(`${armor.replace(/_/g, ' ')} · ${getName(w)}`, heroFigure(w, armor));
    });
  }
}
if (only !== 'heroes' && only !== 'weapons') for (const h of Object.values(HOSTILES)) add(`${h.name}${h.boss ? ' ★' : ''}`, hostileFigure(h.look, !!h.boss));

const cols = only === 'heroes' || only === 'hostiles' ? 6 : 8;
const CELL_W = 130, CELL_H = 124, ZOOM = only ? 3 : 2;
const frozen = params.get('t');
const attack = Number(params.get('attack') ?? 0);
const start = performance.now();

function frame() {
  const rows = Math.ceil(cells.length / cols);
  canvas.width = cols * CELL_W;
  canvas.height = rows * CELL_H;
  canvas.style.width = `${canvas.width * ZOOM}px`;
  canvas.style.height = `${canvas.height * ZOOM}px`;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#14121a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const t = frozen !== null ? Number(frozen) : (performance.now() - start) / 1000;
  cells.forEach((c, i) => {
    const x = (i % cols) * CELL_W, y = Math.floor(i / cols) * CELL_H;
    ctx.fillStyle = (i + Math.floor(i / cols)) % 2 ? '#1a1822' : '#1d1b26';
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.fillStyle = '#26232f';
    ctx.fillRect(x, y + CELL_H - 18, CELL_W, 1);
    const { ax, ay } = paintFigure(c.painter, c.figure, { t: t + i * 0.37, attack }, { rimDir: [0, -1], rimCol: [170, 130, 210], rimAmt: 0.25 });
    const fx = x + Math.round(CELL_W / 2 + (c.figure.left - c.figure.right) * c.figure.scale / 2), fy = y + CELL_H - 18 - Math.round(c.figure.hover * c.figure.scale);
    ctx.drawImage(c.painter.canvas, fx - ax, fy - ay);
    ctx.fillStyle = '#9a90a4';
    ctx.font = '8px monospace';
    ctx.fillText(c.label, x + 3, y + CELL_H - 6, CELL_W - 6);
  });
  if (frozen === null) requestAnimationFrame(frame);
}
void loadSheets().then(() => {
  frame();
  (window as unknown as { galleryReady: boolean }).galleryReady = true;
});
