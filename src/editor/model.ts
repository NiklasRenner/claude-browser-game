/**
 * The scene editor's data side: the layout being edited, what's selected, hit
 * testing, how a drag changes a piece, and undo history. No DOM here.
 */
import { propSpot } from '../render/scenes/backdrop';
import { MIN_W, PX_PER_M, depthOf } from '../render/scenes/depth';
import type { Layout } from '../render/scenes/locations';
import { placePiece } from '../render/scenes/pieces';
import type { Piece } from '../render/scenes/pieces';
import { framesOf } from '../render/sprites/sheets';

export type Sel = { kind: 'piece'; i: number } | { kind: 'prop'; i: number } | { kind: 'body' };

export interface Geometry { W: number; H: number; horizon: number; feet: number }

export interface Box { x: number; y: number; w: number; h: number }

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;
/** Three significant digits (heights from 0.5 m to 40 m). */
const sig3 = (v: number) => round(v, Math.max(0, 2 - Math.floor(Math.log10(Math.abs(v) || 1))));

export const clone = (l: Layout): Layout => JSON.parse(JSON.stringify(l)) as Layout;

/** A piece's sprite box in the scene (null until its sheet has loaded). */
function pieceBox(p: Piece, g: Geometry): (Box & { depth: number }) | null {
  const f = framesOf(p.sheet)?.[0];
  return f ? placePiece(p, f, g.W, g.H, g.horizon, g.feet) : null;
}

export function boxOf(l: Layout, sel: Sel, g: Geometry): Box | null {
  if (sel.kind === 'piece') { const p = l.pieces[sel.i]; return p ? pieceBox(p, g) : null; }
  if (sel.kind === 'prop') {
    const p = l.props[sel.i];
    if (!p) return null;
    const [x, y] = propSpot(p.x, g.W, g.H, g.horizon);
    return { x: x + 6, y: y + 6, w: 28, h: 42 };
  }
  const b = l.body;
  if (!b) return null;
  const r = b.kind === 'planet' ? Math.round(g.W * b.r) : b.r;
  return { x: Math.round(g.W * b.x) - r, y: Math.round(g.horizon * b.y) - r, w: r * 2, h: r * 2 };
}

/** Is the piece's sprite opaque at this scene point? */
function opaqueAt(p: Piece, b: Box, x: number, y: number) {
  const f = framesOf(p.sheet)?.[0];
  if (!f) return false;
  let i = Math.floor(x - b.x);
  const j = Math.floor(y - b.y);
  if (i < 0 || j < 0 || i >= f.w || j >= f.h) return false;
  if (p.flip) i = f.w - 1 - i;
  return f.rgba[(j * f.w + i) * 4 + 3]! >= 128;
}

/**
 * What's under a scene point, topmost first: near pieces, ground and hanging pieces, props, edges, far
 * pieces, the body in the sky. Pieces count only where their sprite is opaque. Hidden pieces are skipped.
 */
export function pick(l: Layout, g: Geometry, x: number, y: number, hidden: ReadonlySet<number>): Sel | null {
  const inside = (b: Box | null) => !!b && x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;
  const order: Piece['at'][][] = [['ground', 'hang'], ['left', 'right'], ['far']];
  const hits = (ats: Piece['at'][]) => {
    for (let i = l.pieces.length - 1; i >= 0; i--) {
      const p = l.pieces[i]!;
      if (hidden.has(i) || !ats.includes(p.at)) continue;
      const b = pieceBox(p, g);
      if (b && opaqueAt(p, b, x, y)) return { kind: 'piece', i } as const;
    }
    return null;
  };
  const first = hits(order[0]!);
  if (first) return first;
  for (let i = l.props.length - 1; i >= 0; i--) if (inside(boxOf(l, { kind: 'prop', i }, g))) return { kind: 'prop', i };
  const rest = hits(order[1]!) ?? hits(order[2]!);
  if (rest) return rest;
  return inside(boxOf(l, { kind: 'body' }, g)) ? { kind: 'body' } : null;
}

/**
 * Moves a selection so its box's top-left is at (x, y) (scene pixels); with `flat`, only sideways.
 * Ground and far pieces moved up or down change depth, which (sprites keep their size) means a
 * different real height: the inspector shows it. Edges stay at their edge.
 */
export function moveTo(l: Layout, sel: Sel, g: Geometry, x: number, y: number, flat: boolean) {
  const box = boxOf(l, sel, g);
  if (!box) return;
  if (sel.kind === 'body') {
    const b = l.body!;
    b.x = round((x + box.w / 2) / g.W, 4);
    if (!flat) b.y = round((y + box.h / 2) / g.horizon, 4);
    return;
  }
  if (sel.kind === 'prop') { const p = l.props[sel.i]!; p.x = round((x + 20 - 6) / g.W, 4); return; }
  const p = l.pieces[sel.i]!;
  if (p.at === 'left' || p.at === 'right') return;
  if (p.at === 'hang') {
    const [ax, ay] = p.from ?? [0, 0];
    const dx = Math.round(x - box.x), dy = Math.round(y - box.y);
    p.from = [ax + dx, flat ? ay : ay + dy];
    return;
  }
  p.x = round((x + Math.floor(box.w / 2) - g.W / 2) / MIN_W + 0.5, 4);
  if (flat || !p.height || y === box.y) return;
  // The base's new line gives the depth, and with the sprite's size the real height.
  const depth = (y + box.h - g.horizon) / (g.feet - g.horizon);
  if (depth > 0.02) p.height = sig3(box.h / (depth * PX_PER_M));
}

/** Lengthens or shortens a hanging piece's chain (pixels). */
export function stretch(l: Layout, sel: Sel, by: number) {
  const p = sel.kind === 'piece' ? l.pieces[sel.i] : undefined;
  if (p?.at === 'hang') p.chain = Math.max(0, (p.chain ?? 8) + by);
}

/** A new piece of this sheet, standing just behind the fighters' line in the middle. */
export function newPiece(sheet: Piece['sheet']): Piece {
  const f = framesOf(sheet)?.[0];
  return { sheet, x: 0.5, at: 'ground', height: sig3((f?.h ?? 40) / (0.9 * PX_PER_M)) };
}

/** A piece's depth, for the inspector (1 = the fighters' line). */
export function depthOfPiece(p: Piece): number | null {
  const f = framesOf(p.sheet)?.[0];
  return f && p.height ? depthOf(f.h, p.height) : null;
}

/** Undo / redo over whole-layout snapshots. */
export class History {
  private past: string[] = [];
  private future: string[] = [];

  /** Call before a change, with the layout as it was. */
  push(l: Layout) {
    const s = JSON.stringify(l);
    if (this.past.at(-1) !== s) this.past.push(s);
    if (this.past.length > 200) this.past.shift();
    this.future = [];
  }

  undo(now: Layout): Layout | null {
    const s = this.past.pop();
    if (!s) return null;
    this.future.push(JSON.stringify(now));
    return JSON.parse(s) as Layout;
  }

  redo(now: Layout): Layout | null {
    const s = this.future.pop();
    if (!s) return null;
    this.past.push(JSON.stringify(now));
    return JSON.parse(s) as Layout;
  }
}
