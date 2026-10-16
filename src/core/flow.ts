/**
 * Mission flow inside the reducer: starting fights (story missions and
 * patrols, drills), resolving a battle round, and what winning or losing does
 * (rewards, mission completion, defeat penalty).
 */
import { beginBattle, freshHostile, runRound } from './combat';
import type { PlayerAct } from './combat';
import { bossLevel, FINAL_MISSION, getHostile, getMission } from './data';
import { drillHostile } from './drill';
import { addItem, derive, fullRestore, grantXp } from './player';
import { PATROL_CONTACTS, patrolBoss, patrolContact, patrolReward } from './patrol';
import type { Rng } from './rng';
import { DEFEAT_CREDITS_PENALTY, ENERGY_RECOVERY } from './stats';
import type { GameEvent, GameState, Hostile, MissionDef, MissionRun } from './types';

/**
 * A run starting on a world: a story mission, or with `patrol` / `drill` set, one of those.
 * Where the three differ: lineupFor (who you fight), missionEncounters (how many fights),
 * onVictory / onDefeat (what winning and losing do).
 */
export function newRun(missionId: string, kind: Pick<MissionRun, 'patrol' | 'drill'> = {}): MissionRun {
  return { missionId, ...kind, cleared: 0, earnedXp: 0, earnedCredits: 0 };
}

/** Regular encounters before the boss on this run. */
export function missionEncounters(run: MissionRun): number {
  return run.patrol ? PATROL_CONTACTS : getMission(run.missionId).encounters;
}

export function leaveMission(state: GameState) {
  state.mission = null;
  state.battle = null;
  state.mode = 'ship';
}

/**
 * A lineup as it stands in the fight: in a lineup of three, a boss takes the middle, flanked by the
 * others (in their order). The scene draws hostiles left to right in this order, which is also the
 * target list's.
 */
function bossInMiddle<T extends { defId: string }>(lineup: T[]): T[] {
  const i = lineup.findIndex((h) => getHostile(h.defId).boss);
  if (lineup.length !== 3 || i < 0 || i === 1) return lineup;
  const rest = lineup.filter((_, k) => k !== i);
  return [rest[0]!, lineup[i]!, rest[1]!];
}

/** Starts the run's next fight: its regular encounters, then (once they're cleared) the boss fight. */
export function startNextBattle(state: GameState, rng: Rng, events: GameEvent[]) {
  const run = state.mission!;
  const hostiles = bossInMiddle(lineupFor(run, run.cleared >= missionEncounters(run), rng));
  state.battle = { hostiles, target: 0, playerStatuses: [], round: 1 };
  state.mode = 'battle';
  events.push({ type: 'battleStart', hostileIds: hostiles.map((h) => h.defId), boss: hostiles.some((h) => getHostile(h.defId).boss) });
  openBattle(state, rng, events);
}

/** Who the run's next fight is against: drills fight the picked lineup, patrols scaled hostiles, missions their own. */
function lineupFor(run: MissionRun, isBoss: boolean, rng: Rng): Hostile[] {
  if (run.drill) return run.drill.hostileIds.map(drillHostile);
  if (run.patrol) return (isBoss ? patrolBoss : patrolContact)(run.missionId, run.patrol.level, rng);
  return storyLineup(getMission(run.missionId), isBoss, rng);
}

/** A story mission's fight: a random group (or single hostile) from its pool, or the boss between its escorts. */
function storyLineup(mission: MissionDef, isBoss: boolean, rng: Rng): Hostile[] {
  const adds = mission.bossAdds ?? [];
  const ids = !isBoss ? (mission.groups ? rng.pick(mission.groups) : [rng.pick(mission.hostiles)])
    : adds.length ? [adds[0]!, mission.boss, ...adds.slice(1)] : [mission.boss];
  // Story bosses fight at the mission's boss level (recommended level + 1 by default).
  return ids.map((defId) => freshHostile(defId, getHostile(defId).boss ? bossLevel(mission) : undefined));
}

