/**
 * Scene editor (dist/editor.html, `npm run dev` → /editor.html): a location
 * with a practice lineup in it. Its layers (painted parts, sprites, the
 * fighters) can be reordered, switched off while editing, and the placed ones
 * dragged around. Save writes src/render/scenes/layouts.json through the dev
 * server; unsaved edits survive a reload. It runs its own copy of the game
 * state, so the game's save is never touched.
 */
import { HOSTILES, drillRoster, getHostile, initialState, step } from '../core';
import type { GameState } from '../core';
import { Stage } from '../render/stage';
import { layerBox } from '../render/scenes/backdrop';
import { FEET, HORIZON, MAX_W, MIN_W, planeLine } from '../render/scenes/scale';
import { LAYOUT_DATA, LOCATION_IDS, locationOf } from '../render/scenes/locations';
import type { Location, SceneLayer } from '../render/scenes/locations';
import { loadSheets } from '../render/sprites/sheets';
import { SHEETS } from '../render/sprites/sheet-data';
import type { SheetId } from '../render/sprites/sheet-data';
import { History, clone, isPlaced, moveTo, newSprite, pick, reorder, sizeCheck } from './model';
import { renderPanel } from './panel';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const overlay = document.querySelector<HTMLElement>('#fx')!;
const panel = document.querySelector<HTMLElement>('#panel')!;
const stage = new Stage(canvas, overlay);

// ─── Per-viewer conveniences (browser storage may be unavailable) ─────────────
const store = {
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(`editor:${key}`); return v === null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
  },
  set(key: string, v: unknown) {
    try { if (v === null) localStorage.removeItem(`editor:${key}`); else localStorage.setItem(`editor:${key}`, JSON.stringify(v)); } catch { /* fine */ }
  },
};

// Sheets used by figures aren't scenery.
const FIGURE_SHEETS = new Set<string>(Object.values(HOSTILES).flatMap((h) => (h.look.sprite ? [h.look.sprite.sheet] : [])));
const SCENERY = (Object.keys(SHEETS) as SheetId[]).filter((id) => !FIGURE_SHEETS.has(id) && !id.startsWith('officer') && id !== 'weapons');
const WIDTHS = [MIN_W, 352, MAX_W];

let loc = LOCATION_IDS.includes(location.hash.slice(1)) ? location.hash.slice(1) : store.get('loc', 'veridia');
let saved: SceneLayer[] = [];
let layers: SceneLayer[] = [];
let sel: number | null = null;
let status = '';
let width = store.get('width', MIN_W);
let bloom = store.get('bloom', true);
let guides = store.get('guides', true);
let collapsed = store.get('collapsed', false);
/** Layers switched off while editing (by object, so they stay off when the order changes). Not saved. */
const hidden = new Set<SceneLayer>();
let history = new History();
let lineup: string[] = [];
let sheet: SheetId = SCENERY[0]!;

const rosterOf = (id: string) => drillRoster().find((w) => w.missionId === id)?.hostileIds ?? [];
const dirty = () => JSON.stringify(layers) !== JSON.stringify(saved);
const here = (): Location => locationOf(loc, { layers });

function openLocation(id: string) {
  loc = id;
  location.hash = id;
  store.set('loc', id);
  saved = clone(LAYOUT_DATA[id]!.layers);
  // Unsaved edits from before a reload (the dev server reloads the page on every code change).
  const draft = store.get<unknown>(`draft:${id}`, null);
  layers = Array.isArray(draft) ? (draft as SceneLayer[]) : clone(saved);
  status = dirty() ? 'Unsaved changes restored.' : store.get('flash', '');
  store.set('flash', null);
  sel = null;
  hidden.clear();
  history = new History();
  const roster = rosterOf(id);
  const kept = store.get<string[]>(`lineup:${id}`, []).filter((h) => roster.includes(h));
  lineup = kept.length ? kept : roster.slice(-1);
  showFighters();
  refresh();
}

/** A practice fight in this location (the editor's own state; the game's save is untouched). */
function showFighters() {
  let s: GameState = step(initialState(1), { type: 'newGame', name: 'Officer' }).state;
  if (lineup.length) s = step(s, { type: 'startDrill', hostileIds: lineup }).state;
  stage.sync(s);
}

