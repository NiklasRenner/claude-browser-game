/**
 * The six character stats. Each has exactly one job, and every class uses
 * them the same way — classes differ only in their ability kits and gear.
 *
 *   Power      → all damage (weapon attacks, abilities, damage-over-time)
 *   Agility    → evasion (diminishing: approaches DODGE_MAX)
 *   Precision  → hit chance
 *   Intellect  → max energy (how many abilities per mission)
 *   Endurance  → max HP
 *   Luck       → critical-hit chance (diminishing: approaches CRIT_MAX)
 *
 * All balance knobs live here. `npm run sim` prints a stat-weights table
 * (value of +1 point in each stat) so changes can be checked with numbers.
 */
import type { Stat, Stats } from './types';

export const STAT_INFO: Record<Stat, { name: string; short: string; help: string }> = {
  pow: { name: 'Power', short: 'POW', help: 'All damage: weapons, abilities and damage over time.' },
  agi: { name: 'Agility', short: 'AGI', help: 'Evasion — hostiles miss you more often.' },
  pre: { name: 'Precision', short: 'PRE', help: 'Hit chance with weapons and weapon techniques.' },
  int: { name: 'Intellect', short: 'INT', help: 'Max energy — more abilities per mission.' },
  end: { name: 'Endurance', short: 'END', help: 'Max HP.' },
  luk: { name: 'Luck', short: 'LUK', help: 'Critical-hit chance (crits deal double damage).' },
};

/** Every character starts with this in every stat. */
export const BASE_STAT = 5;
export const baseStats = (): Stats => ({ pow: BASE_STAT, agi: BASE_STAT, pre: BASE_STAT, int: BASE_STAT, end: BASE_STAT, luk: BASE_STAT });

// ─── Knobs ─────────────────────────────────────────────────────────────────

/** Power: +3% damage per point (additive, so each point is worth a little less, relatively). */
export const POW_PER_POINT = 0.03;
/** Precision: hit-chance points per point. */
export const PRE_PER_POINT = 1.5;
/**
 * The player's base hit chance before Precision (hostiles use their own base).
 * Low enough that Precision keeps paying off for a long time before the 97% cap.
 */
export const PLAYER_BASE_HIT = 72;
/** Field abilities (not weapon techniques) are a little easier to land. */
export const ABILITY_ACCURACY = 10;
/** Agility: evasion = DODGE_MAX · agi / (agi + DODGE_K). Never reaches DODGE_MAX. */
export const DODGE_MAX = 100;
export const DODGE_K = 40;
/** Endurance: HP per point. */
export const END_PER_POINT = 6;
/** Intellect: max energy per point. */
export const INT_PER_POINT = 4;
/** Luck: crit% = CRIT_MAX · luk / (luk + CRIT_K). */
export const CRIT_MAX = 100;
export const CRIT_K = 35;
/** Critical hits multiply damage by this. */
export const PLAYER_CRIT_MULT = 2;

// ─── Formulas ──────────────────────────────────────────────────────────────

export const damageMultiplier = (pow: number) => 1 + pow * POW_PER_POINT;
export const precisionBonus = (pre: number) => pre * PRE_PER_POINT;
export const agilityEvasion = (agi: number) => (DODGE_MAX * Math.max(0, agi)) / (Math.max(0, agi) + DODGE_K);
export const enduranceHp = (end: number) => end * END_PER_POINT;
export const intellectEnergy = (int: number) => int * INT_PER_POINT;
export const luckCrit = (luk: number) => (CRIT_MAX * Math.max(0, luk)) / (Math.max(0, luk) + CRIT_K);
/** Share of max energy recovered after each won fight on a mission or patrol. */
export const ENERGY_RECOVERY = 0.15;
/** Heals have no stat; they grow with level. */
export const healMultiplier = (level: number) => 1 + level * 0.15;
