/** The stage's geometry (src/render/actor.ts): where figures stand, where things are on them, what a click hits. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { center, groupCenter, hand, hostileSpot, pickAt, shot } from '../src/render/actor';
import type { Actor } from '../src/render/actor';
import type { Figure } from '../src/render/sprites';

/** A figure 20 px wide and 40 px tall standing at (x, 100); `muzzle` gives it a gun. */
function actor(x: number, facing: 1 | -1, muzzle?: [number, number, number]): Actor {
  const figure: Figure = { left: 10, right: 10, height: 40, scale: 1, hover: 0, draw: () => {}, ...(muzzle ? { muzzle: () => muzzle } : {}) };
  return {
    figure, painter: null as never, x, y: 100, ox: 0, oy: 0, attack: 0, flash: 0, dissolve: 0, fall: 0, visible: true, facing,
    statuses: new Set(),
  };
}

describe('stage geometry', () => {
  it('a lineup stands left to right, each one a little lower (nearer) than the one before', () => {
    for (const n of [2, 3]) {
      const spots = Array.from({ length: n }, (_, i) => hostileSpot(n, i));
      for (let i = 1; i < n; i++) {
        assert.ok(spots[i]![0] > spots[i - 1]![0], `${n}: slot ${i} right of ${i - 1}`);
        assert.ok(spots[i]![1] > spots[i - 1]![1], `${n}: slot ${i} lower than ${i - 1}`);
      }
    }
  });

  it('without a gun, the weapon is in front of the body, on the side it faces', () => {
    assert.ok(hand(actor(50, 1), 0)[0] > center(actor(50, 1))[0]);
    assert.ok(hand(actor(50, -1), 0)[0] < center(actor(50, -1))[0]);
  });

  it('a shot leaves the muzzle and follows the barrel to the target\'s middle', () => {
    const gunner = actor(50, 1, [12, -30, Math.atan(0.5)]);
    const target = actor(150, -1);
    const s = shot(gunner, target, 0)!;
    assert.deepEqual(s.from, [62, 70]);
    assert.equal(s.to[0], center(target)[0]);
    assert.equal(s.to[1], 70 + 0.5 * (center(target)[0] - 62));
    assert.equal(shot(actor(50, 1), target, 0), null, 'no gun, no shot');
  });

  it('a click picks the figure under it (nearest middle when they overlap), never a hidden one', () => {
    const a = actor(100, -1), b = actor(110, -1);
    assert.equal(pickAt([a, b], 95, 80), 0);
    assert.equal(pickAt([a, b], 115, 80), 1);
    assert.equal(pickAt([a, b], 104, 80), 0, 'both boxes: a\'s middle is nearer');
    assert.equal(pickAt([a, b], 106, 80), 1, 'both boxes: b\'s middle is nearer');
    assert.equal(pickAt([a, b], 300, 80), null);
    b.visible = false;
    assert.equal(pickAt([a, b], 106, 80), 0);
  });

  it('a grenade lands in the middle of the visible ones', () => {
    const a = actor(100, -1), b = actor(140, -1), c = actor(500, -1);
    c.visible = false;
    assert.deepEqual(groupCenter([a, b, c], [0, 0]), [(center(a)[0] + center(b)[0]) / 2, center(a)[1]]);
    assert.deepEqual(groupCenter([c], [7, 8]), [7, 8]);
  });
});
