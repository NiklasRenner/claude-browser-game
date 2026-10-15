/**
 * Turn-based combat rules. All functions mutate the (already cloned) state
 * passed in by the reducer and push events describing what happened.
 *
 * Turn structure:
 *   player action → [every living hostile acts, in order → player turn start]* → player chooses again
 * A stunned player has their turn skipped automatically, so the UI only ever
 * asks for input when the player can actually act.
 *
 * Battles hold 1–3 hostiles. Defeated hostiles stay in `battle.monsters` with
 * hp 0 so indices stay stable; `battle.target` always points at a living one.
 *
 * Determinism note: with a single hostile, dice are rolled in exactly the same
 * order as the original single-hostile engine, so solo fights are unchanged.
 */
import { getClass, getConsumable, getMonster, getSpell, getWeapon } from './data';
import { derive, removeItem } from './player';
import { ABILITY_HIT, MAX_HIT, MIN_HIT, PLAYER_CRIT_MULT, healMultiplier } from './stats';
import type { Rng } from './rng';
import type {
  Actor, BattleState, Element, GameEvent, MonsterAttack, MonsterDef, MonsterInstance, Player, SpellEffect, StatusEffect,
  StatusId,
} from './types';

export { MAX_HIT, MIN_HIT, PLAYER_CRIT_MULT } from './stats';
export const MONSTER_CRIT_MULT = 1.5;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The one hit rule, for both sides: the attack's hit chance minus the
 * defender's evasion, clamped to [MIN_HIT, MAX_HIT].
 */
export function hitChance(hit: number, evasion: number): number {
  return clamp(hit - evasion, MIN_HIT, MAX_HIT);
}

// ─── Battle helpers ────────────────────────────────────────────────────────

export function isAlive(m: MonsterInstance): boolean {
  return m.hp > 0;
}

/** Indices of living hostiles, in order. */
export function aliveIndices(battle: BattleState): number[] {
  const out: number[] = [];
  battle.monsters.forEach((m, i) => { if (isAlive(m)) out.push(i); });
  return out;
}

export function targetMonster(battle: BattleState): MonsterInstance {
  return battle.monsters[battle.target]!;
}

/**
 * Keeps the target on a living hostile: if the current one is down, moves to
 * the next living one (wrapping). Returns true if the target changed.
 */
export function fixTarget(battle: BattleState, events?: GameEvent[]): boolean {
  if (isAlive(targetMonster(battle))) return false;
  const n = battle.monsters.length;
  for (let step = 1; step < n; step++) {
    const i = (battle.target + step) % n;
    if (isAlive(battle.monsters[i]!)) {
      battle.target = i;
      events?.push({ type: 'targeted', foe: i });
      return true;
    }
  }
  return false;
}

// ─── Status helpers ────────────────────────────────────────────────────────

export function statusPower(statuses: StatusEffect[], id: StatusId): number {
  return statuses.find((s) => s.id === id)?.power ?? 0;
}

export function hasStatus(statuses: StatusEffect[], id: StatusId): boolean {
  return statuses.some((s) => s.id === id);
}

/** Applies or refreshes a status. Always inserts a new object (see endTurn). `foe` = hostile index when target is 'monster'. */
export function applyStatus(
  statuses: StatusEffect[], target: Actor, id: StatusId, turns: number, power: number, events: GameEvent[], foe?: number,
): void {
  const i = statuses.findIndex((s) => s.id === id);
  const prev = i >= 0 ? statuses[i]! : null;
  const next: StatusEffect = {
    id,
    turns: Math.max(turns, prev?.turns ?? 0),
    power: Math.max(power, prev?.power ?? 0),
  };
  if (i >= 0) statuses.splice(i, 1);
  statuses.push(next);
  events.push({ type: 'statusApplied', target, ...(foe !== undefined ? { foe } : {}), status: id, turns: next.turns });
}

/**
 * Ends an actor's turn: durations tick down, but statuses applied during this
 * very turn (not present in `atStart`) are left alone, so e.g. a 3-turn shield
 * protects against exactly 3 enemy turns.
 */
function endTurn(
  statuses: StatusEffect[], atStart: ReadonlySet<StatusEffect>, target: Actor, events: GameEvent[], foe?: number,
) {
  for (let i = statuses.length - 1; i >= 0; i--) {
    const s = statuses[i]!;
    if (!atStart.has(s)) continue;
    s.turns -= 1;
    if (s.turns <= 0) {
      statuses.splice(i, 1);
      events.push({ type: 'statusExpired', target, ...(foe !== undefined ? { foe } : {}), status: s.id });
    }
  }
}

