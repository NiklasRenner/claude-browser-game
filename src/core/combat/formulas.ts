/**
 * Combat numbers: hit chance, evasion, strikes and damage. Pure functions of
 * the current state, so the UI and the bot can show / weigh exactly what the
 * rules will roll.
 *
 * The hit rule is the same for both sides: the attack's hit chance minus the
 * defender's evasion, clamped to [MIN_HIT, MAX_HIT]. Blind lowers the
 * attacker's hit chance; the player also loses LEVEL_HIT_PENALTY per level a
 * hostile is above them.
 */
import { getArmor, getHostile, getWeapon } from '../data';
import { derive } from '../player';
import { ABILITY_HIT, LEVEL_HIT_PENALTY, MAX_HIT, MIN_HIT, PLAYER_EVASION_CAP } from '../stats';
import type { AbilityEffect, BattleState, Element, Hostile, HostileAttack, HostileDef, Player, StatusEffect } from '../types';
import { clamp, hostileLevel, statusPower } from './battle';

export type DamageEffect = Extract<AbilityEffect, { type: 'damage' }>;

/** Hit chance a patrol-scaled hostile gains per level above its definition (player evasion doesn't grow with level). */
export const HOSTILE_ACCURACY_PER_LEVEL = 0.5;

export function hitChance(hit: number, evasion: number): number {
  return clamp(hit - evasion, MIN_HIT, MAX_HIT);
}

// ─── Hostiles ──────────────────────────────────────────────────────────────

/** Hit chance of a hostile's attack before the player's evasion (statuses included). */
export function hostileHit(inst: Hostile, attack?: HostileAttack): number {
  const def = getHostile(inst.defId);
  const base = attack?.hit ?? def.accuracy;
  // Only patrol-scaled hostiles (which carry `power`) gain accuracy with level.
  const scaled = inst.power !== undefined ? (hostileLevel(inst) - def.level) * HOSTILE_ACCURACY_PER_LEVEL : 0;
  return base + scaled - statusPower(inst.statuses, 'blind');
}

/** Damage multiplier from the exposed status (void). */
export function exposure(statuses: StatusEffect[]): number {
  return 1 + statusPower(statuses, 'exposed') / 100;
}

/** A hostile's evasion right now (statuses included). */
export function hostileEvasion(inst: Hostile): number {
  return getHostile(inst.defId).evasion + statusPower(inst.statuses, 'evasive') - statusPower(inst.statuses, 'marked');
}

/** Damage a hostile takes from an element, in percent (100 = normal). */
export function hostileDamageTaken(m: HostileDef, el: Element): number {
  return m.resist[el] ?? 100;
}

/** Chance (%) that one strike of this hostile attack lands on the player right now. */
export function hostileHitChance(player: Player, battle: BattleState, foe: number, attack?: HostileAttack): number {
  return hitChance(hostileHit(battle.hostiles[foe]!, attack), playerEvasion(player, battle));
}

// ─── Player ────────────────────────────────────────────────────────────────

/** The player's evasion right now: armor + evasive, capped at PLAYER_EVASION_CAP, minus marked. */
export function playerEvasion(player: Player, battle: BattleState): number {
  const raw = getArmor(player.armor).block + statusPower(battle.playerStatuses, 'evasive');
  return Math.min(PLAYER_EVASION_CAP, raw) - statusPower(battle.playerStatuses, 'marked');
}

/**
 * Base hit chance and strike count of a player attack: the equipped weapon
 * (no effect), or an ability's damage effect. Weapon techniques inherit the
 * weapon's numbers unless the ability overrides them.
 */
export function strikeProfile(player: Player, effect?: DamageEffect): { hit: number; hits: number } {
  const weapon = getWeapon(player.weapon);
  if (!effect) return { hit: weapon.hit, hits: weapon.hits ?? 1 };
  const base = effect.hit ?? (effect.useWeapon ? weapon.hit : ABILITY_HIT);
  const hits = effect.hits ?? (effect.useWeapon ? weapon.hits ?? 1 : 1);
  return { hit: base + (effect.accuracy ?? 0), hits };
}

/** Chance (%) that one strike of the weapon (or ability effect) lands on hostile `foe` right now. */
export function playerHitChance(player: Player, battle: BattleState, foe: number, effect?: DamageEffect): number {
  return strikeChance(player, battle, foe, strikeProfile(player, effect).hit);
}

/** Hit chance lost against a hostile above the player's level. */
export function levelPenalty(player: Player, inst: Hostile): number {
  return Math.max(0, hostileLevel(inst) - player.level) * LEVEL_HIT_PENALTY;
}

/** Chance (%) that a player strike with base hit `hit` lands on hostile `foe` (blind and level gap included). */
export function strikeChance(player: Player, battle: BattleState, foe: number, hit: number): number {
  const inst = battle.hostiles[foe]!;
  return hitChance(hit - statusPower(battle.playerStatuses, 'blind') - levelPenalty(player, inst), hostileEvasion(inst));
}

/** The element a damage effect actually deals ('weapon' = the equipped weapon's). */
export function resolveElement(player: Player, element: Element | 'weapon'): Element {
  return element === 'weapon' ? getWeapon(player.weapon).element : element;
}

/** Average damage of ONE strike of a damage effect, before hit, crits and resist (used by the bot). */
export function averageEffectDamage(player: Player, effect: DamageEffect): number {
  const dice = effect.useWeapon ? getWeapon(player.weapon).damage : effect.dice;
  return ((dice[0] + dice[1]) / 2) * derive(player).damage * (effect.mult ?? 1);
}

// ─── Damage ────────────────────────────────────────────────────────────────

/** Final damage after resistance and shield; never negative, at least 1 unless fully immune. */
export function mitigate(raw: number, damageTakenPct: number, shieldPct: number): number {
  if (damageTakenPct <= 0) return 0;
  const dmg = (raw * damageTakenPct * (100 - shieldPct)) / 10000;
  return Math.max(1, Math.round(dmg));
}
