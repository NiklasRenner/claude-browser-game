/**
 * The scene editor's data side: hit testing, moving and reordering layers,
 * the size check for generated sprites, and undo history. No DOM here.
 */
import { layerBox, spotSize } from '../render/scenes/backdrop';
import type { Location, SceneLayer } from '../render/scenes/locations';
import { PLANES, expectedPx, shiftX } from '../render/scenes/scale';
import type { Plane } from '../render/scenes/scale';
import { framesOf } from '../render/sprites/sheets';
import { SHEETS } from '../render/sprites/sheet-data';
import type { SheetId } from '../render/sprites/sheet-data';
import { PIECE_SIZES } from '../render/sprites/sizes';

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Can this layer be dragged around? */
export const isPlaced = (l: SceneLayer): l is Extract<SceneLayer, { x: number }> => 'x' in l;

/** Is the layer drawn at this scene point? Sprites where they're opaque, props and bodies by their box. */
function hits(loc: Location, l: SceneLayer, W: number, x: number, y: number): boolean {
  const b = layerBox(loc, l, W);
  if (!b || x < b.x || y < b.y || x >= b.x + b.w || y >= b.y + b.h) return false;
  if (l.part === 'body') return Math.hypot(x - b.x - b.w / 2, y - b.y - b.h / 2) <= b.w / 2;
  if (l.part === 'prop') return x >= b.x + 6 && x < b.x + b.w - 6 && y >= b.y + 6;
  if (l.part !== 'sprite') return false;
  const f = framesOf(l.sheet)?.[0];
  if (!f) return true;
  const i = Math.floor(x - b.x), j = Math.floor(y - b.y);
  return f.rgba[(j * f.w + (l.flip ? f.w - 1 - i : i)) * 4 + 3]! >= 128;
}

/** The topmost visible layer at a scene point (its index), or null. */
export function pick(loc: Location, W: number, x: number, y: number, hidden: ReadonlySet<SceneLayer>): number | null {
  for (let i = loc.layers.length - 1; i >= 0; i--) {
    const l = loc.layers[i]!;
    if (!hidden.has(l) && hits(loc, l, W, x, y)) return i;
  }
  return null;
}

/** Moves a placed layer so its top-left is at (x, y) on a screen W wide. */
export function moveTo(loc: Location, l: SceneLayer, W: number, x: number, y: number) {
  const size = spotSize(loc, l);
  if (!isPlaced(l) || !size) return;
  let nx = x - shiftX(l.x, size.w, l.pinned, W);
  // A pinned layer dragged across the middle changes the edge it's pinned to.
  nx = x - shiftX(nx, size.w, l.pinned, W);
  l.x = Math.round(nx);
  l.y = Math.round(y);
}

/** Swaps layer i with its neighbour toward the front (1) or the back (-1); returns its new index. */
export function reorder(layers: SceneLayer[], i: number, dir: 1 | -1): number {
  const j = i + dir;
  if (j < 0 || j >= layers.length) return i;
  [layers[i], layers[j]] = [layers[j]!, layers[i]!];
  return j;
}

/** A new sprite layer, in the middle of the scene, standing on the fighters' line. */
export function newSprite(sheet: SheetId): SceneLayer {
  const { w, h } = SHEETS[sheet];
  return { part: 'sprite', sheet, x: Math.round(160 - w / 2), y: 131 - h };
}

/** How a sprite's size compares with what its label (metres, plane) asks for; null if it has no label. */
export function sizeCheck(sheet: SheetId): { metres: number; plane: Plane; scale: number; px: number; expected: number; ok: boolean } | null {
  const s = PIECE_SIZES[sheet];
  if (!s) return null;
  const px = SHEETS[sheet].h - 2, expected = Math.round(expectedPx(s.metres, s.plane));
  return { ...s, scale: PLANES[s.plane], px, expected, ok: Math.abs(px / expected - 1) <= 0.15 };
}

/** Undo / redo over whole-layout snapshots. */
export class History {
  private past: string[] = [];
  private future: string[] = [];

  /** Call before a change, with the layers as they were. */
  push(layers: SceneLayer[]) {
    const s = JSON.stringify(layers);
    if (this.past.at(-1) !== s) this.past.push(s);
    if (this.past.length > 200) this.past.shift();
    this.future = [];
  }

  undo(now: SceneLayer[]): SceneLayer[] | null {
    const s = this.past.pop();
    if (!s) return null;
    this.future.push(JSON.stringify(now));
    return JSON.parse(s) as SceneLayer[];
  }

  redo(now: SceneLayer[]): SceneLayer[] | null {
    const s = this.future.pop();
    if (!s) return null;
    this.past.push(JSON.stringify(now));
    return JSON.parse(s) as SceneLayer[];
  }
}