/** Damage-over-time ticks at the start of the owner's turn. Returns damage dealt. */
function tickDots(
  statuses: StatusEffect[], target: Actor, damageTaken: (el: Element) => number, events: GameEvent[], foe?: number,
): number {
  let total = 0;
  for (const s of statuses) {
    if (s.id !== 'burn' && s.id !== 'corrode') continue;
    const element: Element = s.id === 'burn' ? 'plasma' : 'corrosive';
    const dmg = Math.round((s.power * damageTaken(element)) / 100);
    total += dmg;
    events.push({ type: 'statusTick', target, ...(foe !== undefined ? { foe } : {}), status: s.id, damage: dmg });
  }
  return total;
}

// ─── Monster numbers ───────────────────────────────────────────────────────

/** Effective level of a hostile (patrols scale it; otherwise the definition's level). */
export function hostileLevel(inst: MonsterInstance): number {
  return inst.level ?? getMonster(inst.defId).level;
}

/** Hit chance a patrol-scaled hostile gains per level above its definition (keeps pace with player evasion). */
export const HOSTILE_ACCURACY_PER_LEVEL = 1.5;

/** Hit chance of a hostile's attack before the player's evasion (statuses included). */
export function hostileHit(inst: MonsterInstance, attack?: MonsterAttack): number {
  const def = getMonster(inst.defId);
  const base = attack?.hit ?? def.accuracy;
  return base + (hostileLevel(inst) - def.level) * HOSTILE_ACCURACY_PER_LEVEL - statusPower(inst.statuses, 'chill');
}

/** A hostile's evasion right now (statuses included). */
export function hostileEvasion(inst: MonsterInstance): number {
  return getMonster(inst.defId).evasion + statusPower(inst.statuses, 'evasive') - statusPower(inst.statuses, 'marked');
}

/** The player's evasion right now (statuses included). */
export function playerEvasion(player: Player, battle: BattleState): number {
  return derive(player).evasion + statusPower(battle.playerStatuses, 'evasive') - statusPower(battle.playerStatuses, 'marked');
}

type DamageEffect = Extract<SpellEffect, { type: 'damage' }>;

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
  const hit = strikeProfile(player, effect).hit - statusPower(battle.playerStatuses, 'chill');
  return hitChance(hit, hostileEvasion(battle.monsters[foe]!));
}

/** Chance (%) that one strike of this hostile attack lands on the player right now. */
export function hostileHitChance(player: Player, battle: BattleState, foe: number, attack?: MonsterAttack): number {
  return hitChance(hostileHit(battle.monsters[foe]!, attack), playerEvasion(player, battle));
}

export function monsterDamageTaken(m: MonsterDef, el: Element): number {
  return m.resist[el] ?? 100;
}

// ─── Damage calculation ────────────────────────────────────────────────────

/** Final damage after resistance and shield; never negative, at least 1 unless fully immune. */
export function mitigate(raw: number, damageTakenPct: number, shieldPct: number): number {
  if (damageTakenPct <= 0) return 0;
  const dmg = (raw * damageTakenPct * (100 - shieldPct)) / 10000;
  return Math.max(1, Math.round(dmg));
}

/** Average outgoing damage for a damage effect before crits/resist (used by the bot). */
/** Average damage of ONE strike of a damage effect, before hit, crits and resist (used by the bot). */
export function averageEffectDamage(player: Player, effect: DamageEffect): number {
  const weapon = getWeapon(player.weapon);
  const power = derive(player).damage;
  const mult = effect.mult ?? 1;
  if (effect.useWeapon) return ((weapon.damage[0] + weapon.damage[1]) / 2) * power * mult;
  return ((effect.dice[0] + effect.dice[1]) / 2) * power * mult;
}

export function resolveElement(player: Player, element: Element | 'weapon'): Element {
  return element === 'weapon' ? getWeapon(player.weapon).element : element;
}

// ─── Player actions ────────────────────────────────────────────────────────

export interface Ctx {
  player: Player;
  battle: BattleState;
  rng: Rng;
  events: GameEvent[];
}

