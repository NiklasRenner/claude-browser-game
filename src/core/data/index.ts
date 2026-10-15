import { MAX_HOSTILES } from '../types';
import type { Element, StatusId, MissionDef, ArmorDef, DivisionDef, DivisionId, ConsumableDef, ItemDef, HostileDef, AbilityDef, WeaponDef } from '../types';
import { MISSIONS, MISSION_ORDER } from './missions';
import { DIVISIONS } from './divisions';
import { ITEMS, QUARTERMASTER_STOCK } from './items';
import { HOSTILES } from './hostiles';
import { ABILITIES } from './abilities';
import { ELEMENT_EFFECTS } from './effects';

export { MISSIONS, MISSION_ORDER, DIVISIONS, ITEMS, HOSTILES, QUARTERMASTER_STOCK, ABILITIES };
export { FINAL_MISSION } from './missions';
export { ELEMENT_EFFECTS, STATUS_INFO } from './effects';

function lookup<T>(table: Record<string, T>, id: string, what: string): T {
  const value = table[id];
  if (value === undefined) throw new Error(`Unknown ${what}: ${id}`);
  return value;
}

export const getItem = (id: string): ItemDef => lookup(ITEMS, id, 'item');
export const getHostile = (id: string): HostileDef => lookup(HOSTILES, id, 'hostile');
export const getAbility = (id: string): AbilityDef => lookup(ABILITIES, id, 'ability');
export const getMission = (id: string): MissionDef => lookup(MISSIONS, id, 'mission');
export const getDivision = (id: DivisionId): DivisionDef => lookup(DIVISIONS, id, 'class');

export function getWeapon(id: string): WeaponDef {
  const item = getItem(id);
  if (item.kind !== 'weapon') throw new Error(`${id} is not a weapon`);
  return item;
}
export function getArmor(id: string): ArmorDef {
  const item = getItem(id);
  if (item.kind !== 'armor') throw new Error(`${id} is not armor`);
  return item;
}
export function getConsumable(id: string): ConsumableDef {
  const item = getItem(id);
  if (item.kind !== 'consumable') throw new Error(`${id} is not a consumable`);
  return item;
}

/** The boss's level in a story mission: its `bossLevel`, or recommended level + 1. */
export const bossLevel = (mission: MissionDef): number => mission.bossLevel ?? mission.minLevel + 1;

/** Abilities a class knows at a given level, in learning order. */
export function abilitiesFor(divisionId: DivisionId, level: number): AbilityDef[] {
  return Object.values(ABILITIES).filter((s) => s.divisionId === divisionId && s.level <= level);
}

/** Statuses that belong to a damage type (the rest — shield, evasive, marked — come from abilities). */
const ELEMENT_STATUSES = new Set(Object.values(ELEMENT_EFFECTS).filter((s): s is StatusId => s !== null));

/** Checks every cross-reference and range in the content tables. Returns a list of problems. */
export function validateContent(): string[] {
  const problems: string[] = [];
  const elementEffect = (where: string, element: Element, status: StatusId) => {
    if (ELEMENT_EFFECTS[element] !== status) problems.push(`${where}: ${element} can't inflict ${status} (its effect is ${ELEMENT_EFFECTS[element] ?? 'none'})`);
  };
  const range = (where: string, [lo, hi]: [number, number]) => {
    if (!(lo >= 0 && hi >= lo)) problems.push(`${where}: bad range [${lo}, ${hi}]`);
  };
  for (const [key, item] of Object.entries(ITEMS)) {
    if (key !== item.id) problems.push(`item key ${key} != id ${item.id}`);
    if (item.price < 0) problems.push(`${item.id}: negative price`);
    if (item.kind === 'weapon') range(item.id, item.damage);
    if (item.kind === 'weapon' && item.proc) elementEffect(item.id, item.element, item.proc.status);
  }
  for (const cls of Object.values(DIVISIONS)) {
    if (ITEMS[cls.startWeapon]?.kind !== 'weapon') problems.push(`${cls.id}: bad startWeapon`);
    if (ITEMS[cls.startArmor]?.kind !== 'armor') problems.push(`${cls.id}: bad startArmor`);
    if (!Object.values(ABILITIES).some((s) => s.divisionId === cls.id && s.level === 1)) {
      problems.push(`${cls.id}: no level-1 ability`);
    }
  }
  for (const ability of Object.values(ABILITIES)) {
    if (ability.energy <= 0) problems.push(`${ability.id}: energy must be positive`);
    for (const e of ability.effects) if (e.type !== 'status') range(ability.id, e.dice);
    // An element effect riding on an ability must belong to that ability's (fixed) damage type.
    const dmg = ability.effects.find((e) => e.type === 'damage');
    for (const e of ability.effects) {
      if (e.type !== 'status' || !ELEMENT_STATUSES.has(e.status)) continue;
      if (dmg?.type !== 'damage' || dmg.element === 'weapon') problems.push(`${ability.id}: ${e.status} needs a fixed damage type`);
      else elementEffect(ability.id, dmg.element, e.status);
    }
  }
  for (const m of Object.values(HOSTILES)) {
    if (m.hp <= 0) problems.push(`${m.id}: hp must be positive`);
    if (m.attacks.length === 0) problems.push(`${m.id}: no attacks`);
    for (const a of m.attacks) range(`${m.id}.${a.name}`, a.damage);
    for (const a of m.attacks) if (a.effect) elementEffect(`${m.id}.${a.name}`, a.element, a.effect.status);
    range(`${m.id}.credits`, m.credits);
    for (const d of m.drops ?? []) if (!ITEMS[d.itemId]) problems.push(`${m.id}: unknown drop ${d.itemId}`);
  }
  for (const id of MISSION_ORDER) {
    const mission = MISSIONS[id]!;
    for (const mid of [...mission.hostiles, mission.boss]) if (!HOSTILES[mid]) problems.push(`${id}: unknown hostile ${mid}`);
    if (!HOSTILES[mission.boss]?.boss) problems.push(`${id}: boss ${mission.boss} is not flagged boss`);
    if (mission.requires && !MISSIONS[mission.requires]) problems.push(`${id}: unknown requirement ${mission.requires}`);
    for (const group of mission.groups ?? []) {
      if (group.length < 1 || group.length > MAX_HOSTILES) problems.push(`${id}: group size ${group.length}`);
      for (const mid of group) {
        if (!HOSTILES[mid]) problems.push(`${id}: unknown hostile ${mid} in group`);
        else if (HOSTILES[mid]!.boss) problems.push(`${id}: boss ${mid} in a regular group`);
      }
    }
    const adds = mission.bossAdds ?? [];
    if (adds.length > MAX_HOSTILES - 1) problems.push(`${id}: too many boss adds`);
    for (const mid of adds) if (!HOSTILES[mid] || HOSTILES[mid]!.boss) problems.push(`${id}: bad boss add ${mid}`);
  }
  for (const id of QUARTERMASTER_STOCK) if (!ITEMS[id]) problems.push(`shop: unknown item ${id}`);
  return problems;
}
