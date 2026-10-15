/**
 * Turn sequencing. The reducer calls `beginBattle` when a fight starts and
 * `runRound` for every player action; both play hostile turns (in timeline
 * order) until it's the player's turn again or one side is down. A stunned
 * player's turn is skipped automatically, so the UI only ever asks for input
 * when the player can actually act.
 */
import { getMonster } from '../data';
import { derive } from '../player';
import type { Rng } from '../rng';
import type { BattleState, Element, GameEvent, Player } from '../types';
import { allDown, damageHostile, endTurn, fixTarget, hasStatus, isAlive, tickDots } from './battle';
import type { Ctx } from './battle';
import { hostileAct } from './actions';
import { monsterDamageTaken } from './formulas';
import { ensureTimeline, initTimeline, nextActor, spendTurn } from './timeline';

export type TurnOutcome = 'continue' | 'allDown' | 'playerDied';

/** A player action; null = the turn is lost (e.g. a failed escape). */
export type PlayerAct = ((ctx: Ctx) => void) | null;

/** Start of a battle: sets up the timeline; hostiles faster than the player act before the player's first turn. */
export function beginBattle(player: Player, battle: BattleState, rng: Rng, events: GameEvent[]): TurnOutcome {
  initTimeline(player, battle);
  return advance({ player, battle, rng, events });
}

/** Runs the player's action, ends their turn, then plays out the timeline until the player can act again. */
export function runRound(player: Player, battle: BattleState, rng: Rng, events: GameEvent[], act: PlayerAct): TurnOutcome {
  const ctx: Ctx = { player, battle, rng, events };
  ensureTimeline(player, battle);
  const atStart = new Set(battle.playerStatuses);
  act?.(ctx);
  endTurn(battle.playerStatuses, atStart, 'player', events);
  spendTurn(player, battle, 'player');
  if (allDown(battle)) return 'allDown';
  fixTarget(battle, events);
  return advance(ctx);
}

/** Plays hostile turns (and auto-skips stunned player turns) until the player can act. */
function advance(ctx: Ctx): TurnOutcome {
  const { player, battle, events } = ctx;
  // Safety cap: chained stuns can never loop forever.
  for (let guard = 0; guard < 200; guard++) {
    if (allDown(battle)) return 'allDown';
    const who = nextActor(player, battle);
    if (who === 'player') {
      if (playerTurnStarts(ctx)) return 'continue';
      if (player.hp <= 0) return 'playerDied';
      continue;
    }
    hostileTurn(ctx, who);
    if (player.hp <= 0) return 'playerDied';
    if (allDown(battle)) return 'allDown';
    fixTarget(battle, events);
  }
  return 'continue';
}

/** Start of the player's turn: damage over time, then stun. Returns true if the player gets to act. */
function playerTurnStarts({ player, battle, events }: Ctx): boolean {
  battle.round += 1;
  const atStart = new Set(battle.playerStatuses);
  const taken = (el: Element) => derive(player).damageTaken[el];
  player.hp = Math.max(0, player.hp - tickDots(battle.playerStatuses, 'player', taken, events));
  if (player.hp <= 0) return false;
  if (!hasStatus(battle.playerStatuses, 'stun')) return true;
  events.push({ type: 'stunned', actor: 'player' });
  endTurn(battle.playerStatuses, atStart, 'player', events);
  spendTurn(player, battle, 'player');
  return false;
}

/** One hostile's turn: damage over time, then stun or attack. */
function hostileTurn(ctx: Ctx, foe: number): void {
  const { player, battle, events } = ctx;
  const m = battle.monsters[foe]!;
  const def = getMonster(m.defId);
  spendTurn(player, battle, foe);
  const atStart = new Set(m.statuses);
  damageHostile(ctx, foe, tickDots(m.statuses, 'monster', (el) => monsterDamageTaken(def, el), events, foe));
  if (!isAlive(m)) return;
  if (hasStatus(m.statuses, 'stun')) events.push({ type: 'stunned', actor: 'monster', foe });
  else hostileAct(ctx, foe);
  endTurn(m.statuses, atStart, 'monster', events, foe);
}
