import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { behindOf, insertPiece, removePiece, restack, stack } from '../src/editor/model';
import type { Layout } from '../src/render/scenes/locations';

const layout = (): Layout => ({
  props: [],
  pieces: [
    { sheet: 'fen_chapel', x: 0.4, at: 'far', height: 28 },
    { sheet: 'fen_barrels', x: 0.5, at: 'ground', height: 0.9 },
    { sheet: 'fen_tree', x: 0, at: 'left' },
  ],
});
const names = (l: Layout) => stack(l).map((r) => (r.kind === 'fighters' ? 'F' : l.pieces[r.i]!.sheet));

describe('scene editor draw order', () => {
  it('without `behind`, every piece is behind the fighters; far pieces are not in the order', () => {
    assert.deepEqual(names(layout()), ['fen_barrels', 'fen_tree', 'F']);
  });

  it('moving a piece back past another swaps them (barrels behind the tree)', () => {
    const l = layout();
    const i = restack(l, { kind: 'piece', i: 1 }, 1);
    assert.deepEqual(names(l), ['fen_tree', 'fen_barrels', 'F']);
    assert.equal(l.pieces[i!]!.sheet, 'fen_barrels');
  });

  it('moving the fighters back puts the pieces they pass in front of them', () => {
    const l = layout();
    restack(l, { kind: 'fighters' }, -1);
    assert.deepEqual(names(l), ['fen_barrels', 'F', 'fen_tree']);
    assert.equal(behindOf(l), 2); // the far chapel and the barrels
  });

  it('new pieces go just behind the fighters; duplicates next to their original; removal keeps the fighters in place', () => {
    const l = layout();
    restack(l, { kind: 'fighters' }, -1);
    insertPiece(l, { sheet: 'fen_shrine', x: 0.2, at: 'ground', height: 1.2 });
    assert.deepEqual(names(l), ['fen_barrels', 'fen_shrine', 'F', 'fen_tree']);
    insertPiece(l, { sheet: 'fen_lantern', x: 0, at: 'hang', from: [60, 50] }, l.pieces.findIndex((p) => p.sheet === 'fen_tree'));
    assert.deepEqual(names(l), ['fen_barrels', 'fen_shrine', 'F', 'fen_tree', 'fen_lantern']);
    removePiece(l, l.pieces.findIndex((p) => p.sheet === 'fen_barrels'));
    assert.deepEqual(names(l), ['fen_shrine', 'F', 'fen_tree', 'fen_lantern']);
  });
});
