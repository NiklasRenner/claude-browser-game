/** Multi-hostile battles: targeting, turn order, area attacks, rewards. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SAVE_VERSION, Rng, deserialize, describeStep, getArea, getMonster, hostileLabels, runRound, step,
} from '../src/core';
import type { GameEvent, GameState } from '../src/core';
import { act, newGame } from './helpers';

/** A battle against an explicit lineup inside the Xenith mission. */
function lineup(ids: string[], classId: 'security' | 'science' | 'engineer' = 'security', seed = 3): GameState {
  const s = newGame(classId, seed);
  s.player!.level = 16;
  s.mode = 'battle';
  s.quest = { areaId: 'xenith', cleared: 0, earnedXp: 0, earnedGold: 0 };
  s.battle = {
    monsters: ids.map((defId) => ({ defId, hp: getMonster(defId).hp, maxHp: getMonster(defId).hp, statuses: [] })),
    target: 0, playerStatuses: [], round: 1,
  };
  return s;
}

const sturdy = (s: GameState) => { s.player!.hp = 1_000_000; return s; };

describe('targeting', () => {
  it('switching target is free: no dice, no hostile turn, no state change besides the target', () => {
    const s = lineup(['hive_drone', 'hive_drone', 'hive_spitter']);
    const r = act(s, { type: 'target', index: 2 });
    assert.equal(r.state.battle!.target, 2);
    assert.equal(r.state.rng, s.rng);
    assert.equal(r.state.player!.hp, s.player!.hp);
    assert.deepEqual(r.events, [{ type: 'targeted', foe: 2 }]);
  });

  it('rejects invalid, defeated and already-selected targets', () => {
    const s = lineup(['hive_drone', 'hive_drone']);
    s.battle!.monsters[1]!.hp = 0;
    for (const index of [-1, 2, 1.5, 1, 0]) assert.equal(step(s, { type: 'target', index }).events[0]!.type, 'error', String(index));
  });

  it('attacks hit the selected target, and an attack can carry its own target', () => {
    const s = sturdy(lineup(['hive_drone', 'hive_drone', 'hive_drone']));
    s.player!.stats.dex = 300;
    const r = act(s, { type: 'attack', target: 1 });
    const hit = r.events.find((e) => e.type === 'attack' && e.actor === 'player');
    assert.ok(hit && hit.type === 'attack' && hit.foe === 1);
    assert.ok(r.state.battle!.monsters[1]!.hp < s.battle!.monsters[1]!.hp);
    assert.equal(r.state.battle!.monsters[0]!.hp, s.battle!.monsters[0]!.hp);
    assert.equal(r.state.battle!.target, 1);
  });

  it('when the target goes down, it moves to the next living hostile (wrapping)', () => {
    const s = sturdy(lineup(['hive_drone', 'hive_drone', 'hive_drone']));
    s.player!.stats.dex = 300;
    s.battle!.target = 2;
    s.battle!.monsters[2]!.hp = 1;
    const r = act(s, { type: 'attack' });
    assert.ok(r.events.some((e) => e.type === 'hostileDown' && e.foe === 2));
    assert.equal(r.state.battle!.target, 0, 'wraps from the last slot to the first living one');
    assert.equal(r.state.mode, 'battle');
  });
});

describe('turn order', () => {
  it('every living hostile acts once per round, in order; downed ones do not', () => {
    const s = sturdy(lineup(['hive_drone', 'hive_drone', 'hive_drone']));
    s.battle!.monsters[1]!.hp = 0;
    s.battle!.target = 0;
    const events: GameEvent[] = [];
    runRound(s.player!, s.battle!, new Rng(9), events, null);
    const attackers = events.filter((e) => e.type === 'attack' && e.actor === 'monster').map((e) => (e as { foe: number }).foe);
    assert.deepEqual(attackers, [0, 2]);
  });

  it('the fight is won only when every hostile is down, with rewards from all of them', () => {
    let s = sturdy(lineup(['hive_drone', 'hive_spitter']));
    s.player!.stats.dex = 300;
    s.battle!.monsters[0]!.hp = 1;
    s.battle!.monsters[1]!.hp = 1;
    let r = act(s, { type: 'attack' });
    assert.equal(r.state.mode, 'battle', 'one hostile still standing');
    s = r.state;
    r = act(s, { type: 'attack' });
    assert.equal(r.state.mode, 'quest');
    const v = r.events.find((e) => e.type === 'victory');
    assert.ok(v && v.type === 'victory');
    assert.equal(v.xp, getMonster('hive_drone').xp + getMonster('hive_spitter').xp);
  });

  it('cannot beam out while the boss is still up, but can once only escorts remain', () => {
    const s = lineup(['hive_drone', 'brood_matriarch', 'hive_drone']);
    assert.match((step(s, { type: 'flee' }).events[0] as { reason: string }).reason, /interference/);
    s.battle!.monsters[1]!.hp = 0;
    assert.equal(step(s, { type: 'flee' }).events[0]!.type === 'error', false);
  });
});