const defOf = (ctx: Ctx, i: number) => getMonster(ctx.battle.monsters[i]!.defId);

/** Applies damage to hostile `i`; announces it going down. */
function damageMonster(ctx: Ctx, i: number, amount: number) {
  const m = ctx.battle.monsters[i]!;
  if (!isAlive(m)) return;
  m.hp = Math.max(0, m.hp - amount);
  if (!isAlive(m)) ctx.events.push({ type: 'hostileDown', foe: i });
}

/** One strike at hostile `foe` with the given base hit chance. Returns true if it landed. */
function playerStrike(
  ctx: Ctx, foe: number, name: string, element: Element, raw: number, baseHit: number, extraCrit = 0,
): boolean {
  const { player, battle, rng, events } = ctx;
  const monster = defOf(ctx, foe);
  const hit = rng.chance(hitChance(baseHit - statusPower(battle.playerStatuses, 'chill'), hostileEvasion(battle.monsters[foe]!)));
  if (!hit) {
    events.push({ type: 'attack', actor: 'player', foe, name, element, hit: false, crit: false, damage: 0 });
    return false;
  }
  const crit = rng.chance(derive(player).critChance + extraCrit);
  const dmg = mitigate(crit ? raw * PLAYER_CRIT_MULT : raw, monsterDamageTaken(monster, element), 0);
  events.push({ type: 'attack', actor: 'player', foe, name, element, hit: true, crit, damage: dmg });
  damageMonster(ctx, foe, dmg);
  return true;
}

export function playerAttack(ctx: Ctx): void {
  const { player, rng, battle } = ctx;
  const foe = battle.target;
  const weapon = getWeapon(player.weapon);
  const power = derive(player).damage;
  const { hit: baseHit, hits } = strikeProfile(player);
  for (let i = 0; i < hits && isAlive(battle.monsters[foe]!); i++) {
    const raw = rng.int(...weapon.damage) * power;
    const hit = playerStrike(ctx, foe, weapon.name, weapon.element, raw, baseHit);
    if (hit && weapon.proc && isAlive(battle.monsters[foe]!) && rng.chance(weapon.proc.chance)) {
      const dot = Math.round(weapon.proc.power * power);
      applyStatus(battle.monsters[foe]!.statuses, 'monster', weapon.proc.status, weapon.proc.turns, dot, ctx.events, foe);
    }
  }
}

