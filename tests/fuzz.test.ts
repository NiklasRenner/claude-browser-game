/**
 * Property / fuzz tests: random play must never crash, stall, or reach an
 * inconsistent state. These catch whole classes of bugs that example-based
 * tests miss (e.g. softlocks, negative gold, orphaned battles).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AREA_ORDER, ITEMS, Rng, STATS, deserialize, derive, initialState, legalActions, serialize, spellsFor, step,
} from '../src/core';
import type { Action, GameState } from '../src/core';

function checkInvariants(s: GameState, ctx: string): void {
  const fail = (msg: string) => assert.fail(`${msg} (${ctx})`);
  if (legalActions(s).length === 0) fail('softlock: no legal actions');
  if ((s.mode === 'battle') !== (s.battle !== null)) fail('battle/mode mismatch');
  if ((s.mode === 'quest' || s.mode === 'battle') !== (s.quest !== null)) fail('quest/mode mismatch');
  if (s.mode === 'title') return;
  const p = s.player;
  if (!p) return fail('missing player');
  const d = derive(p);
  if (!Number.isInteger(p.gold) || p.gold < 0) fail(`bad gold ${p.gold}`);
  if (!Number.isInteger(p.hp) || p.hp < 0 || p.hp > d.maxHp) fail(`bad hp ${p.hp}/${d.maxHp}`);
  if (!Number.isInteger(p.mp) || p.mp < 0 || p.mp > d.maxMp) fail(`bad mp ${p.mp}/${d.maxMp}`);
  if (p.hp === 0 && s.mode !== 'defeated') fail('dead but not defeated');
  if (!(p.inventory[p.weapon]! >= 1) || !(p.inventory[p.armor]! >= 1)) fail('equipped item not owned');
  for (const [id, n] of Object.entries(p.inventory)) if (!(n >= 1) || !ITEMS[id]) fail(`bad inventory ${id}=${n}`);
  if (s.battle) {
    const m = s.battle.monster;
    if (m.hp <= 0 || m.hp > m.maxHp) fail(`bad monster hp ${m.hp}`);
    for (const st of [...m.statuses, ...s.battle.playerStatuses]) if (st.turns <= 0) fail('expired status lingering');
  }
}

/** Biased random policy: mostly legal actions, sometimes garbage. */
function randomAction(s: GameState, rng: Rng): Action {
  if (rng.chance(10)) {
    const junk: Action[] = [
      { type: 'buy', itemId: rng.pick([...Object.keys(ITEMS), 'nope']) },
      { type: 'sell', itemId: rng.pick(Object.keys(ITEMS)) },
      { type: 'equip', itemId: rng.pick(Object.keys(ITEMS)) },
      { type: 'useItem', itemId: rng.pick(Object.keys(ITEMS)) },
      { type: 'cast', spellId: rng.pick(spellsFor('science', 30).map((x) => x.id)) },
      { type: 'startQuest', areaId: rng.pick([...AREA_ORDER, 'void']) },
      { type: 'allocateStat', stat: rng.pick(STATS) },
      { type: rng.pick(['attack', 'flee', 'rest', 'continue', 'retreat', 'returnToTown'] as const) },
    ];
    return rng.pick(junk);
  }
  const legal = legalActions(s);
  // Favour progress so random walks actually reach deeper states.
  const fight = legal.filter((a) => a.type === 'attack' || a.type === 'continue' || a.type === 'returnToTown');
  return fight.length && rng.chance(60) ? rng.pick(fight) : rng.pick(legal);
}

describe('fuzz', () => {
  it('random play never crashes, stalls or breaks invariants', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = new Rng(seed * 7919);
      let s = initialState(seed);
      for (let i = 0; i < 1500; i++) {
        const action = randomAction(s, rng);
        const before = s;
        const r = step(s, action);
        const err = r.events.find((e) => e.type === 'error');
        if (err) assert.equal(r.state, before, 'rejected actions must not change state');
        s = r.state;
        checkInvariants(s, `seed ${seed} step ${i} after ${JSON.stringify(action)}`);
      }
    }
  });

  it('every reachable state survives a save/load round trip', () => {
    const rng = new Rng(4242);
    let s = initialState(3);
    for (let i = 0; i < 2000; i++) {
      s = step(s, randomAction(s, rng)).state;
      if (i % 50 === 0) {
        const r = deserialize(serialize(s));
        assert.ok(r.ok, r.ok ? '' : r.error);
        assert.deepEqual(r.state, s);
      }
    }
  });
});