/** Push the layers to the stage (hidden ones left out) and redraw the panel. */
function refresh(panelToo = true) {
  stage.edit({ layers: layers.filter((l) => !hidden.has(l)) }, bloom, drawGuides, width);
  store.set(`draft:${loc}`, dirty() ? layers : null);
  if (panelToo) renderNow();
}

function renderNow() {
  document.body.classList.toggle('collapsed', collapsed);
  const scroll = panel.scrollTop;
  panel.innerHTML = collapsed
    ? '<button data-act="collapse" class="collapse" title="Show the panel">⟩</button>'
    : renderPanel({
      loc, locations: LOCATION_IDS, location: here(), sel, dirty: dirty(), status, hidden, bloom, guides,
      roster: rosterOf(loc).map((id) => ({ id, name: getHostile(id).name })), lineup,
      width, widths: WIDTHS, sheets: SCENERY, sheet,
    });
  panel.scrollTop = scroll;
}

/** Record the layers before a change (for undo). */
const change = () => { history.push(layers); status = ''; };

// ─── Guides drawn over the scene ──────────────────────────────────────────────
let hover: number | null = null;
function drawGuides(ctx: CanvasRenderingContext2D) {
  if (!guides) return;
  const { W, H } = stage.geometry;
  const line = (y: number, col: string, dash = 4) => {
    ctx.fillStyle = col;
    for (let x = 0; x < W; x += dash) ctx.fillRect(x, y, dash / 2, 1);
  };
  line(HORIZON, 'rgba(120,200,255,0.55)');
  line(FEET, 'rgba(255,210,120,0.6)');
  // The narrowest scene: what every screen shows.
  const x0 = Math.round((W - MIN_W) / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  if (x0 > 0) for (let y = 0; y < H; y += 4) { ctx.fillRect(x0, y, 1, 2); ctx.fillRect(x0 + MIN_W - 1, y, 1, 2); }
  const outline = (i: number | null, col: string) => {
    const l = i === null ? undefined : layers[i];
    const b = l && layerBox(here(), l, W);
    if (!b) return;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  };
  outline(hover, 'rgba(255,255,255,0.35)');
  outline(sel, '#ffd36a');
  // Where the selected sprite's plane stands: a guide for placing it at a believable depth.
  const l = sel === null ? undefined : layers[sel];
  const c = l?.part === 'sprite' ? sizeCheck(l.sheet) : null;
  if (c && c.plane !== 'fighters') line(planeLine(c.plane), 'rgba(140,255,160,0.7)', 6);
}

// ─── Mouse: select and drag in the scene ──────────────────────────────────────
let drag: { dx: number; dy: number; moved: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  const [x, y] = stage.toScene(e.clientX, e.clientY);
  sel = pick(here(), stage.geometry.W, x, y, hidden);
  const l = sel === null ? undefined : layers[sel];
  const b = l && layerBox(here(), l, stage.geometry.W);
  drag = b ? { dx: x - b.x, dy: y - b.y, moved: false } : null;
  if (drag) canvas.setPointerCapture(e.pointerId);
  refresh();
});
canvas.addEventListener('pointermove', (e) => {
  const [x, y] = stage.toScene(e.clientX, e.clientY);
  if (!drag || sel === null) {
    hover = pick(here(), stage.geometry.W, x, y, hidden);
    canvas.style.cursor = hover !== null ? 'grab' : '';
    return;
  }
  if (!drag.moved) { change(); drag.moved = true; }
  moveTo(here(), layers[sel]!, stage.geometry.W, Math.round(x - drag.dx), Math.round(y - drag.dy));
  refresh(false);
});
const endDrag = () => { if (drag?.moved) renderNow(); drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ─── Panel ────────────────────────────────────────────────────────────────────
panel.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || el.tagName === 'SELECT') return;
  const act = el.dataset.act!;
  const i = el.dataset.i !== undefined ? Number(el.dataset.i) : sel;
  const l = i === null ? undefined : layers[i];
  switch (act) {
    case 'select': sel = i; break;
    case 'eye': if (l && !hidden.delete(l)) hidden.add(l); break;
    case 'up': case 'down': if (i !== null) { change(); sel = reorder(layers, i, act === 'up' ? 1 : -1); } break;
    case 'add': {
      // Just behind the fighters.
      change();
      const at = Math.max(0, layers.findIndex((x) => x.part === 'fighters'));
      layers.splice(at, 0, newSprite(sheet));
      sel = at;
      break;
    }
    case 'dup': if (l && i !== null && isPlaced(l) && l.part !== 'body') { change(); layers.splice(i + 1, 0, clone(l)); sel = i + 1; } break;
    case 'del': if (l && i !== null && (l.part === 'sprite' || l.part === 'prop')) { change(); layers.splice(i, 1); sel = null; } break;
    case 'bloom': bloom = !bloom; store.set('bloom', bloom); break;
    case 'guides': guides = !guides; store.set('guides', guides); break;
    case 'collapse':
      collapsed = !collapsed;
      store.set('collapsed', collapsed);
      renderNow();
      window.dispatchEvent(new Event('resize'));
      return;
    case 'lineup': {
      const id = el.dataset.id!;
      lineup = lineup.includes(id) ? lineup.filter((h) => h !== id) : [...lineup, id].slice(-3);
      store.set(`lineup:${loc}`, lineup);
      showFighters();
      break;
    }
    case 'width': width = Number(el.dataset.w); store.set('width', width); break;
    case 'save': void save(); return;
    case 'revert': change(); layers = clone(saved); sel = null; status = 'Reverted to the saved layout.'; break;
    default: return;
  }
  refresh();
});

