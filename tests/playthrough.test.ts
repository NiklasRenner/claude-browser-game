/**
 * End-to-end playthroughs with the bot, plus golden transcripts.
 *
 * Golden files (tests/golden/*.json) pin down exact seeded behaviour, so any
 * change to formulas, content or turn order shows up as a readable diff.
 * After an intentional change: `npm run test:update-golden`, then review the diff.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chooseAction, describeStep, initialState, runBot, step } from '../src/core';
import type { Action, GameState } from '../src/core';
import { expectGolden } from './helpers';

describe('bot playthroughs', () => {
  it('an officer can finish the whole game', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = runBot(seed, 5000);
      assert.ok(r.completed, `seed ${seed} did not finish: ${JSON.stringify(r)}`);
    }
  });

  it('summary stays stable (balance regression guard)', () => {
    expectGolden('bot-summaries', [1, 2, 3, 4].map((seed) => runBot(seed, 5000)));
  });
});

/** Plays with the bot and records a readable transcript of every action and its log lines. */
function transcript(seed: number, until: (s: GameState) => boolean, maxSteps = 400): string[] {
  let s = initialState(seed);
  const lines: string[] = [];
  const play = (action: Action) => {
    const r = step(s, action);
    lines.push(`> ${JSON.stringify(action)}`, ...describeStep(s, r).map((l) => `  ${l}`));
    s = r.state;
  };
  play({ type: 'newGame', name: 'Golden', seed });
  for (let i = 0; i < maxSteps && !until(s); i++) play(chooseAction(s));
  const p = s.player!;
  lines.push(`= ${s.mode} L${p.level} xp ${p.xp} hp ${p.hp} energy ${p.energy} credits ${p.credits} weapon ${p.weapon}`);
  return lines;
}

describe('golden transcripts', () => {
  it('first mission', () => {
    expectGolden('transcript-first-mission', transcript(2026, (s) => s.clearedMissions.length > 0));
  });
});
