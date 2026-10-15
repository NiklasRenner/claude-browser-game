import { MAX_HOSTILES } from '../types';
import type { AreaDef, ArmorDef, ClassDef, ClassId, ConsumableDef, ItemDef, MonsterDef, SpellDef, WeaponDef } from '../types';
import { AREAS, AREA_ORDER } from './areas';
import { CLASSES } from './classes';
import { ITEMS, SHOP_STOCK } from './items';
import { MONSTERS } from './monsters';
import { SPELLS } from './spells';

export { AREAS, AREA_ORDER, CLASSES, ITEMS, MONSTERS, SHOP_STOCK, SPELLS };
export { FINAL_AREA } from './areas';

function lookup<T>(table: Record<string, T>, id: string, what: string): T {
  const value = table[id];
  if (value === undefined) throw new Error(`Unknown ${what}: ${id}`);
  return value;
}

export const getItem = (id: string): ItemDef => lookup(ITEMS, id, 'item');
export const getMonster = (id: string): MonsterDef => lookup(MONSTERS, id, 'monster');
export const getSpell = (id: string): SpellDef => lookup(SPELLS, id, 'spell');
export const getArea = (id: string): AreaDef => lookup(AREAS, id, 'area');
export const getClass = (id: ClassId): ClassDef => lookup(CLASSES, id, 'class');

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

/** Spells a class knows at a given level, in learning order. */
export function spellsFor(classId: ClassId, level: number): SpellDef[] {
  return Object.values(SPELLS).filter((s) => s.classId === classId && s.level <= level);
}

/** Checks every cross-reference and range in the content tables. Returns a list of problems. */
export function validateContent(): string[] {
  const problems: string[] = [];
  const range = (where: string, [lo, hi]: [number, number]) => {
    if (!(lo >= 0 && hi >= lo)) problems.push(`${where}: bad range [${lo}, ${hi}]`);
  };
  for (const [key, item] of Object.entries(ITEMS)) {
    if (key !== item.id) problems.push(`item key ${key} != id ${item.id}`);
    if (item.price < 0) problems.push(`${item.id}: negative price`);
    if (item.kind === 'weapon') range(item.id, item.damage);
  }
  for (const cls of Object.values(CLASSES)) {
    if (ITEMS[cls.startWeapon]?.kind !== 'weapon') problems.push(`${cls.id}: bad startWeapon`);
    if (ITEMS[cls.startArmor]?.kind !== 'armor') problems.push(`${cls.id}: bad startArmor`);
    if (!Object.values(SPELLS).some((s) => s.classId === cls.id && s.level === 1)) {
      problems.push(`${cls.id}: no level-1 spell`);
    }
  }
  for (const spell of Object.values(SPELLS)) {
    if (spell.mp <= 0) problems.push(`${spell.id}: mp must be positive`);
    for (const e of spell.effects) if (e.type !== 'status') range(spell.id, e.dice);
  }
  for (const m of Object.values(MONSTERS)) {
    if (m.hp <= 0) problems.push(`${m.id}: hp must be positive`);
    if (m.attacks.length === 0) problems.push(`${m.id}: no attacks`);
    for (const a of m.attacks) range(`${m.id}.${a.name}`, a.damage);
    range(`${m.id}.gold`, m.gold);
    for (const d of m.drops ?? []) if (!ITEMS[d.itemId]) problems.push(`${m.id}: unknown drop ${d.itemId}`);
  }
  for (const id of AREA_ORDER) {
    const area = AREAS[id]!;
    for (const mid of [...area.monsters, area.boss]) if (!MONSTERS[mid]) problems.push(`${id}: unknown monster ${mid}`);
    if (!MONSTERS[area.boss]?.boss) problems.push(`${id}: boss ${area.boss} is not flagged boss`);
    if (area.requires && !AREAS[area.requires]) problems.push(`${id}: unknown requirement ${area.requires}`);
    for (const group of area.groups ?? []) {
      if (group.length < 1 || group.length > MAX_HOSTILES) problems.push(`${id}: group size ${group.length}`);
      for (const mid of group) {
        if (!MONSTERS[mid]) problems.push(`${id}: unknown monster ${mid} in group`);
        else if (MONSTERS[mid]!.boss) problems.push(`${id}: boss ${mid} in a regular group`);
      }
    }
    const adds = area.bossAdds ?? [];
    if (adds.length > MAX_HOSTILES - 1) problems.push(`${id}: too many boss adds`);
    for (const mid of adds) if (!MONSTERS[mid] || MONSTERS[mid]!.boss) problems.push(`${id}: bad boss add ${mid}`);
  }
  for (const id of SHOP_STOCK) if (!ITEMS[id]) problems.push(`shop: unknown item ${id}`);
  return problems;
}
