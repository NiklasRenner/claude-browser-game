/**
 * The game reducer: `step(state, action) → { state, events }`.
 *
 * - Pure: the input state is never mutated; randomness comes only from `state.rng`.
 * - Total: illegal actions return the unchanged state plus an `error` event.
 * - `legalActions(state)` enumerates every action `step` would accept, which is
 *   what the UI, the bot and the fuzz tests all use.
 */
import { playerAttack, playerCast, runRound, useConsumable, fleeChance } from './combat';
import {
  AREA_ORDER, CLASSES, FINAL_AREA, SHOP_STOCK, getArea, getItem, getMonster, getSpell,
} from './data';
import {
  addItem, allocateStat, clampVitals, countItem, createPlayer, derive, fullRestore, grantXp, knownSpells, removeItem,
} from './player';
import { Rng } from './rng';
import { STATS } from './types';
import type { Action, ClassId, GameEvent, GameState, Player, StepResult } from './types';

export const SAVE_VERSION = 1;
export const DEFEAT_GOLD_PENALTY = 0.1;

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

// ─── Derived queries (used by UI and bot) ──────────────────────────────────

export function restCost(player: Player): number {
  return Math.min(player.gold, player.level * 2);
}

export function sellPrice(itemId: string): number {
  return Math.floor(getItem(itemId).price / 2);
}

export function isAreaUnlocked(state: GameState, areaId: string): boolean {
  const area = getArea(areaId);
  return !area.requires || state.clearedAreas.includes(area.requires);
}

export function isEquipped(player: Player, itemId: string): boolean {
  return player.weapon === itemId || player.armor === itemId;
}

// ─── Validation ────────────────────────────────────────────────────────────

/** Returns null if `action` is legal in `state`, otherwise a human-readable reason. */
export function checkAction(state: GameState, action: Action): string | null {
  const { mode, player } = state;
  if (action.type === 'newGame') {
    if (mode !== 'title') return 'A game is already in progress';
    return action.classId in CLASSES ? null : 'Unknown class';
  }
  if (!player) return 'No active game';
  const inBattle = mode === 'battle' && state.battle !== null;
  const outOfBattle = mode === 'town' || mode === 'quest';

  switch (action.type) {
    case 'rest': {
      if (mode !== 'town') return 'You can only rest in town';
      const d = derive(player);
      return player.hp >= d.maxHp && player.mp >= d.maxMp ? 'Already fully rested' : null;
    }
    case 'buy': {
      if (mode !== 'town') return 'The shop is in town';
      if (!SHOP_STOCK.includes(action.itemId)) return 'Not sold here';
      const item = getItem(action.itemId);
      if (player.gold < item.price) return 'Not enough gold';
      if (item.kind !== 'consumable') {
        if (player.level < item.level) return `Requires level ${item.level}`;
        if (countItem(player, item.id) > 0) return 'Already owned';
      }
      return null;
    }
    case 'sell': {
      if (mode !== 'town') return 'The shop is in town';
      if (countItem(player, action.itemId) <= 0) return 'Not owned';
      if (isEquipped(player, action.itemId)) return 'Unequip it first';
      return sellPrice(action.itemId) > 0 ? null : 'Worthless';
    }
    case 'equip': {
      if (!outOfBattle && !inBattle) return 'Cannot change equipment now';
      if (countItem(player, action.itemId) <= 0) return 'Not owned';
      const item = getItem(action.itemId);
      if (item.kind === 'consumable') return 'Cannot equip that';
      if (inBattle && item.kind !== 'weapon') return 'Only weapons can be swapped mid-battle';
      if (player.level < item.level) return `Requires level ${item.level}`;
      return isEquipped(player, item.id) ? 'Already equipped' : null;
    }
    case 'allocateStat':
      if (!outOfBattle) return 'Train outside of battle';
      if (!STATS.includes(action.stat)) return 'Unknown stat';
      return player.statPoints > 0 ? null : 'No stat points';
    case 'startQuest':
      if (mode !== 'town') return 'Quests start from town';
      if (!AREA_ORDER.includes(action.areaId)) return 'Unknown area';
      return isAreaUnlocked(state, action.areaId) ? null : 'Area is locked';
    case 'continue':
    case 'retreat':
      return mode === 'quest' ? null : 'Not on a quest';
    case 'attack':
      return inBattle ? null : 'Not in battle';
    case 'cast': {
      if (!inBattle) return 'Not in battle';
      if (!knownSpells(player).some((s) => s.id === action.spellId)) return 'Unknown spell';
      return player.mp >= getSpell(action.spellId).mp ? null : 'Not enough MP';
    }
    case 'useItem': {
      if (!outOfBattle && !inBattle) return 'Cannot use items now';
      if (countItem(player, action.itemId) <= 0) return 'Not owned';
      return getItem(action.itemId).kind === 'consumable' ? null : 'Not usable';
    }
    case 'flee':
      if (!inBattle) return 'Not in battle';
      return getMonster(state.battle!.monster.defId).boss ? 'You cannot flee from a boss!' : null;
    case 'returnToTown':
      return mode === 'defeated' ? null : 'Nothing to return from';
  }
}

