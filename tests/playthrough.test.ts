/**
 * End-to-end playthroughs with the bot, plus golden transcripts.
 *
 * Golden files (tests/golden/*.json) pin down exact seeded behaviour, so any
 * change to formulas, content or turn order shows up as a readable diff.
 * After an intentional change: `npm run test:update-golden`, then review the diff.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLASSES, chooseAction, describeStep, initialState, runBot, step } from '../src/core';
import type { Action, ClassId, GameState } from '../src/core';
import { expectGolden } from './helpers';

const classes = Object.keys(CLASSES) as ClassId[];

describe('bot playthroughs', () => {
  for (const classId of classes) {
    it(`a ${classId} can finish the whole game`, () => {
      for (const seed of [1, 2, 3]) {
        const r = runBot(classId, seed, 5000);
        assert.ok(r.completed, `${classId} seed ${seed} did not finish: ${JSON.stringify(r)}`);
      }
    });
  }

  it('summary stays stable (balance regression guard)', () => {
    const summaries = classes.flatMap((c) => [1, 2].map((seed) => runBot(c, seed, 5000)));
    expectGolden('bot-summaries', summaries);
  });
});

/** Plays with the bot and records a readable transcript of every action and its log lines. */
function transcript(classId: ClassId, seed: number, until: (s: GameState) => boolean, maxSteps = 400): string[] {
  let s = initialState(seed);
  const lines: string[] = [];
  const play = (action: Action) => {
    const r = step(s, action);
    lines.push(`> ${JSON.stringify(action)}`, ...describeStep(s, r).map((l) => `  ${l}`));
    s = r.state;
  };
  play({ type: 'newGame', name: 'Golden', classId, seed });
  for (let i = 0; i < maxSteps && !until(s); i++) play(chooseAction(s));
  const p = s.player!;
  lines.push(`= ${s.mode} L${p.level} xp ${p.xp} hp ${p.hp} mp ${p.mp} gold ${p.gold} weapon ${p.weapon}`);
  return lines;
}

describe('golden transcripts', () => {
  for (const classId of classes) {
    it(`${classId}: first quest`, () => {
      expectGolden(`transcript-${classId}`, transcript(classId, 2026, (s) => s.clearedAreas.length > 0));
    });
  }
});
