import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BASE_STAT, MAX_LEVEL, START_POINTS, STATS, checkStart, defaultStart, STAT_POINTS_PER_LEVEL, allocateStat, createPlayer, derive, grantXp, knownAbilities, xpToNext,
} from '../src/core';
import type { GameEvent } from '../src/core';

describe('player progression', () => {
  it('starts at full health with the starter kit equipped and owned', () => {
    const p = createPlayer('  Ana  ');
    const d = derive(p);
    assert.equal(p.name, 'Ana');
    assert.equal(p.hp, d.maxHp);
    assert.equal(p.energy, d.maxEnergy);
    assert.equal(p.inventory[p.weapon], 1);
    assert.equal(p.inventory[p.armor], 1);
  });

  it('spreads the starting points evenly by default, or as picked (exactly START_POINTS of them)', () => {
    assert.deepEqual(createPlayer('A').stats, Object.fromEntries(STATS.map((k) => [k, BASE_STAT + defaultStart()[k]])));
    assert.equal(STATS.reduce((n, k) => n + defaultStart()[k], 0), START_POINTS);
    const p = createPlayer('A', { pow: 3, end: 2 });
    assert.deepEqual([p.stats.pow, p.stats.end, p.stats.spd], [BASE_STAT + 3, BASE_STAT + 2, BASE_STAT]);
    assert.equal(checkStart({ pow: 3, end: 2 }), null);
    assert.ok(checkStart({ pow: 6 }), 'too many');
    assert.ok(checkStart({ pow: 2 }), 'too few');
    assert.ok(checkStart({ pow: 6, end: -1 }), 'negative');
    assert.ok(checkStart({ str: 5 }), 'unknown stat');
  });

  it('falls back to a default name', () => {
    assert.equal(createPlayer('   ').name, 'Hero');
  });

  it('requires strictly more XP for each level', () => {
    for (let l = 1; l < MAX_LEVEL; l++) assert.ok(xpToNext(l + 1) > xpToNext(l));
  });

  it('handles multiple level-ups from one XP grant and carries over the remainder', () => {
    const p = createPlayer('A');
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
    const p = createPlayer('A');
    grantXp(p, 10_000_000, []);
    assert.equal(p.level, MAX_LEVEL);
    assert.equal(p.xp, 0);
  });

  it('raises current HP along with max HP when training endurance', () => {
    const p = createPlayer('A');
    p.statPoints = 1;
    const before = derive(p).maxHp;
    allocateStat(p, 'end');
    assert.ok(derive(p).maxHp > before);
    assert.equal(p.hp, derive(p).maxHp);
    assert.throws(() => allocateStat(p, 'end'), /No stat points/);
  });

  it('unlocks abilities by level', () => {
    const p = createPlayer('A');
    const at1 = knownAbilities(p).length;
    p.level = 12;
    assert.ok(knownAbilities(p).length > at1);
  });

  it('applies armor resistances to damage taken', () => {
    const p = createPlayer('A');
    assert.equal(derive(p).damageTaken.cryo, 100);
    p.inventory.arctic_hardsuit = 1;
    p.armor = 'arctic_hardsuit';
    assert.equal(derive(p).damageTaken.cryo, 65);
  });
});
