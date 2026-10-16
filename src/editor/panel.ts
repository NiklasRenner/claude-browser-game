/**
 * The scene editor's side panel, as HTML: location, layers, the list of
 * things in the scene and an inspector for the selected one. Inputs carry
 * `data-act` (buttons, checkboxes) or `data-field` (inspector values); the
 * editor (main.ts) handles them.
 */
import type { Layout } from '../render/scenes/locations';
import type { Piece } from '../render/scenes/pieces';
import { depthOfPiece } from './model';
import type { Sel } from './model';

export interface PanelState {
  loc: string;
  locations: string[];
  layout: Layout;
  sel: Sel | null;
  dirty: boolean;
  status: string;
  parts: { id: string; label: string }[];
  hide: ReadonlySet<string>;
  hiddenPieces: ReadonlySet<number>;
  roster: { id: string; name: string }[];
  lineup: readonly string[];
  width: number;
  widths: number[];
  sheets: string[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const same = (a: Sel | null, b: Sel) => !!a && a.kind === b.kind && (a.kind === 'body' || (b.kind !== 'body' && a.i === b.i));

const PLACES: Record<Piece['at'], string> = { ground: 'on the ground', far: 'skyline', hang: 'hanging', left: 'left edge', right: 'right edge' };

function inspector(s: PanelState): string {
  const sel = s.sel;
  if (!sel) return '<p class="hint">Click something in the scene, or in the list above.</p>';
  const num = (field: string, label: string, v: number | undefined, step: number, note = '') =>
    `<label>${label}<input type="number" step="${step}" data-field="${field}" value="${v ?? ''}">${note ? `<small>${note}</small>` : ''}</label>`;
  if (sel.kind === 'body') {
    const b = s.layout.body!;
    return `<h3>${b.kind}</h3>${num('x', 'x (of width)', b.x, 0.01)}${num('y', 'y (of horizon)', b.y, 0.01)}${num('r', b.kind === 'planet' ? 'radius (of width)' : 'radius (px)', b.r, b.kind === 'planet' ? 0.01 : 1)}`;
  }
  if (sel.kind === 'prop') {
    const p = s.layout.props[sel.i]!;
    return `<h3>Prop: ${p.style}</h3>${num('x', 'x (of width)', p.x, 0.01)}`;
  }
  const p = s.layout.pieces[sel.i]!;
  const d = depthOfPiece(p);
  const depthNote = d === null ? '' : `depth ${d.toFixed(2)}${d > 1 ? ' · in front of the fighters' : d < 0.25 ? ' · far' : ''}`;
  const at = Object.entries(PLACES).map(([k, v]) => `<option value="${k}"${k === p.at ? ' selected' : ''}>${v}</option>`).join('');
  const rows = [`<label>Placed<select data-field="at">${at}</select></label>`];
  if (p.at === 'ground' || p.at === 'far') {
    rows.push(num('x', 'x (of 320 px)', p.x, 0.005));
    rows.push(num('height', 'real height (m)', p.height, p.at === 'far' ? 1 : 0.05, depthNote));
  }
  if (p.at === 'far') rows.push(num('rank', 'after skyline', p.rank, 1));
  if (p.at === 'hang') {
    rows.push(num('fromX', 'anchor x (px)', p.from?.[0], 1));
    rows.push(num('fromY', 'anchor y (px)', p.from?.[1], 1));
    rows.push(num('chain', 'chain (px)', p.chain ?? 8, 1));
  }
  rows.push(num('fps', 'frames per second', p.fps ?? 6, 1));
  rows.push(`<label class="check"><input type="checkbox" data-field="flip"${p.flip ? ' checked' : ''}> mirrored</label>`);
  return `<h3>${esc(p.sheet)}</h3>${rows.join('')}
    <div class="row"><button data-act="dup">Duplicate</button><button data-act="up">Bring forward</button><button data-act="down">Send back</button><button data-act="del" class="danger">Delete</button></div>`;
}

export function renderPanel(s: PanelState): string {
  const locs = s.locations.map((l) => `<option${l === s.loc ? ' selected' : ''}>${l}</option>`).join('');
  const layers = [...s.parts, { id: 'fighters', label: 'Fighters' }, { id: 'bloom', label: 'Glow (bloom)' }, { id: 'guides', label: 'Guides (lines, outlines)' }]
    .map((p) => `<label class="check"><input type="checkbox" data-act="layer" data-id="${p.id}"${s.hide.has(p.id) ? '' : ' checked'}> ${esc(p.label)}</label>`).join('');
  const item = (sel: Sel, label: string, extra = '') =>
    `<li class="${same(s.sel, sel) ? 'on' : ''}" data-act="select" data-sel='${JSON.stringify(sel)}'>${extra}${esc(label)}</li>`;
  const pieces = s.layout.pieces.map((p, i) => item({ kind: 'piece', i }, `${p.sheet} · ${PLACES[p.at]}`,
    `<input type="checkbox" title="Show" data-act="eye" data-i="${i}"${s.hiddenPieces.has(i) ? '' : ' checked'}> `)).join('');
  const props = s.layout.props.map((p, i) => item({ kind: 'prop', i }, `prop: ${p.style}`)).join('');
  const body = s.layout.body ? item({ kind: 'body' }, `sky: ${s.layout.body.kind}`) : '';
  const roster = s.roster.map((h) => `<label class="check"><input type="checkbox" data-act="lineup" data-id="${h.id}"${s.lineup.includes(h.id) ? ' checked' : ''}> ${esc(h.name)}</label>`).join('');
  const widths = s.widths.map((w) => `<button data-act="width" data-w="${w}" class="${w === s.width ? 'on' : ''}">${w}</button>`).join('');
  const sheets = s.sheets.map((id) => `<option>${id}</option>`).join('');
  return `
    <header>
      <h2>Scene editor</h2>
      <div class="row"><select data-act="loc">${locs}</select>
        <button data-act="save" class="primary"${s.dirty ? '' : ' disabled'}>Save</button>
        <button data-act="revert"${s.dirty ? '' : ' disabled'}>Revert</button></div>
      <p class="status">${esc(s.status)}</p>
    </header>
    <section><h3>In the scene</h3><ul class="list">${pieces}${props}${body}</ul>
      <div class="row"><select data-act="sheet">${sheets}</select><button data-act="add">Add piece</button></div></section>
    <section class="inspector">${inspector(s)}</section>
    <details open><summary>Layers</summary>${layers}</details>
    <details><summary>Fighters &amp; width</summary>${roster || '<p class="hint">No hostiles here.</p>'}
      <div class="row">Scene width: ${widths}</div></details>
    <details><summary>Keys</summary><p class="hint">
      Drag to move; <b>Shift</b>+drag moves sideways only (keeps the depth).<br>
      Moving a ground piece up or down changes its depth, so its real height changes (it keeps its pixels).<br>
      Arrows nudge 1 px · <b>Shift</b>+↑/↓ chain length (hanging) · <b>F</b> mirror · <b>[ ]</b> skyline rank ·
      <b>H</b> hide · <b>Del</b> delete · <b>Ctrl+Z / Ctrl+Shift+Z</b> undo / redo · <b>Ctrl+S</b> save · <b>Esc</b> deselect.</p></details>`;
}
