/**
 * End-to-end playthroughs with the bot, plus golden transcripts.
 *
 * Golden files (tests/golden/*.json) pin down exact seeded behaviour, so any
 * change to formulas, content or turn order shows up as a readable diff.
 * After an intentional change: `npm run test:update-golden`, then review the diff.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DIVISIONS, chooseAction, describeStep, initialState, runBot, step } from '../src/core';
import type { Action, DivisionId, GameState } from '../src/core';
import { expectGolden } from './helpers';

const classes = Object.keys(DIVISIONS) as DivisionId[];

describe('bot playthroughs', () => {
  for (const divisionId of classes) {
    it(`a ${divisionId} can finish the whole game`, () => {
      for (const seed of [1, 2, 3]) {
        const r = runBot(divisionId, seed, 5000);
        assert.ok(r.completed, `${divisionId} seed ${seed} did not finish: ${JSON.stringify(r)}`);
      }
    });
  }

  it('summary stays stable (balance regression guard)', () => {
    const summaries = classes.flatMap((c) => [1, 2].map((seed) => runBot(c, seed, 5000)));
    expectGolden('bot-summaries', summaries);
  });
});

/** Plays with the bot and records a readable transcript of every action and its log lines. */
function transcript(divisionId: DivisionId, seed: number, until: (s: GameState) => boolean, maxSteps = 400): string[] {
  let s = initialState(seed);
  const lines: string[] = [];
  const play = (action: Action) => {
    const r = step(s, action);
    lines.push(`> ${JSON.stringify(action)}`, ...describeStep(s, r).map((l) => `  ${l}`));
    s = r.state;
  };
  play({ type: 'newGame', name: 'Golden', divisionId: divisionId, seed });
  for (let i = 0; i < maxSteps && !until(s); i++) play(chooseAction(s));
  const p = s.player!;
  lines.push(`= ${s.mode} L${p.level} xp ${p.xp} hp ${p.hp} energy ${p.energy} credits ${p.credits} weapon ${p.weapon}`);
  return lines;
}

describe('golden transcripts', () => {
  for (const divisionId of classes) {
    it(`${divisionId}: first mission`, () => {
      expectGolden(`transcript-${divisionId}`, transcript(divisionId, 2026, (s) => s.clearedMissions.length > 0));
    });
  }
});
