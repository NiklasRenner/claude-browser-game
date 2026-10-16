/**
 * What each generated set piece shows: its real height in metres (of what's
 * in the sprite, e.g. the visible part of a framing tree) and the plane it's
 * made for (see PLANES in scenes/scale.ts). When generating one, make it
 * expectedPx(metres, plane) pixels tall; tests/sprites.test.ts checks it.
 * Hostiles are made for the fighters' line: their `look.height`.
 */
import type { Plane } from '../scenes/scale';
import type { SheetId } from './sheet-data';

export const PIECE_SIZES: Partial<Record<SheetId, { metres: number; plane: Plane }>> = {
  fen_chapel: { metres: 22, plane: 'horizon' },
  fen_shrine: { metres: 1.2, plane: 'fighters' },
  fen_barrels: { metres: 0.9, plane: 'behind' },
  fen_lantern: { metres: 1, plane: 'fighters' },
  fen_tree: { metres: 3, plane: 'foreground' },
  fen_house: { metres: 3, plane: 'foreground' },
};
