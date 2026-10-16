/**
 * Scene editor (dist/editor.html, `npm run dev` → /editor.html): a location
 * with a practice lineup in it, where the layout (set pieces, props, the body
 * in the sky) can be dragged around and its layers switched off. Save writes
 * src/render/scenes/layouts.json through the dev server; unsaved edits survive
 * a reload. It runs its own copy of the game state, so the game's save is
 * never touched.
 */
import { drillRoster, getHostile, initialState, step } from '../core';
import type { GameState } from '../core';
import { Stage } from '../render/stage';
import { backdropParts } from '../render/scenes/backdrop';
import { MAX_W, MIN_W } from '../render/scenes/depth';
import { LAYOUT_DATA, LOCATION_IDS } from '../render/scenes/locations';
import type { Layout } from '../render/scenes/locations';
import { loadSheets } from '../render/sprites/sheets';
import { SHEETS } from '../render/sprites/sheet-data';
import type { SheetId } from '../render/sprites/sheet-data';
import { HOSTILES } from '../core';
import { History, boxOf, clone, moveTo, newPiece, pick, stretch } from './model';
import type { Sel } from './model';
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

// Sheets used by figures aren't set pieces.
const FIGURE_SHEETS = new Set<string>(Object.values(HOSTILES).flatMap((h) => (h.look.sprite ? [h.look.sprite.sheet] : [])));
const PIECE_SHEETS = (Object.keys(SHEETS) as SheetId[]).filter((id) => !FIGURE_SHEETS.has(id) && !id.startsWith('officer') && id !== 'weapons');
const WIDTHS = [MIN_W, 352, MAX_W];

let loc = LOCATION_IDS.includes(location.hash.slice(1)) ? location.hash.slice(1) : store.get('loc', 'veridia');
let saved: Layout = clone(LAYOUT_DATA[loc]!);
let layout: Layout = clone(saved);
let sel: Sel | null = null;
let status = '';
let width = store.get('width', MIN_W);
const hide = new Set<string>(store.get<string[]>('hide', []));
const hiddenPieces = new Set<number>();
let history = new History();
let lineup: string[] = [];
let sheet: SheetId = PIECE_SHEETS[0]!;

const rosterOf = (id: string) => drillRoster().find((w) => w.missionId === id)?.hostileIds ?? [];
const dirty = () => JSON.stringify(layout) !== JSON.stringify(saved);

function openLocation(id: string) {
  loc = id;
  location.hash = id;
  store.set('loc', id);
  saved = clone(LAYOUT_DATA[id]!);
  // Unsaved edits from before a reload (the dev server reloads the page on every code change).
  layout = store.get<Layout | null>(`draft:${id}`, null) ?? clone(saved);
  status = dirty() ? 'Unsaved changes restored.' : store.get('flash', '');
  store.set('flash', null);
  sel = null;
  hiddenPieces.clear();
  history = new History();
  const roster = rosterOf(id);
  const kept = store.get<string[]>(`lineup:${id}`, []).filter((h) => roster.includes(h));
  lineup = kept.length ? kept : roster.slice(-1);
  showFighters();
  refresh();
}

/** A practice fight in this location (the editor's own state; the game's save is untouched). */
function showFighters() {
  let s: GameState = step(initialState(1), { type: 'newGame', name: 'Officer', divisionId: 'security' }).state;
  if (lineup.length) s = step(s, { type: 'startDrill', hostileIds: lineup }).state;
  stage.sync(s);
}

/** Push the layout to the stage and redraw the panel. */
function refresh(panelToo = true) {
  const shown: Layout = { ...layout, pieces: layout.pieces.filter((_, i) => !hiddenPieces.has(i)) };
  stage.edit(shown, hide, drawGuides, width);
  store.set(`draft:${loc}`, dirty() ? layout : null);
  if (panelToo) renderNow();
}

function renderNow() {
  // Keep focus and the scroll position across re-renders.
  const scroll = panel.scrollTop;
  panel.innerHTML = renderPanel({
    loc, locations: LOCATION_IDS, layout, sel, dirty: dirty(), status,
    parts: backdropParts(loc), hide, hiddenPieces,
    roster: rosterOf(loc).map((id) => ({ id, name: getHostile(id).name })), lineup,
    width, widths: WIDTHS, sheets: PIECE_SHEETS,
  });
  panel.scrollTop = scroll;
  const pick = panel.querySelector<HTMLSelectElement>('[data-act="sheet"]');
  if (pick) pick.value = sheet;
}

