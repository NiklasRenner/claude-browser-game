/**
 * What the player may do: `checkAction` (with a reason when not) and
 * `legalActions`, plus small read-only queries (prices, unlocks). This is the
 * single source of truth for legality, used by the reducer, the UI, the bot
 * and the fuzz tests.
 */
import { aliveIndices, isAlive } from './combat';
import { checkDrill, drillRoster } from './drill';
import { ABILITIES, MISSION_ORDER, QUARTERMASTER_STOCK, SCRIPTORIUM, getMission, getItem, getHostile, getAbility } from './data';
import { checkStart, countItem, derive, knownAbilities } from './player';
import { STATS } from './types';
import type { Action, GameState, Player } from './types';

// ─── Queries (used by UI and bot) ──────────────────────────────────────────

export function treatmentCost(player: Player): number {
  return Math.min(player.credits, player.level * 2);
}

/** Half the purchase price; anything (even starter kit) sells for at least 1 credit. */
export function sellPrice(itemId: string): number {
  return Math.max(1, Math.floor(getItem(itemId).price / 2));
}

export function isMissionUnlocked(state: GameState, missionId: string): boolean {
  const mission = getMission(missionId);
  return !mission.requires || state.clearedMissions.includes(mission.requires);
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
    return checkStart(action.stats);
  }
  if (!player) return 'No active game';
  const inBattle = mode === 'battle' && state.battle !== null;
  const outOfBattle = mode === 'ship' || mode === 'mission';

  switch (action.type) {
    case 'treat': {
      if (mode !== 'ship') return 'Sickbay is aboard the ship';
      const d = derive(player);
      return player.hp >= d.maxHp && player.energy >= d.maxEnergy ? 'Already fully rested' : null;
    }
    case 'buy': {
      if (mode !== 'ship') return 'The quartermaster is aboard the ship';
      if (!QUARTERMASTER_STOCK.includes(action.itemId)) return 'Not stocked here';
      const item = getItem(action.itemId);
      if (player.credits < item.price) return 'Not enough credits';
      if (item.kind !== 'consumable') {
        if (player.level < item.level) return `Requires level ${item.level}`;
        if (countItem(player, item.id) > 0) return 'Already owned';
      }
      return null;
    }
    case 'sell': {
      if (mode !== 'ship') return 'The quartermaster is aboard the ship';
      if (countItem(player, action.itemId) <= 0) return 'Not owned';
      if (isEquipped(player, action.itemId)) return 'Unequip it first';
      return null;
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
      if (!outOfBattle) return 'Train aboard the ship or between fights';
      if (!STATS.includes(action.stat)) return 'Unknown stat';
      return player.statPoints > 0 ? null : 'No stat points';
    case 'learnAbility': {
      if (mode !== 'ship') return 'The Scriptorium is aboard the ship';
      const ability = ABILITIES[action.abilityId];
      if (!ability?.shop) return 'Not taught here';
      if (knownAbilities(player).some((a) => a.id === ability.id)) return 'Already known';
      if (player.level < ability.shop.level) return `Requires level ${ability.shop.level}`;
      return player.credits >= ability.shop.price ? null : 'Not enough credits';
    }
    case 'startMission':
      if (mode !== 'ship') return 'Missions launch from the ship';
      if (!MISSION_ORDER.includes(action.missionId)) return 'Unknown mission';
      return isMissionUnlocked(state, action.missionId) ? null : 'Mission is locked';
    case 'startPatrol':
      return mode === 'ship' ? null : 'Patrols launch from the ship';
    case 'startDrill':
      return mode === 'ship' ? checkDrill(action.hostileIds) : 'Drills run from the ship';
    case 'continue':
    case 'retreat':
      return mode === 'mission' ? null : 'Not on a mission';
    case 'attack':
      if (!inBattle) return 'Not in battle';
      return action.target === undefined ? null : checkTarget(state, action.target, true);
    case 'useAbility': {
      if (!inBattle) return 'Not in battle';
      if (!knownAbilities(player).some((s) => s.id === action.abilityId)) return 'Unknown ability';
      if (player.energy < getAbility(action.abilityId).energy) return 'Not enough energy';
      return action.target === undefined ? null : checkTarget(state, action.target, true);
    }
    case 'target':
      if (!inBattle) return 'Not in battle';
      return checkTarget(state, action.index, false);
    case 'useItem': {
      if (!outOfBattle && !inBattle) return 'Cannot use items now';
      if (countItem(player, action.itemId) <= 0) return 'Not owned';
      return getItem(action.itemId).kind === 'consumable' ? null : 'Not usable';
    }
    case 'flee':
      if (!inBattle) return 'Not in battle';
      if (state.mission?.drill) return null; // ending a drill always works
      return aliveIndices(state.battle!).some((i) => getHostile(state.battle!.hostiles[i]!.defId).boss)
        ? 'Too much interference to beam out!' : null;
    case 'returnToShip':
      return mode === 'defeated' ? null : 'Nothing to return from';
  }
}

function checkTarget(state: GameState, index: number, allowCurrent: boolean): string | null {
  const battle = state.battle!;
  if (!Number.isInteger(index) || index < 0 || index >= battle.hostiles.length) return 'No such target';
  if (!isAlive(battle.hostiles[index]!)) return 'That hostile is already down';
  if (!allowCurrent && index === battle.target) return 'Already targeted';
  return null;
}

/** Every concrete action currently legal. Never empty for a reachable state. */
export function legalActions(state: GameState): Action[] {
  const candidates: Action[] = [];
  const p = state.player;
  if (state.mode === 'title') {
    candidates.push({ type: 'newGame', name: 'Hero' }, { type: 'newGame', name: 'Hero', stats: { pow: 3, end: 2 } });
  } else if (p) {
    candidates.push({ type: 'treat' }, { type: 'continue' }, { type: 'retreat' }, { type: 'attack' }, { type: 'flee' });
    candidates.push({ type: 'returnToShip' }, { type: 'startPatrol' });
    for (const itemId of QUARTERMASTER_STOCK) candidates.push({ type: 'buy', itemId });
    for (const itemId of Object.keys(p.inventory)) {
      candidates.push({ type: 'sell', itemId }, { type: 'equip', itemId }, { type: 'useItem', itemId });
    }
    for (const stat of STATS) candidates.push({ type: 'allocateStat', stat });
    for (const a of SCRIPTORIUM) candidates.push({ type: 'learnAbility', abilityId: a.id });
    for (const missionId of MISSION_ORDER) candidates.push({ type: 'startMission', missionId: missionId });
    // Drills take any lineup; list one per world (its boss) rather than every combination.
    for (const world of drillRoster()) candidates.push({ type: 'startDrill', hostileIds: [world.hostileIds.at(-1)!] });
    for (const ability of knownAbilities(p)) candidates.push({ type: 'useAbility', abilityId: ability.id });
    if (state.battle) state.battle.hostiles.forEach((_, index) => candidates.push({ type: 'target', index }));
  }
  return candidates.filter((a) => checkAction(state, a) === null);
}
