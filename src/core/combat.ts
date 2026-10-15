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
import { derive, removeItem, statMultiplier } from './player';
import type { Rng } from './rng';
import type {
  Actor, BattleState, Element, GameEvent, MonsterDef, MonsterInstance, Player, SpellEffect, StatusEffect, StatusId,
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

/** Final damage after resistance and shield; never negative, at least 1 unless fully immune. */
export function mitigate(raw: number, damageTakenPct: number, shieldPct: number): number {
  if (damageTakenPct <= 0) return 0;
  const dmg = (raw * damageTakenPct * (100 - shieldPct)) / 10000;
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

function playerStrike(
  ctx: Ctx, foe: number, name: string, element: Element, raw: number, opts: { canMiss: boolean; extraCrit?: number },
): boolean {
  const { player, battle, rng, events } = ctx;
  const monster = defOf(ctx, foe);
  const d = derive(player);
  let hit = true;
  if (opts.canMiss) {
    const acc = d.accuracy - statusPower(battle.playerStatuses, 'chill');
    hit = rng.chance(hitChance(acc, monsterEvasion(monster)));
  }
  if (!hit) {
    events.push({ type: 'attack', actor: 'player', foe, name, element, hit: false, crit: false, damage: 0 });
    return false;
  }
  const crit = rng.chance(d.critChance + (opts.extraCrit ?? 0));
  const dmg = mitigate(crit ? raw * PLAYER_CRIT_MULT : raw, monsterDamageTaken(monster, element), 0);
  events.push({ type: 'attack', actor: 'player', foe, name, element, hit: true, crit, damage: dmg });
  damageMonster(ctx, foe, dmg);
  return true;
}

export function playerAttack(ctx: Ctx): void {
  const { player, rng, battle } = ctx;
  const foe = battle.target;
  const cls = getClass(player.classId);
  const weapon = getWeapon(player.weapon);
  const raw = rng.int(...weapon.damage) * cls.weaponMult * statMultiplier(player.stats[cls.attackStat]);
  const hit = playerStrike(ctx, foe, weapon.name, weapon.element, raw, { canMiss: true });
  if (hit && weapon.proc && isAlive(battle.monsters[foe]!) && rng.chance(weapon.proc.chance)) {
    const power = Math.round(weapon.proc.power * statMultiplier(player.stats[cls.attackStat]));
    applyStatus(battle.monsters[foe]!.statuses, 'monster', weapon.proc.status, weapon.proc.turns, power, ctx.events, foe);
  }
}

/** True if any damage effect of the spell hits every hostile. */
export function isAreaSpell(spellId: string): boolean {
  return getSpell(spellId).effects.some((e) => e.type === 'damage' && e.aoe);
}

export function playerCast(ctx: Ctx, spellId: string): void {
  const { player, rng, events, battle } = ctx;
  const spell = getSpell(spellId);
  const cls = getClass(player.classId);
  player.mp -= spell.mp;
  events.push({ type: 'cast', actor: 'player', spellId, name: spell.name });

  // Hostiles struck by the most recent damage effect; enemy status riders apply to these.
  let landedOn: number[] = [battle.target];
  for (const effect of spell.effects) {
    if (effect.type === 'damage') {
      const element = resolveElement(player, effect.element);
      const targets = effect.aoe ? aliveIndices(battle) : [battle.target];
      landedOn = [];
      for (const foe of targets) {
        let raw: number;
        if (effect.useWeapon) {
          const weapon = getWeapon(player.weapon);
          raw = rng.int(...weapon.damage) * cls.weaponMult;
        } else {
          raw = rng.int(...effect.dice);
        }
        raw *= statMultiplier(player.stats[effect.scaling]) * (effect.mult ?? 1);
        // Weapon techniques can miss; pure field science always lands.
        const hit = playerStrike(ctx, foe, spell.name, element, raw, {
          canMiss: !!effect.useWeapon,
          ...(effect.extraCrit !== undefined ? { extraCrit: effect.extraCrit } : {}),
        });
        if (hit) landedOn.push(foe);
      }
    } else if (effect.type === 'heal') {
      const d = derive(player);
      const amount = Math.round(rng.int(...effect.dice) * statMultiplier(player.stats[effect.scaling]) * (1 + player.level * 0.05));
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
          ? Math.round(effect.power * statMultiplier(player.stats[spellScaling(spellId)]))
          : effect.power;
        applyStatus(m.statuses, 'monster', effect.status, effect.turns, scaled, events, foe);
      }
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

/** Escape chance against the toughest living hostile. */
export function fleeChance(player: Player, monster: MonsterDef): number {
  return clamp(50 + (player.level - monster.level) * 6 + player.stats.luk * 0.5 + player.stats.dex * 0.5, 20, 90);
}

export function toughestAlive(battle: BattleState): MonsterDef {
  return aliveIndices(battle).map((i) => getMonster(battle.monsters[i]!.defId))
    .reduce((a, b) => (b.level > a.level ? b : a));
}

// ─── Monster turns & turn sequencing ───────────────────────────────────────

function monsterAct(ctx: Ctx, foe: number): void {
  const { player, battle, rng, events } = ctx;
  const monster = defOf(ctx, foe);
  const self = battle.monsters[foe]!;
  const attack = rng.weighted(monster.attacks, (a) => a.weight);
  const d = derive(player);
  const acc = monsterAccuracy(monster) - statusPower(self.statuses, 'chill');
  const eva = d.evasion + statusPower(battle.playerStatuses, 'evasive');
  if (!rng.chance(hitChance(acc, eva))) {
    events.push({ type: 'attack', actor: 'monster', foe, name: attack.name, element: attack.element, hit: false, crit: false, damage: 0 });
    return;
  }
  const crit = rng.chance(monsterCrit(monster));
  const raw = rng.int(...attack.damage) * (crit ? MONSTER_CRIT_MULT : 1);
  const dmg = mitigate(raw, d.damageTaken[attack.element], statusPower(battle.playerStatuses, 'shield'));
  player.hp = Math.max(0, player.hp - dmg);
  events.push({ type: 'attack', actor: 'monster', foe, name: attack.name, element: attack.element, hit: true, crit, damage: dmg });
  if (attack.effect && player.hp > 0 && rng.chance(attack.effect.chance)) {
    applyStatus(battle.playerStatuses, 'player', attack.effect.status, attack.effect.turns, attack.effect.power, events);
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
