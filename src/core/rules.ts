/**
 * What the player may do: `checkAction` (with a reason when not) and
 * `legalActions`, plus small read-only queries (prices, unlocks). This is the
 * single source of truth for legality, used by the reducer, the UI, the bot
 * and the fuzz tests.
 */
import { aliveIndices, isAlive } from './combat';
import { AREA_ORDER, CLASSES, SHOP_STOCK, getArea, getItem, getMonster, getSpell } from './data';
import { countItem, derive, knownSpells } from './player';
import { STATS } from './types';
import type { Action, ClassId, GameState, Player } from './types';

// ─── Queries (used by UI and bot) ──────────────────────────────────────────

export function restCost(player: Player): number {
  return Math.min(player.gold, player.level * 2);
}

/** Half the purchase price; anything (even starter kit) sells for at least 1 credit. */
export function sellPrice(itemId: string): number {
  return Math.max(1, Math.floor(getItem(itemId).price / 2));
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
      if (mode !== 'town') return 'Sickbay is aboard the ship';
      const d = derive(player);
      return player.hp >= d.maxHp && player.mp >= d.maxMp ? 'Already fully rested' : null;
    }
    case 'buy': {
      if (mode !== 'town') return 'The quartermaster is aboard the ship';
      if (!SHOP_STOCK.includes(action.itemId)) return 'Not stocked here';
      const item = getItem(action.itemId);
      if (player.gold < item.price) return 'Not enough credits';
      if (item.kind !== 'consumable') {
        if (player.level < item.level) return `Requires level ${item.level}`;
        if (countItem(player, item.id) > 0) return 'Already owned';
      }
      return null;
    }
    case 'sell': {
      if (mode !== 'town') return 'The quartermaster is aboard the ship';
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
    case 'startQuest':
      if (mode !== 'town') return 'Missions launch from the ship';
      if (!AREA_ORDER.includes(action.areaId)) return 'Unknown area';
      return isAreaUnlocked(state, action.areaId) ? null : 'Area is locked';
    case 'startPatrol':
      return mode === 'town' ? null : 'Patrols launch from the ship';
    case 'continue':
    case 'retreat':
      return mode === 'quest' ? null : 'Not on a mission';
    case 'attack':
      if (!inBattle) return 'Not in battle';
      return action.target === undefined ? null : checkTarget(state, action.target, true);
    case 'cast': {
      if (!inBattle) return 'Not in battle';
      if (!knownSpells(player).some((s) => s.id === action.spellId)) return 'Unknown ability';
      if (player.mp < getSpell(action.spellId).mp) return 'Not enough energy';
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
      return aliveIndices(state.battle!).some((i) => getMonster(state.battle!.monsters[i]!.defId).boss)
        ? 'Too much interference to beam out!' : null;
    case 'returnToTown':
      return mode === 'defeated' ? null : 'Nothing to return from';
  }
}

function checkTarget(state: GameState, index: number, allowCurrent: boolean): string | null {
  const battle = state.battle!;
  if (!Number.isInteger(index) || index < 0 || index >= battle.monsters.length) return 'No such target';
  if (!isAlive(battle.monsters[index]!)) return 'That hostile is already down';
  if (!allowCurrent && index === battle.target) return 'Already targeted';
  return null;
}

/** Every concrete action currently legal. Never empty for a reachable state. */
export function legalActions(state: GameState): Action[] {
  const candidates: Action[] = [];
  const p = state.player;
  if (state.mode === 'title') {
    for (const classId of Object.keys(CLASSES) as ClassId[]) candidates.push({ type: 'newGame', name: 'Hero', classId });
  } else if (p) {
    candidates.push({ type: 'rest' }, { type: 'continue' }, { type: 'retreat' }, { type: 'attack' }, { type: 'flee' });
    candidates.push({ type: 'returnToTown' }, { type: 'startPatrol' });
    for (const itemId of SHOP_STOCK) candidates.push({ type: 'buy', itemId });
    for (const itemId of Object.keys(p.inventory)) {
      candidates.push({ type: 'sell', itemId }, { type: 'equip', itemId }, { type: 'useItem', itemId });
    }
    for (const stat of STATS) candidates.push({ type: 'allocateStat', stat });
    for (const areaId of AREA_ORDER) candidates.push({ type: 'startQuest', areaId });
    for (const spell of knownSpells(p)) candidates.push({ type: 'cast', spellId: spell.id });
    if (state.battle) state.battle.monsters.forEach((_, index) => candidates.push({ type: 'target', index }));
  }
  return candidates.filter((a) => checkAction(state, a) === null);
}
