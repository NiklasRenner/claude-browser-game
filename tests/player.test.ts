import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLASSES, MAX_LEVEL, STAT_POINTS_PER_LEVEL, allocateStat, createPlayer, derive, grantXp, knownSpells, xpToNext,
} from '../src/core';
import type { ClassId, GameEvent } from '../src/core';

describe('player progression', () => {
  it('starts every class at full health with its starter kit equipped and owned', () => {
    for (const id of Object.keys(CLASSES) as ClassId[]) {
      const p = createPlayer('  Ana  ', id);
      const d = derive(p);
      assert.equal(p.name, 'Ana');
      assert.equal(p.hp, d.maxHp);
      assert.equal(p.mp, d.maxMp);
      assert.equal(p.inventory[p.weapon], 1);
      assert.equal(p.inventory[p.armor], 1);
    }
  });

  it('falls back to a default name', () => {
    assert.equal(createPlayer('   ', 'science').name, 'Hero');
  });

  it('requires strictly more XP for each level', () => {
    for (let l = 1; l < MAX_LEVEL; l++) assert.ok(xpToNext(l + 1) > xpToNext(l));
  });

  it('handles multiple level-ups from one XP grant and carries over the remainder', () => {
    const p = createPlayer('A', 'security');
    const events: GameEvent[] = [];
    const need = xpToNext(1) + xpToNext(2) + 5;
    p.hp = 1;
    grantXp(p, need, events);
    assert.equal(p.level, 3);
    assert.equal(p.xp, 5);
    assert.equal(p.statPoints, 2 * STAT_POINTS_PER_LEVEL);
    assert.equal(p.hp, derive(p).maxHp, 'level-up fully heals');
    assert.deepEqual(events.filter((e) => e.type === 'levelUp').map((e) => (e as { level: number }).level), [2, 3]);
  });

  it('caps at MAX_LEVEL', () => {
    const p = createPlayer('A', 'engineer');
    grantXp(p, 10_000_000, []);
    assert.equal(p.level, MAX_LEVEL);
    assert.equal(p.xp, 0);
  });

  it('raises current HP along with max HP when training endurance', () => {
    const p = createPlayer('A', 'security');
    p.statPoints = 1;
    const before = derive(p).maxHp;
    allocateStat(p, 'end');
    assert.ok(derive(p).maxHp > before);
    assert.equal(p.hp, derive(p).maxHp);
    assert.throws(() => allocateStat(p, 'end'), /No stat points/);
  });

  it('unlocks spells by level', () => {
    const p = createPlayer('A', 'science');
    const at1 = knownSpells(p).length;
    p.level = 12;
    assert.ok(knownSpells(p).length > at1);
  });

  it('applies armor resistances to damage taken', () => {
    const p = createPlayer('A', 'security');
    assert.equal(derive(p).damageTaken.cryo, 100);
    p.inventory.arctic_hardsuit = 1;
    p.armor = 'arctic_hardsuit';
    assert.equal(derive(p).damageTaken.cryo, 65);
  });
});
