import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_HIT, MIN_HIT, Rng, applyStatus, beginBattle, fleeChance, getHostile, hitChance, mitigate, runRound, step,
} from '../src/core';
import type { GameEvent } from '../src/core';
import { act, inBattle, newGame, sureHit, endlessFight } from './helpers';

const sturdyBattle = (hostileId = 'fen_leech') => endlessFight(hostileId);

describe('combat formulas', () => {
  it('clamps hit chance', () => {
    assert.equal(hitChance(1000, 0), MAX_HIT);
    assert.equal(hitChance(-1000, 0), MIN_HIT);
    assert.equal(hitChance(88, 20), 68, 'hit chance minus evasion');
    assert.equal(hitChance(120, 30), 90, 'hit above 100 still pays off against evasion');
  });

  it('mitigates damage by resistance and guard, with a floor of 1 unless immune', () => {
    assert.equal(mitigate(10, 100, 0), 10);
    assert.equal(mitigate(10, 150, 0), 15);
    assert.equal(mitigate(10, 100, 50), 5);
    assert.equal(mitigate(1, 10, 90), 1);
    assert.equal(mitigate(100, 0, 0), 0);
  });

  it('bounds flee chance', () => {
    const p = newGame('engineer').player!;
    const low = fleeChance(p, getHostile('rift_marauder').level);
    p.level = 30;
    const high = fleeChance(p, getHostile('fen_leech').level);
    assert.ok(low >= 5 && high <= 95 && high > low);
  });
});

describe('status effects', () => {
  it('a 3-turn guard protects against exactly 3 hostile turns', () => {
    const s = sturdyBattle();
    const rng = new Rng(1);
    const events: GameEvent[] = [];
    runRound(s.player!, s.battle!, rng, events, (ctx) =>
      applyStatus(ctx.battle.playerStatuses, 'player', 'shield', 3, 40, ctx.events));
    let guardedHostileTurns = s.battle!.playerStatuses.some((x) => x.id === 'shield') ? 1 : 0;
    for (let i = 0; i < 5; i++) {
      runRound(s.player!, s.battle!, rng, events, () => {});
      if (s.battle!.playerStatuses.some((x) => x.id === 'shield')) guardedHostileTurns++;
    }
    assert.equal(guardedHostileTurns, 3);
  });

  it('poison applied by the player ticks exactly `turns` times', () => {
    const s = sturdyBattle();
    const events: GameEvent[] = [];
    const rng = new Rng(2);
    runRound(s.player!, s.battle!, rng, events, (ctx) =>
      applyStatus(ctx.battle.hostiles[0]!.statuses, 'hostile', 'corrode', 3, 5, ctx.events));
    for (let i = 0; i < 5; i++) runRound(s.player!, s.battle!, rng, events, () => {});
    const ticks = events.filter((e) => e.type === 'statusTick' && e.target === 'hostile');
    assert.equal(ticks.length, 3);
    assert.ok(ticks.every((e) => e.type === 'statusTick' && e.damage === Math.round(5 * 50 / 100)), 'slime resists poison 50%');
  });

  it('a stunned hostile skips its turn', () => {
    const s = sturdyBattle();
    const events: GameEvent[] = [];
    runRound(s.player!, s.battle!, new Rng(3), events, (ctx) =>
      applyStatus(ctx.battle.hostiles[0]!.statuses, 'hostile', 'stun', 1, 0, ctx.events));
    assert.ok(events.some((e) => e.type === 'stunned' && e.actor === 'hostile'));
    assert.ok(!events.some((e) => e.type === 'attack' && e.actor === 'hostile'));
    assert.equal(s.battle!.hostiles[0]!.statuses.length, 0, 'stun expires after the skipped turn');
  });

  it('a stunned player has their turn skipped automatically', () => {
    const s = sturdyBattle('choir_cantor'); // same speed as the player, so turns alternate
    s.battle!.playerStatuses.push({ id: 'stun', turns: 1, power: 0 });
    const events: GameEvent[] = [];
    // The player would act first, but is stunned: that turn is skipped, the cantor acts, then it's the player's turn.
    assert.equal(beginBattle(s.player!, s.battle!, new Rng(4), events), 'continue');
    const hostileTurns = events.filter((e) => e.type === 'attack' && e.actor === 'hostile').length;
    assert.ok(events.some((e) => e.type === 'stunned' && e.actor === 'player'));
    assert.ok(hostileTurns >= 1, 'the cantor used the skipped turn');
    assert.ok(!s.battle!.playerStatuses.some((x) => x.id === 'stun'), 'stun is consumed');
  });

  it('refreshing a status keeps the stronger values', () => {
    const list: { id: 'burn'; turns: number; power: number }[] = [];
    applyStatus(list, 'hostile', 'burn', 3, 2, []);
    applyStatus(list, 'hostile', 'burn', 1, 9, []);
    assert.deepEqual(list, [{ id: 'burn', turns: 3, power: 9 }]);
  });
});

