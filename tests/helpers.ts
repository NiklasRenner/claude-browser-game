import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMonster, initialState, step } from '../src/core';
import type { Action, ClassId, GameState, StepResult } from '../src/core';

/** Starts a new game in town. */
export function newGame(classId: ClassId = 'security', seed = 1): GameState {
  return act(initialState(seed), { type: 'newGame', name: 'Tester', classId, seed }).state;
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

/** Puts the player straight into a fight with `monsterId` (inside a quest in the first area). */
export function inBattle(state: GameState, monsterId: string): GameState {
  const s = structuredClone(state);
  const def = getMonster(monsterId);
  s.mode = 'battle';
  s.quest = { areaId: 'veridia', cleared: def.boss ? 3 : 0, earnedXp: 0, earnedGold: 0 };
  s.battle = { monsters: [{ defId: monsterId, hp: def.hp, maxHp: def.hp, statuses: [] }], target: 0, playerStatuses: [], round: 1 };
  return s;
}

/**
 * A fight against `monsterId` where nobody dies (both sides have a million HP),
 * for observing many turns. Options tweak the officer.
 */
export function endlessFight(
  monsterId: string,
  opts: { classId?: ClassId; seed?: number; weapon?: string; level?: number; spd?: number } = {},
): GameState {
  const s = inBattle(newGame(opts.classId ?? 'security', opts.seed ?? 3), monsterId);
  const p = s.player!;
  if (opts.weapon) {
    p.inventory[opts.weapon] = 1;
    p.weapon = opts.weapon;
  }
  if (opts.level) p.level = opts.level;
  if (opts.spd) p.stats.spd = opts.spd;
  p.hp = 1_000_000;
  s.battle!.monsters[0]!.hp = s.battle!.monsters[0]!.maxHp = 1_000_000;
  return s;
}

/**
 * Makes the player's attacks land: marks every hostile with a huge evasion
 * penalty (still subject to the MAX_HIT cap, which is 100).
 */
export function sureHit(state: GameState): GameState {
  for (const m of state.battle?.monsters ?? []) {
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
