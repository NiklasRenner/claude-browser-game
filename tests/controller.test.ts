import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chooseAction } from '../src/core';
import { GameController, memoryStorage } from '../src/game/controller';

describe('GameController', () => {
  it('colours log lines: victories and level-ups good, purchases as loot, rejections bad', async () => {
    const game = new GameController(memoryStorage(), 7);
    await game.dispatch({ type: 'newGame', name: 'Log' });
    const kinds = new Map<string, string>(); // first line text → kind, collected as we go (the log is capped)
    const record = () => { for (const l of game.log) if (!kinds.has(l.text)) kinds.set(l.text, l.kind); };
    await game.dispatch({ type: 'buy', itemId: 'medkit' });
    await game.dispatch({ type: 'attack' }); // illegal in the ship hub
    record();
    for (let i = 0; i < 300 && !game.state.clearedMissions.length; i++) {
      await game.dispatch(chooseAction(game.state));
      record();
    }

    const kindOf = (re: RegExp) => [...kinds].find(([text]) => re.test(text))?.[1];
    assert.equal(kindOf(/^Bought Medkit/), 'loot');
    assert.equal(kindOf(/^⚠ Not in battle/), 'bad');
    assert.equal(kindOf(/^Hostile neutralised/), 'good');
    assert.equal(kindOf(/^Mission complete/), 'good');
    assert.equal(kindOf(/^LEVEL UP/), 'good');
  });

  it('autosaves after every accepted action and can resume', async () => {
    const storage = memoryStorage();
    const a = new GameController(storage, 1);
    await a.dispatch({ type: 'newGame', name: 'Saver' });
    await a.dispatch({ type: 'startMission', missionId: 'veridia' });
    const b = new GameController(storage, 2);
    assert.ok(b.hasSave());
    assert.equal(b.continueGame(), null);
    assert.deepEqual(b.state, a.state);
  });
});
