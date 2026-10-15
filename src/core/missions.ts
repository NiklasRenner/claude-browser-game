/**
 * Mission flow inside the reducer: starting fights (story missions and
 * patrols), resolving a battle round, and what winning or losing does
 * (rewards, mission completion, defeat penalty).
 */
import { beginBattle, runRound } from './combat';
import type { PlayerAct } from './combat';
import { FINAL_AREA, getArea, getMonster } from './data';
import { addItem, derive, grantXp } from './player';
import { PATROL_CONTACTS, patrolBoss, patrolContact, patrolReward } from './patrol';
import type { Rng } from './rng';
import { ENERGY_RECOVERY } from './stats';
import type { GameEvent, GameState, QuestState } from './types';

const DEFEAT_GOLD_PENALTY = 0.1;

/** Regular encounters before the boss on this quest. */
export function questEncounters(quest: QuestState): number {
  return quest.patrol ? PATROL_CONTACTS : getArea(quest.areaId).encounters;
}

export function leaveQuest(state: GameState) {
  state.quest = null;
  state.battle = null;
  state.mode = 'town';
}

export function startNextBattle(state: GameState, rng: Rng, events: GameEvent[]) {
  const quest = state.quest!;
  const area = getArea(quest.areaId);
  const isBoss = quest.cleared >= questEncounters(quest);
  if (quest.patrol) {
    const monsters = isBoss ? patrolBoss(area.id, quest.patrol.level, rng) : patrolContact(area.id, quest.patrol.level, rng);
    state.battle = { monsters, target: 0, playerStatuses: [], round: 1 };
    state.mode = 'battle';
    events.push({ type: 'battleStart', monsterIds: monsters.map((m) => m.defId), boss: isBoss });
    openBattle(state, rng, events);
    return;
  }
  let lineup: string[];
  if (isBoss) {
    // Escorts flank the boss: [add, boss, add].
    const adds = area.bossAdds ?? [];
    lineup = adds.length ? [adds[0]!, area.boss, ...adds.slice(1)] : [area.boss];
  } else {
    lineup = area.groups ? [...rng.pick(area.groups)] : [rng.pick(area.monsters)];
  }
  state.battle = {
    monsters: lineup.map((defId) => {
      const def = getMonster(defId);
      return { defId, hp: def.hp, maxHp: def.hp, statuses: [] };
    }),
    target: 0,
    playerStatuses: [],
    round: 1,
  };
  state.mode = 'battle';
  events.push({ type: 'battleStart', monsterIds: lineup, boss: isBoss });
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
  const quest = state.quest!;
  // Rewards from every hostile in the fight (rolled in lineup order).
  const lineup = state.battle!.monsters;
  const defs = lineup.map((m) => getMonster(m.defId));
  let gold = 0;
  let xp = 0;
  const drops: string[] = [];
  for (const [i, monster] of defs.entries()) {
    const scale = lineup[i]!.reward; // patrol hostiles only; missions use the plain numbers
    const rolled = rng.int(...monster.gold);
    gold += Math.round(scale === undefined ? rolled : rolled * scale);
    xp += scale === undefined ? monster.xp : Math.round(monster.xp * scale);
    for (const drop of monster.drops ?? []) {
      if (rng.chance(drop.chance)) {
        addItem(player, drop.itemId);
        drops.push(drop.itemId);
      }
    }
  }
  player.gold += gold;
  quest.cleared += 1;
  quest.earnedXp += xp;
  quest.earnedGold += gold;
  state.stats.battlesWon += 1;
  state.battle = null;
  events.push({ type: 'victory', xp, gold, drops });
  // Catch your breath: some energy comes back after every won fight.
  const recovered = Math.min(Math.round(derive(player).maxMp * ENERGY_RECOVERY), derive(player).maxMp - player.mp);
  if (recovered > 0) {
    player.mp += recovered;
    events.push({ type: 'heal', actor: 'player', amount: 0, mana: recovered });
  }
  grantXp(player, xp, events);

  if (!defs.some((m) => m.boss)) {
    state.mode = 'quest';
    return;
  }
  const area = getArea(quest.areaId);
  if (quest.patrol) {
    const reward = patrolReward(quest.patrol.level);
    player.gold += reward.gold;
    events.push({ type: 'patrolComplete', areaId: area.id, level: quest.patrol.level, ...reward });
    grantXp(player, reward.xp, events);
    leaveQuest(state);
    return;
  }
  const firstClear = !state.clearedAreas.includes(area.id);
  player.gold += area.reward.gold;
  events.push({ type: 'questComplete', areaId: area.id, xp: area.reward.xp, gold: area.reward.gold, firstClear });
  grantXp(player, area.reward.xp, events);
  if (firstClear) {
    state.clearedAreas.push(area.id);
    if (area.id === FINAL_AREA) events.push({ type: 'gameComplete' });
  }
  leaveQuest(state);
}

function onDefeat(state: GameState, events: GameEvent[]) {
  const player = state.player!;
  const goldLost = Math.floor(player.gold * DEFEAT_GOLD_PENALTY);
  player.gold -= goldLost;
  player.hp = 0;
  state.stats.battlesLost += 1;
  state.battle = null;
  state.quest = null;
  state.mode = 'defeated';
  events.push({ type: 'defeat', goldLost });
}
