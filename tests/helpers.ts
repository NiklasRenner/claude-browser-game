import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ABILITIES, HOSTILES, ITEMS, MAX_LOADOUT, MISSIONS, freshHostile, getHostile, getMission, initialState, knownAbilities, newRun, step } from '../src/core';
import type { Action, GameState, StepResult } from '../src/core';

// Content is fixed: any code (or test) writing to a content table throws.
for (const table of [ABILITIES, HOSTILES, ITEMS, MISSIONS]) deepFreeze(table);

/** Starts a new game in ship. */
export function newGame(seed = 1): GameState {
  return act(initialState(seed), { type: 'newGame', name: 'Tester', seed }).state;
}

/** Gives the officer Scriptorium abilities (learned and in the loadout), to test their effects. Mutates `state`. */
export function teach(state: GameState, ids: string[]): GameState {
  const p = state.player!;
  for (const id of ids) {
    p.learned.push(id);
    p.loadout.push(id);
  }
  assert.ok(p.loadout.length <= MAX_LOADOUT);
  return state;
}

/** Applies an action and fails the test if it was rejected. */
export function act(state: GameState, action: Action): StepResult {
  const result = step(state, action);
  const err = result.events.find((e) => e.type === 'error');
  assert.equal(err, undefined, `Action ${JSON.stringify(action)} was rejected: ${JSON.stringify(err)}`);
  return result;
}

/** Applies a sequence of actions, returning the final state. */
export function actAll(state: GameState, actions: Action[]): GameState {
  return actions.reduce((s, a) => act(s, a).state, state);
}

/**
 * Puts the player straight into a fight with these hostiles (in this order, at their own level), on a
 * story run of `missionId`; a lineup with a boss is that run's boss fight.
 */
export function inBattle(state: GameState, hostileIds: string | string[], missionId = 'veridia'): GameState {
  const s = structuredClone(state);
  const ids = typeof hostileIds === 'string' ? [hostileIds] : hostileIds;
  s.mode = 'battle';
  s.mission = newRun(missionId);
  if (ids.some((id) => getHostile(id).boss)) s.mission = { ...s.mission, cleared: getMission(missionId).encounters };
  s.battle = { hostiles: ids.map((id) => freshHostile(id)), target: 0, playerStatuses: [], round: 1 };
  return s;
}

/** Repeats `action` (default: attack) until the battle is over (at most `max` times); returns the last step. */
export function fightOut(state: GameState, action: Action = { type: 'attack' }, max = 500): StepResult {
  let r = act(state, action);
  for (let i = 1; r.state.mode === 'battle'; i++) {
    assert.ok(i < max, `the battle didn't end in ${max} turns`);
    r = act(r.state, action);
  }
  return r;
}

/**
 * A fight against `hostileId` where nobody dies (both sides have a million HP),
 * for observing many turns. Options tweak the officer.
 */
export function endlessFight(
  hostileId: string,
  opts: { seed?: number; weapon?: string; level?: number; spd?: number } = {},
): GameState {
  const s = inBattle(newGame(opts.seed ?? 3), hostileId);
  const p = s.player!;
  if (opts.weapon) {
    p.inventory[opts.weapon] = 1;
    p.weapon = opts.weapon;
  }
  if (opts.level) {
    p.level = opts.level;
    p.loadout = knownAbilities(p).slice(0, MAX_LOADOUT).map((a) => a.id);
  }
  if (opts.spd) p.stats.spd = opts.spd;
  p.hp = 1_000_000;
  s.battle!.hostiles[0]!.hp = s.battle!.hostiles[0]!.maxHp = 1_000_000;
  return s;
}

/**
 * Makes the player's attacks land: marks every hostile with a huge evasion
 * penalty (still subject to the MAX_HIT cap, which is 100).
 */
export function sureHit(state: GameState): GameState {
  for (const m of state.battle?.hostiles ?? []) {
    m.statuses = m.statuses.filter((st) => st.id !== 'marked');
    m.statuses.push({ id: 'marked', turns: 99, power: 1000 });
  }
  return state;
}

/** Recursively freezes an object so accidental mutation throws in strict mode. */
export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const value of Object.values(obj)) deepFreeze(value);
  }
  return obj;
}

// ─── Golden files ──────────────────────────────────────────────────────────

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');
export const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === '1';

/**
 * Compares `actual` against tests/golden/<name>.json. Run
 * `npm run test:update-golden` after an intentional gameplay change.
 */
export function expectGolden(name: string, actual: unknown): void {
  const file = path.join(GOLDEN_DIR, `${name}.json`);
  const text = `${JSON.stringify(actual, null, 2)}\n`;
  if (UPDATE_GOLDEN) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(file, text);
    return;
  }
  assert.ok(existsSync(file), `Missing golden file ${name}.json — run \`npm run test:update-golden\``);
  assert.deepStrictEqual(
    actual,
    JSON.parse(readFileSync(file, 'utf8')),
    `Golden mismatch for ${name}. If this change is intended, run \`npm run test:update-golden\` and review the diff.`,
  );
}
