/**
 * Turn-based combat rules. All functions mutate the (already cloned) state
 * passed in by the reducer and push events describing what happened.
 *
 * Turn structure:
 *   player action → [monster turn → player turn start]* → player chooses again
 * A stunned player has their turn skipped automatically, so the UI only ever
 * asks for input when the player can actually act.
 */
import { getClass, getConsumable, getMonster, getSpell, getWeapon } from './data';
import { derive, removeItem, statMultiplier } from './player';
import type { Rng } from './rng';
import type {
  Actor, BattleState, Element, GameEvent, MonsterDef, Player, SpellEffect, StatusEffect, StatusId,
} from './types';

export const BASE_HIT = 82;
export const MIN_HIT = 10;
export const MAX_HIT = 97;
export const PLAYER_CRIT_MULT = 1.75;
export const MONSTER_CRIT_MULT = 1.5;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function hitChance(accuracy: number, evasion: number): number {
  return clamp(BASE_HIT + accuracy - evasion, MIN_HIT, MAX_HIT);
}

// ─── Status helpers ────────────────────────────────────────────────────────

export function statusPower(statuses: StatusEffect[], id: StatusId): number {
  return statuses.find((s) => s.id === id)?.power ?? 0;
}

export function hasStatus(statuses: StatusEffect[], id: StatusId): boolean {
  return statuses.some((s) => s.id === id);
}

/** Applies or refreshes a status. Always inserts a new object (see endTurn). */
export function applyStatus(
  statuses: StatusEffect[], target: Actor, id: StatusId, turns: number, power: number, events: GameEvent[],
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
  events.push({ type: 'statusApplied', target, status: id, turns: next.turns });
}

/**
 * Ends an actor's turn: durations tick down, but statuses applied during this
 * very turn (not present in `atStart`) are left alone, so e.g. a 3-turn guard
 * protects against exactly 3 enemy turns.
 */
function endTurn(statuses: StatusEffect[], atStart: ReadonlySet<StatusEffect>, target: Actor, events: GameEvent[]) {
  for (let i = statuses.length - 1; i >= 0; i--) {
    const s = statuses[i]!;
    if (!atStart.has(s)) continue;
    s.turns -= 1;
    if (s.turns <= 0) {
      statuses.splice(i, 1);
      events.push({ type: 'statusExpired', target, status: s.id });
    }
  }
}

/** Damage-over-time ticks at the start of the owner's turn. Returns damage dealt. */
function tickDots(
  statuses: StatusEffect[], target: Actor, damageTaken: (el: Element) => number, events: GameEvent[],
): number {
  let total = 0;
  for (const s of statuses) {
    if (s.id !== 'burn' && s.id !== 'corrode') continue;
    const element: Element = s.id === 'burn' ? 'plasma' : 'corrosive';
    const dmg = Math.round((s.power * damageTaken(element)) / 100);
    total += dmg;
    events.push({ type: 'statusTick', target, status: s.id, damage: dmg });
  }
  return total;
}

// ─── Monster numbers ───────────────────────────────────────────────────────

export function monsterAccuracy(m: MonsterDef): number {
  return m.level * 1.5 + m.stats.dex * 0.5;
}
export function monsterEvasion(m: MonsterDef): number {
  return m.evasion + m.stats.dex * 0.3 + m.level * 0.5;
}
export function monsterCrit(m: MonsterDef): number {
  return 3 + m.stats.luk * 0.4;
}
export function monsterDamageTaken(m: MonsterDef, el: Element): number {
  return m.resist[el] ?? 100;
}

// ─── Damage calculation ────────────────────────────────────────────────────

/** Final damage after resistance and guard; never negative, at least 1 unless fully immune. */
export function mitigate(raw: number, damageTakenPct: number, guardPct: number): number {
  if (damageTakenPct <= 0) return 0;
  const dmg = (raw * damageTakenPct * (100 - guardPct)) / 10000;
  return Math.max(1, Math.round(dmg));
}

