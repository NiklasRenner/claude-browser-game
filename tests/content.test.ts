import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AREA_ORDER, CLASSES, ITEMS, MONSTERS, SHOP_STOCK, getArea, spellsFor, validateContent } from '../src/core';
import type { ClassId } from '../src/core';

describe('content tables', () => {
  it('have no broken references or invalid ranges', () => {
    assert.deepEqual(validateContent(), []);
  });

  it('give every class a spell at level 1 and more spells later', () => {
    for (const id of Object.keys(CLASSES) as ClassId[]) {
      assert.ok(spellsFor(id, 1).length >= 1, `${id} has no level-1 spell`);
      assert.ok(spellsFor(id, 12).length >= 5, `${id} has too few spells`);
    }
  });

  it('form a single unlock chain starting from an unrestricted area', () => {
    assert.equal(getArea(AREA_ORDER[0]!).requires, undefined);
    for (let i = 1; i < AREA_ORDER.length; i++) {
      assert.equal(getArea(AREA_ORDER[i]!).requires, AREA_ORDER[i - 1]);
    }
  });

  it('offer each area\'s recommended level in increasing order', () => {
    const levels = AREA_ORDER.map((id) => getArea(id).minLevel);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  });

  it('never sell starter gear and stock consumables', () => {
    for (const cls of Object.values(CLASSES)) {
      assert.ok(!SHOP_STOCK.includes(cls.startWeapon));
      assert.ok(!SHOP_STOCK.includes(cls.startArmor));
    }
    assert.ok(SHOP_STOCK.some((id) => ITEMS[id]!.kind === 'consumable'));
  });

  it('flag exactly one boss per area', () => {
    const bosses = Object.values(MONSTERS).filter((m) => m.boss).map((m) => m.id).sort();
    assert.deepEqual(bosses, AREA_ORDER.map((id) => getArea(id).boss).sort());
  });
});
