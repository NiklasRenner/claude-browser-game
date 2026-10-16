import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MISSION_ORDER, ITEMS, HOSTILES, QUARTERMASTER_STOCK, START_ARMOR, START_WEAPON, getMission, abilitiesFor, validateContent } from '../src/core';

describe('content tables', () => {
  it('have no broken references or invalid ranges', () => {
    assert.deepEqual(validateContent(), []);
  });

  it('teach every officer Overcharge at level 1, Target Painter at 3 and Combat Stim at 5 (the rest wait for the ability shop)', () => {
    assert.deepEqual(abilitiesFor(1).map((a) => a.id), ['overcharge']);
    assert.deepEqual(abilitiesFor(4).map((a) => a.id), ['overcharge', 'target_painter']);
    assert.deepEqual(abilitiesFor(30).map((a) => a.id), ['overcharge', 'target_painter', 'combat_stim']);
  });

  it('form a single unlock chain starting from an unrestricted mission', () => {
    assert.equal(getMission(MISSION_ORDER[0]!).requires, undefined);
    for (let i = 1; i < MISSION_ORDER.length; i++) {
      assert.equal(getMission(MISSION_ORDER[i]!).requires, MISSION_ORDER[i - 1]);
    }
  });

  it('offer each mission\'s recommended level in increasing order', () => {
    const levels = MISSION_ORDER.map((id) => getMission(id).minLevel);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  });

  it('never sell starter gear and stock consumables', () => {
    assert.ok(!QUARTERMASTER_STOCK.includes(START_WEAPON));
    assert.ok(!QUARTERMASTER_STOCK.includes(START_ARMOR));
    assert.ok(QUARTERMASTER_STOCK.some((id) => ITEMS[id]!.kind === 'consumable'));
  });

  it('flag exactly one boss per mission', () => {
    const bosses = Object.values(HOSTILES).filter((m) => m.boss).map((m) => m.id).sort();
    assert.deepEqual(bosses, MISSION_ORDER.map((id) => getMission(id).boss).sort());
  });
});