describe('battle outcomes', () => {
  it('awards XP and credits on victory and returns to the mission', () => {
    const s = inBattle(newGame('security', 5), 'fen_leech');
    s.battle!.hostiles[0]!.hp = 1;
    sureHit(s);
    const { state, events } = act(s, { type: 'attack' });
    const victory = events.find((e) => e.type === 'victory');
    assert.ok(victory && victory.type === 'victory');
    assert.equal(state.mode, 'mission');
    assert.equal(state.battle, null);
    assert.equal(state.player!.credits, s.player!.credits + victory.credits);
    assert.equal(state.mission!.cleared, 1);
    assert.equal(state.stats.battlesWon, 1);
  });

  it('completes the mission and unlocks the next mission when the boss falls', () => {
    const s = inBattle(newGame('security', 5), 'archcantor');
    s.battle!.hostiles[0]!.hp = 1;
    sureHit(s);
    const { state, events } = act(s, { type: 'attack' });
    assert.ok(events.some((e) => e.type === 'missionComplete' && e.firstClear));
    assert.equal(state.mode, 'ship');
    assert.deepEqual(state.clearedMissions, ['veridia']);
    assert.equal(state.mission, null);
  });

  it('applies the defeat penalty and lets the player recover in ship', () => {
    const s = inBattle(newGame('science', 6), 'choir_cantor');
    s.player!.hp = 1;
    s.player!.credits = 100;
    // Make our attacks (almost) always miss and theirs always land.
    s.battle!.hostiles[0]!.statuses.push({ id: 'evasive', turns: 99, power: 1000 });
    s.battle!.playerStatuses.push({ id: 'marked', turns: 99, power: 1000 });
    let r = act(s, { type: 'attack' });
    // The bandit might miss a few times; keep swinging until we fall.
    while (r.state.mode === 'battle') r = act(r.state, { type: 'attack' });
    assert.equal(r.state.mode, 'defeated');
    assert.ok(r.events.some((e) => e.type === 'defeat' && e.creditsLost === 10));
    assert.equal(r.state.player!.credits, 90);
    const back = act(r.state, { type: 'returnToShip' }).state;
    assert.equal(back.mode, 'ship');
    assert.ok(back.player!.hp > 0);
  });

  it('forbids fleeing from bosses', () => {
    const s = inBattle(newGame(), 'magma_colossus');
    const r = step(s, { type: 'flee' });
    assert.equal(r.state, s);
    assert.match((r.events[0] as { reason: string }).reason, /interference/);
  });

  it('spends MP when casting and refuses without enough', () => {
    const s = inBattle(newGame('science'), 'tundra_brute');
    const r = act(s, { type: 'useAbility', abilityId: 'plasma_burst' });
    assert.equal(r.state.player!.energy, s.player!.energy - 6);
    const broke = structuredClone(s);
    broke.player!.energy = 0;
    assert.equal(step(broke, { type: 'useAbility', abilityId: 'plasma_burst' }).events[0]!.type, 'error');
  });

  it('exploits elemental weaknesses', () => {
    // Firebolt vs. a fire-weak slime should outdamage the same ability vs. a fire-immune golem.
    const total = (hostileId: string) => {
      let sum = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const s = inBattle(newGame('science', seed), hostileId);
        s.battle!.hostiles[0]!.hp = s.battle!.hostiles[0]!.maxHp = 10_000;
        const ev = act(s, { type: 'useAbility', abilityId: 'plasma_burst' }).events;
        for (const e of ev) if (e.type === 'attack' && e.actor === 'player') sum += e.damage;
      }
      return sum;
    };
    assert.ok(total('fen_leech') > 300);
    assert.equal(total('magma_colossus'), 0);
  });
});
