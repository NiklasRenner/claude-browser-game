/**
 * Save format: `{ format: 'questforge-save', version, state }` as JSON.
 * Loading validates every id against the content tables, so a corrupt or
 * outdated save is rejected instead of crashing the game later.
 */
import { AREAS, CLASSES, ITEMS, MONSTERS } from './data';
import { SAVE_VERSION } from './game';
import { clampVitals } from './player';
import { STATS } from './types';
import type { GameState } from './types';

const FORMAT = 'questforge-save';

export function serialize(state: GameState): string {
  return JSON.stringify({ format: FORMAT, version: SAVE_VERSION, state });
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; error: string };

/** Upgrades older save versions in place. Add a case per version bump. */
const MIGRATIONS: Record<number, (state: any) => void> = {
  // 0 → 1 example: version 0 did not track run statistics.
  0: (s) => {
    s.stats ??= { battlesWon: 0, battlesLost: 0, actions: 0 };
  },
};

export function deserialize(text: string): LoadResult {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Save data is not valid JSON' };
  }
  if (parsed?.format !== FORMAT || typeof parsed.version !== 'number' || typeof parsed.state !== 'object') {
    return { ok: false, error: 'Not a QuestForge save' };
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
  if (!['title', 'town', 'quest', 'battle', 'defeated'].includes(s.mode)) return 'bad mode';
  if (!isInt(s.rng)) return 'bad rng';
  if (!Array.isArray(s.clearedAreas) || !s.clearedAreas.every((a: string) => a in AREAS)) return 'bad cleared areas';
  if (s.mode !== 'title' && !s.player) return 'missing player';
  const p = s.player;
  if (p) {
    if (!(p.classId in CLASSES)) return 'bad class';
    if (!isInt(p.level, 1) || !isInt(p.xp) || !isInt(p.gold) || !isInt(p.statPoints)) return 'bad player numbers';
    if (!isInt(p.hp) || !isInt(p.mp)) return 'bad vitals';
    if (!STATS.every((k) => isInt(p.stats?.[k]))) return 'bad stats';
    if (typeof p.inventory !== 'object' || p.inventory === null) return 'bad inventory';
    for (const [id, n] of Object.entries(p.inventory)) if (!(id in ITEMS) || !isInt(n, 1)) return `bad item ${id}`;
    if (ITEMS[p.weapon]?.kind !== 'weapon' || !p.inventory[p.weapon]) return 'bad weapon';
    if (ITEMS[p.armor]?.kind !== 'armor' || !p.inventory[p.armor]) return 'bad armor';
  }
  if ((s.mode === 'quest' || s.mode === 'battle') && !(s.quest?.areaId in AREAS)) return 'bad quest';
  if (s.mode === 'battle' && !(s.battle?.monster?.defId in MONSTERS)) return 'bad battle';
  return null;
}
