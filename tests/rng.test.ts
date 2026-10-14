import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Rng, hashSeed } from '../src/core';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  });

  it('can be resumed from its serialized state', () => {
    const a = new Rng(99);
    for (let i = 0; i < 10; i++) a.next();
    const b = new Rng(a.state);
    for (let i = 0; i < 10; i++) assert.equal(a.next(), b.next());
  });

  it('keeps int() within inclusive bounds and hits both ends', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(3, 6);
      assert.ok(v >= 3 && v <= 6);
      seen.add(v);
    }
    assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
  });

  it('respects chance() roughly', () => {
    const rng = new Rng(42);
    let hits = 0;
    for (let i = 0; i < 10000; i++) if (rng.chance(30)) hits++;
    assert.ok(hits > 2700 && hits < 3300, `got ${hits}`);
    assert.equal([...Array(100)].some(() => rng.chance(0)), false);
    assert.equal([...Array(100)].every(() => rng.chance(100)), true);
  });

  it('respects weights', () => {
    const rng = new Rng(5);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 10000; i++) counts[rng.weighted(['a', 'b'] as const, (x) => (x === 'a' ? 3 : 1))]++;
    assert.ok(counts.a / counts.b > 2.6 && counts.a / counts.b < 3.4);
  });

  it('hashes strings to stable seeds', () => {
    assert.equal(hashSeed('questforge'), hashSeed('questforge'));
    assert.notEqual(hashSeed('a'), hashSeed('b'));
  });
});
