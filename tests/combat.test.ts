import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_HIT, MIN_HIT, Rng, applyStatus, fleeChance, getMonster, hitChance, mitigate, runRound, step,
} from '../src/core';
import type { GameEvent, GameState } from '../src/core';
import { act, inBattle, newGame } from './helpers';

/** A battle where the player cannot die, for observing many monster turns. */
function sturdyBattle(monsterId = 'protoplasm'): GameState {
  const s = inBattle(newGame('security', 3), monsterId);
  s.player!.hp = 1_000_000;
  s.battle!.monster.hp = s.battle!.monster.maxHp = 1_000_000;
  return s;
}

describe('combat formulas', () => {
  it('clamps hit chance', () => {
    assert.equal(hitChance(1000, 0), MAX_HIT);
    assert.equal(hitChance(-1000, 0), MIN_HIT);
    assert.equal(hitChance(0, 0), 82);
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
    const low = fleeChance(p, getMonster('rift_marauder'));
    p.level = 30;
    const high = fleeChance(p, getMonster('protoplasm'));
    assert.ok(low >= 20 && high <= 90 && high > low);
  });
});

describe('status effects', () => {
  it('a 3-turn guard protects against exactly 3 monster turns', () => {
    const s = sturdyBattle();
    const rng = new Rng(1);
    const events: GameEvent[] = [];
    runRound(s.player!, s.battle!, rng, events, (ctx) =>
      applyStatus(ctx.battle.playerStatuses, 'player', 'shield', 3, 40, ctx.events));
    let guardedMonsterTurns = s.battle!.playerStatuses.some((x) => x.id === 'shield') ? 1 : 0;
    for (let i = 0; i < 5; i++) {
      runRound(s.player!, s.battle!, rng, events, () => {});
      if (s.battle!.playerStatuses.some((x) => x.id === 'shield')) guardedMonsterTurns++;
    }
    assert.equal(guardedMonsterTurns, 3);
  });

  it('poison applied by the player ticks exactly `turns` times', () => {
    const s = sturdyBattle();
    const events: GameEvent[] = [];
    const rng = new Rng(2);
    runRound(s.player!, s.battle!, rng, events, (ctx) =>
      applyStatus(ctx.battle.monster.statuses, 'monster', 'corrode', 3, 5, ctx.events));
    for (let i = 0; i < 5; i++) runRound(s.player!, s.battle!, rng, events, () => {});
    const ticks = events.filter((e) => e.type === 'statusTick' && e.target === 'monster');
    assert.equal(ticks.length, 3);
    assert.ok(ticks.every((e) => e.type === 'statusTick' && e.damage === Math.round(5 * 50 / 100)), 'slime resists poison 50%');
  });

  it('a stunned monster skips its turn', () => {
    const s = sturdyBattle();
    const events: GameEvent[] = [];
    runRound(s.player!, s.battle!, new Rng(3), events, (ctx) =>
      applyStatus(ctx.battle.monster.statuses, 'monster', 'stun', 1, 0, ctx.events));
    assert.ok(events.some((e) => e.type === 'stunned' && e.actor === 'monster'));
    assert.ok(!events.some((e) => e.type === 'attack' && e.actor === 'monster'));
    assert.equal(s.battle!.monster.statuses.length, 0, 'stun expires after the skipped turn');
  });

  it('a stunned player has their turn skipped automatically', () => {
    const s = sturdyBattle();
    s.battle!.playerStatuses.push({ id: 'stun', turns: 1, power: 0 });
    const events: GameEvent[] = [];
    // The stun is "discovered" at the start of the player's next turn, after the monster acts.
    runRound(s.player!, s.battle!, new Rng(4), events, null);
    const monsterAttacks = events.filter((e) => e.type === 'attack' && e.actor === 'monster').length;
    assert.ok(events.some((e) => e.type === 'stunned' && e.actor === 'player'));
    assert.equal(monsterAttacks, 2, 'monster acts twice: its own turn plus the skipped player turn');
    assert.ok(!s.battle!.playerStatuses.some((x) => x.id === 'stun'), 'stun is consumed');
  });

  it('refreshing a status keeps the stronger values', () => {
    const list: { id: 'burn'; turns: number; power: number }[] = [];
    applyStatus(list, 'monster', 'burn', 3, 2, []);
    applyStatus(list, 'monster', 'burn', 1, 9, []);
    assert.deepEqual(list, [{ id: 'burn', turns: 3, power: 9 }]);
  });
});

describe('battle outcomes', () => {
  it('awards XP and gold on victory and returns to the quest', () => {
    const s = inBattle(newGame('security', 5), 'protoplasm');
    s.battle!.monster.hp = 1;
    s.player!.stats.dex = 200; // guarantee the hit
    const { state, events } = act(s, { type: 'attack' });
    const victory = events.find((e) => e.type === 'victory');
    assert.ok(victory && victory.type === 'victory');
    assert.equal(state.mode, 'quest');
    assert.equal(state.battle, null);
    assert.equal(state.player!.gold, s.player!.gold + victory.gold);
    assert.equal(state.quest!.cleared, 1);
    assert.equal(state.stats.battlesWon, 1);
  });

  it('completes the quest and unlocks the next area when the boss falls', () => {
    const s = inBattle(newGame('security', 5), 'thornhide_behemoth');
    s.battle!.monster.hp = 1;
    s.player!.stats.dex = 200;
    const { state, events } = act(s, { type: 'attack' });
    assert.ok(events.some((e) => e.type === 'questComplete' && e.firstClear));
    assert.equal(state.mode, 'town');
    assert.deepEqual(state.clearedAreas, ['veridia']);
    assert.equal(state.quest, null);
  });

  it('applies the defeat penalty and lets the player recover in town', () => {
    const s = inBattle(newGame('science', 6), 'raider');
    s.player!.hp = 1;
    s.player!.gold = 100;
    s.player!.stats.dex = -200; // guarantee our attack misses and theirs lands
    let r = act(s, { type: 'attack' });
    // The bandit might miss a few times; keep swinging until we fall.
    while (r.state.mode === 'battle') r = act(r.state, { type: 'attack' });
    assert.equal(r.state.mode, 'defeated');
    assert.ok(r.events.some((e) => e.type === 'defeat' && e.goldLost === 10));
    assert.equal(r.state.player!.gold, 90);
    const back = act(r.state, { type: 'returnToTown' }).state;
    assert.equal(back.mode, 'town');
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
    const r = act(s, { type: 'cast', spellId: 'plasma_burst' });
    assert.equal(r.state.player!.mp, s.player!.mp - 6);
    const broke = structuredClone(s);
    broke.player!.mp = 0;
    assert.equal(step(broke, { type: 'cast', spellId: 'plasma_burst' }).events[0]!.type, 'error');
  });

  it('exploits elemental weaknesses', () => {
    // Firebolt vs. a fire-weak slime should outdamage the same spell vs. a fire-immune golem.
    const total = (monsterId: string) => {
      let sum = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const s = inBattle(newGame('science', seed), monsterId);
        s.battle!.monster.hp = s.battle!.monster.maxHp = 10_000;
        const ev = act(s, { type: 'cast', spellId: 'plasma_burst' }).events;
        for (const e of ev) if (e.type === 'attack' && e.actor === 'player') sum += e.damage;
      }
      return sum;
    };
    assert.ok(total('protoplasm') > 300);
    assert.equal(total('magma_colossus'), 0);
  });
});
