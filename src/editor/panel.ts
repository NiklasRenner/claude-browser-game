/**
 * The scene editor's side panel, as HTML: the location's layers (front at the
 * top) and an inspector for the selected one. Inputs carry `data-act` (buttons,
 * checkboxes) or `data-field` (inspector values); main.ts handles them.
 */
import { layerName } from '../render/scenes/backdrop';
import type { Location, SceneLayer } from '../render/scenes/locations';
import { isPiece, isPlaced, sizeCheck } from './model';

export interface PanelState {
  loc: string;
  locations: string[];
  location: Location;
  sel: number | null;
  dirty: boolean;
  status: string;
  hidden: ReadonlySet<SceneLayer>;
  bloom: boolean;
  guides: boolean;
  roster: { id: string; name: string }[];
  lineup: readonly string[];
  width: number;
  widths: number[];
  sheets: string[];
  sheet: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const check = (act: string, on: boolean, label: string, extra = '') =>
  `<label class="check"><input type="checkbox" data-act="${act}" ${extra}${on ? ' checked' : ''}> ${label}</label>`;

function inspector(s: PanelState): string {
  const l = s.sel === null ? undefined : s.location.layers[s.sel];
  if (!l) return '<p class="hint">Click something in the scene, or a layer above.</p>';
  const name = `<h3>${esc(layerName(s.location, l))}</h3>`;
  if (!isPlaced(l)) return `${name}<p class="hint">Painted from the location's look; only its place in the order changes here.</p>`;
  const num = (field: string, label: string, v: number | undefined, step: number) =>
    `<label>${label}<input type="number" step="${step}" data-field="${field}" value="${v ?? ''}"></label>`;
  const flag = (field: string, on: boolean | undefined, label: string) =>
    `<label class="check"><input type="checkbox" data-field="${field}"${on ? ' checked' : ''}> ${label}</label>`;
  const rows = [`<div class="pair">${num('x', 'x', l.x, 1)}${num('y', 'y', l.y, 1)}</div>`,
    flag('pinned', l.pinned, 'pinned to its edge <small>(else stays with the centre on wider screens)</small>')];
  if (l.part === 'sprite') {
    rows.push(flag('flip', l.flip, 'mirrored'));
    rows.push(`<div class="pair">${num('fps', 'frames / s', l.fps ?? 6, 1)}${num('fog', 'fog (0–1)', l.fog ?? 0, 0.05)}</div>`);
    const c = sizeCheck(l.sheet);
    rows.push(c
      ? `<p class="size ${c.ok ? 'ok' : 'bad'}">Made for <b>${c.plane}</b> (×${c.scale}): ${c.metres} m → ${c.expected} px expected, sprite is ${c.px} px ${c.ok ? '✓' : '✗'}<br><small>The ${c.plane} line is shown in the scene.</small></p>`
      : '<p class="size">No size label (src/render/sprites/sizes.ts).</p>');
  }
  const buttons = !isPiece(l) ? '' : '<div class="row"><button data-act="dup">Duplicate</button><button data-act="del" class="danger">Delete</button></div>';
  return name + rows.join('') + buttons;
}

export function renderPanel(s: PanelState): string {
  const locs = s.locations.map((l) => `<option${l === s.loc ? ' selected' : ''}>${l}</option>`).join('');
  const rows = s.location.layers.map((l, i) => {
    const size = l.part === 'sprite' ? sizeCheck(l.sheet) : null;
    return `<li data-act="select" data-i="${i}" class="${s.sel === i ? 'on' : ''}${l.part === 'fighters' ? ' fighters' : ''}">
      <input type="checkbox" title="Show" data-act="eye" data-i="${i}"${s.hidden.has(l) ? '' : ' checked'}>
      <span class="name">${l.part === 'fighters' ? '⚔ Fighters' : esc(layerName(s.location, l))}${size ? ` <small>${size.plane}</small>` : ''}${isPlaced(l) && l.pinned ? ' <small>📌</small>' : ''}</span>
      <span class="move"><button data-act="up" data-i="${i}" title="Forward">▲</button><button data-act="down" data-i="${i}" title="Back">▼</button></span></li>`;
  }).reverse().join('');
  const roster = s.roster.map((h) => check('lineup', s.lineup.includes(h.id), esc(h.name), `data-id="${h.id}"`)).join('');
  const widths = s.widths.map((w) => `<button data-act="width" data-w="${w}" class="${w === s.width ? 'on' : ''}">${w}</button>`).join('');
  const sheets = s.sheets.map((id) => `<option${id === s.sheet ? ' selected' : ''}>${id}</option>`).join('');
  return `
    <header>
      <div class="row"><h2>Scene editor</h2><button data-act="collapse" class="collapse" title="Hide the panel">⟨</button></div>
      <div class="row"><select data-act="loc">${locs}</select>
        <button data-act="save" class="primary"${s.dirty ? '' : ' disabled'}>Save</button>
        <button data-act="revert"${s.dirty ? '' : ' disabled'}>Revert</button></div>
      <p class="status">${esc(s.status)}</p>
    </header>
    <section><h3>Layers <small>front ↑ · back ↓</small></h3><ul class="list">${rows}</ul>
      <div class="row"><select data-act="sheet">${sheets}</select><button data-act="add">Add sprite</button></div></section>
    <section class="inspector">${inspector(s)}</section>
    <details open><summary>View</summary>${check('bloom', s.bloom, 'Glow (bloom)')}${check('guides', s.guides, 'Guides: horizon, fighters’ line, 320 px frame, outlines')}
      <div class="row">Scene width: ${widths}</div></details>
    <details><summary>Lineup</summary>${roster || '<p class="hint">No hostiles here.</p>'}</details>
    <details><summary>Keys</summary><p class="hint">
      Drag to move · arrows nudge 1 px · <b>PgUp / PgDn</b> forward / back · <b>P</b> pin · <b>F</b> mirror · <b>H</b> hide ·
      <b>Del</b> delete · <b>Ctrl+Z / Ctrl+Shift+Z</b> undo / redo · <b>Ctrl+S</b> save · <b>Esc</b> deselect.<br>
      Positions are in the 320 × 180 scene every screen shows; wider screens add room at the sides.</p></details>`;
}
