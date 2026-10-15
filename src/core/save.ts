/**
 * Save format: `{ format: 'questforge-save', version, state }` as JSON.
 * Loading validates every id against the content tables, so a corrupt or
 * outdated save is rejected instead of crashing the game later.
 */
import { AREAS, CLASSES, ITEMS, MONSTERS } from './data';
import { SAVE_VERSION } from './game';
import { clampVitals } from './player';
import { MAX_HOSTILES, STATS } from './types';
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
  // 1 → 2: fantasy → sci-fi reskin. Same mechanics, new ids.
  1: (s) => {
    const id = (v: string) => V1_IDS[v] ?? v;
    s.clearedAreas = (s.clearedAreas ?? []).map(id);
    if (s.quest) s.quest.areaId = id(s.quest.areaId);
    if (s.battle) {
      s.battle.monster.defId = id(s.battle.monster.defId);
      for (const st of [...s.battle.monster.statuses, ...s.battle.playerStatuses]) st.id = id(st.id);
    }
    const p = s.player;
    if (p) {
      p.classId = id(p.classId);
      p.weapon = id(p.weapon);
      p.armor = id(p.armor);
      p.inventory = Object.fromEntries(Object.entries(p.inventory).map(([k, n]) => [id(k), n]));
    }
  },
  // 2 → 3: battles hold 1–3 hostiles plus a target index.
  2: (s) => {
    if (s.battle?.monster) {
      s.battle.monsters = [s.battle.monster];
      s.battle.target = 0;
      delete s.battle.monster;
    }
  },
  // 3 → 4: generic stats (pow/agi/pre/int/end/luk). Points spent in the old
  // class-coupled stats are converted to the new stats that did the same job.
  3: (s) => {
    const p = s.player;
    if (!p?.stats || !('str' in p.stats)) return;
    const base = V3_BASE_STATS[p.classId] ?? { str: 6, dex: 6, int: 6, end: 6, luk: 6 };
    const next: Record<string, number> = { pow: 5, agi: 5, pre: 5, int: 5, end: 5, luk: 5 };
    const route = V3_STAT_ROUTES[p.classId] ?? V3_STAT_ROUTES.security!;
    for (const old of ['str', 'dex', 'int', 'end', 'luk']) {
      const spent = Math.max(0, Math.round((p.stats[old] ?? 0) - (base[old] ?? 0)));
      splitPoints(spent, route[old]!, next);
    }
    // Points that weren't "spent" (starting stats above the new baseline) stay in the pool as unspent points.
    const oldTotal = ['str', 'dex', 'int', 'end', 'luk'].reduce((t, k) => t + (p.stats[k] ?? 0), 0);
    const newTotal = Object.values(next).reduce((t, v) => t + v, 0);
    p.statPoints = (p.statPoints ?? 0) + Math.max(0, oldTotal - newTotal);
    p.stats = next;
  },
};

/** v3 starting stats per class (needed to tell starting stats from spent points). */
const V3_BASE_STATS: Record<string, Record<string, number>> = {
  security: { str: 9, dex: 5, int: 2, end: 9, luk: 5 },
  science: { str: 2, dex: 5, int: 10, end: 7, luk: 6 },
  engineer: { str: 5, dex: 10, int: 2, end: 6, luk: 7 },
};

/** Where each old stat's points go, per class: [new stat, share]. Shares sum to 1. */
const V3_STAT_ROUTES: Record<string, Record<string, [string, number][]>> = {
  // Security: strength was its damage stat; dexterity gave accuracy and evasion.
  security: { str: [['pow', 1]], dex: [['pre', 0.5], ['agi', 0.5]], int: [['int', 1]], end: [['end', 1]], luk: [['luk', 1]] },
  // Science: intellect was both its damage and its energy.
  science: { str: [['pow', 1]], dex: [['pre', 0.5], ['agi', 0.5]], int: [['pow', 0.5], ['int', 0.5]], end: [['end', 1]], luk: [['luk', 1]] },
  // Engineer: dexterity was its damage, accuracy and evasion.
  engineer: { str: [['pow', 1]], dex: [['pow', 0.5], ['pre', 0.25], ['agi', 0.25]], int: [['int', 1]], end: [['end', 1]], luk: [['luk', 1]] },
};

/** Splits `points` by shares, rounding down and handing leftovers out in route order. Never loses a point. */
function splitPoints(points: number, route: [string, number][], into: Record<string, number>) {
  let left = points;
  for (const [stat, share] of route) {
    const n = Math.floor(points * share);
    into[stat]! += n;
    left -= n;
  }
  for (let i = 0; left > 0; i = (i + 1) % route.length, left--) into[route[i]![0]]! += 1;
}

/** Old (v1) content ids → current ids. Ids only appear in saves as classes, items, areas, monsters and statuses. */
const V1_IDS: Record<string, string> = {
  warrior: 'security', mage: 'science', rogue: 'engineer',
  greenwood: 'veridia', ashen_caves: 'kethra', frostpeak: 'glacies', shadow_keep: 'void_rift',
  poison: 'corrode', guard: 'shield',
  training_sword: 'sidearm_mk1', apprentice_staff: 'sonic_emitter', rusty_dagger: 'mag_wrench',
  iron_sword: 'gauss_pistol', flame_blade: 'plasma_pistol', frost_edge: 'cryo_carbine', venom_fang: 'corrosive_needler',
  storm_spear: 'ion_lance', sunsteel_mace: 'photon_rifle', dragonfang: 'plasma_cannon',
  glacier_greatsword: 'stasis_projector', dawnbringer: 'nova_rifle', voidreaver: 'singularity_edge',
  tunic: 'duty_uniform', leather_armor: 'field_jacket', chainmail: 'composite_vest',
  emberweave_robe: 'thermal_envirosuit', frostguard_mail: 'arctic_hardsuit', radiant_plate: 'aegis_power_armor',
  health_potion: 'medkit', mana_potion: 'energy_cell', greater_health_potion: 'trauma_kit',
  antidote: 'detox_injector', elixir: 'nano_restorer',
  green_slime: 'protoplasm', forest_wolf: 'razorback_hound', bandit: 'raider', thornback_boar: 'thornhide_behemoth',
  cave_bat: 'cave_glider', fire_imp: 'plasma_sprite', skeleton: 'nanite_husk', magma_golem: 'magma_colossus',
  ice_wyrmling: 'frost_serpent', yeti: 'tundra_brute', frost_wraith: 'cryo_phantom',
  shade: 'void_shade', dark_knight: 'rift_marauder', vampire: 'void_leech', hollow_king: 'hollow_admiral',
};

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
  if (s.quest?.patrol !== undefined && !isInt(s.quest.patrol?.level, 1)) return 'bad patrol';
  if (s.mode === 'battle') {
    const b = s.battle;
    if (!Array.isArray(b?.monsters) || b.monsters.length < 1 || b.monsters.length > MAX_HOSTILES) return 'bad battle';
    for (const m of b.monsters) {
      if (!(m?.defId in MONSTERS) || !isInt(m.hp) || !isInt(m.maxHp, 1) || m.hp > m.maxHp || !Array.isArray(m.statuses)) return 'bad hostile';
      if (m.level !== undefined && !isInt(m.level, 1)) return 'bad hostile level';
      for (const k of ['power', 'reward'] as const) {
        if (m[k] !== undefined && !(typeof m[k] === 'number' && Number.isFinite(m[k]) && m[k] > 0)) return `bad hostile ${k}`;
      }
    }
    if (!isInt(b.target) || b.target >= b.monsters.length || b.monsters[b.target].hp <= 0) return 'bad target';
  }
  return null;
}
