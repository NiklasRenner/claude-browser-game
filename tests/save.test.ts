import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SAVE_VERSION, chooseAction, deserialize, serialize, step } from '../src/core';
import type { GameState } from '../src/core';
import { act, newGame } from './helpers';

function midBattle(): GameState {
  let s = act(newGame('engineer', 31), { type: 'startQuest', areaId: 'veridia' }).state;
  s = act(s, { type: 'cast', spellId: 'nanite_swarm' }).state;
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
    const text = JSON.stringify({ format: 'questforge-save', version: SAVE_VERSION + 1, state: newGame() });
    const r = deserialize(text);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : '', /newer/);
  });

  it('rejects corrupted content references', () => {
    const corruptions: ((s: GameState) => void)[] = [
      (s) => { s.player!.weapon = 'excalibur'; },
      (s) => { s.player!.inventory.excalibur = 1; },
      (s) => { s.player!.gold = -5; },
      (s) => { s.player!.stats.pow = 1.5; },
      (s) => { s.mode = 'battle'; },
      (s) => { s.clearedAreas.push('atlantis'); },
    ];
    for (const corrupt of corruptions) {
      const s = newGame();
      corrupt(s);
      assert.equal(deserialize(serialize(s)).ok, false, corrupt.toString());
    }
  });

  it('migrates version-0 saves', () => {
    const s: Partial<GameState> = { ...newGame() };
    delete s.stats;
    const r = deserialize(JSON.stringify({ format: 'questforge-save', version: 0, state: s }));
    assert.ok(r.ok);
    assert.deepEqual(r.state.stats, { battlesWon: 0, battlesLost: 0, actions: 0 });
    assert.equal(r.state.version, SAVE_VERSION);
  });

  it('migrates a version-1 (fantasy-era) save to the sci-fi content ids', () => {
    // Shape of a real v1 save: level-12 warrior mid-battle in Shadow Keep, poisoned and guarded.
    const v1 = {
      version: 1, mode: 'battle', rng: 12345, clearedAreas: ['greenwood', 'ashen_caves', 'frostpeak'],
      quest: { areaId: 'shadow_keep', cleared: 1, earnedXp: 10, earnedGold: 5 },
      battle: {
        monster: { defId: 'vampire', hp: 50, maxHp: 124, statuses: [{ id: 'poison', turns: 2, power: 5 }] },
        playerStatuses: [{ id: 'guard', turns: 1, power: 40 }], round: 3,
      },
      player: {
        name: 'Renner', classId: 'warrior', level: 12, xp: 583, gold: 1913, hp: 300, mp: 80,
        stats: { str: 25, dex: 9, int: 2, end: 20, luk: 5 }, statPoints: 8,
        weapon: 'sunsteel_mace', armor: 'frostguard_mail',
        inventory: { training_sword: 1, tunic: 1, sunsteel_mace: 1, frostguard_mail: 1, health_potion: 3, elixir: 1 },
      },
      stats: { battlesWon: 40, battlesLost: 2, actions: 300 },
    };
    const r = deserialize(JSON.stringify({ format: 'questforge-save', version: 1, state: v1 }));
    assert.ok(r.ok, r.ok ? '' : r.error);
    const s = r.state;
    assert.equal(s.player!.classId, 'security');
    assert.equal(s.player!.weapon, 'photon_rifle');
    assert.equal(s.player!.armor, 'arctic_hardsuit');
    assert.deepEqual(s.player!.inventory, {
      sidearm_mk1: 1, duty_uniform: 1, photon_rifle: 1, arctic_hardsuit: 1, medkit: 3, nano_restorer: 1,
    });
    assert.deepEqual(s.clearedAreas, ['veridia', 'kethra', 'glacies']);
    assert.equal(s.quest!.areaId, 'void_rift');
    assert.equal(s.battle!.monsters[0]!.defId, 'void_leech');
    assert.equal(s.battle!.monsters[0]!.statuses[0]!.id, 'corrode');
    assert.equal(s.battle!.playerStatuses[0]!.id, 'shield');
    assert.equal(s.player!.level, 12);
    assert.equal(s.player!.gold, 1913);
  });

  it('converts v3 class-coupled stats to the generic five, keeping every spent point', () => {
    const cases = [
      // Security: +12 str, +4 dex, +6 end spent.
      { classId: 'security', old: { str: 21, dex: 9, int: 2, end: 15, luk: 5 }, statPoints: 2,
        expect: { pow: 17, spd: 7, int: 5, end: 11, luk: 5 } },
      // Science: +14 int spent → half power, half intellect.
      { classId: 'science', old: { str: 2, dex: 5, int: 24, end: 9, luk: 6 }, statPoints: 0,
        expect: { pow: 12, spd: 5, int: 12, end: 7, luk: 5 } },
      // Engineer: +8 dex → 4 power, 2 precision (refunded), 2 agility; +3 luk.
      { classId: 'engineer', old: { str: 5, dex: 18, int: 2, end: 6, luk: 10 }, statPoints: 4,
        expect: { pow: 9, spd: 7, int: 5, end: 5, luk: 8 } },
    ] as const;
    for (const c of cases) {
      const s = newGame(c.classId) as unknown as Record<string, any>;
      s.player.stats = { ...c.old };
      s.player.statPoints = c.statPoints;
      s.version = 3;
      const r = deserialize(JSON.stringify({ format: 'questforge-save', version: 3, state: s }));
      assert.ok(r.ok, r.ok ? '' : r.error);
      assert.deepEqual(r.state.player!.stats, c.expect, c.classId);
      const oldTotal = Object.values(c.old).reduce((a, b) => a + b, 0) + c.statPoints;
      const newTotal = Object.values(r.state.player!.stats).reduce((a, b) => a + b, 0) + r.state.player!.statPoints;
      // The only thing that disappears is the 5 base points Precision started with.
      assert.equal(newTotal + 5, oldTotal, `${c.classId}: no spent points lost or gained`);
    }
  });

  it('refunds points spent in Precision (v4) as unspent stat points', () => {
    const s = newGame('engineer') as unknown as Record<string, any>;
    s.player.stats = { pow: 12, agi: 6, pre: 11, int: 5, end: 9, luk: 7 };
    s.player.statPoints = 1;
    s.version = 4;
    const r = deserialize(JSON.stringify({ format: 'questforge-save', version: 4, state: s }));
    assert.ok(r.ok, r.ok ? '' : r.error);
    assert.deepEqual(r.state.player!.stats, { pow: 12, spd: 6, int: 5, end: 9, luk: 7 });
    assert.equal(r.state.player!.statPoints, 7);
  });

  it('turns v5 Agility into Speed, point for point', () => {
    const s = newGame('security') as unknown as Record<string, any>;
    s.player.stats = { pow: 12, agi: 9, int: 5, end: 9, luk: 7 };
    s.version = 5;
    const r = deserialize(JSON.stringify({ format: 'questforge-save', version: 5, state: s }));
    assert.ok(r.ok, r.ok ? '' : r.error);
    assert.deepEqual(r.state.player!.stats, { pow: 12, spd: 9, int: 5, end: 9, luk: 7 });
  });
});
