/**
 * Mission flow inside the reducer: starting fights (story missions and
 * patrols), resolving a battle round, and what winning or losing does
 * (rewards, mission completion, defeat penalty).
 */
import { beginBattle, runRound } from './combat';
import type { PlayerAct } from './combat';
import { bossLevel, FINAL_MISSION, getHostile, getMission } from './data';
import { addItem, derive, grantXp } from './player';
import { PATROL_CONTACTS, patrolBoss, patrolContact, patrolReward } from './patrol';
import type { Rng } from './rng';
import { ENERGY_RECOVERY } from './stats';
import type { GameEvent, GameState, MissionRun } from './types';

const DEFEAT_CREDITS_PENALTY = 0.1;

/** Regular encounters before the boss on this run. */
export function missionEncounters(run: MissionRun): number {
  return run.patrol ? PATROL_CONTACTS : getMission(run.missionId).encounters;
}

export function leaveMission(state: GameState) {
  state.mission = null;
  state.battle = null;
  state.mode = 'ship';
}

export function startNextBattle(state: GameState, rng: Rng, events: GameEvent[]) {
  const run = state.mission!;
  const mission = getMission(run.missionId);
  const isBoss = run.cleared >= missionEncounters(run);
  if (run.patrol) {
    const hostiles = isBoss ? patrolBoss(mission.id, run.patrol.level, rng) : patrolContact(mission.id, run.patrol.level, rng);
    state.battle = { hostiles: hostiles, target: 0, playerStatuses: [], round: 1 };
    state.mode = 'battle';
    events.push({ type: 'battleStart', hostileIds: hostiles.map((m) => m.defId), boss: isBoss });
    openBattle(state, rng, events);
    return;
  }
  let lineup: string[];
  if (isBoss) {
    // Escorts flank the boss: [add, boss, add].
    const adds = mission.bossAdds ?? [];
    lineup = adds.length ? [adds[0]!, mission.boss, ...adds.slice(1)] : [mission.boss];
  } else {
    lineup = mission.groups ? [...rng.pick(mission.groups)] : [rng.pick(mission.hostiles)];
  }
  state.battle = {
    hostiles: lineup.map((defId) => {
      const def = getHostile(defId);
      // Story bosses fight at the mission's boss level (recommended level + 1 by default).
      return def.boss ? { defId, hp: def.hp, maxHp: def.hp, statuses: [], level: bossLevel(mission) } : { defId, hp: def.hp, maxHp: def.hp, statuses: [] };
    }),
    target: 0,
    playerStatuses: [],
    round: 1,
  };
  state.mode = 'battle';
  events.push({ type: 'battleStart', hostileIds: lineup, boss: isBoss });
  openBattle(state, rng, events);
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

function onVictory(state: GameState, rng: Rng, events: GameEvent[]) {
  const player = state.player!;
  const run = state.mission!;
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
