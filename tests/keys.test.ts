import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkAction, initialState } from '../src/core';
import { keyAction } from '../src/ui/keys';
import { act, inBattle, newGame, sureHit } from './helpers';

describe('keyboard shortcuts', () => {
  it('advance to the next fight with Enter, Space or C, and return to ship with R', () => {
    let s = act(newGame('security', 4), { type: 'startQuest', areaId: 'veridia' }).state;
    s.battle!.monsters[0]!.hp = 1;
    sureHit(s);
    s = act(s, { type: 'attack' }).state;
    assert.equal(s.mode, 'quest');
    for (const key of ['Enter', ' ', 'c', 'C']) assert.deepEqual(keyAction(s, key), { type: 'continue' }, key);
    assert.deepEqual(keyAction(s, 'r'), { type: 'retreat' });
    assert.equal(act(s, keyAction(s, 'Enter')!).state.mode, 'battle');
  });

  it('map battle keys to attack, flee and abilities by slot', () => {
    const s = inBattle(newGame('science', 4), 'protoplasm');
    assert.deepEqual(keyAction(s, 'a'), { type: 'attack' });
    assert.deepEqual(keyAction(s, 'f'), { type: 'flee' });
    assert.deepEqual(keyAction(s, '1'), { type: 'cast', spellId: 'plasma_burst' });
    assert.equal(keyAction(s, '9'), null, 'no ability in that slot yet');
    assert.equal(keyAction(s, 'Enter'), null, 'Enter must not do anything mid-fight');
  });

  it('wake up after going down with Enter or Space', () => {
    const s = newGame('engineer');
    s.mode = 'defeated';
    assert.deepEqual(keyAction(s, 'Enter'), { type: 'returnToTown' });
    assert.deepEqual(keyAction(s, ' '), { type: 'returnToTown' });
  });

  it('do nothing on the title screen or aboard the ship', () => {
    assert.equal(keyAction(initialState(1), 'Enter'), null);
    assert.equal(keyAction(newGame(), 'Enter'), null);
    assert.equal(keyAction(newGame(), 'a'), null);
  });

  it('only ever produce actions the rules accept in that mode', () => {
    const s = act(newGame('security', 4), { type: 'startQuest', areaId: 'veridia' }).state;
    for (const key of ['a', 'f', '1', '2', '3']) {
      const action = keyAction(s, key);
      if (action) assert.equal(checkAction(s, action), null, key);
    }
  });

  it('Tab / Shift+Tab cycle through living hostiles only, wrapping around', () => {
    const s = inBattle(newGame('security', 4), 'hive_drone');
    s.battle!.monsters = ['hive_drone', 'hive_spitter', 'hive_drone'].map((defId) => ({ defId, hp: 50, maxHp: 50, statuses: [] }));
    s.battle!.target = 0;
    assert.deepEqual(keyAction(s, 'Tab'), { type: 'target', index: 1 });
    assert.deepEqual(keyAction(s, 'Tab', true), { type: 'target', index: 2 });
    s.battle!.monsters[1]!.hp = 0;
    assert.deepEqual(keyAction(s, 'Tab'), { type: 'target', index: 2 }, 'skips the downed hostile');
    s.battle!.monsters[2]!.hp = 0;
    assert.equal(keyAction(s, 'Tab'), null, 'nothing to switch to');
  });
});
