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
    const s1 = newGame('engineer', 1);
    assert.equal(s1.mode, 'town');
    assert.equal(s1.player!.classId, 'engineer');
  });

  it('never mutates the input state', () => {
    const s = deepFreeze(newGame('security', 9));
    const actions: Action[] = [
      { type: 'buy', itemId: 'medkit' }, { type: 'startQuest', areaId: 'veridia' }, { type: 'attack' },
    ];
    let cur = s;
    for (const a of actions) cur = deepFreeze(act(cur, a).state);
    assert.equal(s.player!.gold, 50);
  });

  it('rejects illegal actions without changing state', () => {
    const s = newGame();
    for (const a of [
      { type: 'attack' }, { type: 'continue' }, { type: 'returnToTown' }, { type: 'buy', itemId: 'nova_rifle' },
      { type: 'buy', itemId: 'not_an_item' }, { type: 'startQuest', areaId: 'void_rift' },
      { type: 'newGame', name: 'x', classId: 'science' }, { type: 'allocateStat', stat: 'str' },
    ] as Action[]) {
      const r = step(s, a);
      assert.equal(r.state, s, JSON.stringify(a));
      assert.equal(r.events.length, 1);
      assert.equal(r.events[0]!.type, 'error');
    }
  });

  it('agrees with legalActions: everything listed is accepted', () => {
    const s = newGame('science', 4);
    for (const a of legalActions(s)) assert.equal(step(s, a).events.find((e) => e.type === 'error'), undefined);
  });

  it('is deterministic: same seed and actions give identical results', () => {
    const run = () => actAll(newGame('security', 77), [{ type: 'startQuest', areaId: 'veridia' }, { type: 'attack' }, { type: 'attack' }]);
    assert.deepEqual(run(), run());
  });
});

describe('town', () => {
  it('buys and sells with correct gold accounting', () => {
    let s = newGame('security');
    s.player!.level = 2;
    s.player!.gold = 100;
    s = act(s, { type: 'buy', itemId: 'gauss_pistol' }).state;
    assert.equal(s.player!.gold, 100 - getItem('gauss_pistol').price);
    assert.equal(s.player!.inventory.gauss_pistol, 1);
    assert.equal(step(s, { type: 'buy', itemId: 'gauss_pistol' }).events[0]!.type, 'error', 'gear is unique');
    const gold = s.player!.gold;
    s = act(s, { type: 'sell', itemId: 'gauss_pistol' }).state;
    assert.equal(s.player!.gold, gold + sellPrice('gauss_pistol'));
    assert.equal(s.player!.inventory.gauss_pistol, undefined);
  });

  it('enforces level requirements and blocks selling equipped gear', () => {
    let s = newGame('security');
    s.player!.gold = 10_000;
    assert.match((step(s, { type: 'buy', itemId: 'plasma_pistol' }).events[0] as { reason: string }).reason, /level 3/);
    s.player!.level = 2;
    s = act(s, { type: 'buy', itemId: 'gauss_pistol' }).state;
    s = act(s, { type: 'equip', itemId: 'gauss_pistol' }).state;
    assert.equal(s.player!.weapon, 'gauss_pistol');
    assert.equal(step(s, { type: 'sell', itemId: 'gauss_pistol' }).events[0]!.type, 'error');
    // The unequipped starter sidearm can now be sold, for 1 credit.
    const gold = s.player!.gold;
    s = act(s, { type: 'sell', itemId: 'sidearm_mk1' }).state;
    assert.equal(s.player!.gold, gold + 1);
    assert.equal(s.player!.inventory.sidearm_mk1, undefined);
  });

  it('sells starter kit for 1 credit but never what is equipped (so you always keep a weapon and armor)', () => {
    let s = newGame('engineer');
    assert.equal(sellPrice('mag_wrench'), 1);
    assert.equal(sellPrice('duty_uniform'), 1);
    assert.match((step(s, { type: 'sell', itemId: 'mag_wrench' }).events[0] as { reason: string }).reason, /Unequip/);
    assert.match((step(s, { type: 'sell', itemId: 'duty_uniform' }).events[0] as { reason: string }).reason, /Unequip/);
    s.player!.level = 2;
    s.player!.gold = 200;
    s = act(s, { type: 'buy', itemId: 'field_jacket' }).state;
    s = act(s, { type: 'equip', itemId: 'field_jacket' }).state;
    s = act(s, { type: 'sell', itemId: 'duty_uniform' }).state;
    assert.equal(s.player!.inventory.duty_uniform, undefined);
    assert.equal(s.player!.armor, 'field_jacket');
  });

  it('rests to full for a small fee, and only when needed', () => {
    let s = newGame('security');
    assert.equal(step(s, { type: 'rest' }).events[0]!.type, 'error');
    s = structuredClone(s);
    s.player!.hp = 1;
    const cost = restCost(s.player!);
    const r = act(s, { type: 'rest' });
    assert.equal(r.state.player!.hp, derive(r.state.player!).maxHp);
    assert.equal(r.state.player!.gold, s.player!.gold - cost);
  });

  it('lets a broke player rest for free (no softlock)', () => {
    const s = newGame('security');
    s.player!.gold = 0;
    s.player!.hp = 1;
    assert.equal(act(s, { type: 'rest' }).state.player!.gold, 0);
  });

  it('uses potions outside battle', () => {
    const s = newGame('engineer');
    s.player!.hp = 10;
    const r = act(s, { type: 'useItem', itemId: 'medkit' });
    assert.equal(r.state.player!.hp, 55);
    assert.equal(r.state.player!.inventory.medkit, 1);
  });
});

describe('quest flow', () => {
  it('starts a battle immediately and allows retreating between fights', () => {
    let s = act(newGame('security', 12), { type: 'startQuest', areaId: 'veridia' }).state;
    assert.equal(s.mode, 'battle');
    assert.equal(s.quest!.areaId, 'veridia');
    s.battle!.monsters[0]!.hp = 1;
    s.player!.stats.pre = 300;
    s = act(s, { type: 'attack' }).state;
    assert.equal(s.mode, 'quest');
    assert.equal(act(s, { type: 'retreat' }).state.mode, 'town');
    s = act(s, { type: 'continue' }).state;
    assert.equal(s.mode, 'battle');
  });

  it('sends the boss after the regular encounters', () => {
    let s = act(newGame('security', 12), { type: 'startQuest', areaId: 'veridia' }).state;
    for (let i = 0; i < 3; i++) {
      s.battle!.monsters[0]!.hp = 1;
      s.player!.stats.pre = 300;
      s.player!.hp = 999;
      s = act(s, { type: 'attack' }).state;
      const r = act(s, { type: 'continue' });
      s = r.state;
      if (i === 2) assert.ok(r.events.some((e) => e.type === 'battleStart' && e.boss && e.monsterIds[0] === 'thornhide_behemoth'));
    }
  });

  it('swapping weapons mid-battle costs a turn', () => {
    let s = newGame('security', 8);
    s.player!.gold = 1000;
    s.player!.level = 2;
    s = act(s, { type: 'buy', itemId: 'gauss_pistol' }).state;
    s = act(s, { type: 'startQuest', areaId: 'veridia' }).state;
    const r = act(s, { type: 'equip', itemId: 'gauss_pistol' });
    assert.equal(r.state.player!.weapon, 'gauss_pistol');
    assert.ok(r.events.some((e) => e.type === 'attack' && e.actor === 'monster'), 'the monster gets its turn');
    assert.equal(step(r.state, { type: 'equip', itemId: 'duty_uniform' }).events[0]!.type, 'error', 'no armor swaps mid-battle');
  });
});
