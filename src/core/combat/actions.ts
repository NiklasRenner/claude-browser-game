/**
 * What happens on a turn: the player's attack, abilities and items, and a
 * hostile's attack. Each function mutates the (already cloned) state in `ctx`
 * and pushes events describing what happened.
 */
import { getConsumable, getAbility, getWeapon, getHostile, inflictedPower } from '../data';
import { derive, removeItem } from '../player';
import { FLEE_BASE, FLEE_MAX, FLEE_MIN, FLEE_PER_LEVEL, PLAYER_CRIT_MULT, healMultiplier } from '../stats';
import type { Element, GameEvent, Player, StatusEffect } from '../types';
import { aliveIndices, applyStatus, clamp, damageHostile, isAlive, statusPower } from './battle';
import type { Ctx } from './battle';
import { exposure, hostileDamageTaken, hostileHitChance, mitigate, resolveElement, strikeChance, strikeProfile } from './formulas';

const HOSTILE_CRIT_MULT = 1.5;

// ─── Player ────────────────────────────────────────────────────────────────

interface Volley {
  name: string;
  element: Element;
  /** Base hit chance before blind, level gap and the target's evasion. */
  hit: number;
  hits: number;
  extraCrit?: number;
  /** Rolls one strike's raw damage. */
  roll: () => number;
  /** Called after each strike that lands. */
  onLand?: () => void;
}

/**
 * Fires `volley.hits` strikes at hostile `foe` (stopping if it goes down).
 * Per strike: damage roll, hit roll, crit roll (if hit), then `onLand`.
 * Returns true if any strike landed.
 */
function strike(ctx: Ctx, foe: number, volley: Volley): boolean {
  const { player, battle, rng, events } = ctx;
  const target = battle.hostiles[foe]!;
  const def = getHostile(target.defId);
  let landed = false;
  for (let i = 0; i < volley.hits && isAlive(target); i++) {
    const raw = volley.roll();
    const base = { type: 'attack', actor: 'player', foe, name: volley.name, element: volley.element } as const;
    if (!rng.chance(strikeChance(player, battle, foe, volley.hit))) {
      events.push({ ...base, hit: false, crit: false, damage: 0 });
      continue;
    }
    const crit = rng.chance(derive(player).critChance + (volley.extraCrit ?? 0));
    const taken = hostileDamageTaken(def, volley.element) * exposure(target.statuses);
    const damage = mitigate(crit ? raw * PLAYER_CRIT_MULT : raw, taken, 0);
    events.push({ ...base, hit: true, crit, damage });
    damageHostile(ctx, foe, damage);
    landed = true;
    volley.onLand?.();
  }
  return landed;
}

export function playerAttack(ctx: Ctx): void {
  const { player, rng, battle, events } = ctx;
  const foe = battle.target;
  const target = battle.hostiles[foe]!;
  const weapon = getWeapon(player.weapon);
  const power = derive(player).damage;
  const { proc } = weapon;
  strike(ctx, foe, {
    name: weapon.name,
    element: weapon.element,
    ...strikeProfile(player),
    roll: () => rng.int(...weapon.damage) * power,
    onLand: () => {
      if (proc && isAlive(target) && rng.chance(proc.chance)) {
        applyStatus(target.statuses, 'hostile', proc.status, proc.turns, inflictedPower(proc.status, proc.power, power), events, foe);
      }
    },
  });
}

