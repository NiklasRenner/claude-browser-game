/**
 * Combat drills: a single fight against any hostiles you pick (1–3), on the
 * world they come from. A simulation for practice and testing: no rewards, no
 * losses, and HP and energy are restored when it ends (win, lose or beam out).
 */
import { MISSION_ORDER, bossLevel, getHostile, getMission } from './data';
import { MAX_HOSTILES } from './types';
import type { Hostile } from './types';

/** Every hostile, grouped by the world it lives on (story order; each hostile listed once). */
export function drillRoster(): { missionId: string; hostileIds: string[] }[] {
  const seen = new Set<string>();
  return MISSION_ORDER.map((missionId) => {
    const m = getMission(missionId);
    const ids = [...m.hostiles, ...(m.groups ?? []).flat(), ...(m.bossAdds ?? []), m.boss].filter((id) => !seen.has(id) && seen.add(id));
    return { missionId, hostileIds: ids };
  });
}

/** The world a hostile lives on (its backdrop in a drill), or undefined for an unknown id. */
export function drillWorld(defId: string): string | undefined {
  return drillRoster().find((w) => w.hostileIds.includes(defId))?.missionId;
}

/** Why this lineup can't be drilled, or null if it can. */
export function checkDrill(hostileIds: unknown): string | null {
  if (!Array.isArray(hostileIds) || hostileIds.length < 1 || hostileIds.length > MAX_HOSTILES) return `Pick 1–${MAX_HOSTILES} hostiles`;
  return hostileIds.every((id) => typeof id === 'string' && drillWorld(id) !== undefined) ? null : 'Unknown hostile';
}

/** A hostile as it fights in a drill: its own stats; a boss at the level it has in its story mission. */
export function drillHostile(defId: string): Hostile {
  const def = getHostile(defId);
  const hostile: Hostile = { defId, hp: def.hp, maxHp: def.hp, statuses: [] };
  if (def.boss) hostile.level = bossLevel(getMission(drillWorld(defId)!));
  return hostile;
}
