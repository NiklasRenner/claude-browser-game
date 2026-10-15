/** Hit model: per-weapon / per-ability hit chance, evasion, multi-hit, hostile profiles. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HOSTILE_ACCURACY_PER_LEVEL, ITEMS, HOSTILES, ABILITIES, getHostile, getWeapon, hostileHit, hostileHitChance, playerHitChance,
  scaledHostile, strikeProfile,
} from '../src/core';
import type { DivisionId, GameEvent, WeaponDef } from '../src/core';
import { act, endlessFight } from './helpers';

const strikes = (events: GameEvent[], actor: 'player' | 'hostile') => events.filter((e) => e.type === 'attack' && e.actor === actor);

/** A level-20 fight where nobody dies, with `weapon` equipped. */
const fight = (hostileId: string, weapon = 'sidearm_mk1', divisionId: DivisionId = 'security') =>
  endlessFight(hostileId, { divisionId, seed: 4, weapon, level: 20 });

describe('hit chance', () => {
  it('is the weapon\'s hit minus the hostile\'s evasion', () => {
    const s = fight('void_shade');
    assert.equal(playerHitChance(s.player!, s.battle!, 0), getWeapon('sidearm_mk1').hit - getHostile('void_shade').evasion);
  });

  it('abilities use their own hit; weapon techniques use the weapon\'s plus their accuracy', () => {
    const s = fight('protoplasm', 'mag_wrench', 'engineer');
    const ion = ABILITIES.ion_storm!.effects[0]!;
    const exploit = ABILITIES.exploit_weakness!.effects[0]!;
    assert.ok(ion.type === 'damage' && exploit.type === 'damage');
    assert.equal(strikeProfile(s.player!, ion).hit, 105);
    assert.equal(strikeProfile(s.player!, exploit).hit, getWeapon('mag_wrench').hit + 15);
  });

  it('matches the observed hit rate', () => {
    let s = fight('void_shade', 'sidearm_mk1');
    let hits = 0, total = 0;
    for (let i = 0; i < 400; i++) {
      const r = act(s, { type: 'attack' });
      for (const e of strikes(r.events, 'player')) { total++; if (e.type === 'attack' && e.hit) hits++; }
      s = r.state;
    }
    const expected = playerHitChance(s.player!, s.battle!, 0) / 100;
    assert.ok(Math.abs(hits / total - expected) < 0.07, `${hits}/${total} vs ${expected}`);
  });

  it('chill lowers the attacker\'s hit; marked and evasive move the defender\'s evasion', () => {
    const s = fight('raider');
    const base = playerHitChance(s.player!, s.battle!, 0);
    s.battle!.playerStatuses.push({ id: 'chill', turns: 2, power: 20 });
    assert.equal(playerHitChance(s.player!, s.battle!, 0), base - 20);
    s.battle!.hostiles[0]!.statuses.push({ id: 'marked', turns: 2, power: 30 });
    assert.equal(playerHitChance(s.player!, s.battle!, 0), Math.min(100, base + 10));
    const before = hostileHitChance(s.player!, s.battle!, 0);
    s.battle!.playerStatuses.push({ id: 'evasive', turns: 2, power: 25 });
    assert.equal(hostileHitChance(s.player!, s.battle!, 0), Math.max(5, before - 25));
  });
});

