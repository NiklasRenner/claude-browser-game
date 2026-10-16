/**
 * The five character stats. Each has exactly one job:
 *
 *   Power      → all damage (weapon attacks, abilities, damage-over-time)
 *   Speed      → how often you act (diminishing: approaches +SPEED_MAX %)
 *   Intellect  → max energy (how many abilities per mission)
 *   Endurance  → max HP
 *   Luck       → critical-hit chance (diminishing: approaches CRIT_MAX)
 *
 * Hit chance is not a stat: every weapon, ability and hostile attack has its
 * own (see WeaponDef.hit), and the target's evasion is subtracted from it.
 * Player evasion isn't a stat either: it comes in fixed amounts from armor and
 * abilities, and the total is capped at PLAYER_EVASION_CAP.
 *
 * Stats are the player's *price list* for combat numbers (points → evasion %,
 * crit %, speed, HP...). Hostiles are authored directly in those output numbers, so
 * the diminishing curves below never constrain hostile design.
 *
 * All balance knobs live here. `npm run sim` prints a stat-weights table
 * (value of +1 point in each stat) so changes can be checked with numbers.
 */
import type { Stat, Stats } from './types';

export const STAT_INFO: Record<Stat, { name: string; short: string; help: string }> = {
  pow: { name: 'Power', short: 'POW', help: 'All damage: weapons, abilities and damage over time.' },
  spd: { name: 'Speed', short: 'SPD', help: 'How often you act. Fast enough, and you sometimes take two turns before a hostile gets one.' },
  int: { name: 'Intellect', short: 'INT', help: 'Max energy — more abilities per mission.' },
  end: { name: 'Endurance', short: 'END', help: 'Max HP.' },
  luk: { name: 'Luck', short: 'LUK', help: 'Critical-hit chance (crits deal double damage).' },
};

/** Every character starts with this in every stat. */
export const BASE_STAT = 5;
export const baseStats = (): Stats => ({ pow: BASE_STAT, spd: BASE_STAT, int: BASE_STAT, end: BASE_STAT, luk: BASE_STAT });

// ─── Knobs ─────────────────────────────────────────────────────────────────

/** Power: +3% damage per point (additive, so each point is worth a little less, relatively). */
const POW_PER_POINT = 0.03;
/** Default hit chance of field abilities that don't set their own. */
export const ABILITY_HIT = 90;
/** Final hit chance is clamped to this range, so nothing is ever completely unhittable. */
export const MIN_HIT = 5;
export const MAX_HIT = 100;
/**
 * Speed: % bonus = SPEED_MAX · x / (x + SPEED_K), x = points above BASE_STAT,
 * so every officer starts at exactly speed 100 and it never reaches +SPEED_MAX.
 */
export const SPEED_MAX = 60;
const SPEED_K = 40;
/** The player's evasion (armor + abilities) never exceeds this. Hostiles are not capped. */
export const PLAYER_EVASION_CAP = 40;
/**
 * Battle timeline: an actor with speed S waits TURN_LENGTH · 100 / S time
 * units between turns. Whoever's next turn comes first acts (ties: player,
 * then hostiles in lineup order). No dice involved.
 */
const TURN_LENGTH = 100;
/** Endurance: HP per point. */
const END_PER_POINT = 6;
/** Intellect: max energy per point. */
const INT_PER_POINT = 5;
/** Max energy everyone has, and what each level adds (kept low, so Intellect is what buys more casts). */
const BASE_ENERGY = 15;
const ENERGY_PER_LEVEL = 2;
/** Luck: crit% = CRIT_MAX · luk / (luk + CRIT_K). */
const CRIT_MAX = 100;
const CRIT_K = 35;
/** Critical hits multiply damage by this. */
export const PLAYER_CRIT_MULT = 2;
/** Every officer's crit chance before Luck and weapon. */
export const BASE_CRIT = 5;
/** Max HP before Endurance and armor: base plus per level. */
const BASE_HP = 40;
const HP_PER_LEVEL = 12;

// ─── Hostiles ──────────────────────────────────────────────────────────────

/** A hostile's critical hit multiplies its damage by this. */
export const HOSTILE_CRIT_MULT = 1.5;
/** Hit chance a patrol-scaled hostile gains per level above its definition (player evasion doesn't grow with level). */
export const HOSTILE_ACCURACY_PER_LEVEL = 0.5;

// ─── Progression ───────────────────────────────────────────────────────────

export const MAX_LEVEL = 30;
export const STAT_POINTS_PER_LEVEL = 4;
/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) => Math.floor(30 * Math.pow(level, 1.45));
/** Going down costs this share of your credits. */
export const DEFEAT_CREDITS_PENALTY = 0.1;
/** Sickbay treatment: credits per level (never more than you have). */
export const TREATMENT_PER_LEVEL = 2;

// ─── Formulas ──────────────────────────────────────────────────────────────

export const damageMultiplier = (pow: number) => 1 + pow * POW_PER_POINT;
/** Max HP before armor: base, level and Endurance. */
export const maxHpFor = (level: number, end: number) => BASE_HP + level * HP_PER_LEVEL + enduranceHp(end);
export const speedBonus = (spd: number) => {
  const x = Math.max(0, spd - BASE_STAT);
  return (SPEED_MAX * x) / (x + SPEED_K);
};
/** Time between turns for an actor of the given speed. */
export const turnDelay = (speed: number) => (TURN_LENGTH * 100) / Math.max(1, speed);
export const enduranceHp = (end: number) => end * END_PER_POINT;
export const intellectEnergy = (int: number) => int * INT_PER_POINT;
/** Max energy before armor: base, level and Intellect. */
export const maxEnergyFor = (level: number, int: number) => BASE_ENERGY + level * ENERGY_PER_LEVEL + intellectEnergy(int);
export const luckCrit = (luk: number) => (CRIT_MAX * Math.max(0, luk)) / (Math.max(0, luk) + CRIT_K);
/** Share of max energy recovered after each won fight on a mission or patrol. */
export const ENERGY_RECOVERY = 0.15;
// ─── Level difference ──────────────────────────────────────────────────────

/** Your hit chance drops by this much per level a hostile is above you. */
export const LEVEL_HIT_PENALTY = 10;
/** Escape chance: base at equal level, ± per level of difference, clamped. */
export const FLEE_BASE = 60;
export const FLEE_PER_LEVEL = 12;
export const FLEE_MIN = 5;
export const FLEE_MAX = 95;

// ─── Status effects ────────────────────────────────────────────────────────

/** Corrode stacks up to this many times the strength of the dose being applied. */
export const CORRODE_MAX_STACKS = 3;

/** Heals have no stat; they grow with level. */
export const healMultiplier = (level: number) => 1 + level * 0.15;
