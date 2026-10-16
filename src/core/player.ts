import { getAbility, getArmor, getItem, getWeapon, abilitiesFor } from './data';
import { ELEMENTS, STATS } from './types';
import {
  BASE_CRIT, MAX_LEVEL, PLAYER_EVASION_CAP, STAT_POINTS_PER_LEVEL, baseStats, damageMultiplier, luckCrit, maxEnergyFor, maxHpFor,
  speedBonus, xpToNext,
} from './stats';
import type { AbilityDef, ArmorDef, Element, GameEvent, Player, Stat, Stats } from './types';

export interface DerivedStats {
  maxHp: number;
  maxEnergy: number;
  /** Subtracted from the enemy's to-hit chance (armor only here; abilities add in battle, capped). */
  evasion: number;
  critChance: number;
  /** Turn speed, 100 = normal. */
  speed: number;
  /** Multiplier on all outgoing damage (from Power). */
  damage: number;
  /** Damage taken per element in percent (100 = normal). Shared per armor: don't mutate. */
  damageTaken: Readonly<Record<Element, number>>;
}

export function derive(player: Player): DerivedStats {
  const weapon = getWeapon(player.weapon);
  const armor = getArmor(player.armor);
  const { pow, spd, int, end, luk } = player.stats;
  return {
    maxHp: maxHpFor(player.level, end) + armor.hp,
    maxEnergy: maxEnergyFor(player.level, int) + armor.energy,
    evasion: Math.min(PLAYER_EVASION_CAP, armor.block),
    critChance: BASE_CRIT + luckCrit(luk) + weapon.crit,
    damage: damageMultiplier(pow),
    speed: 100 + speedBonus(spd) + (armor.speed ?? 0),
    damageTaken: resistTable(armor),
  };
}

const resistTables = new Map<ArmorDef, Readonly<Record<Element, number>>>();
/** Damage taken per element through this armor (content is fixed, so it is worked out once per armor). */
function resistTable(armor: ArmorDef): Readonly<Record<Element, number>> {
  let table = resistTables.get(armor);
  if (!table) {
    const t = Object.fromEntries(ELEMENTS.map((el) => [el, 100])) as Record<Element, number>;
    for (const [el, pct] of Object.entries(armor.resist) as [Element, number][]) t[el] = 100 - pct;
    resistTables.set(armor, table = t);
  }
  return table;
}

/** Every officer starts with this gear. */
export const START_WEAPON = 'sidearm_mk1';
export const START_ARMOR = 'duty_uniform';
/** Points spread over the stats when enlisting, on top of the base stats. */
export const START_POINTS = 5;

/**
 * The starting points as offered on the title screen: spread over everything but speed, so every
 * officer starts at exactly speed 100 (its curve is steep on purpose, see stats.ts).
 */
export const defaultStart = (): Stats => ({ pow: 1, spd: 0, int: 1, end: 2, luk: 1 });

/** Starting points not yet spread. */
export const startPointsLeft = (start: Partial<Stats>): number => STATS.reduce((n, k) => n - (start[k] ?? 0), START_POINTS);

/** Why this spread of starting points isn't allowed, or null if it is. */
export function checkStart(start: unknown): string | null {
  if (start === undefined) return null;
  if (typeof start !== 'object' || start === null) return 'Bad starting stats';
  const entries = Object.entries(start);
  if (!entries.every(([k, v]) => (STATS as readonly string[]).includes(k) && Number.isInteger(v) && (v as number) >= 0)) return 'Bad starting stats';
  const total = entries.reduce((n, [, v]) => n + (v as number), 0);
  return total === START_POINTS ? null : `Spread exactly ${START_POINTS} starting points`;
}

export function createPlayer(name: string, start: Partial<Stats> = defaultStart()): Player {
  const stats = baseStats();
  for (const k of STATS) stats[k] += start[k] ?? 0;
  const player: Player = {
    name: name.trim().slice(0, 20) || 'Hero',
    level: 1,
    xp: 0,
    credits: 50,
    hp: 1,
    energy: 1,
    stats,
    statPoints: 0,
    learned: [],
    loadout: abilitiesFor(1).map((a) => a.id),
    weapon: START_WEAPON,
    armor: START_ARMOR,
    inventory: { [START_WEAPON]: 1, [START_ARMOR]: 1, medkit: 2 },
  };
  fullRestore(player);
  return player;
}

export function fullRestore(player: Player): void {
  const d = derive(player);
  player.hp = d.maxHp;
  player.energy = d.maxEnergy;
}

/** Keeps hp/energy within bounds after max values change (e.g. equipment swap). */
export function clampVitals(player: Player): void {
  const d = derive(player);
  player.hp = Math.max(0, Math.min(player.hp, d.maxHp));
  player.energy = Math.max(0, Math.min(player.energy, d.maxEnergy));
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
    for (const ability of abilitiesFor(player.level)) {
      if (ability.level === player.level) learn(player, ability.id, events);
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
  player.energy += after.maxEnergy - before.maxEnergy;
}

/** How many abilities can be taken into battle (one per hotkey). */
export const MAX_LOADOUT = 8;

/** The abilities taken into battle, in hotkey order. */
export function loadoutAbilities(player: Player): AbilityDef[] {
  return player.loadout.map(getAbility);
}

/** A newly learned ability goes into the loadout if there's room. */
export function learn(player: Player, abilityId: string, events: GameEvent[]) {
  events.push({ type: 'learned', abilityId });
  if (player.loadout.length < MAX_LOADOUT && !player.loadout.includes(abilityId)) player.loadout.push(abilityId);
}

/** Abilities learned by level, then the ones bought in the Scriptorium (in the order bought). */
export function knownAbilities(player: Player): AbilityDef[] {
  return [...abilitiesFor(player.level), ...player.learned.map(getAbility)];
}

/** The consumables the officer carries (medkits, stims…), in inventory order. */
export function ownedConsumables(player: Player): string[] {
  return Object.keys(player.inventory).filter((id) => getItem(id).kind === 'consumable');
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
