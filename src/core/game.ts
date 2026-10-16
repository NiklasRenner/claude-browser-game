/**
 * The game reducer: `step(state, action) → { state, events }`.
 *
 * - Pure: the input state is never mutated; randomness comes only from `state.rng`.
 * - Total: illegal actions return the unchanged state plus an `error` event
 *   (legality lives in rules.ts).
 */
import { fleeChance, playerAttack, playerUseAbility, toughestAliveLevel, useConsumable } from './combat';
import { getAbility, getMission, getItem } from './data';
import { addItem, allocateStat, clampVitals, createPlayer, fullRestore, learn, removeItem } from './player';
import { drillWorld } from './drill';
import { endDrill, leaveMission, resolveBattleRound, startNextBattle } from './flow';
import { patrolWorlds } from './patrol';
import { Rng } from './rng';
import { checkAction, treatmentCost, sellPrice } from './rules';
import type { Action, GameEvent, GameState, StepResult } from './types';

export const SAVE_VERSION = 4;

export function initialState(seed = 1): GameState {
  return {
    version: SAVE_VERSION,
    mode: 'title',
    rng: seed >>> 0,
    player: null,
    mission: null,
    battle: null,
    clearedMissions: [],
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
    state.player = createPlayer(action.name, action.stats);
    state.mode = 'ship';
    events.push({ type: 'message', text: `${state.player.name} reports for duty aboard the Meridian.` });
    return;
  }
  const player = state.player!;

  switch (action.type) {
    case 'treat': {
      const cost = treatmentCost(player);
      player.credits -= cost;
      fullRestore(player);
      events.push({ type: 'treated', cost });
      return;
    }
    case 'buy': {
      const item = getItem(action.itemId);
      player.credits -= item.price;
      addItem(player, item.id);
      events.push({ type: 'bought', itemId: item.id, price: item.price });
      return;
    }
    case 'sell': {
      const value = sellPrice(action.itemId);
      removeItem(player, action.itemId);
      player.credits += value;
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
    case 'learnAbility': {
      const ability = getAbility(action.abilityId);
      player.credits -= ability.shop!.price;
      player.learned.push(ability.id);
      learn(player, ability.id, events);
      return;
    }
    case 'slotAbility':
      player.loadout.push(action.abilityId);
      return;
    case 'unslotAbility':
      player.loadout = player.loadout.filter((id) => id !== action.abilityId);
      return;
    case 'useItem': {
      if (state.mode === 'battle') {
        resolveBattleRound(state, rng, events, () => useConsumable(player, action.itemId, state.battle!.playerStatuses, events));
      } else {
        useConsumable(player, action.itemId, null, events);
      }
      return;
    }
    case 'startMission': {
      state.mission = { missionId: action.missionId, cleared: 0, earnedXp: 0, earnedCredits: 0 };
      startNextBattle(state, rng, events);
      return;
    }
    case 'startPatrol': {
      const missionId = rng.pick(patrolWorlds(state));
      state.mission = { missionId: missionId, patrol: { level: player.level }, cleared: 0, earnedXp: 0, earnedCredits: 0 };
      events.push({ type: 'message', text: `Patrol launched: ${getMission(missionId).name} sector. Hostiles at level ${player.level}.` });
      startNextBattle(state, rng, events);
      return;
    }
    case 'startDrill': {
      state.mission = { missionId: drillWorld(action.hostileIds[0]!)!, drill: { hostileIds: [...action.hostileIds] }, cleared: 0, earnedXp: 0, earnedCredits: 0 };
      events.push({ type: 'message', text: 'Combat drill: a simulated engagement. Nothing gained, nothing lost.' });
      startNextBattle(state, rng, events);
      return;
    }
    case 'continue':
      startNextBattle(state, rng, events);
      return;
    case 'retreat':
      events.push({ type: 'message', text: 'Beaming back to the Meridian.' });
      leaveMission(state);
      return;
    case 'target':
      state.battle!.target = action.index;
      events.push({ type: 'targeted', foe: action.index });
      return;
    case 'attack':
      if (action.target !== undefined) state.battle!.target = action.target;
      resolveBattleRound(state, rng, events, (ctx) => playerAttack(ctx));
      return;
    case 'useAbility':
      if (action.target !== undefined) state.battle!.target = action.target;
      resolveBattleRound(state, rng, events, (ctx) => playerUseAbility(ctx, action.abilityId));
      return;
    case 'flee': {
      if (state.mission!.drill) { endDrill(state, events, 'ended'); return; }
      if (rng.chance(fleeChance(player, toughestAliveLevel(state.battle!)))) {
        events.push({ type: 'fled', success: true });
        leaveMission(state);
      } else {
        events.push({ type: 'fled', success: false });
        resolveBattleRound(state, rng, events, null);
      }
      return;
    }
    case 'returnToShip':
      fullRestore(player);
      state.mode = 'ship';
      return;
  }
}