/** Average outgoing damage for a damage effect before crits/resist (used by the bot). */
export function averageEffectDamage(player: Player, effect: Extract<SpellEffect, { type: 'damage' }>): number {
  const cls = getClass(player.classId);
  const weapon = getWeapon(player.weapon);
  const stat = statMultiplier(player.stats[effect.scaling]);
  const mult = effect.mult ?? 1;
  if (effect.useWeapon) return ((weapon.damage[0] + weapon.damage[1]) / 2) * cls.weaponMult * stat * mult;
  return ((effect.dice[0] + effect.dice[1]) / 2) * stat * mult;
}

export function resolveElement(player: Player, element: Element | 'weapon'): Element {
  return element === 'weapon' ? getWeapon(player.weapon).element : element;
}

// ─── Player actions ────────────────────────────────────────────────────────

interface Ctx {
  player: Player;
  battle: BattleState;
  monster: MonsterDef;
  rng: Rng;
  events: GameEvent[];
}

function damageMonster(ctx: Ctx, amount: number) {
  ctx.battle.monster.hp = Math.max(0, ctx.battle.monster.hp - amount);
}

function playerStrike(
  ctx: Ctx, name: string, element: Element, raw: number, opts: { canMiss: boolean; extraCrit?: number },
): boolean {
  const { player, battle, monster, rng, events } = ctx;
  const d = derive(player);
  let hit = true;
  if (opts.canMiss) {
    const acc = d.accuracy - statusPower(battle.playerStatuses, 'chill');
    hit = rng.chance(hitChance(acc, monsterEvasion(monster)));
  }
  if (!hit) {
    events.push({ type: 'attack', actor: 'player', name, element, hit: false, crit: false, damage: 0 });
    return false;
  }
  const crit = rng.chance(d.critChance + (opts.extraCrit ?? 0));
  const dmg = mitigate(crit ? raw * PLAYER_CRIT_MULT : raw, monsterDamageTaken(monster, element), 0);
  damageMonster(ctx, dmg);
  events.push({ type: 'attack', actor: 'player', name, element, hit: true, crit, damage: dmg });
  return true;
}

export function playerAttack(ctx: Ctx): void {
  const { player, rng } = ctx;
  const cls = getClass(player.classId);
  const weapon = getWeapon(player.weapon);
  const raw = rng.int(...weapon.damage) * cls.weaponMult * statMultiplier(player.stats[cls.attackStat]);
  const hit = playerStrike(ctx, weapon.name, weapon.element, raw, { canMiss: true });
  if (hit && weapon.proc && ctx.battle.monster.hp > 0 && rng.chance(weapon.proc.chance)) {
    const power = Math.round(weapon.proc.power * statMultiplier(player.stats[cls.attackStat]));
    applyStatus(ctx.battle.monster.statuses, 'monster', weapon.proc.status, weapon.proc.turns, power, ctx.events);
  }
}

export function playerCast(ctx: Ctx, spellId: string): void {
  const { player, rng, events, battle } = ctx;
  const spell = getSpell(spellId);
  const cls = getClass(player.classId);
  player.mp -= spell.mp;
  events.push({ type: 'cast', actor: 'player', spellId, name: spell.name });

  let landed = true; // later effects (e.g. stun riders) only apply if the strike landed
  for (const effect of spell.effects) {
    if (effect.type === 'damage') {
      const element = resolveElement(player, effect.element);
      let raw: number;
      if (effect.useWeapon) {
        const weapon = getWeapon(player.weapon);
        raw = rng.int(...weapon.damage) * cls.weaponMult;
      } else {
        raw = rng.int(...effect.dice);
      }
      raw *= statMultiplier(player.stats[effect.scaling]) * (effect.mult ?? 1);
      // Weapon techniques can miss (with a small accuracy bonus); pure magic always lands.
      landed = playerStrike(ctx, spell.name, element, raw, {
        canMiss: !!effect.useWeapon,
        ...(effect.extraCrit !== undefined ? { extraCrit: effect.extraCrit } : {}),
      });
    } else if (effect.type === 'heal') {
      const d = derive(player);
      const amount = Math.round(rng.int(...effect.dice) * statMultiplier(player.stats[effect.scaling]) * (1 + player.level * 0.05));
      const healed = Math.min(amount, d.maxHp - player.hp);
      player.hp += healed;
      events.push({ type: 'heal', actor: 'player', amount: healed, mana: 0 });
    } else {
      if (effect.target === 'enemy' && (!landed || battle.monster.hp <= 0)) continue;
      if (effect.chance !== undefined && !rng.chance(effect.chance)) continue;
      const scaled = effect.status === 'burn' || effect.status === 'corrode'
        ? Math.round(effect.power * statMultiplier(player.stats[spellScaling(spellId)]))
        : effect.power;
      const list = effect.target === 'self' ? battle.playerStatuses : battle.monster.statuses;
      applyStatus(list, effect.target === 'self' ? 'player' : 'monster', effect.status, effect.turns, scaled, events);
    }
  }
}

