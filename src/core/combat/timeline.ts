/**
 * Turn order: a deterministic timeline driven by speed.
 *
 * Every combatant has a "next turn" time. Whoever's comes first acts, then
 * waits turnDelay(speed) before acting again. A speed-110 officer facing a
 * speed-100 hostile takes 11 turns for every 10 of theirs, so roughly every
 * 10th turn they act twice in a row — on a fixed, predictable beat, no dice.
 * Ties go to the player, then to hostiles in lineup order.
 *
 * A new battle starts everyone one delay away (initTimeline), so faster
 * combatants go first and with equal speed the player does. A battle without
 * timeline data (an older save or a hand-made test state) is at the player's
 * turn, and reads as a fresh battle right after any opening hostile turns.
 */
import { getHostile } from '../data';
import { derive } from '../player';
import { turnDelay } from '../stats';
import type { BattleState, Hostile, Player } from '../types';
import { isAlive } from './battle';

export type Turn = 'player' | number;

const playerDelay = (player: Player) => turnDelay(derive(player).speed);
const hostileDelay = (inst: Hostile) => turnDelay(getHostile(inst.defId).speed);
const playerNextTime = (battle: BattleState) => battle.playerNext ?? 0;

/**
 * Time of a hostile's next turn. Without timeline data: where a fresh battle
 * would have it once the player is up (its first multiple of its delay at or
 * after the player's first turn), shifted so the player is due at 0.
 */
function hostileNextTime(player: Player, battle: BattleState, inst: Hostile): number {
  if (inst.next !== undefined) return inst.next;
  const dp = playerDelay(player);
  const dm = hostileDelay(inst);
  return playerNextTime(battle) + Math.ceil(dp / dm - 1e-9) * dm - dp;
}

/** Sets up a brand-new battle's timeline: everyone is one turn-delay away from acting. */
export function initTimeline(player: Player, battle: BattleState): void {
  battle.playerNext = playerDelay(player);
  for (const m of battle.hostiles) m.next = hostileDelay(m);
}

/** Writes any missing timeline data into the battle (see hostileNextTime) so it can be advanced. */
export function ensureTimeline(player: Player, battle: BattleState): void {
  for (const m of battle.hostiles) m.next = hostileNextTime(player, battle, m);
  battle.playerNext = playerNextTime(battle);
}

/** Who acts next: 'player' or a hostile index. */
export function nextActor(player: Player, battle: BattleState): Turn {
  let who: Turn = 'player';
  let at = playerNextTime(battle);
  battle.hostiles.forEach((m, i) => {
    if (!isAlive(m)) return;
    const t = hostileNextTime(player, battle, m);
    if (t < at) { who = i; at = t; }
  });
  return who;
}

/** Moves an actor's next turn one delay further along the timeline (call after it has had its turn). */
export function spendTurn(player: Player, battle: BattleState, who: Turn): void {
  if (who === 'player') {
    battle.playerNext = playerNextTime(battle) + playerDelay(player);
  } else {
    const m = battle.hostiles[who]!;
    m.next = hostileNextTime(player, battle, m) + hostileDelay(m);
  }
}

/**
 * The next `n` turns as things stand (ignores stuns and deaths that haven't
 * happened yet). Used by the turn-order strip in the UI.
 */
export function upcomingTurns(player: Player, battle: BattleState, n: number): Turn[] {
  const sim: BattleState = { ...battle, hostiles: battle.hostiles.map((m) => ({ ...m })) };
  ensureTimeline(player, sim);
  const out: Turn[] = [];
  for (let i = 0; i < n; i++) {
    const who = nextActor(player, sim);
    out.push(who);
    spendTurn(player, sim, who);
  }
  return out;
}
