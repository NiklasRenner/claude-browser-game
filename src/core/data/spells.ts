import type { SpellDef } from '../types';

const spells: SpellDef[] = [
  // ── Warrior: strength-scaled battle skills ──
  { id: 'power_strike', name: 'Power Strike', classId: 'warrior', level: 1, mp: 6, description: 'A heavy blow for 170% weapon damage.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], scaling: 'str', useWeapon: true, mult: 1.7 }] },
  { id: 'iron_skin', name: 'Iron Skin', classId: 'warrior', level: 3, mp: 8, description: 'Take 40% less damage for 3 enemy turns.',
    effects: [{ type: 'status', target: 'self', status: 'guard', turns: 3, power: 40 }] },
  { id: 'second_wind', name: 'Second Wind', classId: 'warrior', level: 5, mp: 12, description: 'Catch your breath and recover health.',
    effects: [{ type: 'heal', dice: [26, 36], scaling: 'str' }] },
  { id: 'holy_smite', name: 'Holy Smite', classId: 'warrior', level: 8, mp: 16, description: 'Strike with radiant light.',
    effects: [{ type: 'damage', element: 'light', dice: [24, 34], scaling: 'str' }] },
  { id: 'whirlwind', name: 'Whirlwind', classId: 'warrior', level: 11, mp: 22, description: '240% weapon damage with a chance to stun.',
    effects: [
      { type: 'damage', element: 'weapon', dice: [0, 0], scaling: 'str', useWeapon: true, mult: 2.4 },
      { type: 'status', target: 'enemy', status: 'stun', turns: 1, power: 0, chance: 25 },
    ] },

  // ── Mage: intelligence-scaled elemental magic ──
  { id: 'firebolt', name: 'Firebolt', classId: 'mage', level: 1, mp: 6, description: 'Hurl a bolt of fire.',
    effects: [{ type: 'damage', element: 'fire', dice: [9, 14], scaling: 'int' }] },
  { id: 'frost_lance', name: 'Frost Lance', classId: 'mage', level: 2, mp: 7, description: 'An icy spear that may chill the target.',
    effects: [
      { type: 'damage', element: 'ice', dice: [9, 14], scaling: 'int' },
      { type: 'status', target: 'enemy', status: 'chill', turns: 2, power: 20, chance: 40 },
    ] },
  { id: 'mend', name: 'Mend', classId: 'mage', level: 3, mp: 10, description: 'Knit wounds closed.',
    effects: [{ type: 'heal', dice: [28, 38], scaling: 'int' }] },
  { id: 'arc_lightning', name: 'Arc Lightning', classId: 'mage', level: 5, mp: 14, description: 'Lightning that may stun.',
    effects: [
      { type: 'damage', element: 'energy', dice: [16, 24], scaling: 'int' },
      { type: 'status', target: 'enemy', status: 'stun', turns: 1, power: 0, chance: 20 },
    ] },
  { id: 'arcane_ward', name: 'Arcane Ward', classId: 'mage', level: 7, mp: 14, description: 'Take 50% less damage for 3 enemy turns.',
    effects: [{ type: 'status', target: 'self', status: 'guard', turns: 3, power: 50 }] },
  { id: 'radiance', name: 'Radiance', classId: 'mage', level: 9, mp: 20, description: 'Searing holy light.',
    effects: [{ type: 'damage', element: 'light', dice: [28, 38], scaling: 'int' }] },
  { id: 'meteor', name: 'Meteor', classId: 'mage', level: 12, mp: 34, description: 'Call down a burning star.',
    effects: [
      { type: 'damage', element: 'fire', dice: [46, 62], scaling: 'int' },
      { type: 'status', target: 'enemy', status: 'burn', turns: 3, power: 8, chance: 60 },
    ] },

  // ── Rogue: dexterity-scaled tricks ──
  { id: 'venom_strike', name: 'Venom Strike', classId: 'rogue', level: 1, mp: 5, description: 'A poisoned stab that keeps hurting.',
    effects: [
      { type: 'damage', element: 'poison', dice: [0, 0], scaling: 'dex', useWeapon: true, mult: 1.1 },
      { type: 'status', target: 'enemy', status: 'poison', turns: 3, power: 4, chance: 75 },
    ] },
  { id: 'shadow_step', name: 'Shadow Step', classId: 'rogue', level: 3, mp: 7, description: 'Become hard to hit for 2 enemy turns.',
    effects: [{ type: 'status', target: 'self', status: 'evasive', turns: 2, power: 35 }] },
  { id: 'bandage', name: 'Bandage', classId: 'rogue', level: 4, mp: 8, description: 'Patch yourself up.',
    effects: [{ type: 'heal', dice: [22, 30], scaling: 'dex' }] },
  { id: 'backstab', name: 'Backstab', classId: 'rogue', level: 5, mp: 12, description: '160% weapon damage, +30% crit chance.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], scaling: 'dex', useWeapon: true, mult: 1.6, extraCrit: 30 }] },
  { id: 'frost_vial', name: 'Frost Vial', classId: 'rogue', level: 7, mp: 10, description: 'A thrown vial of liquid cold.',
    effects: [
      { type: 'damage', element: 'ice', dice: [16, 24], scaling: 'dex' },
      { type: 'status', target: 'enemy', status: 'chill', turns: 2, power: 20, chance: 50 },
    ] },
  { id: 'assassinate', name: 'Assassinate', classId: 'rogue', level: 10, mp: 24, description: '260% weapon damage, +25% crit chance.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], scaling: 'dex', useWeapon: true, mult: 2.6, extraCrit: 25 }] },
];

export const SPELLS: Record<string, SpellDef> = Object.fromEntries(spells.map((s) => [s.id, s]));
