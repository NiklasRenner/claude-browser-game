/**
 * Battle-state helpers shared by the rest of the combat code: who is alive,
 * targeting, levels, and status effects.
 *
 * Battles hold 1–3 hostiles. Defeated hostiles stay in `battle.hostiles` with
 * hp 0 so indices stay stable; `battle.target` always points at a living one.
 * Statuses work the same way on the player and on hostiles.
 */
import { STATUSES, getHostile } from '../data';
import type { Rng } from '../rng';
import type { Actor, BattleState, Element, GameEvent, Hostile, Player, StatusEffect, StatusId } from '../types';

/** Everything an action needs while it resolves (the state is already a private copy, so it is mutated). */
export interface Ctx {
  player: Player;
  battle: BattleState;
  rng: Rng;
  events: GameEvent[];
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─── Hostiles ──────────────────────────────────────────────────────────────

export function isAlive(m: Hostile): boolean {
  return m.hp > 0;
}

/** Indices of living hostiles, in order. */
export function aliveIndices(battle: BattleState): number[] {
  const out: number[] = [];
  battle.hostiles.forEach((m, i) => { if (isAlive(m)) out.push(i); });
  return out;
}

export const allDown = (battle: BattleState) => !battle.hostiles.some(isAlive);

/** A hostile at full health, as its definition has it (at `level` if given: bosses fight above theirs). */
export function freshHostile(defId: string, level?: number): Hostile {
  const { hp } = getHostile(defId);
  return level === undefined ? { defId, hp, maxHp: hp, statuses: [] } : { defId, hp, maxHp: hp, statuses: [], level };
}

/** Effective level of a hostile (patrols scale it; otherwise the definition's level). */
export function hostileLevel(inst: Hostile): number {
  return inst.level ?? getHostile(inst.defId).level;
}

/** Highest effective level among living hostiles. */
export function toughestAliveLevel(battle: BattleState): number {
  return Math.max(...aliveIndices(battle).map((i) => hostileLevel(battle.hostiles[i]!)));
}

/** Applies damage to hostile `foe`; announces it going down. */
export function damageHostile(ctx: Ctx, foe: number, amount: number) {
  const m = ctx.battle.hostiles[foe]!;
  if (!isAlive(m)) return;
  m.hp = Math.max(0, m.hp - amount);
  if (!isAlive(m)) ctx.events.push({ type: 'hostileDown', foe });
}

/** The next living hostile after the current target, going right (1) or left (−1) and wrapping; null if it's the only one. */
export function nextLivingTarget(battle: BattleState, dir: 1 | -1 = 1): number | null {
  const n = battle.hostiles.length;
  for (let step = 1; step < n; step++) {
    const i = (battle.target + (dir === 1 ? step : n - step)) % n;
    if (isAlive(battle.hostiles[i]!)) return i;
  }
  return null;
}

/** If the current target is down, moves it to the next living hostile (wrapping). */
export function fixTarget(battle: BattleState, events: GameEvent[]): void {
  if (isAlive(battle.hostiles[battle.target]!)) return;
  const i = nextLivingTarget(battle);
  if (i === null) return;
  battle.target = i;
  events.push({ type: 'targeted', foe: i });
}

// ─── Status effects ────────────────────────────────────────────────────────

export function statusPower(statuses: StatusEffect[], id: StatusId): number {
  return statuses.find((s) => s.id === id)?.power ?? 0;
}

export function hasStatus(statuses: StatusEffect[], id: StatusId): boolean {
  return statuses.some((s) => s.id === id);
}

/** Applies or refreshes a status (see StatusRule.stacks). Always inserts a new object (see endTurn). `foe` = hostile index when target is 'hostile'. */
export function applyStatus(
  statuses: StatusEffect[], target: Actor, id: StatusId, turns: number, power: number, events: GameEvent[], foe?: number,
): void {
  const i = statuses.findIndex((s) => s.id === id);
  const prev = i >= 0 ? statuses[i]! : null;
  const { stacks } = STATUSES[id];
  const stacked = stacks && prev ? Math.min(prev.power + power, power * stacks) : power;
  const next: StatusEffect = {
    id,
    turns: Math.max(turns, prev?.turns ?? 0),
    power: Math.max(stacked, prev?.power ?? 0),
  };
  if (i >= 0) statuses.splice(i, 1);
  statuses.push(next);
  events.push({ type: 'statusApplied', target, ...(foe !== undefined ? { foe } : {}), status: id, turns: next.turns });
}

/**
 * Ends an actor's turn: durations tick down, but statuses applied during this
 * very turn (not present in `atStart`) are left alone, so a 3-turn shield
 * lasts through the owner's next 3 turns.
 */
export function endTurn(
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
export function tickDots(
  statuses: StatusEffect[], target: Actor, damageTaken: (el: Element) => number, events: GameEvent[], foe?: number,
): number {
  let total = 0;
  for (const s of statuses) {
    const element = STATUSES[s.id].dot;
    if (!element) continue;
    const dmg = Math.round((s.power * damageTaken(element)) / 100);
    total += dmg;
    events.push({ type: 'statusTick', target, ...(foe !== undefined ? { foe } : {}), status: s.id, damage: dmg });
  }
  return total;
}
