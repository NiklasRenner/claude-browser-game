/** Element effects (burn, corrode, chill, stun, blind, exposed), level-gap hit penalty, fleeing and boss levels. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ELEMENT_EFFECTS, FLEE_BASE, FLEE_MAX, FLEE_MIN, FLEE_PER_LEVEL, LEVEL_HIT_PENALTY, MISSIONS, applyStatus, bossLevel,
  fleeChance, getMission, hostileHitChance, playerHitChance, step, upcomingTurns, validateContent,
} from '../src/core';
import type { GameEvent, StatusEffect } from '../src/core';
import { act, endlessFight, newGame, sureHit } from './helpers';

describe('element effects', () => {
  it('each damage type has at most one effect, and content only uses its own', () => {
    assert.equal(ELEMENT_EFFECTS.kinetic, null);
    const used = Object.values(ELEMENT_EFFECTS).filter(Boolean);
    assert.equal(new Set(used).size, used.length, 'no effect shared by two types');
    assert.deepEqual(validateContent(), []);
  });

  it('corrode stacks with every dose, up to 3× the dose; burn just refreshes', () => {
    const list: StatusEffect[] = [];
    const ev: GameEvent[] = [];
    for (let i = 0; i < 5; i++) applyStatus(list, 'hostile', 'corrode', 4, 3, ev, 0);
    assert.deepEqual(list, [{ id: 'corrode', turns: 4, power: 9 }]);
    const burn: StatusEffect[] = [];
    applyStatus(burn, 'hostile', 'burn', 2, 5, ev, 0);
    applyStatus(burn, 'hostile', 'burn', 2, 5, ev, 0);
    assert.deepEqual(burn, [{ id: 'burn', turns: 2, power: 5 }]);
  });

  it('chill slows: a hostile at −50% speed gets half as many turns', () => {
    const s = endlessFight('raider'); // speed 100, like the player
    s.battle!.hostiles[0]!.statuses.push({ id: 'chill', turns: 99, power: 50 });
    const order = upcomingTurns(s.player!, s.battle!, 30);
    assert.equal(order.filter((w) => w !== 'player').length, 10);
  });

  it('blind lowers a hostile\'s hit chance too', () => {
    const s = endlessFight('raider');
    const base = hostileHitChance(s.player!, s.battle!, 0);
    s.battle!.hostiles[0]!.statuses.push({ id: 'blind', turns: 2, power: 30 });
    assert.equal(hostileHitChance(s.player!, s.battle!, 0), base - 30);
  });

  it('exposed makes the owner take more damage', () => {
    const hits = (exposed: boolean) => {
      let s = sureHit(endlessFight('raider', { seed: 9 }));
      if (exposed) s.battle!.hostiles[0]!.statuses.push({ id: 'exposed', turns: 99, power: 50 });
      let total = 0;
      for (let i = 0; i < 20; i++) {
        const r = act(s, { type: 'attack' });
        for (const e of r.events) if (e.type === 'attack' && e.actor === 'player') total += e.damage;
        s = r.state;
      }
      return total;
    };
    const plain = hits(false);
    const more = hits(true);
    assert.ok(Math.abs(more / plain - 1.5) < 0.05, `${more} vs ${plain}`);
  });
});

describe('level gap', () => {
  it(`your hit chance drops ${LEVEL_HIT_PENALTY}% per level a hostile is above you, not below`, () => {
    const s = endlessFight('raider'); // level 3
    s.player!.level = 3;
    const even = playerHitChance(s.player!, s.battle!, 0);
    s.player!.level = 1;
    assert.equal(playerHitChance(s.player!, s.battle!, 0), even - 2 * LEVEL_HIT_PENALTY);
    s.player!.level = 8;
    assert.equal(playerHitChance(s.player!, s.battle!, 0), even);
  });

  it('fleeing is easy from weaker hostiles and hard from stronger ones', () => {
    const p = newGame('security').player!;
    p.level = 10;
    assert.equal(fleeChance(p, 10), FLEE_BASE);
    assert.equal(fleeChance(p, 8), FLEE_BASE + 2 * FLEE_PER_LEVEL);
    assert.equal(fleeChance(p, 12), FLEE_BASE - 2 * FLEE_PER_LEVEL);
    assert.equal(fleeChance(p, 1), FLEE_MAX);
    assert.equal(fleeChance(p, 30), FLEE_MIN);
  });

  it('story bosses fight at the recommended level + 1 unless the mission says otherwise', () => {
    for (const m of Object.values(MISSIONS)) assert.equal(bossLevel(m), m.bossLevel ?? m.minLevel + 1, m.id);
    let s = newGame('security', 4);
    s.player!.hp = 100_000;
    s = act(s, { type: 'startMission', missionId: 'veridia' }).state;
    s.mission!.cleared = getMission('veridia').encounters;
    s.mode = 'mission';
    s.battle = null;
    const r = step(s, { type: 'continue' });
    const boss = r.state.battle!.hostiles.find((h) => h.defId === getMission('veridia').boss)!;
    assert.equal(boss.level, getMission('veridia').minLevel + 1);
  });
});