/** True if any damage effect of the spell hits every hostile. */
export function isAreaSpell(spellId: string): boolean {
  return getSpell(spellId).effects.some((e) => e.type === 'damage' && e.aoe);
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
      const element = resolveElement(player, effect.element);
      const targets = effect.aoe ? aliveIndices(battle) : [battle.target];
      landedOn = [];
      const { hit: baseHit, hits } = strikeProfile(player, effect);
      for (const foe of targets) {
        let landed = false;
        for (let i = 0; i < hits && isAlive(battle.monsters[foe]!); i++) {
          let raw: number;
          if (effect.useWeapon) {
            const weapon = getWeapon(player.weapon);
            raw = rng.int(...weapon.damage);
          } else {
            raw = rng.int(...effect.dice);
          }
          raw *= power * (effect.mult ?? 1);
          if (playerStrike(ctx, foe, spell.name, element, raw, baseHit, effect.extraCrit ?? 0)) landed = true;
        }
        if (landed) landedOn.push(foe);
      }
    } else if (effect.type === 'heal') {
      const d = derive(player);
      const amount = Math.round(rng.int(...effect.dice) * healMultiplier(player.level));
      const healed = Math.min(amount, d.maxHp - player.hp);
      player.hp += healed;
      events.push({ type: 'heal', actor: 'player', amount: healed, mana: 0 });
    } else if (effect.target === 'self') {
      if (effect.chance !== undefined && !rng.chance(effect.chance)) continue;
      applyStatus(battle.playerStatuses, 'player', effect.status, effect.turns, effect.power, events);
    } else {
      for (const foe of landedOn) {
        const m = battle.monsters[foe]!;
        if (!isAlive(m)) continue;
        if (effect.chance !== undefined && !rng.chance(effect.chance)) continue;
        const scaled = effect.status === 'burn' || effect.status === 'corrode'
          ? Math.round(effect.power * power)
          : effect.power;
        applyStatus(m.statuses, 'monster', effect.status, effect.turns, scaled, events, foe);
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

/** Escape chance against a hostile of the given level (use the toughest living one). */
export function fleeChance(player: Player, hostileLvl: number): number {
  return clamp(50 + (player.level - hostileLvl) * 6 + player.stats.agi, 20, 90);
}

/** Highest effective level among living hostiles. */
export function toughestAliveLevel(battle: BattleState): number {
  return Math.max(...aliveIndices(battle).map((i) => hostileLevel(battle.monsters[i]!)));
}

// ─── Monster turns & turn sequencing ───────────────────────────────────────

function monsterAct(ctx: Ctx, foe: number): void {
  const { player, battle, rng, events } = ctx;
  const monster = defOf(ctx, foe);
  const self = battle.monsters[foe]!;
  const attack = rng.weighted(monster.attacks, (a) => a.weight);
  const d = derive(player);
  const chance = hostileHitChance(player, battle, foe, attack);
  for (let i = 0; i < (attack.hits ?? 1) && player.hp > 0; i++) {
    if (!rng.chance(chance)) {
      events.push({ type: 'attack', actor: 'monster', foe, name: attack.name, element: attack.element, hit: false, crit: false, damage: 0 });
      continue;
    }
    const crit = rng.chance(monster.crit);
    // `power` only exists on patrol-scaled hostiles.
    let raw = rng.int(...attack.damage) * (crit ? MONSTER_CRIT_MULT : 1);
    if (self.power !== undefined) raw *= self.power;
    const dmg = mitigate(raw, d.damageTaken[attack.element], statusPower(battle.playerStatuses, 'shield'));
    player.hp = Math.max(0, player.hp - dmg);
    events.push({ type: 'attack', actor: 'monster', foe, name: attack.name, element: attack.element, hit: true, crit, damage: dmg });
    if (attack.effect && player.hp > 0 && rng.chance(attack.effect.chance)) {
      const power = self.power !== undefined ? Math.round(attack.effect.power * self.power) : attack.effect.power;
      applyStatus(battle.playerStatuses, 'player', attack.effect.status, attack.effect.turns, power, events);
    }
  }
}

export type TurnOutcome = 'continue' | 'allDown' | 'playerDied';

/**
 * Wraps a player action: runs it, ends the player's turn, then lets every
 * living hostile act (and auto-skips stunned player turns) until the player
 * can act again or one side is defeated.
 */
export function runRound(
  player: Player, battle: BattleState, rng: Rng, events: GameEvent[], act: ((ctx: Ctx) => void) | null,
): TurnOutcome {
  const ctx: Ctx = { player, battle, rng, events };
  const playerDamageTaken = (el: Element) => derive(player).damageTaken[el];
  const allDown = () => aliveIndices(battle).length === 0;

  if (act) {
    const atStart = new Set(battle.playerStatuses);
    act(ctx);
    endTurn(battle.playerStatuses, atStart, 'player', events);
    if (allDown()) return 'allDown';
    fixTarget(battle, events);
  }

  // Safety cap: chained stuns can never loop forever.
  for (let guard = 0; guard < 20; guard++) {
    // Hostile turns, in order.
    battle.round += 1;
    for (let foe = 0; foe < battle.monsters.length; foe++) {
      const m = battle.monsters[foe]!;
      if (!isAlive(m)) continue;
      const def = getMonster(m.defId);
      const mStart = new Set(m.statuses);
      damageMonster(ctx, foe, tickDots(m.statuses, 'monster', (el) => monsterDamageTaken(def, el), events, foe));
      if (!isAlive(m)) continue;
      if (hasStatus(m.statuses, 'stun')) events.push({ type: 'stunned', actor: 'monster', foe });
      else monsterAct(ctx, foe);
      endTurn(m.statuses, mStart, 'monster', events, foe);
      if (player.hp <= 0) return 'playerDied';
    }
    if (allDown()) return 'allDown';
    fixTarget(battle, events);

    // Start of player turn.
    const pStart = new Set(battle.playerStatuses);
    player.hp = Math.max(0, player.hp - tickDots(battle.playerStatuses, 'player', playerDamageTaken, events));
    if (player.hp <= 0) return 'playerDied';
    if (!hasStatus(battle.playerStatuses, 'stun')) return 'continue';
    events.push({ type: 'stunned', actor: 'player' });
    endTurn(battle.playerStatuses, pStart, 'player', events);
  }
  return 'continue';
}
