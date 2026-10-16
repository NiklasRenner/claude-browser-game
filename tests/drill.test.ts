import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HOSTILES, bossLevel, checkAction, derive, getMission, hostileLevel, step } from '../src/core';
import type { GameState } from '../src/core';
import { act, newGame, sureHit } from './helpers';

const drill = (s: GameState, hostileIds: string[]) => act(s, { type: 'startDrill', hostileIds });

describe('combat drill', () => {
  it('starts one fight against the picked lineup, on the first hostile\'s world, bosses at their story level', () => {
    const s = drill(newGame('security'), ['hive_drone', 'brood_matriarch']).state;
    assert.equal(s.mode, 'battle');
    assert.equal(s.mission!.missionId, 'xenith');
    assert.deepEqual(s.battle!.hostiles.map((h) => h.defId), ['hive_drone', 'brood_matriarch']);
    assert.equal(hostileLevel(s.battle!.hostiles[0]!), HOSTILES.hive_drone!.level);
    assert.equal(hostileLevel(s.battle!.hostiles[1]!), bossLevel(getMission('xenith')));
  });

  it('rejects empty, oversized and unknown lineups, and anything off the ship', () => {
    const s = newGame();
    assert.ok(checkAction(s, { type: 'startDrill', hostileIds: [] }));
    assert.ok(checkAction(s, { type: 'startDrill', hostileIds: ['hive_drone', 'hive_drone', 'hive_drone', 'hive_drone'] }));
    assert.ok(checkAction(s, { type: 'startDrill', hostileIds: ['nope'] }));
    const inFight = drill(s, ['hive_drone']).state;
    assert.ok(checkAction(inFight, { type: 'startDrill', hostileIds: ['hive_drone'] }));
  });

  it('a win gives nothing and restores the officer, back on the ship', () => {
    let s = drill(newGame(), ['fen_leech']).state;
    const before = structuredClone(s.player!);
    s.battle!.hostiles[0]!.hp = 1;
    s.player!.hp = 3;
    sureHit(s);
    const r = act(s, { type: 'attack' });
    assert.equal(r.state.mode, 'ship');
    assert.equal(r.state.mission, null);
    assert.ok(r.events.some((e) => e.type === 'drillEnded' && e.outcome === 'won'));
    assert.ok(!r.events.some((e) => e.type === 'victory' || e.type === 'levelUp'));
    const p = r.state.player!;
    assert.deepEqual([p.xp, p.credits, p.inventory], [before.xp, before.credits, before.inventory]);
    assert.deepEqual([p.hp, p.energy], [derive(p).maxHp, derive(p).maxEnergy]);
    assert.equal(r.state.stats.battlesWon, 0);
  });

  it('a loss costs nothing: no credits lost, no defeat screen', () => {
    const s = drill(newGame(), ['brood_matriarch']).state;
    s.player!.hp = 1;
    s.player!.credits = 500;
    let r = { state: s, events: [] as ReturnType<typeof step>['events'] };
    for (let i = 0; i < 50 && r.state.mode === 'battle'; i++) r = act(r.state, { type: 'attack' });
    assert.equal(r.state.mode, 'ship');
    assert.ok(r.events.some((e) => e.type === 'drillEnded' && e.outcome === 'lost'));
    assert.equal(r.state.player!.credits, 500);
    assert.equal(r.state.player!.hp, derive(r.state.player!).maxHp);
    assert.equal(r.state.stats.battlesLost, 0);
  });

  it('beaming out always works, even from a boss', () => {
    const s = drill(newGame(), ['brood_matriarch']).state;
    const r = act(s, { type: 'flee' });
    assert.equal(r.state.mode, 'ship');
    assert.ok(r.events.some((e) => e.type === 'drillEnded' && e.outcome === 'ended'));
  });
});
