/**
 * Turn-based combat rules.
 *
 *   battle.ts    battle-state helpers and status effects
 *   formulas.ts  hit chance, evasion, strikes, damage (pure numbers; used by UI and bot too)
 *   timeline.ts  speed-based turn order
 *   actions.ts   what a turn does: attack, abilities, items, hostile attacks
 *   round.ts     sequencing: run the player's action, then hostile turns until the player is up
 */
export { aliveIndices, applyStatus, freshHostile, hostileLevel, isAlive, nextLivingTarget, toughestAliveLevel } from './battle';
export type { Ctx } from './battle';
export {
  averageEffectDamage, averageWeaponDamage, hitChance, hostileEvasion, hostileHit, hostileHitChance,
  mitigate, hostileDamageTaken, levelPenalty, playerEvasion, playerHitChance, resolveElement, strikeProfile,
} from './formulas';
export type { DamageEffect } from './formulas';
export { hostileSpeed, initTimeline, nextActor, upcomingTurns } from './timeline';
export type { Turn } from './timeline';
export { fleeChance, playerAttack, playerUseAbility, useConsumable } from './actions';
export { beginBattle, runRound } from './round';
export type { PlayerAct, TurnOutcome } from './round';
