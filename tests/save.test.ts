import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SAVE_VERSION, chooseAction, deserialize, serialize, step } from '../src/core';
import type { GameState } from '../src/core';
import { act, newGame } from './helpers';

function midBattle(): GameState {
  let s = act(newGame('engineer', 31), { type: 'startMission', missionId: 'veridia' }).state;
  s = act(s, { type: 'useAbility', abilityId: 'nanite_swarm' }).state;
  return s;
}

describe('save / load', () => {
  it('round-trips exactly, including mid-battle', () => {
    const s = midBattle();
    const loaded = deserialize(serialize(s));
    assert.ok(loaded.ok);
    assert.deepEqual(loaded.state, s);
  });

  it('a loaded game continues exactly like the original (RNG state is saved)', () => {
    let a = midBattle();
    const loaded = deserialize(serialize(a));
    assert.ok(loaded.ok);
    let b = loaded.state;
    for (let i = 0; i < 200; i++) {
      const ra = step(a, chooseAction(a));
      const rb = step(b, chooseAction(b));
      assert.deepEqual(rb.events, ra.events);
      a = ra.state;
      b = rb.state;
    }
  });

  it('rejects garbage and foreign data', () => {
    assert.equal(deserialize('not json').ok, false);
    assert.equal(deserialize('{}').ok, false);
    assert.equal(deserialize(JSON.stringify({ format: 'other', version: 1, state: {} })).ok, false);
  });

  it('rejects saves from a newer version', () => {
    const text = JSON.stringify({ format: 'starward-save', version: SAVE_VERSION + 1, state: newGame() });
    const r = deserialize(text);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : '', /newer/);
  });

  it('rejects corrupted content references', () => {
    const corruptions: ((s: GameState) => void)[] = [
      (s) => { s.player!.weapon = 'excalibur'; },
      (s) => { s.player!.inventory.excalibur = 1; },
      (s) => { s.player!.credits = -5; },
      (s) => { s.player!.stats.pow = 1.5; },
      (s) => { s.mode = 'battle'; },
      (s) => { s.clearedMissions.push('atlantis'); },
    ];
    for (const corrupt of corruptions) {
      const s = newGame();
      corrupt(s);
      assert.equal(deserialize(serialize(s)).ok, false, corrupt.toString());
    }
  });
});
