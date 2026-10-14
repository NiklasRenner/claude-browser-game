import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMonster, initialState, step } from '../src/core';
import type { Action, ClassId, GameState, StepResult } from '../src/core';

/** Starts a new game in town. */
export function newGame(classId: ClassId = 'warrior', seed = 1): GameState {
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
  s.quest = { areaId: 'greenwood', cleared: def.boss ? 3 : 0, earnedXp: 0, earnedGold: 0 };
  s.battle = { monster: { defId: monsterId, hp: def.hp, maxHp: def.hp, statuses: [] }, playerStatuses: [], round: 1 };
  return s;
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
