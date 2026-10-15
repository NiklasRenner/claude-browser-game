/**
 * The game reducer: `step(state, action) → { state, events }`.
 *
 * - Pure: the input state is never mutated; randomness comes only from `state.rng`.
 * - Total: illegal actions return the unchanged state plus an `error` event
 *   (legality lives in rules.ts).
 */
import { fleeChance, playerAttack, playerCast, toughestAliveLevel, useConsumable } from './combat';
import { CLASSES, getArea, getItem } from './data';
import { addItem, allocateStat, clampVitals, createPlayer, fullRestore, removeItem } from './player';
import { leaveQuest, resolveBattleRound, startNextBattle } from './missions';
import { patrolWorlds } from './patrol';
import { Rng } from './rng';
import { checkAction, restCost, sellPrice } from './rules';
import type { Action, GameEvent, GameState, StepResult } from './types';

export const SAVE_VERSION = 6;

export function initialState(seed = 1): GameState {
  return {
    version: SAVE_VERSION,
    mode: 'title',
    rng: seed >>> 0,
    player: null,
    quest: null,
    battle: null,
    clearedAreas: [],
    stats: { battlesWon: 0, battlesLost: 0, actions: 0 },
  };
}

// ─── Reducer ───────────────────────────────────────────────────────────────

export function step(prev: GameState, action: Action): StepResult {
  const reason = checkAction(prev, action);
  if (reason) return { state: prev, events: [{ type: 'error', reason }] };

  const state = structuredClone(prev);
  const rng = new Rng(state.rng);
  const events: GameEvent[] = [];
  apply(state, action, rng, events);
  state.rng = rng.state;
  state.stats.actions += 1;
  return { state, events };
}

function apply(state: GameState, action: Action, rng: Rng, events: GameEvent[]): void {
  if (action.type === 'newGame') {
    const seed = action.seed ?? state.rng;
    Object.assign(state, initialState(seed));
    rng.state = seed >>> 0;
    state.player = createPlayer(action.name, action.classId);
    state.mode = 'town';
    events.push({ type: 'message', text: `${state.player.name} the ${CLASSES[action.classId].name} reports for duty aboard the Meridian.` });
    return;
  }
  const player = state.player!;

  switch (action.type) {
    case 'rest': {
      const cost = restCost(player);
      player.gold -= cost;
      fullRestore(player);
      events.push({ type: 'rested', cost });
      return;
    }
    case 'buy': {
      const item = getItem(action.itemId);
      player.gold -= item.price;
      addItem(player, item.id);
      events.push({ type: 'bought', itemId: item.id, price: item.price });
      return;
    }
    case 'sell': {
      const value = sellPrice(action.itemId);
      removeItem(player, action.itemId);
      player.gold += value;
      events.push({ type: 'sold', itemId: action.itemId, credits: value });
      return;
    }
    case 'equip': {
      const item = getItem(action.itemId);
      if (item.kind === 'weapon') player.weapon = item.id;
      else if (item.kind === 'armor') player.armor = item.id;
      clampVitals(player);
      events.push({ type: 'equip', itemId: item.id });
      if (state.mode === 'battle') resolveBattleRound(state, rng, events, () => {});
      return;
    }
    case 'allocateStat':
      allocateStat(player, action.stat);
      return;
    case 'useItem': {
      if (state.mode === 'battle') {
        resolveBattleRound(state, rng, events, () => useConsumable(player, action.itemId, state.battle!.playerStatuses, events));
      } else {
        useConsumable(player, action.itemId, null, events);
      }
      return;
    }
    case 'startQuest': {
      state.quest = { areaId: action.areaId, cleared: 0, earnedXp: 0, earnedGold: 0 };
      startNextBattle(state, rng, events);
      return;
    }
    case 'startPatrol': {
      const areaId = rng.pick(patrolWorlds(state));
      state.quest = { areaId, patrol: { level: player.level }, cleared: 0, earnedXp: 0, earnedGold: 0 };
      events.push({ type: 'message', text: `Patrol launched: ${getArea(areaId).name} sector. Hostiles at level ${player.level}.` });
      startNextBattle(state, rng, events);
      return;
    }
    case 'continue':
      startNextBattle(state, rng, events);
      return;
    case 'retreat':
      events.push({ type: 'message', text: 'Beaming back to the Meridian.' });
      leaveQuest(state);
      return;
    case 'target':
      state.battle!.target = action.index;
      events.push({ type: 'targeted', foe: action.index });
      return;
    case 'attack':
      if (action.target !== undefined) state.battle!.target = action.target;
      resolveBattleRound(state, rng, events, (ctx) => playerAttack(ctx));
      return;
    case 'cast':
      if (action.target !== undefined) state.battle!.target = action.target;
      resolveBattleRound(state, rng, events, (ctx) => playerCast(ctx, action.spellId));
      return;
    case 'flee': {
      if (rng.chance(fleeChance(player, toughestAliveLevel(state.battle!)))) {
        events.push({ type: 'fled', success: true });
        leaveQuest(state);
      } else {
        events.push({ type: 'fled', success: false });
        resolveBattleRound(state, rng, events, null);
      }
      return;
    }
    case 'returnToTown':
      fullRestore(player);
      state.mode = 'town';
      return;
  }
}
