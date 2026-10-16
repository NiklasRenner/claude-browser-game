import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SCRIPTORIUM, checkAction, deserialize, getAbility, knownAbilities, serialize, step } from '../src/core';
import { act, newGame } from './helpers';

const learn = (abilityId: string) => ({ type: 'learnAbility', abilityId }) as const;

describe('scriptorium', () => {
  it('teaches an ability from its level for its price; it is then known (after the level ones) and survives a save', () => {
    let s = newGame();
    s.player!.credits = 1000;
    const r = act(s, learn('plasma_burst'));
    s = r.state;
    assert.equal(s.player!.credits, 1000 - getAbility('plasma_burst').shop!.price);
    assert.ok(r.events.some((e) => e.type === 'learned' && e.abilityId === 'plasma_burst'));
    assert.deepEqual(knownAbilities(s.player!).map((a) => a.id), ['overcharge', 'plasma_burst']);
    const loaded = deserialize(serialize(s));
    assert.ok(loaded.ok && loaded.state.player!.learned.includes('plasma_burst'));
  });

  it('refuses below its level, without the credits, twice, level abilities, and away from the ship', () => {
    const s = newGame();
    s.player!.credits = 100_000;
    assert.match(checkAction(s, learn('orbital_strike'))!, /level 12/);
    const poor = structuredClone(s);
    poor.player!.credits = 10;
    assert.match(checkAction(poor, learn('plasma_burst'))!, /credits/);
    const once = act(s, learn('plasma_burst')).state;
    assert.match(checkAction(once, learn('plasma_burst'))!, /Already/);
    assert.ok(checkAction(s, learn('overcharge')));
    const away = act(s, { type: 'startMission', missionId: 'veridia' }).state;
    assert.ok(checkAction(away, learn('plasma_burst')));
    assert.equal(step(poor, learn('plasma_burst')).state, poor, 'a refused purchase changes nothing');
  });

  it('lists every sold ability, by level', () => {
    const levels = SCRIPTORIUM.map((a) => a.shop!.level);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
    assert.equal(SCRIPTORIUM.length, 16);
  });
});
