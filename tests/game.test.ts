import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { derive, getItem, initialState, legalActions, restCost, sellPrice, step } from '../src/core';
import type { Action } from '../src/core';
import { act, actAll, deepFreeze, newGame } from './helpers';

describe('reducer basics', () => {
  it('starts on the title screen and creates a character', () => {
    const s0 = initialState(1);
    assert.equal(s0.mode, 'title');
    assert.deepEqual(legalActions(s0).map((a) => a.type), ['newGame', 'newGame', 'newGame']);
    const s1 = newGame('rogue', 1);
    assert.equal(s1.mode, 'town');
    assert.equal(s1.player!.classId, 'rogue');
  });

  it('never mutates the input state', () => {
    const s = deepFreeze(newGame('warrior', 9));
    const actions: Action[] = [
      { type: 'buy', itemId: 'health_potion' }, { type: 'startQuest', areaId: 'greenwood' }, { type: 'attack' },
    ];
    let cur = s;
    for (const a of actions) cur = deepFreeze(act(cur, a).state);
    assert.equal(s.player!.gold, 50);
  });

  it('rejects illegal actions without changing state', () => {
    const s = newGame();
    for (const a of [
      { type: 'attack' }, { type: 'continue' }, { type: 'returnToTown' }, { type: 'buy', itemId: 'dawnbringer' },
      { type: 'buy', itemId: 'not_an_item' }, { type: 'startQuest', areaId: 'shadow_keep' },
      { type: 'newGame', name: 'x', classId: 'mage' }, { type: 'allocateStat', stat: 'str' },
    ] as Action[]) {
      const r = step(s, a);
      assert.equal(r.state, s, JSON.stringify(a));
      assert.equal(r.events.length, 1);
      assert.equal(r.events[0]!.type, 'error');
    }
  });

  it('agrees with legalActions: everything listed is accepted', () => {
    const s = newGame('mage', 4);
    for (const a of legalActions(s)) assert.equal(step(s, a).events.find((e) => e.type === 'error'), undefined);
  });

  it('is deterministic: same seed and actions give identical results', () => {
    const run = () => actAll(newGame('warrior', 77), [{ type: 'startQuest', areaId: 'greenwood' }, { type: 'attack' }, { type: 'attack' }]);
    assert.deepEqual(run(), run());
  });
});

describe('town', () => {
  it('buys and sells with correct gold accounting', () => {
    let s = newGame('warrior');
    s.player!.level = 2;
    s.player!.gold = 100;
    s = act(s, { type: 'buy', itemId: 'iron_sword' }).state;
    assert.equal(s.player!.gold, 100 - getItem('iron_sword').price);
    assert.equal(s.player!.inventory.iron_sword, 1);
    assert.equal(step(s, { type: 'buy', itemId: 'iron_sword' }).events[0]!.type, 'error', 'gear is unique');
    const gold = s.player!.gold;
    s = act(s, { type: 'sell', itemId: 'iron_sword' }).state;
    assert.equal(s.player!.gold, gold + sellPrice('iron_sword'));
    assert.equal(s.player!.inventory.iron_sword, undefined);
  });

  it('enforces level requirements and blocks selling equipped gear', () => {
    let s = newGame('warrior');
    s.player!.gold = 10_000;
    assert.match((step(s, { type: 'buy', itemId: 'flame_blade' }).events[0] as { reason: string }).reason, /level 3/);
    s.player!.level = 2;
    s = act(s, { type: 'buy', itemId: 'iron_sword' }).state;
    s = act(s, { type: 'equip', itemId: 'iron_sword' }).state;
    assert.equal(s.player!.weapon, 'iron_sword');
    assert.equal(step(s, { type: 'sell', itemId: 'iron_sword' }).events[0]!.type, 'error');
    assert.equal(step(s, { type: 'sell', itemId: 'training_sword' }).events[0]!.type, 'error', 'starter gear is worthless');
  });

  it('rests to full for a small fee, and only when needed', () => {
    let s = newGame('warrior');
    assert.equal(step(s, { type: 'rest' }).events[0]!.type, 'error');
    s = structuredClone(s);
    s.player!.hp = 1;
    const cost = restCost(s.player!);
    const r = act(s, { type: 'rest' });
    assert.equal(r.state.player!.hp, derive(r.state.player!).maxHp);
    assert.equal(r.state.player!.gold, s.player!.gold - cost);
  });

  it('lets a broke player rest for free (no softlock)', () => {
    const s = newGame('warrior');
    s.player!.gold = 0;
    s.player!.hp = 1;
    assert.equal(act(s, { type: 'rest' }).state.player!.gold, 0);
  });

  it('uses potions outside battle', () => {
    const s = newGame('rogue');
    s.player!.hp = 10;
    const r = act(s, { type: 'useItem', itemId: 'health_potion' });
    assert.equal(r.state.player!.hp, 55);
    assert.equal(r.state.player!.inventory.health_potion, 1);
  });
});

describe('quest flow', () => {
  it('starts a battle immediately and allows retreating between fights', () => {
    let s = act(newGame('warrior', 12), { type: 'startQuest', areaId: 'greenwood' }).state;
    assert.equal(s.mode, 'battle');
    assert.equal(s.quest!.areaId, 'greenwood');
    s.battle!.monster.hp = 1;
    s.player!.stats.dex = 300;
    s = act(s, { type: 'attack' }).state;
    assert.equal(s.mode, 'quest');
    assert.equal(act(s, { type: 'retreat' }).state.mode, 'town');
    s = act(s, { type: 'continue' }).state;
    assert.equal(s.mode, 'battle');
  });

  it('sends the boss after the regular encounters', () => {
    let s = act(newGame('warrior', 12), { type: 'startQuest', areaId: 'greenwood' }).state;
    for (let i = 0; i < 3; i++) {
      s.battle!.monster.hp = 1;
      s.player!.stats.dex = 300;
      s.player!.hp = 999;
      s = act(s, { type: 'attack' }).state;
      const r = act(s, { type: 'continue' });
      s = r.state;
      if (i === 2) assert.ok(r.events.some((e) => e.type === 'battleStart' && e.boss && e.monsterId === 'thornback_boar'));
    }
  });

  it('swapping weapons mid-battle costs a turn', () => {
    let s = newGame('warrior', 8);
    s.player!.gold = 1000;
    s.player!.level = 2;
    s = act(s, { type: 'buy', itemId: 'iron_sword' }).state;
    s = act(s, { type: 'startQuest', areaId: 'greenwood' }).state;
    const r = act(s, { type: 'equip', itemId: 'iron_sword' });
    assert.equal(r.state.player!.weapon, 'iron_sword');
    assert.ok(r.events.some((e) => e.type === 'attack' && e.actor === 'monster'), 'the monster gets its turn');
    assert.equal(step(r.state, { type: 'equip', itemId: 'tunic' }).events[0]!.type, 'error', 'no armor swaps mid-battle');
  });
});