export function playerUseAbility(ctx: Ctx, abilityId: string): void {
  const { player, rng, events, battle } = ctx;
  const ability = getAbility(abilityId);
  const power = derive(player).damage;
  player.energy -= ability.energy;
  events.push({ type: 'abilityUsed', actor: 'player', abilityId: abilityId, name: ability.name });

  // Hostiles struck by the most recent damage effect; enemy status riders apply to these.
  let landedOn: number[] = [battle.target];
  for (const effect of ability.effects) {
    if (effect.type === 'damage') {
      const dice = effect.useWeapon ? getWeapon(player.weapon).damage : effect.dice;
      const volley: Volley = {
        name: ability.name,
        element: resolveElement(player, effect.element),
        ...strikeProfile(player, effect),
        extraCrit: effect.extraCrit ?? 0,
        roll: () => rng.int(...dice) * (power * (effect.mult ?? 1)),
      };
      const targets = effect.aoe ? aliveIndices(battle) : [battle.target];
      landedOn = targets.filter((foe) => strike(ctx, foe, volley));
    } else if (effect.type === 'heal') {
      const amount = Math.round(rng.int(...effect.dice) * healMultiplier(player.level));
      const healed = Math.min(amount, derive(player).maxHp - player.hp);
      player.hp += healed;
      events.push({ type: 'heal', actor: 'player', amount: healed, energy: 0 });
    } else if (effect.target === 'self') {
      if (effect.chance !== undefined && !rng.chance(effect.chance)) continue;
      applyStatus(battle.playerStatuses, 'player', effect.status, effect.turns, effect.power, events);
    } else {
      for (const foe of landedOn) {
        const m = battle.hostiles[foe]!;
        if (!isAlive(m)) continue;
        if (effect.chance !== undefined && !rng.chance(effect.chance)) continue;
        applyStatus(m.statuses, 'hostile', effect.status, effect.turns, inflictedPower(effect.status, effect.power, power), events, foe);
      }
    }
  }
}

/** Uses a consumable. Works in and out of battle; `statuses` is null outside battle. */
export function useConsumable(player: Player, itemId: string, statuses: StatusEffect[] | null, events: GameEvent[]) {
  const item = getConsumable(itemId);
  removeItem(player, itemId);
  const d = derive(player);
  const heal = Math.min(item.heal, d.maxHp - player.hp);
  const energy = Math.min(item.energy, d.maxEnergy - player.energy);
  player.hp += heal;
  player.energy += energy;
  events.push({ type: 'heal', actor: 'player', amount: heal, energy: energy });
  if (statuses && item.cures) {
    for (let i = statuses.length - 1; i >= 0; i--) {
      const s = statuses[i]!;
      if (item.cures.includes(s.id)) {
        statuses.splice(i, 1);
        events.push({ type: 'statusExpired', target: 'player', status: s.id });
      }
    }
  }
}

/**
 * Escape chance against a hostile of the given level (use the toughest living
 * one): easy from weaker hostiles, hard from stronger ones. Speed helps a little.
 */
export function fleeChance(player: Player, hostileLvl: number): number {
  const chance = FLEE_BASE + (player.level - hostileLvl) * FLEE_PER_LEVEL + (derive(player).speed - 100) / 2;
  return clamp(Math.round(chance), FLEE_MIN, FLEE_MAX);
}

// ─── Hostiles ──────────────────────────────────────────────────────────────

/** Hostile `foe` picks one of its attacks (weighted) and fires its strikes at the player. */
export function hostileAct(ctx: Ctx, foe: number): void {
  const { player, battle, rng, events } = ctx;
  const self = battle.hostiles[foe]!;
  const def = getHostile(self.defId);
  const attack = rng.weighted(def.attacks, (a) => a.weight);
  const chance = hostileHitChance(player, battle, foe, attack);
  const base = { type: 'attack', actor: 'hostile', foe, name: attack.name, element: attack.element } as const;
  for (let i = 0; i < (attack.hits ?? 1) && player.hp > 0; i++) {
    if (!rng.chance(chance)) {
      events.push({ ...base, hit: false, crit: false, damage: 0 });
      continue;
    }
    const crit = rng.chance(def.crit);
    // `power` only exists on patrol-scaled hostiles.
    let raw = rng.int(...attack.damage) * (crit ? HOSTILE_CRIT_MULT : 1);
    if (self.power !== undefined) raw *= self.power;
    const taken = derive(player).damageTaken[attack.element] * exposure(battle.playerStatuses);
    const damage = mitigate(raw, taken, statusPower(battle.playerStatuses, 'shield'));
    player.hp = Math.max(0, player.hp - damage);
    events.push({ ...base, hit: true, crit, damage });
    if (attack.effect && player.hp > 0 && rng.chance(attack.effect.chance)) {
      const power = inflictedPower(attack.effect.status, attack.effect.power, self.power ?? 1);
      applyStatus(battle.playerStatuses, 'player', attack.effect.status, attack.effect.turns, power, events);
    }
  }
}