function spellScaling(spellId: string) {
  const spell = getSpell(spellId);
  for (const e of spell.effects) if (e.type !== 'status') return e.scaling;
  return getClass(spell.classId).attackStat;
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

export function fleeChance(player: Player, monster: MonsterDef): number {
  return clamp(50 + (player.level - monster.level) * 6 + player.stats.luk * 0.5 + player.stats.dex * 0.5, 20, 90);
}

// ─── Monster turn & turn sequencing ────────────────────────────────────────

function monsterAct(ctx: Ctx): void {
  const { player, battle, monster, rng, events } = ctx;
  const attack = rng.weighted(monster.attacks, (a) => a.weight);
  const d = derive(player);
  const acc = monsterAccuracy(monster) - statusPower(battle.monster.statuses, 'chill');
  const eva = d.evasion + statusPower(battle.playerStatuses, 'evasive');
  if (!rng.chance(hitChance(acc, eva))) {
    events.push({ type: 'attack', actor: 'monster', name: attack.name, element: attack.element, hit: false, crit: false, damage: 0 });
    return;
  }
  const crit = rng.chance(monsterCrit(monster));
  const raw = rng.int(...attack.damage) * (crit ? MONSTER_CRIT_MULT : 1);
  const dmg = mitigate(raw, d.damageTaken[attack.element], statusPower(battle.playerStatuses, 'shield'));
  player.hp = Math.max(0, player.hp - dmg);
  events.push({ type: 'attack', actor: 'monster', name: attack.name, element: attack.element, hit: true, crit, damage: dmg });
  if (attack.effect && player.hp > 0 && rng.chance(attack.effect.chance)) {
    applyStatus(battle.playerStatuses, 'player', attack.effect.status, attack.effect.turns, attack.effect.power, events);
  }
}

export type TurnOutcome = 'continue' | 'monsterDied' | 'playerDied';

/**
 * Wraps a player action: runs it, ends the player's turn, then plays monster
 * turns (and auto-skips stunned player turns) until the player can act again
 * or someone dies.
 */
export function runRound(
  player: Player, battle: BattleState, rng: Rng, events: GameEvent[], act: ((ctx: Ctx) => void) | null,
): TurnOutcome {
  const monster = getMonster(battle.monster.defId);
  const ctx: Ctx = { player, battle, monster, rng, events };
  const playerDamageTaken = (el: Element) => derive(player).damageTaken[el];

  if (act) {
    const atStart = new Set(battle.playerStatuses);
    act(ctx);
    endTurn(battle.playerStatuses, atStart, 'player', events);
    if (battle.monster.hp <= 0) return 'monsterDied';
  }

  // Safety cap: chained stuns can never loop forever.
  for (let guard = 0; guard < 20; guard++) {
    // Monster turn.
    battle.round += 1;
    const mStart = new Set(battle.monster.statuses);
    damageMonster(ctx, tickDots(battle.monster.statuses, 'monster', (el) => monsterDamageTaken(monster, el), events));
    if (battle.monster.hp <= 0) return 'monsterDied';
    if (hasStatus(battle.monster.statuses, 'stun')) events.push({ type: 'stunned', actor: 'monster' });
    else monsterAct(ctx);
    endTurn(battle.monster.statuses, mStart, 'monster', events);
    if (player.hp <= 0) return 'playerDied';

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
