import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MISSION_ORDER, DIVISIONS, ITEMS, HOSTILES, QUARTERMASTER_STOCK, getMission, abilitiesFor, validateContent } from '../src/core';
import type { DivisionId } from '../src/core';

describe('content tables', () => {
  it('have no broken references or invalid ranges', () => {
    assert.deepEqual(validateContent(), []);
  });

  it('give every class a ability at level 1 and more abilities later', () => {
    for (const id of Object.keys(DIVISIONS) as DivisionId[]) {
      assert.ok(abilitiesFor(id, 1).length >= 1, `${id} has no level-1 ability`);
      assert.ok(abilitiesFor(id, 12).length >= 5, `${id} has too few abilities`);
    }
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
    for (const cls of Object.values(DIVISIONS)) {
      assert.ok(!QUARTERMASTER_STOCK.includes(cls.startWeapon));
      assert.ok(!QUARTERMASTER_STOCK.includes(cls.startArmor));
    }
    assert.ok(QUARTERMASTER_STOCK.some((id) => ITEMS[id]!.kind === 'consumable'));
  });

  it('flag exactly one boss per mission', () => {
    const bosses = Object.values(HOSTILES).filter((m) => m.boss).map((m) => m.id).sort();
    assert.deepEqual(bosses, MISSION_ORDER.map((id) => getMission(id).boss).sort());
  });
});