panel.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.dataset.act === 'loc') { openLocation(el.value); return; }
  if (el.dataset.act === 'sheet') { sheet = el.value as SheetId; return; }
  const field = el.dataset.field;
  const l = sel === null ? undefined : layers[sel];
  if (!field || !l) return;
  const v = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : Number(el.value);
  if (typeof v === 'number' && !Number.isFinite(v)) return;
  change();
  const rec = l as unknown as Record<string, unknown>;
  if (v === false) delete rec[field]; else rec[field] = v;
  refresh();
});

// ─── Keyboard ─────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  const typing = (e.target as HTMLElement).closest('input, select');
  const ctrl = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (ctrl && key === 's') { e.preventDefault(); void save(); return; }
  if (ctrl && (key === 'z' || key === 'y')) {
    if (typing) return;
    e.preventDefault();
    const back = key === 'y' || e.shiftKey ? history.redo(layers) : history.undo(layers);
    if (back) { layers = back; hidden.clear(); if (sel !== null && sel >= layers.length) sel = null; refresh(); }
    return;
  }
  const l = sel === null ? undefined : layers[sel];
  if (typing || !l || sel === null) return;
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key] && isPlaced(l)) {
    e.preventDefault();
    change();
    l.x += arrows[e.key]![0];
    l.y += arrows[e.key]![1];
  } else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); change(); sel = reorder(layers, sel, e.key === 'PageUp' ? 1 : -1); }
  else if (e.key === 'Escape') sel = null;
  else if (key === 'h') { if (!hidden.delete(l)) hidden.add(l); }
  else if (key === 'p' && isPlaced(l)) { change(); if (l.pinned) delete l.pinned; else l.pinned = true; }
  else if (key === 'f' && l.part === 'sprite') { change(); if (l.flip) delete l.flip; else l.flip = true; }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && (l.part === 'sprite' || l.part === 'prop')) { change(); layers.splice(sel, 1); sel = null; }
  else return;
  refresh();
});

window.addEventListener('beforeunload', () => store.set(`draft:${loc}`, dirty() ? layers : null));

// ─── Saving ───────────────────────────────────────────────────────────────────
async function save() {
  if (!dirty()) return;
  const body = JSON.stringify({ id: loc, layout: { layers } });
  try {
    const res = await fetch('/__layout', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
    saved = clone(layers);
    status = 'Saved to src/render/scenes/layouts.json.';
    // The dev server reloads the page once it has rebuilt with the new file: say so after the reload too.
    store.set('flash', status);
    store.set(`draft:${loc}`, null);
  } catch (err) {
    // Not the dev server (e.g. `npm run preview`): hand over the layout instead.
    const text = JSON.stringify({ layers }, null, 2);
    try { await navigator.clipboard.writeText(text); status = `Couldn't save (${String(err)}); run \`npm run dev\` to save. The ${loc} layout is on the clipboard.`; } catch { status = `Couldn't save (${String(err)}); run \`npm run dev\` to save.`; }
  }
  renderNow();
}

void loadSheets().then(() => refresh());
openLocation(loc);
