import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chooseAction } from '../src/core';
import type { GameState } from '../src/core';
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

  it('while events animate, the shown state and the log catch up one event at a time', async () => {
    const game = new GameController(memoryStorage(), 3);
    await game.dispatch({ type: 'newGame', name: 'Shown' });
    await game.dispatch({ type: 'startMission', missionId: 'veridia' });
    const foeBefore = game.state.battle!.hostiles[0]!.hp, logBefore = game.log.length;
    const seen: { foe: number; log: number }[] = [];
    game.setAnimator(async (events, _before, _after, played) => {
      seen.push({ foe: game.shown.battle!.hostiles[0]!.hp, log: game.log.length });
      for (let i = 0; i < events.length; i++) {
        played(i);
        seen.push({ foe: game.shown.battle?.hostiles[0]?.hp ?? -1, log: game.log.length });
      }
    });
    const events = await game.dispatch({ type: 'attack' });
    assert.equal(seen[0]!.foe, foeBefore, 'nothing is shown before it plays');
    assert.equal(seen[0]!.log, logBefore, 'no log lines before they play');
    const hit = events.findIndex((e) => e.type === 'attack' && e.actor === 'player' && e.hit);
    if (hit >= 0) assert.ok(seen[hit + 1]!.foe < foeBefore, 'the bar drops once the hit has played');
    assert.deepEqual(game.shown, game.state, 'and ends on the real state');
  });

  it('launching a mission shows the fight at once, before anyone acts', async () => {
    const game = new GameController(memoryStorage(), 5);
    await game.dispatch({ type: 'newGame', name: 'Quick' });
    let atStart: GameState | null = null;
    game.setAnimator(async () => { atStart = structuredClone(game.shown); });
    await game.dispatch({ type: 'startMission', missionId: 'veridia' });
    const shown = atStart as GameState | null;
    assert.equal(shown?.mode, 'battle');
    assert.ok(shown!.battle!.hostiles.every((h) => h.hp === h.maxHp));
  });
});