describe('area attacks', () => {
  it('an AoE ability strikes every living hostile; a normal one only the target', () => {
    const aoe = sturdy(lineup(['hive_drone', 'hive_drone', 'hive_drone'], 'science'));
    aoe.player!.level = 16;
    aoe.player!.mp = 999;
    aoe.battle!.monsters[1]!.hp = 0;
    const r1 = act(aoe, { type: 'cast', spellId: 'ion_storm' });
    const hits1 = r1.events.filter((e) => e.type === 'attack' && e.actor === 'player').map((e) => (e as { foe: number }).foe);
    assert.deepEqual(hits1, [0, 2]);

    const single = sturdy(lineup(['hive_drone', 'hive_drone', 'hive_drone'], 'science'));
    single.player!.mp = 999;
    const r2 = act(single, { type: 'cast', spellId: 'plasma_burst' });
    const hits2 = r2.events.filter((e) => e.type === 'attack' && e.actor === 'player').map((e) => (e as { foe: number }).foe);
    assert.deepEqual(hits2, [0]);
  });
});

describe('encounters and log text', () => {
  it('boss fights put the boss between its escorts', () => {
    let s = newGame('security', 2);
    s.player!.level = 16;
    s.clearedAreas = ['veridia', 'kethra', 'glacies', 'void_rift'];
    s = act(s, { type: 'startQuest', areaId: 'xenith' }).state;
    s.quest!.cleared = getArea('xenith').encounters;
    s.mode = 'quest';
    s.battle = null;
    const r = act(s, { type: 'continue' });
    assert.deepEqual(r.state.battle!.monsters.map((m) => m.defId), ['hive_drone', 'brood_matriarch', 'hive_drone']);
    assert.match(describeStep(s, r).join('\n'), /PRIORITY TARGET — The Brood Matriarch! Escorts: Hive Drone A and Hive Drone B\./);
  });

  it('regular hive encounters come from the defined packs', () => {
    const groups = getArea('xenith').groups!.map((g) => g.join('+'));
    for (let seed = 1; seed <= 30; seed++) {
      let s = newGame('security', seed);
      s.player!.level = 16;
      s.clearedAreas = ['veridia', 'kethra', 'glacies', 'void_rift'];
      s = act(s, { type: 'startQuest', areaId: 'xenith' }).state;
      assert.ok(groups.includes(s.battle!.monsters.map((m) => m.defId).join('+')));
    }
  });

  it('labels duplicate hostiles A, B, C', () => {
    assert.deepEqual(hostileLabels(['hive_drone', 'hive_spitter', 'hive_drone']), ['Hive Drone A', 'Hive Spitter', 'Hive Drone B']);
    assert.deepEqual(hostileLabels(['protoplasm']), ['Protoplasm']);
  });
});

describe('saves', () => {
  it('migrates a version-2 single-hostile battle to the lineup format', () => {
    const s = lineup(['razorback_hound']);
    const v2 = structuredClone(s) as unknown as Record<string, unknown>;
    const battle = v2.battle as Record<string, unknown>;
    battle.monster = (battle.monsters as unknown[])[0];
    delete battle.monsters;
    delete battle.target;
    v2.version = 2;
    const r = deserialize(JSON.stringify({ format: 'questforge-save', version: 2, state: v2 }));
    assert.ok(r.ok, r.ok ? '' : r.error);
    assert.equal(r.state.version, SAVE_VERSION);
    assert.deepEqual(r.state.battle, s.battle);
  });

  it('rejects a save whose target is a defeated hostile', () => {
    const s = lineup(['hive_drone', 'hive_drone']);
    s.battle!.monsters[0]!.hp = 0;
    const r = deserialize(JSON.stringify({ format: 'questforge-save', version: SAVE_VERSION, state: s }));
    assert.equal(r.ok, false);
  });
});
