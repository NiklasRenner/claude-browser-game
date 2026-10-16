/**
 * Save format: `{ format: 'starward-save', version, state }` as JSON.
 * Loading validates every id against the content tables, so a corrupt or
 * outdated save is rejected instead of crashing the game later.
 */
import { MISSIONS, DIVISIONS, ITEMS, HOSTILES } from './data';
import { SAVE_VERSION } from './game';
import { checkDrill } from './drill';
import { clampVitals } from './player';
import { MAX_HOSTILES, STATS } from './types';
import type { GameState } from './types';

const FORMAT = 'starward-save';

export function serialize(state: GameState): string {
  return JSON.stringify({ format: FORMAT, version: SAVE_VERSION, state });
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; error: string };

/**
 * Upgrades older save versions in place: add `MIGRATIONS[n] = (state) => …`
 * to turn a version-n save into version n+1 when you bump SAVE_VERSION.
 * (History was reset at version 1 when the internal names were cleaned up.)
 */
const MIGRATIONS: Record<number, (state: any) => void> = {};

export function deserialize(text: string): LoadResult {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Save data is not valid JSON' };
  }
  if (parsed?.format !== FORMAT || typeof parsed.version !== 'number' || typeof parsed.state !== 'object') {
    return { ok: false, error: 'Not a Starward save file' };
  }
  if (parsed.version > SAVE_VERSION) return { ok: false, error: 'Save is from a newer version of the game' };
  const state = parsed.state;
  for (let v = parsed.version; v < SAVE_VERSION; v++) MIGRATIONS[v]?.(state);
  state.version = SAVE_VERSION;

  const problem = validateState(state);
  if (problem) return { ok: false, error: `Corrupt save: ${problem}` };
  if (state.player) clampVitals(state.player);
  return { ok: true, state };
}

const isInt = (v: unknown, min = 0) => Number.isInteger(v) && (v as number) >= min;

function validateState(s: any): string | null {
  if (!['title', 'ship', 'mission', 'battle', 'defeated'].includes(s.mode)) return 'bad mode';
  if (!isInt(s.rng)) return 'bad rng';
  if (!Array.isArray(s.clearedMissions) || !s.clearedMissions.every((a: string) => a in MISSIONS)) return 'bad cleared missions';
  if (s.mode !== 'title' && !s.player) return 'missing player';
  const p = s.player;
  if (p) {
    if (!(p.divisionId in DIVISIONS)) return 'bad class';
    if (!isInt(p.level, 1) || !isInt(p.xp) || !isInt(p.credits) || !isInt(p.statPoints)) return 'bad player numbers';
    if (!isInt(p.hp) || !isInt(p.energy)) return 'bad vitals';
    if (!STATS.every((k) => isInt(p.stats?.[k]))) return 'bad stats';
    if (typeof p.inventory !== 'object' || p.inventory === null) return 'bad inventory';
    for (const [id, n] of Object.entries(p.inventory)) if (!(id in ITEMS) || !isInt(n, 1)) return `bad item ${id}`;
    if (ITEMS[p.weapon]?.kind !== 'weapon' || !p.inventory[p.weapon]) return 'bad weapon';
    if (ITEMS[p.armor]?.kind !== 'armor' || !p.inventory[p.armor]) return 'bad armor';
  }
  if ((s.mode === 'mission' || s.mode === 'battle') && !(s.mission?.missionId in MISSIONS)) return 'bad mission';
  if (s.mission?.patrol !== undefined && !isInt(s.mission.patrol?.level, 1)) return 'bad patrol';
  if (s.mission?.drill !== undefined && checkDrill(s.mission.drill?.hostileIds)) return 'bad drill';
  if (s.mode === 'battle') {
    const b = s.battle;
    if (!Array.isArray(b?.hostiles) || b.hostiles.length < 1 || b.hostiles.length > MAX_HOSTILES) return 'bad battle';
    for (const m of b.hostiles) {
      if (!(m?.defId in HOSTILES) || !isInt(m.hp) || !isInt(m.maxHp, 1) || m.hp > m.maxHp || !Array.isArray(m.statuses)) return 'bad hostile';
      if (m.level !== undefined && !isInt(m.level, 1)) return 'bad hostile level';
      if (m.next !== undefined && !(typeof m.next === 'number' && Number.isFinite(m.next) && m.next >= 0)) return 'bad hostile timeline';
      for (const k of ['power', 'reward'] as const) {
        if (m[k] !== undefined && !(typeof m[k] === 'number' && Number.isFinite(m[k]) && m[k] > 0)) return `bad hostile ${k}`;
      }
    }
    if (b.playerNext !== undefined && !(typeof b.playerNext === 'number' && Number.isFinite(b.playerNext) && b.playerNext >= 0)) return 'bad timeline';
    if (!isInt(b.target) || b.target >= b.hostiles.length || b.hostiles[b.target].hp <= 0) return 'bad target';
  }
  return null;
}