/** Lets faster hostiles take their opening turns before the player's first one. */
function openBattle(state: GameState, rng: Rng, events: GameEvent[]) {
  const outcome = beginBattle(state.player!, state.battle!, rng, events);
  if (outcome === 'playerDied') onDefeat(state, events);
}

/** `act` = the player's action for this round, or null if the turn was lost (failed flee). */
export function resolveBattleRound(
  state: GameState, rng: Rng, events: GameEvent[], act: PlayerAct,
) {
  const outcome = runRound(state.player!, state.battle!, rng, events, act);
  if (outcome === 'allDown') onVictory(state, rng, events);
  else if (outcome === 'playerDied') onDefeat(state, events);
}

/** Ends a combat drill: back aboard, fully restored, nothing gained or lost. */
export function endDrill(state: GameState, events: GameEvent[], outcome: 'won' | 'lost' | 'ended') {
  fullRestore(state.player!);
  leaveMission(state);
  events.push({ type: 'drillEnded', outcome });
}

function onVictory(state: GameState, rng: Rng, events: GameEvent[]) {
  const player = state.player!;
  const run = state.mission!;
  if (run.drill) { endDrill(state, events, 'won'); return; }
  // Rewards from every hostile in the fight (rolled in lineup order).
  const lineup = state.battle!.hostiles;
  const defs = lineup.map((m) => getHostile(m.defId));
  let credits = 0;
  let xp = 0;
  const drops: string[] = [];
  for (const [i, hostile] of defs.entries()) {
    const scale = lineup[i]!.reward; // patrol hostiles only; missions use the plain numbers
    const rolled = rng.int(...hostile.credits);
    credits += Math.round(scale === undefined ? rolled : rolled * scale);
    xp += scale === undefined ? hostile.xp : Math.round(hostile.xp * scale);
    for (const drop of hostile.drops ?? []) {
      if (rng.chance(drop.chance)) {
        addItem(player, drop.itemId);
        drops.push(drop.itemId);
      }
    }
  }
  player.credits += credits;
  run.cleared += 1;
  run.earnedXp += xp;
  run.earnedCredits += credits;
  state.stats.battlesWon += 1;
  state.battle = null;
  events.push({ type: 'victory', xp, credits: credits, drops });
  // Catch your breath: some energy comes back after every won fight.
  const recovered = Math.min(Math.round(derive(player).maxEnergy * ENERGY_RECOVERY), derive(player).maxEnergy - player.energy);
  if (recovered > 0) {
    player.energy += recovered;
    events.push({ type: 'heal', actor: 'player', amount: 0, energy: recovered });
  }
  grantXp(player, xp, events);

  if (!defs.some((m) => m.boss)) {
    state.mode = 'mission';
    return;
  }
  const mission = getMission(run.missionId);
  if (run.patrol) {
    const reward = patrolReward(run.patrol.level);
    player.credits += reward.credits;
    events.push({ type: 'patrolComplete', missionId: mission.id, level: run.patrol.level, ...reward });
    grantXp(player, reward.xp, events);
    leaveMission(state);
    return;
  }
  const firstClear = !state.clearedMissions.includes(mission.id);
  player.credits += mission.reward.credits;
  events.push({ type: 'missionComplete', missionId: mission.id, xp: mission.reward.xp, credits: mission.reward.credits, firstClear });
  grantXp(player, mission.reward.xp, events);
  if (firstClear) {
    state.clearedMissions.push(mission.id);
    if (mission.id === FINAL_MISSION) events.push({ type: 'gameComplete' });
  }
  leaveMission(state);
}

function onDefeat(state: GameState, events: GameEvent[]) {
  if (state.mission?.drill) { endDrill(state, events, 'lost'); return; }
  const player = state.player!;
  const creditsLost = Math.floor(player.credits * DEFEAT_CREDITS_PENALTY);
  player.credits -= creditsLost;
  player.hp = 0;
  state.stats.battlesLost += 1;
  state.battle = null;
  state.mission = null;
  state.mode = 'defeated';
  events.push({ type: 'defeat', creditsLost: creditsLost });
}
