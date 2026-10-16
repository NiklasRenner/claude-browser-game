/**
 * Sprite sheets made from concept art (see scripts/sprites.py). Each sheet is
 * a strip of frames with a glow mask below it. Sheets load in the background;
 * until one has loaded, figures that use it draw their painted fallback.
 */
import { fromHsl, toHsl } from '../pixel/palette';
import type { RGB } from '../pixel/palette';
import { SHEETS } from './sheet-data';
import type { SheetId } from './sheet-data';

export interface Frame {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  /** 1 where the pixel glows. */
  glow: Uint8Array;
}

const loaded = new Map<string, Frame[]>();
let loading: Promise<void> | null = null;

export const isSheet = (id: string): id is SheetId => id in SHEETS;

/** Starts loading every sheet (once). Resolves when all are in, or failed. */
export function loadSheets(): Promise<void> {
  loading ??= Promise.all(Object.entries(SHEETS).map(async ([id, sheet]) => {
    try {
      const img = new Image();
      img.src = sheet.file;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      const frames: Frame[] = [];
      for (let f = 0; f < sheet.frames; f++) {
        const rgba = g.getImageData(f * sheet.w, 0, sheet.w, sheet.h).data;
        const mask = g.getImageData(f * sheet.w, sheet.h, sheet.w, sheet.h).data;
        const glow = new Uint8Array(sheet.w * sheet.h);
        for (let i = 0; i < glow.length; i++) glow[i] = mask[i * 4 + 3]! > 128 ? 1 : 0;
        frames.push({ w: sheet.w, h: sheet.h, rgba, glow });
      }
      loaded.set(id, frames);
    } catch (err) {
      console.warn(`Sprite sheet ${id} failed to load; using painted figures.`, err);
    }
  })).then(() => undefined);
  return loading;
}

/** The frames of a sheet, or null if it hasn't loaded (yet). */
export function framesOf(id: SheetId): Frame[] | null {
  return loaded.get(id) ?? null;
}

const recoloured = new Map<string, Frame[]>();

/** The sheet with its red and orange trim shifted to another hue (division colours). Cached. */
export function tinted(id: SheetId, to: RGB): Frame[] | null {
  const base = framesOf(id);
  if (!base) return null;
  const key = `${id}:${to.join(',')}`;
  let frames = recoloured.get(key);
  if (!frames) {
    const hue = hueOf(to);
    frames = base.map((f) => {
      const rgba = new Uint8ClampedArray(f.rgba);
      for (let i = 0; i < rgba.length; i += 4) {
        const r = rgba[i]!, gg = rgba[i + 1]!, b = rgba[i + 2]!;
        const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
        // Reds and oranges only: red clearly on top and saturated (skin is too yellow and pale to match).
        if (max !== r || max - min < 28 || gg > r * 0.62 || b > r * 0.7) continue;
        const [nr, ng, nb] = withHue([r, gg, b], hue);
        rgba[i] = nr; rgba[i + 1] = ng; rgba[i + 2] = nb;
      }
      return { ...f, rgba };
    });
    recoloured.set(key, frames);
  }
  return frames;
}

const hueOf = (c: RGB): number => toHsl(c)[0];

/** Same lightness and saturation, new hue. */
function withHue(c: RGB, hue: number): RGB {
  const [, s, l] = toHsl(c);
  return fromHsl(hue, s, l);
}