describe('multi-hit', () => {
  it('a multi-hit weapon strikes `hits` times, each rolled on its own', () => {
    const w = getWeapon('flechette_pistol');
    assert.ok((w.hits ?? 1) > 1);
    let s = fight('protoplasm', w.id);
    const outcomes = new Set<boolean>();
    for (let i = 0; i < 30; i++) {
      const r = act(s, { type: 'attack' });
      const mine = strikes(r.events, 'player');
      assert.equal(mine.length, w.hits);
      for (const e of mine) if (e.type === 'attack') outcomes.add(e.hit);
      s = r.state;
    }
    assert.deepEqual([...outcomes].sort(), [false, true], 'some strikes hit and some miss within the same volleys');
  });

  it('weapon techniques inherit the weapon\'s strikes; dice abilities can set their own', () => {
    const s = fight('protoplasm', 'pulse_repeater', 'security');
    s.player!.energy = 999;
    const r = act(s, { type: 'useAbility', abilityId: 'overcharge' });
    assert.equal(strikes(r.events, 'player').length, getWeapon('pulse_repeater').hits);
    const pulse = ABILITIES.photon_pulse!.effects[0]!;
    assert.ok(pulse.type === 'damage' && pulse.hits === 3);
  });

  it('stops striking once the target is down', () => {
    const s = fight('protoplasm', 'pulse_repeater');
    s.battle!.hostiles[0]!.hp = 1;
    s.battle!.hostiles[0]!.statuses.push({ id: 'marked', turns: 9, power: 1000 });
    const r = act(s, { type: 'attack' });
    assert.equal(strikes(r.events, 'player').length, 1);
  });

  it('hostile attacks can strike several times too', () => {
    const spitter = getHostile('hive_spitter');
    const volley = spitter.attacks.find((a) => (a.hits ?? 1) > 1)!;
    let s = fight('hive_spitter');
    let seen = false;
    for (let i = 0; i < 40 && !seen; i++) {
      const r = act(s, { type: 'attack' });
      seen = strikes(r.events, 'hostile').filter((e) => e.type === 'attack' && e.name === volley.name).length === volley.hits;
      s = r.state;
    }
    assert.ok(seen, `${volley.name} strikes ${volley.hits} times`);
  });
});

describe('hostile profiles', () => {
  it('are authored in output units, free of player curves (extremes allowed)', () => {
    assert.ok(getHostile('phase_wisp').evasion >= 70, 'very evasive');
    assert.ok(getHostile('tundra_brute').accuracy < 80, 'inaccurate brute');
    for (const m of Object.values(HOSTILES)) {
      for (const k of ['accuracy', 'evasion', 'crit'] as const) assert.ok(Number.isFinite(m[k]) && m[k] >= 0, `${m.id}.${k}`);
    }
  });

  it('an attack can override the hostile\'s accuracy', () => {
    const s = fight('hive_spitter');
    const volley = getHostile('hive_spitter').attacks.find((a) => a.hit !== undefined)!;
    assert.equal(hostileHit(s.battle!.hostiles[0]!, volley), volley.hit);
    assert.equal(hostileHit(s.battle!.hostiles[0]!), getHostile('hive_spitter').accuracy);
  });

  it('patrol scaling raises a hostile\'s accuracy with level', () => {
    const def = getHostile('raider');
    const up = scaledHostile('raider', def.level + 10, 1);
    assert.equal(hostileHit(up), def.accuracy + 10 * HOSTILE_ACCURACY_PER_LEVEL);
  });
});

describe('Target Painter', () => {
  it('marks the target without a hit roll, making it easier to hit for its duration', () => {
    const s = fight('phase_wisp', 'mag_wrench', 'engineer');
    s.player!.energy = 999;
    const before = playerHitChance(s.player!, s.battle!, 0);
    const r = act(s, { type: 'useAbility', abilityId: 'target_painter' });
    assert.ok(r.events.some((e) => e.type === 'statusApplied' && e.status === 'marked'));
    assert.equal(playerHitChance(r.state.player!, r.state.battle!, 0), before + 35);
  });
});

describe('content', () => {
  it('every weapon has a sane hit chance and strike count', () => {
    for (const w of Object.values(ITEMS).filter((i): i is WeaponDef => i.kind === 'weapon')) {
      assert.ok(w.hit >= 40 && w.hit <= 130, w.id);
      assert.ok(w.hits === undefined || (Number.isInteger(w.hits) && w.hits >= 1 && w.hits <= 6), w.id);
    }
  });
});
