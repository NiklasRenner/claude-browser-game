/**
 * What happens on a turn: the player's attack, abilities and items, and a
 * hostile's attack. Each function mutates the (already cloned) state in `ctx`
 * and pushes events describing what happened.
 */
import { getConsumable, getSpell, getWeapon, getMonster } from '../data';
import { derive, removeItem } from '../player';
import { PLAYER_CRIT_MULT, healMultiplier } from '../stats';
import type { Element, GameEvent, Player, StatusEffect } from '../types';
import { aliveIndices, applyStatus, clamp, damageHostile, isAlive, statusPower } from './battle';
import type { Ctx } from './battle';
import { hostileHitChance, mitigate, monsterDamageTaken, resolveElement, strikeChance, strikeProfile } from './formulas';

const HOSTILE_CRIT_MULT = 1.5;

// ─── Player ────────────────────────────────────────────────────────────────

interface Volley {
  name: string;
  element: Element;
  /** Base hit chance before chill and the target's evasion. */
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
  const target = battle.monsters[foe]!;
  const def = getMonster(target.defId);
  let landed = false;
  for (let i = 0; i < volley.hits && isAlive(target); i++) {
    const raw = volley.roll();
    const base = { type: 'attack', actor: 'player', foe, name: volley.name, element: volley.element } as const;
    if (!rng.chance(strikeChance(battle, foe, volley.hit))) {
      events.push({ ...base, hit: false, crit: false, damage: 0 });
      continue;
    }
    const crit = rng.chance(derive(player).critChance + (volley.extraCrit ?? 0));
    const damage = mitigate(crit ? raw * PLAYER_CRIT_MULT : raw, monsterDamageTaken(def, volley.element), 0);
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
  const target = battle.monsters[foe]!;
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
        applyStatus(target.statuses, 'monster', proc.status, proc.turns, Math.round(proc.power * power), events, foe);
      }
    },
  });
}

export function playerCast(ctx: Ctx, spellId: string): void {
  const { player, rng, events, battle } = ctx;
  const spell = getSpell(spellId);
  const power = derive(player).damage;
  player.mp -= spell.mp;
  events.push({ type: 'cast', actor: 'player', spellId, name: spell.name });

  // Hostiles struck by the most recent damage effect; enemy status riders apply to these.
  let landedOn: number[] = [battle.target];
  for (const effect of spell.effects) {
    if (effect.type === 'damage') {
      const dice = effect.useWeapon ? getWeapon(player.weapon).damage : effect.dice;
      const volley: Volley = {
        name: spell.name,
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
      events.push({ type: 'heal', actor: 'player', amount: healed, mana: 0 });
    } else if (effect.target === 'self') {
      if (effect.chance !== undefined && !rng.chance(effect.chance)) continue;
      applyStatus(battle.playerStatuses, 'player', effect.status, effect.turns, effect.power, events);
    } else {
      // Damage-over-time riders scale with Power like direct damage.
      const dot = effect.status === 'burn' || effect.status === 'corrode';
      for (const foe of landedOn) {
        const m = battle.monsters[foe]!;
        if (!isAlive(m)) continue;
        if (effect.chance !== undefined && !rng.chance(effect.chance)) continue;
        applyStatus(m.statuses, 'monster', effect.status, effect.turns, dot ? Math.round(effect.power * power) : effect.power, events, foe);
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
  const mana = Math.min(item.mana, d.maxMp - player.mp);
  player.hp += heal;
  player.mp += mana;
  events.push({ type: 'heal', actor: 'player', amount: heal, mana });
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

/** Escape chance against a hostile of the given level (use the toughest living one). Faster officers get away more often. */
export function fleeChance(player: Player, hostileLvl: number): number {
  return clamp(50 + (player.level - hostileLvl) * 6 + (derive(player).speed - 100), 20, 90);
}

// ─── Hostiles ──────────────────────────────────────────────────────────────

/** Hostile `foe` picks one of its attacks (weighted) and fires its strikes at the player. */
export function hostileAct(ctx: Ctx, foe: number): void {
  const { player, battle, rng, events } = ctx;
  const self = battle.monsters[foe]!;
  const def = getMonster(self.defId);
  const attack = rng.weighted(def.attacks, (a) => a.weight);
  const chance = hostileHitChance(player, battle, foe, attack);
  const base = { type: 'attack', actor: 'monster', foe, name: attack.name, element: attack.element } as const;
  for (let i = 0; i < (attack.hits ?? 1) && player.hp > 0; i++) {
    if (!rng.chance(chance)) {
      events.push({ ...base, hit: false, crit: false, damage: 0 });
      continue;
    }
    const crit = rng.chance(def.crit);
    // `power` only exists on patrol-scaled hostiles.
    let raw = rng.int(...attack.damage) * (crit ? HOSTILE_CRIT_MULT : 1);
    if (self.power !== undefined) raw *= self.power;
    const damage = mitigate(raw, derive(player).damageTaken[attack.element], statusPower(battle.playerStatuses, 'shield'));
    player.hp = Math.max(0, player.hp - damage);
    events.push({ ...base, hit: true, crit, damage });
    if (attack.effect && player.hp > 0 && rng.chance(attack.effect.chance)) {
      const power = self.power !== undefined ? Math.round(attack.effect.power * self.power) : attack.effect.power;
      applyStatus(battle.playerStatuses, 'player', attack.effect.status, attack.effect.turns, power, events);
    }
  }
}