/** Every concrete action currently legal. Never empty for a reachable state. */
export function legalActions(state: GameState): Action[] {
  const candidates: Action[] = [];
  const p = state.player;
  if (state.mode === 'title') {
    for (const classId of Object.keys(CLASSES) as ClassId[]) candidates.push({ type: 'newGame', name: 'Hero', classId });
  } else if (p) {
    candidates.push({ type: 'rest' }, { type: 'continue' }, { type: 'retreat' }, { type: 'attack' }, { type: 'flee' });
    candidates.push({ type: 'returnToTown' });
    for (const itemId of SHOP_STOCK) candidates.push({ type: 'buy', itemId });
    for (const itemId of Object.keys(p.inventory)) {
      candidates.push({ type: 'sell', itemId }, { type: 'equip', itemId }, { type: 'useItem', itemId });
    }
    for (const stat of STATS) candidates.push({ type: 'allocateStat', stat });
    for (const areaId of AREA_ORDER) candidates.push({ type: 'startQuest', areaId });
    for (const spell of knownSpells(p)) candidates.push({ type: 'cast', spellId: spell.id });
  }
  return candidates.filter((a) => checkAction(state, a) === null);
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
    events.push({ type: 'message', text: `${state.player.name} the ${CLASSES[action.classId].name} arrives in Brightwater.` });
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
      events.push({ type: 'gold', amount: -item.price }, { type: 'message', text: `Bought ${item.name}.` });
      return;
    }
    case 'sell': {
      const value = sellPrice(action.itemId);
      removeItem(player, action.itemId);
      player.gold += value;
      events.push({ type: 'gold', amount: value }, { type: 'message', text: `Sold ${getItem(action.itemId).name}.` });
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
    case 'continue':
      startNextBattle(state, rng, events);
      return;
    case 'retreat':
      events.push({ type: 'message', text: 'You head back to town.' });
      leaveQuest(state);
      return;
    case 'attack':
      resolveBattleRound(state, rng, events, (ctx) => playerAttack(ctx));
      return;
    case 'cast':
      resolveBattleRound(state, rng, events, (ctx) => playerCast(ctx, action.spellId));
      return;
    case 'flee': {
      const monster = getMonster(state.battle!.monster.defId);
      if (rng.chance(fleeChance(player, monster))) {
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

function leaveQuest(state: GameState) {
  state.quest = null;
  state.battle = null;
  state.mode = 'town';
}

function startNextBattle(state: GameState, rng: Rng, events: GameEvent[]) {
  const quest = state.quest!;
  const area = getArea(quest.areaId);
  const isBoss = quest.cleared >= area.encounters;
  const monsterId = isBoss ? area.boss : rng.pick(area.monsters);
  const def = getMonster(monsterId);
  state.battle = {
    monster: { defId: monsterId, hp: def.hp, maxHp: def.hp, statuses: [] },
    playerStatuses: [],
    round: 1,
  };
  state.mode = 'battle';
  events.push({ type: 'battleStart', monsterId, boss: isBoss });
}

/** `act` = the player's action for this round, or null if the turn was lost (failed flee). */
function resolveBattleRound(
  state: GameState, rng: Rng, events: GameEvent[], act: Parameters<typeof runRound>[4],
) {
  const outcome = runRound(state.player!, state.battle!, rng, events, act);
  if (outcome === 'monsterDied') onVictory(state, rng, events);
  else if (outcome === 'playerDied') onDefeat(state, events);
}

function onVictory(state: GameState, rng: Rng, events: GameEvent[]) {
  const player = state.player!;
  const quest = state.quest!;
  const monster = getMonster(state.battle!.monster.defId);
  const gold = Math.round(rng.int(...monster.gold) * (1 + player.stats.luk * 0.01));
  const drops: string[] = [];
  for (const drop of monster.drops ?? []) {
    if (rng.chance(drop.chance)) {
      addItem(player, drop.itemId);
      drops.push(drop.itemId);
    }
  }
  player.gold += gold;
  quest.cleared += 1;
  quest.earnedXp += monster.xp;
  quest.earnedGold += gold;
  state.stats.battlesWon += 1;
  state.battle = null;
  events.push({ type: 'victory', xp: monster.xp, gold, drops });
  grantXp(player, monster.xp, events);

  if (!monster.boss) {
    state.mode = 'quest';
    return;
  }
  const area = getArea(quest.areaId);
  const firstClear = !state.clearedAreas.includes(area.id);
  player.gold += area.reward.gold;
  events.push({ type: 'questComplete', areaId: area.id, xp: area.reward.xp, gold: area.reward.gold, firstClear });
  grantXp(player, area.reward.xp, events);
  if (firstClear) {
    state.clearedAreas.push(area.id);
    if (area.id === FINAL_AREA) events.push({ type: 'gameComplete' });
  }
  leaveQuest(state);
}

function onDefeat(state: GameState, events: GameEvent[]) {
  const player = state.player!;
  const goldLost = Math.floor(player.gold * DEFEAT_GOLD_PENALTY);
  player.gold -= goldLost;
  player.hp = 0;
  state.stats.battlesLost += 1;
  state.battle = null;
  state.quest = null;
  state.mode = 'defeated';
  events.push({ type: 'defeat', goldLost });
}
