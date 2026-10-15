/** Speed and the battle timeline: deterministic turn order. Also the player evasion cap. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PLAYER_EVASION_CAP, Rng, SPEED_MAX, beginBattle, derive, getHostile, initTimeline, nextActor, playerEvasion, speedBonus, upcomingTurns,
} from '../src/core';
import type { GameEvent, GameState } from '../src/core';
import { act, endlessFight, newGame } from './helpers';

const fight = (hostileId: string, spd = 5) => endlessFight(hostileId, { spd });

/** Plays `n` player actions and returns the actor sequence seen in the log ('P' / 'M'). */
function turnLog(s: GameState, n: number): string {
  let seq = '';
  let state = s;
  for (let i = 0; i < n; i++) {
    const r = act(state, { type: 'attack' });
    seq += 'P';
    let lastFoe = -1;
    for (const e of r.events) {
      // One hostile turn can contain several strikes; count turns, not strikes.
      if (e.type === 'attack' && e.actor === 'hostile') { if (lastFoe !== e.foe) seq += 'M'; lastFoe = e.foe; } else if (e.type === 'attack') lastFoe = -1;
    }
    state = r.state;
  }
  return seq;
}

describe('speed stat', () => {
  it('starts every officer at exactly speed 100 and has diminishing returns below +SPEED_MAX%', () => {
    assert.equal(derive(newGame('engineer').player!).speed, 100);
    assert.equal(speedBonus(5), 0);
    assert.equal(speedBonus(13), 10, '8 points above base = +10%');
    assert.ok(speedBonus(65) - speedBonus(35) < speedBonus(35) - speedBonus(5), 'later points are worth less');
    assert.ok(speedBonus(10_000) < SPEED_MAX);
  });
});

describe('battle timeline', () => {
  it('equal speed: the player opens, then turns alternate', () => {
    const s = fight('raider'); // speed 100
    assert.equal(nextActor(s.player!, s.battle!), 'player');
    assert.deepEqual(upcomingTurns(s.player!, s.battle!, 6), ['player', 0, 'player', 0, 'player', 0]);
    assert.equal(turnLog(s, 20), 'PM'.repeat(20));
  });

  it('+10% speed: exactly 11 turns for every 10 of theirs, on a fixed beat (no dice)', () => {
    const s = fight('raider', 13); // speed 110
    assert.equal(derive(s.player!).speed, 110);
    const order = upcomingTurns(s.player!, s.battle!, 210);
    assert.equal(order.filter((w) => w === 'player').length, 110);
    assert.equal(order.filter((w) => w === 0).length, 100);
    const doubles = order.map((w, i) => (w === 'player' && order[i + 1] === 'player' ? i : -1)).filter((i) => i >= 0);
    assert.equal(doubles.length, 10, 'one double turn per 10 rounds');
    assert.deepEqual(upcomingTurns(s.player!, s.battle!, 210), order, 'the same every time');
  });

  it('a faster hostile gets proportionally more turns', () => {
    const s = fight('phase_wisp'); // speed 130
    const order = upcomingTurns(s.player!, s.battle!, 230);
    assert.equal(order.filter((w) => w !== 'player').length, 130, '13 hostile turns per 10 player turns');
  });

  it('a faster hostile opens the fight before the player can act', () => {
    const s = fight('hive_drone'); // speed 120
    initTimeline(s.player!, s.battle!);
    assert.equal(nextActor(s.player!, s.battle!), 0);
    const events: GameEvent[] = [];
    assert.equal(beginBattle(s.player!, s.battle!, new Rng(1), events), 'continue');
    assert.ok(events.some((e) => e.type === 'attack' && e.actor === 'hostile'));
    assert.equal(nextActor(s.player!, s.battle!), 'player', 'then it is the player\'s turn');
  });

  it('a battle without timeline data (old save) is the player\'s turn, then runs like a fresh battle', () => {
    for (const id of ['raider', 'hive_drone', 'phase_wisp', 'magma_colossus']) {
      const loaded = fight(id, 11);
      const fresh = structuredClone(loaded);
      initTimeline(fresh.player!, fresh.battle!);
      const freshOrder = upcomingTurns(fresh.player!, fresh.battle!, 40);
      const afterOpening = freshOrder.slice(freshOrder.indexOf('player'));
      assert.deepEqual(upcomingTurns(loaded.player!, loaded.battle!, 30), afterOpening.slice(0, 30), id);
    }
  });

  it('a real mission start lets fast hostiles strike first', () => {
    let saw = false;
    for (let seed = 1; seed <= 20 && !saw; seed++) {
      const s = newGame('security', seed);
      s.clearedMissions = ['veridia'];
      s.player!.level = 6;
      s.player!.hp = 10_000;
      const r = act(s, { type: 'startMission', missionId: 'kethra' });
      const fast = r.state.battle?.hostiles.some((m) => getHostile(m.defId).speed > 100);
      if (fast) {
        saw = true;
        assert.ok(r.events.some((e) => e.type === 'attack' && e.actor === 'hostile'), 'they attacked right away');
      }
    }
    assert.ok(saw, 'found a fast Kethra hostile');
  });

  it('armor can change speed', () => {
    const p = newGame('security').player!;
    for (const [armor, speed] of [['aegis_power_armor', 96], ['thermal_envirosuit', 104]] as const) {
      p.inventory[armor] = 1;
      p.armor = armor;
      assert.equal(derive(p).speed, speed, armor);
    }
  });
});

describe('player evasion', () => {
  it('comes from armor and abilities only, capped at PLAYER_EVASION_CAP', () => {
    const s = fight('raider', 200);
    s.player!.inventory.aegis_power_armor = 1;
    s.player!.armor = 'aegis_power_armor';
    const armorOnly = playerEvasion(s.player!, s.battle!);
    assert.equal(armorOnly, 12, 'stats (even huge speed) add no evasion');
    s.battle!.playerStatuses.push({ id: 'evasive', turns: 2, power: 35 });
    assert.equal(playerEvasion(s.player!, s.battle!), PLAYER_EVASION_CAP);
    s.battle!.playerStatuses.push({ id: 'marked', turns: 2, power: 15 });
    assert.equal(playerEvasion(s.player!, s.battle!), PLAYER_EVASION_CAP - 15, 'marked applies after the cap');
  });
});
