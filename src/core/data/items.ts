import type { ArmorDef, ConsumableDef, ItemDef, WeaponDef } from '../types';

const weapons: WeaponDef[] = [
  // Starter weapons (not sold in the shop, price 0).
  { kind: 'weapon', id: 'training_sword', name: 'Training Sword', element: 'physical', damage: [4, 7], bonus: 0, crit: 0, level: 1, price: 0, description: 'Dull, but honest.' },
  { kind: 'weapon', id: 'apprentice_staff', name: 'Apprentice Staff', element: 'physical', damage: [3, 6], bonus: 0, crit: 0, level: 1, price: 0, description: 'Mostly used for leaning on.' },
  { kind: 'weapon', id: 'rusty_dagger', name: 'Rusty Dagger', element: 'physical', damage: [3, 6], bonus: 2, crit: 3, level: 1, price: 0, description: 'Tetanus counts as a status effect, right?' },
  // Shop weapons.
  { kind: 'weapon', id: 'iron_sword', name: 'Iron Sword', element: 'physical', damage: [6, 10], bonus: 2, crit: 0, level: 2, price: 60, description: 'A dependable upgrade.' },
  { kind: 'weapon', id: 'flame_blade', name: 'Flame Blade', element: 'fire', damage: [8, 13], bonus: 2, crit: 0, level: 3, price: 160, description: 'Sets things on fire. Including, occasionally, things.', proc: { chance: 15, status: 'burn', turns: 3, power: 3 } },
  { kind: 'weapon', id: 'frost_edge', name: 'Frost Edge', element: 'ice', damage: [8, 13], bonus: 2, crit: 0, level: 3, price: 160, description: 'Cold to the touch; colder to the target.', proc: { chance: 20, status: 'chill', turns: 2, power: 15 } },
  { kind: 'weapon', id: 'venom_fang', name: 'Venom Fang', element: 'poison', damage: [10, 15], bonus: 3, crit: 5, level: 5, price: 300, description: 'Drips with something green.', proc: { chance: 30, status: 'poison', turns: 3, power: 5 } },
  { kind: 'weapon', id: 'storm_spear', name: 'Storm Spear', element: 'energy', damage: [11, 17], bonus: 4, crit: 0, level: 6, price: 380, description: 'Crackles before every thrust.', proc: { chance: 8, status: 'stun', turns: 1, power: 0 } },
  { kind: 'weapon', id: 'sunsteel_mace', name: 'Sunsteel Mace', element: 'light', damage: [12, 18], bonus: 3, crit: 0, level: 7, price: 480, description: 'Undead find it deeply rude.' },
  { kind: 'weapon', id: 'dragonfang', name: 'Dragonfang', element: 'fire', damage: [17, 25], bonus: 4, crit: 3, level: 10, price: 900, description: 'Carved from a fang that was still warm.', proc: { chance: 20, status: 'burn', turns: 3, power: 7 } },
  { kind: 'weapon', id: 'glacier_greatsword', name: 'Glacier Greatsword', element: 'ice', damage: [17, 25], bonus: 4, crit: 0, level: 10, price: 900, description: 'Heavy enough to stop rivers.', proc: { chance: 20, status: 'chill', turns: 2, power: 20 } },
  { kind: 'weapon', id: 'dawnbringer', name: 'Dawnbringer', element: 'light', damage: [22, 32], bonus: 6, crit: 3, level: 13, price: 1500, description: 'The sun, folded a thousand times.' },
  { kind: 'weapon', id: 'voidreaver', name: 'Voidreaver', element: 'darkness', damage: [22, 32], bonus: 5, crit: 8, level: 14, price: 1600, description: 'Hums a song only it can hear.' },
];

const armors: ArmorDef[] = [
  { kind: 'armor', id: 'tunic', name: 'Traveler\'s Tunic', block: 0, resist: {}, hp: 0, mp: 0, level: 1, price: 0, description: 'Keeps the rain off. Mostly.' },
  { kind: 'armor', id: 'leather_armor', name: 'Leather Armor', block: 4, resist: { physical: 5 }, hp: 10, mp: 0, level: 1, price: 60, description: 'Supple and sensible.' },
  { kind: 'armor', id: 'chainmail', name: 'Chainmail', block: 7, resist: { physical: 10 }, hp: 25, mp: 0, level: 4, price: 220, description: 'Jingles reassuringly.' },
  { kind: 'armor', id: 'emberweave_robe', name: 'Emberweave Robe', block: 5, resist: { fire: 30 }, hp: 20, mp: 25, level: 6, price: 360, description: 'Woven from salamander silk.' },
  { kind: 'armor', id: 'frostguard_mail', name: 'Frostguard Mail', block: 9, resist: { physical: 10, ice: 35 }, hp: 45, mp: 0, level: 8, price: 600, description: 'Never quite warm, never quite frozen.' },
  { kind: 'armor', id: 'radiant_plate', name: 'Radiant Plate', block: 12, resist: { physical: 15, darkness: 35 }, hp: 70, mp: 15, level: 12, price: 1200, description: 'Glows faintly in the dark. Very faintly.' },
];

const consumables: ConsumableDef[] = [
  { kind: 'consumable', id: 'health_potion', name: 'Health Potion', heal: 45, mana: 0, price: 25, description: 'Restores 45 HP.' },
  { kind: 'consumable', id: 'mana_potion', name: 'Mana Potion', heal: 0, mana: 30, price: 30, description: 'Restores 30 MP.' },
  { kind: 'consumable', id: 'greater_health_potion', name: 'Greater Health Potion', heal: 120, mana: 0, price: 75, description: 'Restores 120 HP.' },
  { kind: 'consumable', id: 'antidote', name: 'Antidote', heal: 10, mana: 0, cures: ['poison', 'burn'], price: 15, description: 'Cures poison and burns.' },
  { kind: 'consumable', id: 'elixir', name: 'Elixir', heal: 250, mana: 100, cures: ['poison', 'burn', 'chill'], price: 200, description: 'Restores nearly everything.' },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  [...weapons, ...armors, ...consumables].map((item) => [item.id, item]),
);

/** Items the town shop sells (starter gear is excluded). */
export const SHOP_STOCK: string[] = [...weapons, ...armors, ...consumables]
  .filter((item) => item.price > 0)
  .map((item) => item.id);
