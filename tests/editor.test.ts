import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { History, isPiece, moveTo, reorder } from '../src/editor/model';
import { locationOf } from '../src/render/scenes/locations';
import type { SceneLayer } from '../src/render/scenes/locations';
import { shiftX } from '../src/render/scenes/scale';

describe('scene layout', () => {
  it('reordering swaps a layer with its neighbour (the draw order is the list order)', () => {
    const layers: SceneLayer[] = [{ part: 'ground' }, { part: 'sprite', sheet: 'fen_barrels', x: 0, y: 0 }, { part: 'sprite', sheet: 'fen_tree', x: 0, y: 0 }, { part: 'fighters' }];
    assert.equal(reorder(layers, 1, 1), 2);
    assert.deepEqual(layers.map((l) => (l.part === 'sprite' ? l.sheet : l.part)), ['ground', 'fen_tree', 'fen_barrels', 'fighters']);
    assert.equal(reorder(layers, 3, 1), 3); // already in front
  });

  it('on wider screens, things stay with the centre; pinned ones stay with their nearest edge', () => {
    assert.equal(shiftX(100, 40, false, 384), 32);
    assert.equal(shiftX(10, 40, true, 384), 0); // left half: stays at the left edge
    assert.equal(shiftX(250, 40, true, 384), 64); // right half: moves with the right edge
    assert.equal(shiftX(250, 40, true, 320), 0);
  });

  it('dragging on a wide screen stores the position in the 320 px scene', () => {
    const loc = locationOf('veridia');
    const free: SceneLayer = { part: 'sprite', sheet: 'fen_barrels', x: 100, y: 90 };
    moveTo(loc, free, 384, 140, 95);
    assert.deepEqual([free.x, free.y], [108, 95]);
    const pinned: SceneLayer = { part: 'sprite', sheet: 'fen_barrels', x: 250, y: 90, pinned: true };
    moveTo(loc, pinned, 384, 330, 90);
    assert.deepEqual([pinned.x, pinned.y], [266, 90]);
  });

  it('undo and redo step through whole-layout snapshots; a new change clears the redo', () => {
    const h = new History();
    let layers: SceneLayer[] = [{ part: 'ground' }];
    h.push(layers);
    layers = [{ part: 'ground' }, { part: 'fighters' }];
    layers = h.undo(layers)!;
    assert.deepEqual(layers, [{ part: 'ground' }]);
    layers = h.redo(layers)!;
    assert.equal(layers.length, 2);
    h.push(layers);
    assert.equal(h.redo(layers), null);
    const first = h.undo(h.undo(layers)!)!;
    assert.deepEqual(first, [{ part: 'ground' }]);
    assert.equal(h.undo(first), null, 'nothing before the first change');
  });

  it('only set pieces (sprites, props) can be duplicated or deleted', () => {
    assert.ok(isPiece({ part: 'sprite', sheet: 'fen_tree', x: 0, y: 0 }));
    assert.ok(!isPiece({ part: 'fighters' }));
    assert.ok(!isPiece({ part: 'body', x: 0, y: 0 }));
  });
});
