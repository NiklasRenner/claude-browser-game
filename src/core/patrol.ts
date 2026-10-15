/**
 * Patrols: random runs on an unlocked world. Hostiles come from that world's
 * pool but are scaled to the patrol level (the player's level when it starts),
 * so patrols stay a fair fight at any level — including after the finale.
 *
 * Shape: PATROL_CONTACTS regular encounters (1–3 hostiles each), then the
 * world's priority target (scaled a bit above the patrol level), sometimes
 * with escorts.
 */
import { MISSION_ORDER, getMission, getHostile } from './data';
import type { Rng } from './rng';
import type { GameState, Hostile } from './types';

export const PATROL_CONTACTS = 4;

/**
 * How hostile HP and damage grow with level, fitted to the story content
 * (roughly linear: HP ≈ 20 + 6·level, damage ≈ 3.5 + 1.15·level). Scaling a
 * hostile from its own level to the patrol level multiplies by the ratio, so
 * an L6 hostile at L12 is about as tough as a typical L12 hostile.
 */
const hpCurve = (level: number) => 20 + 6 * level;
const dmgCurve = (level: number) => 3.5 + 1.15 * level;

/** Pack members are individually weaker so a pack of 3 isn't 3× as dangerous. Index = pack size. */
const PACK_HP = [1, 1, 0.8, 0.68];
const PACK_POWER = [1, 1, 0.75, 0.6];

/** Patrol bosses fight at your level early on, one above once you're seasoned (level 12+). */
const patrolBossLevel = (level: number) => (level >= 12 ? level + 1 : level);

/** Bonus on defeating the patrol's priority target (patrols are repeatable, so below story rewards). */
export function patrolReward(level: number): { xp: number; credits: number } {
  return { xp: Math.round(1.5 * level * level), credits: Math.round(2 * level * level) };
}

/** Story bosses pay out a one-off fortune; a repeatable patrol boss pays a fraction of it. */
const PATROL_BOSS_REWARD = 0.3;

/** A hostile scaled to `level`, as one of `packSize` in its lineup. */
export function scaledHostile(defId: string, level: number, packSize: number): Hostile {
  const def = getHostile(defId);
  const hpMult = (hpCurve(level) / hpCurve(def.level)) * PACK_HP[packSize]!;
  const hp = Math.max(1, Math.round(def.hp * hpMult));
  return {
    defId,
    hp,
    maxHp: hp,
    statuses: [],
    level,
    power: Math.round((dmgCurve(level) / dmgCurve(def.level)) * PACK_POWER[packSize]! * 1000) / 1000,
    reward: Math.round(hpMult * 1000) / 1000,
  };
}

/** Worlds the player may patrol: any mission that is unlocked. */
export function patrolWorlds(state: GameState): string[] {
  return MISSION_ORDER.filter((id) => {
    const mission = getMission(id);
    return !mission.requires || state.clearedMissions.includes(mission.requires);
  });
}

/** Lineup for a regular patrol contact. */
export function patrolContact(missionId: string, level: number, rng: Rng): Hostile[] {
  const pool = getMission(missionId).hostiles;
  // Mostly singles and pairs; packs of three are rarer and never the very first contact at level 1–2.
  const roll = rng.int(1, 100);
  const size = roll <= 45 ? 1 : roll <= 80 ? 2 : level >= 3 ? 3 : 2;
  const ids = Array.from({ length: size }, () => rng.pick(pool));
  return ids.map((id) => scaledHostile(id, level, size));
}

/** Lineup for the patrol's final fight: the world's boss, from level 8 sometimes with escorts. */
export function patrolBoss(missionId: string, level: number, rng: Rng): Hostile[] {
  const mission = getMission(missionId);
  const bossLevel = patrolBossLevel(level);
  const escorts = level >= 8 && rng.chance(50) ? (level >= 14 ? 2 : 1) : 0;
  const boss = scaledHostile(mission.boss, bossLevel, 1);
  boss.reward = Math.round(boss.reward! * PATROL_BOSS_REWARD * 1000) / 1000;
  if (escorts === 0) return [boss];
  const adds = Array.from({ length: escorts }, () => scaledHostile(rng.pick(mission.hostiles), level, escorts + 1));
  // Escorts flank the boss, like story bosses.
  return [adds[0]!, boss, ...adds.slice(1)];
}
