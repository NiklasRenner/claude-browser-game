import { getArmor, getClass, getWeapon, spellsFor } from './data';
import { ELEMENTS } from './types';
import {
  PLAYER_EVASION_CAP, baseStats, damageMultiplier, enduranceHp, intellectEnergy, luckCrit, speedBonus,
} from './stats';
import type { ClassId, Element, GameEvent, Player, Resistances, SpellDef, Stat } from './types';

export const MAX_LEVEL = 30;
export const STAT_POINTS_PER_LEVEL = 4;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.floor(30 * Math.pow(level, 1.45));
}

export interface DerivedStats {
  maxHp: number;
  maxMp: number;
  /** Subtracted from the enemy's to-hit chance (armor only here; abilities add in battle, capped). */
  evasion: number;
  critChance: number;
  /** Turn speed, 100 = normal. */
  speed: number;
  /** Multiplier on all outgoing damage (from Power). */
  damage: number;
  /** Damage taken per element in percent (100 = normal). */
  damageTaken: Record<Element, number>;
}

export function derive(player: Player): DerivedStats {
  const weapon = getWeapon(player.weapon);
  const armor = getArmor(player.armor);
  const { pow, spd, int, end, luk } = player.stats;
  return {
    maxHp: 40 + player.level * 12 + enduranceHp(end) + armor.hp,
    maxMp: 15 + player.level * 4 + intellectEnergy(int) + armor.mp,
    evasion: Math.min(PLAYER_EVASION_CAP, armor.block),
    critChance: 5 + luckCrit(luk) + weapon.crit,
    damage: damageMultiplier(pow),
    speed: 100 + speedBonus(spd) + (armor.speed ?? 0),
    damageTaken: resistTable(armor.resist),
  };
}

function resistTable(resist: Resistances): Record<Element, number> {
  const table = Object.fromEntries(ELEMENTS.map((el) => [el, 100])) as Record<Element, number>;
  for (const [el, pct] of Object.entries(resist) as [Element, number][]) table[el] = 100 - pct;
  return table;
}

export function createPlayer(name: string, classId: ClassId): Player {
  const cls = getClass(classId);
  const player: Player = {
    name: name.trim().slice(0, 20) || 'Hero',
    classId,
    level: 1,
    xp: 0,
    gold: 50,
    hp: 1,
    mp: 1,
    stats: baseStats(),
    statPoints: 0,
    weapon: cls.startWeapon,
    armor: cls.startArmor,
    inventory: { [cls.startWeapon]: 1, [cls.startArmor]: 1, medkit: 2 },
  };
  fullRestore(player);
  return player;
}

export function fullRestore(player: Player): void {
  const d = derive(player);
  player.hp = d.maxHp;
  player.mp = d.maxMp;
}

/** Keeps hp/mp within bounds after max values change (e.g. equipment swap). */
export function clampVitals(player: Player): void {
  const d = derive(player);
  player.hp = Math.max(0, Math.min(player.hp, d.maxHp));
  player.mp = Math.max(0, Math.min(player.mp, d.maxMp));
}

/** Adds XP and handles any number of level-ups. Mutates `player`. */
export function grantXp(player: Player, amount: number, events: GameEvent[]): void {
  player.xp += amount;
  while (player.level < MAX_LEVEL && player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    player.level += 1;
    player.statPoints += STAT_POINTS_PER_LEVEL;
    fullRestore(player);
    events.push({ type: 'levelUp', level: player.level });
    for (const spell of spellsFor(player.classId, player.level)) {
      if (spell.level === player.level) events.push({ type: 'learned', spellId: spell.id });
    }
  }
  if (player.level >= MAX_LEVEL) player.xp = 0;
}

export function allocateStat(player: Player, stat: Stat): void {
  if (player.statPoints <= 0) throw new Error('No stat points');
  player.statPoints -= 1;
  const before = derive(player);
  player.stats[stat] += 1;
  const after = derive(player);
  // Raising END/INT also raises current HP/MP by the same amount, like a level-up would.
  player.hp += after.maxHp - before.maxHp;
  player.mp += after.maxMp - before.maxMp;
}

export function knownSpells(player: Player): SpellDef[] {
  return spellsFor(player.classId, player.level);
}

export function countItem(player: Player, itemId: string): number {
  return player.inventory[itemId] ?? 0;
}

export function addItem(player: Player, itemId: string, n = 1): void {
  player.inventory[itemId] = countItem(player, itemId) + n;
}

export function removeItem(player: Player, itemId: string, n = 1): void {
  const left = countItem(player, itemId) - n;
  if (left < 0) throw new Error(`Not enough ${itemId}`);
  if (left === 0) delete player.inventory[itemId];
  else player.inventory[itemId] = left;
}
