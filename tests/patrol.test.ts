/** Patrols: random, level-scaled runs. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PATROL_CONTACTS, chooseAction, describeStep, getHostile, initialState, patrolReward, scaledHostile, step,
} from '../src/core';
import type { Action, GameState } from '../src/core';
import { act, expectGolden, newGame, sureHit } from './helpers';

const patrolAction = (s: GameState): Action => {
  const a = chooseAction(s);
  return a.type === 'startMission' ? { type: 'startPatrol' } : a;
};

/** Wins every fight instantly so tests can walk through a whole patrol. */
function winFight(s: GameState): GameState {
  const t = structuredClone(s);
  t.player!.hp = 100_000;
  sureHit(t);
  for (const m of t.battle!.hostiles) m.hp = Math.min(m.hp, 1);
  let r = act(t, { type: 'attack' });
  while (r.state.mode === 'battle') r = act(r.state, { type: 'attack' });
  return r.state;
}

describe('patrols', () => {
  it('launch from the ship only, onto an unlocked world, at the player\'s level', () => {
    const s = newGame('engineer', 5);
    s.player!.level = 7;
    const r = act(s, { type: 'startPatrol' });
    assert.equal(r.state.mode, 'battle');
    assert.equal(r.state.mission!.missionId, 'veridia', 'only the first world is unlocked');
    assert.deepEqual(r.state.mission!.patrol, { level: 7 });
    assert.ok(r.state.battle!.hostiles.every((m) => m.level === 7));
    assert.equal(step(r.state, { type: 'startPatrol' }).events[0]!.type, 'error');
  });

  it('pick from every unlocked world', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame('security', seed);
      s.clearedMissions = ['veridia', 'kethra'];
      seen.add(act(s, { type: 'startPatrol' }).state.mission!.missionId);
    }
    assert.deepEqual([...seen].sort(), ['glacies', 'kethra', 'veridia']);
  });

  it('run PATROL_CONTACTS contacts, then a boss, then pay out and return to the ship', () => {
    let s = newGame('security', 8);
    s.player!.level = 10;
    s = act(s, { type: 'startPatrol' }).state;
    for (let i = 0; i < PATROL_CONTACTS; i++) {
      assert.ok(s.battle!.hostiles.every((m) => !getHostile(m.defId).boss), `contact ${i + 1} has no boss`);
      assert.ok(s.battle!.hostiles.length >= 1 && s.battle!.hostiles.length <= 3);
      s = winFight(s);
      assert.equal(s.mode, 'mission');
      s = act(s, { type: 'continue' }).state;
    }
    assert.ok(s.battle!.hostiles.some((m) => getHostile(m.defId).boss), 'final fight has the boss');
    const before = s;
    const t = structuredClone(s);
    t.player!.hp = 100_000;
    sureHit(t);
    for (const m of t.battle!.hostiles) m.hp = 1;
    let r = act(t, { type: 'attack' });
    while (r.state.mode === 'battle') r = act(r.state, { type: 'attack' });
    const done = r.events.find((e) => e.type === 'patrolComplete');
    assert.ok(done && done.type === 'patrolComplete');
    assert.deepEqual({ xp: done.xp, credits: done.credits }, patrolReward(10));
    assert.equal(r.state.mode, 'ship');
    assert.deepEqual(r.state.clearedMissions, before.clearedMissions, 'patrols never count as clearing a mission');
    assert.ok(!r.events.some((e) => e.type === 'gameComplete' || e.type === 'missionComplete'));
    assert.match(describeStep(t, r).join('\n'), /Patrol complete: .* sector \(level 10\)!/);
  });

  it('scale hostiles: same level and solo = unchanged; higher level = tougher; packs = weaker each', () => {
    const def = getHostile('frost_serpent');
    const same = scaledHostile('frost_serpent', def.level, 1);
    assert.equal(same.hp, def.hp);
    assert.equal(same.power, 1);
    assert.equal(same.reward, 1);
    const up = scaledHostile('frost_serpent', def.level + 6, 1);
    assert.ok(up.hp > def.hp && up.power! > 1);
    const down = scaledHostile('frost_serpent', 2, 1);
    assert.ok(down.hp < def.hp && down.power! < 1);
    const pack = scaledHostile('frost_serpent', def.level, 3);
    assert.ok(pack.hp < def.hp && pack.power! < 1);
  });

  it('scaled damage and level actually apply in combat', () => {
    const s = newGame('security', 2);
    s.player!.level = 20;
    s.player!.hp = 100_000;
    s.mode = 'battle';
    s.mission = { missionId: 'veridia', patrol: { level: 20 }, cleared: 0, earnedXp: 0, earnedCredits: 0 };
    const make = (scaled: boolean) => {
      const t = structuredClone(s);
      const base = { defId: 'protoplasm', hp: 5000, maxHp: 5000, statuses: [] };
      t.battle = { hostiles: [scaled ? { ...base, level: 20, power: 4 } : base], target: 0, playerStatuses: [], round: 1 };
      return t;
    };
    let plain = 0, strong = 0;
    for (let i = 0; i < 30; i++) {
      const a = make(false); a.rng = i;
      const b = make(true); b.rng = i;
      plain += 100_000 - act(a, { type: 'flee' }).state.player!.hp;
      strong += 100_000 - act(b, { type: 'flee' }).state.player!.hp;
    }
    assert.ok(strong > plain * 2.5, `scaled hits harder (${strong} vs ${plain})`);
  });

  it('are deterministic for a seed', () => {
    const run = () => {
      let s = newGame('science', 77);
      s.player!.level = 9;
      s = act(s, { type: 'startPatrol' }).state;
      return s.battle;
    };
    assert.deepEqual(run(), run());
  });

  it('golden: a full bot patrol transcript', () => {
    let s = initialState(2026);
    const lines: string[] = [];
    const play = (a: Action) => {
      const r = step(s, a);
      lines.push(`> ${JSON.stringify(a)}`, ...describeStep(s, r).map((l) => `  ${l}`));
      s = r.state;
    };
    play({ type: 'newGame', name: 'Patrol', divisionId: 'engineer', seed: 2026 });
    let started = false;
    for (let i = 0; i < 400; i++) {
      const a = patrolAction(s);
      if (a.type === 'startPatrol') { if (started) break; started = true; }
      play(a);
    }
    assert.ok(lines.some((l) => /Patrol complete|You're down/.test(l)), 'the patrol finished one way or another');
    expectGolden('transcript-patrol', lines);
  });
});