/** Record the layout before a change (for undo). */
const change = () => { history.push(layout); status = ''; };

// ─── Guides drawn over the scene ──────────────────────────────────────────────
let hover: Sel | null = null;
function drawGuides(ctx: CanvasRenderingContext2D) {
  if (hide.has('guides')) return;
  const g = stage.geometry;
  const line = (y: number, col: string) => {
    ctx.fillStyle = col;
    for (let x = 0; x < g.W; x += 4) ctx.fillRect(x, y, 2, 1);
  };
  line(g.horizon, 'rgba(120,200,255,0.55)');
  line(g.feet, 'rgba(255,210,120,0.6)');
  // The narrowest scene: what every screen shows.
  const x0 = Math.round((g.W - MIN_W) / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  if (x0 > 0) for (let y = 0; y < g.H; y += 4) { ctx.fillRect(x0, y, 1, 2); ctx.fillRect(x0 + MIN_W - 1, y, 1, 2); }
  const outline = (s: Sel | null, col: string) => {
    const b = s && boxOf(layout, s, g);
    if (!b) return;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  };
  outline(hover, 'rgba(255,255,255,0.35)');
  outline(sel, '#ffd36a');
}

// ─── Mouse: select and drag in the scene ──────────────────────────────────────
let drag: { dx: number; dy: number; moved: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  const [x, y] = stage.toScene(e.clientX, e.clientY);
  sel = pick(layout, stage.geometry, x, y, hiddenPieces);
  const b = sel && boxOf(layout, sel, stage.geometry);
  drag = b ? { dx: x - b.x, dy: y - b.y, moved: false } : null;
  if (drag) canvas.setPointerCapture(e.pointerId);
  refresh();
});
canvas.addEventListener('pointermove', (e) => {
  const [x, y] = stage.toScene(e.clientX, e.clientY);
  if (!drag || !sel) {
    hover = pick(layout, stage.geometry, x, y, hiddenPieces);
    canvas.style.cursor = hover ? 'grab' : '';
    return;
  }
  if (!drag.moved) { change(); drag.moved = true; }
  moveTo(layout, sel, stage.geometry, Math.round(x - drag.dx), Math.round(y - drag.dy), e.shiftKey);
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
  const i = sel?.kind === 'piece' ? sel.i : -1;
  switch (act) {
    case 'select': sel = JSON.parse(el.dataset.sel!) as Sel; break;
    case 'eye': {
      const n = Number(el.dataset.i);
      if (!hiddenPieces.delete(n)) hiddenPieces.add(n);
      e.stopPropagation();
      break;
    }
    case 'layer': {
      const id = el.dataset.id!;
      if (!hide.delete(id)) hide.add(id);
      store.set('hide', [...hide]);
      break;
    }
    case 'lineup': {
      const id = el.dataset.id!;
      lineup = lineup.includes(id) ? lineup.filter((h) => h !== id) : [...lineup, id].slice(-3);
      store.set(`lineup:${loc}`, lineup);
      showFighters();
      break;
    }
    case 'width': width = Number(el.dataset.w); store.set('width', width); break;
    case 'add': change(); layout.pieces.push(newPiece(sheet)); sel = { kind: 'piece', i: layout.pieces.length - 1 }; break;
    case 'dup': if (i >= 0) { change(); layout.pieces.splice(i + 1, 0, clone({ ...layout, pieces: [layout.pieces[i]!] }).pieces[0]!); sel = { kind: 'piece', i: i + 1 }; } break;
    case 'del': if (i >= 0) { change(); layout.pieces.splice(i, 1); sel = null; hiddenPieces.clear(); } break;
    case 'up': case 'down': {
      const j = act === 'up' ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= layout.pieces.length) break;
      change();
      [layout.pieces[i], layout.pieces[j]] = [layout.pieces[j]!, layout.pieces[i]!];
      sel = { kind: 'piece', i: j };
      break;
    }
    case 'save': void save(); return;
    case 'revert': change(); layout = clone(saved); sel = null; status = 'Reverted to the saved layout.'; break;
    default: return;
  }
  refresh();
});

