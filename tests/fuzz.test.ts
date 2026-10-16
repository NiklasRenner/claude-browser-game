/**
 * Property / fuzz tests: random play must never crash, stall, or reach an
 * inconsistent state. These catch whole classes of bugs that example-based
 * tests miss (e.g. softlocks, negative credits, orphaned battles).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HOSTILES, MAX_LOADOUT, MISSION_ORDER, ITEMS, Rng, STATS, deserialize, derive, initialState, knownAbilities, legalActions,
  missionEncounters, serialize, ABILITIES, step,
} from '../src/core';
import type { Action, GameState, StatusEffect } from '../src/core';
import { deepFreeze } from './helpers';

function checkInvariants(s: GameState, ctx: string): void {
  const fail = (msg: string) => assert.fail(`${msg} (${ctx})`);
  if (legalActions(s).length === 0) fail('softlock: no legal actions');
  if ((s.mode === 'battle') !== (s.battle !== null)) fail('battle/mode mismatch');
  if ((s.mode === 'mission' || s.mode === 'battle') !== (s.mission !== null)) fail('mission/mode mismatch');
  if (s.mission?.drill && s.mode !== 'battle') fail('drill outlived its single fight');
  if (s.mode === 'title') return;
  const p = s.player;
  if (!p) return fail('missing player');
  const d = derive(p);
  if (!Number.isInteger(p.credits) || p.credits < 0) fail(`bad credits ${p.credits}`);
  if (!Number.isInteger(p.hp) || p.hp < 0 || p.hp > d.maxHp) fail(`bad hp ${p.hp}/${d.maxHp}`);
  if (!Number.isInteger(p.energy) || p.energy < 0 || p.energy > d.maxEnergy) fail(`bad energy ${p.energy}/${d.maxEnergy}`);
  if (p.hp === 0 && s.mode !== 'defeated') fail('dead but not defeated');
  if (!(p.inventory[p.weapon]! >= 1) || !(p.inventory[p.armor]! >= 1)) fail('equipped item not owned');
  for (const [id, n] of Object.entries(p.inventory)) if (!(n >= 1) || !ITEMS[id]) fail(`bad inventory ${id}=${n}`);
  const known = new Set(knownAbilities(p).map((a) => a.id));
  if (p.loadout.length > MAX_LOADOUT || new Set(p.loadout).size !== p.loadout.length || !p.loadout.every((id) => known.has(id))) {
    fail(`bad loadout ${p.loadout}`);
  }
  if (s.mission && s.mission.cleared > missionEncounters(s.mission)) fail(`cleared ${s.mission.cleared} encounters`);
  const unique = (list: StatusEffect[]) => new Set(list.map((st) => st.id)).size === list.length;
  if (s.battle) {
    const b = s.battle;
    if (b.hostiles.length < 1 || b.hostiles.length > 3) fail(`bad lineup size ${b.hostiles.length}`);
    if (!b.hostiles.some((m) => m.hp > 0)) fail('battle continues with every hostile down');
    if (!(b.hostiles[b.target]!.hp > 0)) fail(`target ${b.target} is not a living hostile`);
    for (const m of b.hostiles) {
      if (!Number.isInteger(m.hp) || m.hp < 0 || m.hp > m.maxHp) fail(`bad hostile hp ${m.hp}`);
      for (const st of m.statuses) if (st.turns <= 0) fail('expired status lingering');
      if (!unique(m.statuses)) fail('a status twice on one hostile');
    }
    for (const st of b.playerStatuses) if (st.turns <= 0) fail('expired status lingering');
    if (!unique(b.playerStatuses)) fail('a status twice on the player');
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
      { type: 'useAbility', abilityId: rng.pick(Object.keys(ABILITIES)) },
      { type: rng.pick(['slotAbility', 'unslotAbility', 'learnAbility'] as const), abilityId: rng.pick([...Object.keys(ABILITIES), 'nope']) },
      { type: 'startMission', missionId: rng.pick([...MISSION_ORDER, 'void']) },
      { type: 'startDrill', hostileIds: Array.from({ length: rng.int(0, 4) }, () => rng.pick([...Object.keys(HOSTILES), 'nope'])) },
      { type: 'allocateStat', stat: rng.pick(STATS) },
      { type: 'target', index: rng.int(-1, 4) },
      { type: 'attack', target: rng.int(-1, 4) },
      { type: rng.pick(['attack', 'flee', 'treat', 'continue', 'retreat', 'returnToShip'] as const) },
    ];
    return rng.pick(junk);
  }
  const legal = legalActions(s);
  // Favour progress so random walks actually reach deeper states.
  const fight = legal.filter((a) => a.type === 'attack' || a.type === 'continue' || a.type === 'returnToShip');
  return fight.length && rng.chance(60) ? rng.pick(fight) : rng.pick(legal);
}

describe('fuzz', () => {
  it('random play never crashes, stalls or breaks invariants', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = new Rng(seed * 7919);
      let s = initialState(seed);
      for (let i = 0; i < 1500; i++) {
        const action = randomAction(s, rng);
        // step() must never change its input (checked on a sample: freezing makes any write throw).
        if (i % 7 === 0) deepFreeze(s);
        const before = s;
        const r = step(s, action);
        const err = r.events.find((e) => e.type === 'error');
        if (err) assert.equal(r.state, before, 'rejected actions must not change state');
        s = r.state;
        checkInvariants(s, `seed ${seed} step ${i} after ${JSON.stringify(action)}`);
      }
    }
  });

  it('reachable states survive a save/load round trip', () => {
    for (const seed of [3, 4, 5]) {
      const rng = new Rng(4242 + seed);
      let s = initialState(seed);
      for (let i = 0; i < 1500; i++) {
        s = step(s, randomAction(s, rng)).state;
        if (i % 5 === 0) {
          const r = deserialize(serialize(s));
          assert.ok(r.ok, r.ok ? '' : r.error);
          assert.deepEqual(r.state, s);
        }
      }
    }
  });
});
