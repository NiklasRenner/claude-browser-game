import type { AbilityDef } from '../types';

/**
 * Every officer learns the abilities with a `level` when reaching it. The ones
 * with `shop` are taught in the Scriptorium, aboard the ship, from that level
 * for that many credits.
 */
const abilities: AbilityDef[] = [
  { id: 'overcharge', name: 'Overcharge', level: 1, energy: 6, description: 'Overload your weapon for 200% damage.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 2 }] },
  { id: 'personal_shield', name: 'Personal Shield', shop: { level: 3, price: 140 }, energy: 8, description: 'Take 40% less damage until the end of your 3rd turn from now.',
    effects: [{ type: 'status', target: 'self', status: 'shield', turns: 3, power: 40 }] },
  { id: 'combat_stim', name: 'Combat Stim', level: 5, energy: 12, description: 'A shot of adrenaline and coagulant. Recovers health.',
    effects: [{ type: 'heal', dice: [26, 36] }] },
  { id: 'photon_grenade', name: 'Photon Grenade', shop: { level: 4, price: 200 }, energy: 14, description: 'A burst of photon energy that may blind the target.',
    effects: [
      { type: 'damage', element: 'photon', dice: [24, 34], hit: 86 },
      { type: 'status', target: 'enemy', status: 'blind', turns: 2, power: 30, chance: 50 },
    ] },
  { id: 'suppressive_fire', name: 'Suppressive Fire', shop: { level: 11, price: 820 }, energy: 22, description: 'Sweep every hostile for 260% weapon damage (−10% hit).',
    effects: [
      { type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 2.6, aoe: true, accuracy: -10 },
    ] },

  { id: 'plasma_burst', name: 'Plasma Burst', shop: { level: 1, price: 60 }, energy: 6, description: 'Vent a burst of superheated plasma.',
    effects: [{ type: 'damage', element: 'plasma', dice: [9, 14], hit: 88 }] },
  { id: 'cryo_beam', name: 'Cryo Beam', shop: { level: 2, price: 90 }, energy: 7, description: 'A freezing beam that may chill the target.',
    effects: [
      { type: 'damage', element: 'cryo', dice: [9, 14], hit: 88 },
      { type: 'status', target: 'enemy', status: 'chill', turns: 2, power: 30, chance: 40 },
    ] },
  { id: 'regen_field', name: 'Regen Field', shop: { level: 3, price: 140 }, energy: 10, description: 'Accelerate cellular repair.',
    effects: [{ type: 'heal', dice: [28, 38] }] },
  { id: 'ion_storm', name: 'Ion Storm', shop: { level: 5, price: 300 }, energy: 14, description: 'Ionised discharge that arcs through every hostile and may stun. Hard to dodge.',
    effects: [
      { type: 'damage', element: 'ion', dice: [16, 24], aoe: true, hit: 105 },
      { type: 'status', target: 'enemy', status: 'stun', turns: 1, power: 0, chance: 20 },
    ] },
  { id: 'deflector_field', name: 'Deflector Field', shop: { level: 7, price: 420 }, energy: 14, description: 'Take 50% less damage until the end of your 3rd turn from now.',
    effects: [{ type: 'status', target: 'self', status: 'shield', turns: 3, power: 50 }] },
  { id: 'photon_pulse', name: 'Photon Pulse', shop: { level: 9, price: 600 }, energy: 20, description: 'Three searing pulses of coherent light.',
    effects: [{ type: 'damage', element: 'photon', dice: [10, 14], hits: 3, hit: 88 }] },
  { id: 'orbital_strike', name: 'Orbital Strike', shop: { level: 12, price: 950 }, energy: 34, description: 'Paint the target for the ship\'s plasma batteries. Devastating, if it lands.',
    effects: [
      { type: 'damage', element: 'plasma', dice: [54, 72], hit: 75 },
      { type: 'status', target: 'enemy', status: 'burn', turns: 2, power: 12, chance: 60 },
    ] },

  { id: 'nanite_swarm', name: 'Nanite Swarm', shop: { level: 1, price: 60 }, energy: 5, description: 'A strike that releases corrosive nanites.',
    effects: [
      { type: 'damage', element: 'corrosive', dice: [0, 0], useWeapon: true, mult: 1.1, accuracy: 5 },
      { type: 'status', target: 'enemy', status: 'corrode', turns: 4, power: 3, chance: 75 },
    ] },
  { id: 'target_painter', name: 'Target Painter', level: 3, energy: 4, description: 'Laser-mark the target: it is 35% easier to hit for 3 turns.',
    effects: [{ type: 'status', target: 'enemy', status: 'marked', turns: 3, power: 35 }] },
  { id: 'holo_decoy', name: 'Holo-Decoy', shop: { level: 3, price: 140 }, energy: 7, description: 'Project a decoy. +35 evasion until the end of your 2nd turn from now (total evasion caps at 40).',
    effects: [{ type: 'status', target: 'self', status: 'evasive', turns: 2, power: 35 }] },
  { id: 'field_repair', name: 'Field Repair', shop: { level: 4, price: 180 }, energy: 8, description: 'Patch your suit and yourself.',
    effects: [{ type: 'heal', dice: [22, 30] }] },
  { id: 'exploit_weakness', name: 'Exploit Weakness', shop: { level: 5, price: 280 }, energy: 12, description: 'A careful strike: 160% weapon damage, +15% hit, +30% crit chance.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 1.6, extraCrit: 30, accuracy: 15 }] },
  { id: 'cryo_grenade', name: 'Cryo Grenade', shop: { level: 7, price: 420 }, energy: 10, description: 'A canister of liquid coolant that bursts over every hostile.',
    effects: [
      { type: 'damage', element: 'cryo', dice: [16, 24], aoe: true, hit: 86 },
      { type: 'status', target: 'enemy', status: 'chill', turns: 2, power: 30, chance: 50 },
    ] },
  { id: 'overload', name: 'Precision Overload', shop: { level: 10, price: 700 }, energy: 24, description: '260% weapon damage, +10% hit, +25% crit chance.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 2.6, extraCrit: 25, accuracy: 10 }] },
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(abilities.map((s) => [s.id, s]));