panel.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.dataset.act === 'loc') { openLocation(el.value); return; }
  if (el.dataset.act === 'sheet') { sheet = el.value as SheetId; return; }
  const field = el.dataset.field;
  if (!field || !sel) return;
  change();
  const v = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
  if (typeof v === 'number' && !Number.isFinite(v)) return;
  if (sel.kind === 'body') Object.assign(layout.body!, { [field]: v });
  else if (sel.kind === 'prop') Object.assign(layout.props[sel.i]!, { [field]: v });
  else {
    const p = layout.pieces[sel.i]!;
    if (field === 'fromX' || field === 'fromY') {
      const [ax, ay] = p.from ?? [0, 0];
      p.from = field === 'fromX' ? [v as number, ay] : [ax, v as number];
    } else if (field === 'flip') {
      if (v) p.flip = true; else delete p.flip;
    } else if (field === 'at') {
      p.at = v as typeof p.at;
      if (p.at === 'hang' && !p.from) { p.from = [160, 40]; p.chain = 10; }
      if ((p.at === 'ground' || p.at === 'far') && !p.height) Object.assign(p, { height: newPiece(p.sheet).height });
    } else Object.assign(p, { [field]: v });
  }
  refresh();
});

// ─── Keyboard ─────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  const typing = (e.target as HTMLElement).closest('input, select');
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
  if (ctrl && e.key.toLowerCase() === 'z' || ctrl && e.key.toLowerCase() === 'y') {
    if (typing) return;
    e.preventDefault();
    const back = e.key.toLowerCase() === 'y' || e.shiftKey ? history.redo(layout) : history.undo(layout);
    if (back) { layout = back; if (sel && !boxOf(layout, sel, stage.geometry)) sel = null; refresh(); }
    return;
  }
  if (typing || !sel) return;
  const g = stage.geometry;
  const b = boxOf(layout, sel, g);
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const piece = sel.kind === 'piece' ? layout.pieces[sel.i] : undefined;
  if (arrows[e.key] && b) {
    e.preventDefault();
    change();
    const [dx, dy] = arrows[e.key]!;
    if (e.shiftKey && piece?.at === 'hang') stretch(layout, sel, dy);
    else moveTo(layout, sel, g, b.x + dx, b.y + dy, dy === 0);
  } else if (e.key === 'Escape') sel = null;
  else if (piece && (e.key === 'f' || e.key === 'F')) { change(); if (piece.flip) delete piece.flip; else piece.flip = true; }
  else if (piece?.at === 'far' && (e.key === '[' || e.key === ']')) { change(); piece.rank = Math.max(0, (piece.rank ?? 0) + (e.key === ']' ? 1 : -1)); }
  else if (piece && (e.key === 'h' || e.key === 'H')) { const i = (sel as { i: number }).i; if (!hiddenPieces.delete(i)) hiddenPieces.add(i); }
  else if (piece && (e.key === 'Delete' || e.key === 'Backspace')) { change(); layout.pieces.splice((sel as { i: number }).i, 1); sel = null; hiddenPieces.clear(); }
  else return;
  refresh();
});

window.addEventListener('beforeunload', () => store.set(`draft:${loc}`, dirty() ? layout : null));

// ─── Saving ───────────────────────────────────────────────────────────────────
async function save() {
  if (!dirty()) return;
  const body = JSON.stringify({ id: loc, layout });
  try {
    const res = await fetch('/__layout', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
    saved = clone(layout);
    status = 'Saved to src/render/scenes/layouts.json.';
    // The dev server reloads the page once it has rebuilt with the new file: say so after the reload too.
    store.set('flash', status);
    store.set(`draft:${loc}`, null);
  } catch (err) {
    // Not the dev server (e.g. `npm run preview`): hand over the layout instead.
    const text = JSON.stringify(layout, null, 2);
    try { await navigator.clipboard.writeText(text); status = `Couldn't save (${String(err)}); run \`npm run dev\` to save. The ${loc} layout is on the clipboard.`; } catch { status = `Couldn't save (${String(err)}); run \`npm run dev\` to save.`; }
  }
  renderNow();
}

void loadSheets().then(() => refresh());
openLocation(loc);
