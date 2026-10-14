import type { ArmorDef, ConsumableDef, ItemDef, WeaponDef } from '../types';

const weapons: WeaponDef[] = [
  // Starter kit (not sold by the quartermaster, price 0).
  { kind: 'weapon', id: 'sidearm_mk1', name: 'Mk I Sidearm', style: 'ranged', element: 'kinetic', damage: [4, 7], bonus: 0, crit: 0, level: 1, price: 0, description: 'Standard issue. Reliable, unremarkable.' },
  { kind: 'weapon', id: 'sonic_emitter', name: 'Sonic Emitter', style: 'ranged', element: 'kinetic', damage: [3, 6], bonus: 0, crit: 0, level: 1, price: 0, description: 'A lab tool, technically. Hums at hostile frequencies.' },
  { kind: 'weapon', id: 'mag_wrench', name: 'Mag-Wrench', style: 'melee', element: 'kinetic', damage: [3, 6], bonus: 2, crit: 3, level: 1, price: 0, description: 'Fixes conduits. Unfixes faces.' },
  // Quartermaster stock.
  { kind: 'weapon', id: 'gauss_pistol', name: 'Gauss Pistol', style: 'ranged', element: 'kinetic', damage: [6, 10], bonus: 2, crit: 0, level: 2, price: 60, description: 'Magnetically accelerated slugs. A dependable upgrade.' },
  { kind: 'weapon', id: 'plasma_pistol', name: 'Plasma Pistol', style: 'ranged', element: 'plasma', damage: [8, 13], bonus: 2, crit: 0, level: 3, price: 160, description: 'Fires superheated plasma that keeps burning.', proc: { chance: 15, status: 'burn', turns: 3, power: 3 } },
  { kind: 'weapon', id: 'cryo_carbine', name: 'Cryo Carbine', style: 'ranged', element: 'cryo', damage: [8, 13], bonus: 2, crit: 0, level: 3, price: 160, description: 'Flash-freezes the target\'s outer layer.', proc: { chance: 20, status: 'chill', turns: 2, power: 15 } },
  { kind: 'weapon', id: 'corrosive_needler', name: 'Corrosive Needler', style: 'ranged', element: 'corrosive', damage: [10, 15], bonus: 3, crit: 5, level: 5, price: 300, description: 'Needles laced with armor-eating nanites.', proc: { chance: 30, status: 'corrode', turns: 3, power: 5 } },
  { kind: 'weapon', id: 'ion_lance', name: 'Ion Lance', style: 'melee', element: 'ion', damage: [11, 17], bonus: 4, crit: 0, level: 6, price: 380, description: 'A charged polearm that scrambles nervous systems.', proc: { chance: 8, status: 'stun', turns: 1, power: 0 } },
  { kind: 'weapon', id: 'photon_rifle', name: 'Photon Rifle', style: 'ranged', element: 'photon', damage: [12, 18], bonus: 3, crit: 0, level: 7, price: 480, description: 'Coherent light. Void-touched things hate it.' },
  { kind: 'weapon', id: 'plasma_cannon', name: 'Heavy Plasma Cannon', style: 'ranged', element: 'plasma', damage: [17, 25], bonus: 4, crit: 3, level: 10, price: 900, description: 'Shoulder-mounted. Do not fire indoors.', proc: { chance: 20, status: 'burn', turns: 3, power: 7 } },
  { kind: 'weapon', id: 'stasis_projector', name: 'Stasis Projector', style: 'ranged', element: 'cryo', damage: [17, 25], bonus: 4, crit: 0, level: 10, price: 900, description: 'Drops local temperature to near absolute zero.', proc: { chance: 20, status: 'chill', turns: 2, power: 20 } },
  { kind: 'weapon', id: 'nova_rifle', name: 'Nova Photon Rifle', style: 'ranged', element: 'photon', damage: [22, 32], bonus: 6, crit: 3, level: 13, price: 1500, description: 'A captured star in a rifle stock.' },
  { kind: 'weapon', id: 'singularity_edge', name: 'Singularity Edge', style: 'melee', element: 'void', damage: [22, 32], bonus: 5, crit: 8, level: 14, price: 1600, description: 'A blade that cuts through the space it occupies.' },
];

const armors: ArmorDef[] = [
  { kind: 'armor', id: 'duty_uniform', name: 'Duty Uniform', block: 0, resist: {}, hp: 0, mp: 0, level: 1, price: 0, description: 'Smart, comfortable, not remotely armored.' },
  { kind: 'armor', id: 'field_jacket', name: 'Padded Field Jacket', block: 4, resist: { kinetic: 5 }, hp: 10, mp: 0, level: 1, price: 60, description: 'Standard away-team outerwear.' },
  { kind: 'armor', id: 'composite_vest', name: 'Composite Armor Vest', block: 7, resist: { kinetic: 10 }, hp: 25, mp: 0, level: 4, price: 220, description: 'Ceramic plates over a ballistic weave.' },
  { kind: 'armor', id: 'thermal_envirosuit', name: 'Thermal Envirosuit', block: 5, resist: { plasma: 30 }, hp: 20, mp: 25, level: 6, price: 360, description: 'Rated for walking on lava. Briefly.' },
  { kind: 'armor', id: 'arctic_hardsuit', name: 'Arctic Hardsuit', block: 9, resist: { kinetic: 10, cryo: 35 }, hp: 45, mp: 0, level: 8, price: 600, description: 'Heated plating and a very good seal.' },
  { kind: 'armor', id: 'aegis_power_armor', name: 'Aegis Power Armor', block: 12, resist: { kinetic: 15, void: 35 }, hp: 70, mp: 15, level: 12, price: 1200, description: 'Powered plate with a void-dampening field.' },
];

const consumables: ConsumableDef[] = [
  { kind: 'consumable', id: 'medkit', name: 'Medkit', heal: 45, mana: 0, price: 25, description: 'Restores 45 HP.' },
  { kind: 'consumable', id: 'energy_cell', name: 'Energy Cell', heal: 0, mana: 30, price: 30, description: 'Restores 30 EN.' },
  { kind: 'consumable', id: 'trauma_kit', name: 'Trauma Kit', heal: 120, mana: 0, price: 75, description: 'Restores 120 HP.' },
  { kind: 'consumable', id: 'detox_injector', name: 'Detox Injector', heal: 10, mana: 0, cures: ['corrode', 'burn'], price: 15, description: 'Neutralises corrosion and burns.' },
  { kind: 'consumable', id: 'nano_restorer', name: 'Nano-Restorer', heal: 250, mana: 100, cures: ['corrode', 'burn', 'chill'], price: 200, description: 'Medical nanites. Restores nearly everything.' },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  [...weapons, ...armors, ...consumables].map((item) => [item.id, item]),
);

/** Items the quartermaster sells (starter kit is excluded). */
export const SHOP_STOCK: string[] = [...weapons, ...armors, ...consumables]
  .filter((item) => item.price > 0)
  .map((item) => item.id);
