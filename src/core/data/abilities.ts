import type { AbilityDef } from '../types';

const abilities: AbilityDef[] = [
  // ── Security: combat tactics ──
  { id: 'overcharge', name: 'Overcharge', divisionId: 'security', level: 1, energy: 6, description: 'Overload your weapon for 200% damage.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 2 }] },
  { id: 'personal_shield', name: 'Personal Shield', divisionId: 'security', level: 3, energy: 8, description: 'Take 40% less damage until the end of your 3rd turn from now.',
    effects: [{ type: 'status', target: 'self', status: 'shield', turns: 3, power: 40 }] },
  { id: 'combat_stim', name: 'Combat Stim', divisionId: 'security', level: 5, energy: 12, description: 'A shot of adrenaline and coagulant. Recovers health.',
    effects: [{ type: 'heal', dice: [26, 36] }] },
  { id: 'photon_grenade', name: 'Photon Grenade', divisionId: 'security', level: 4, energy: 14, description: 'A blinding burst of photon energy.',
    effects: [{ type: 'damage', element: 'photon', dice: [24, 34], hit: 86 }] },
  { id: 'suppressive_fire', name: 'Suppressive Fire', divisionId: 'security', level: 11, energy: 22, description: 'Sweep every hostile for 240% weapon damage (−10% hit), with a chance to stun.',
    effects: [
      { type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 2.4, aoe: true, accuracy: -10 },
      { type: 'status', target: 'enemy', status: 'stun', turns: 1, power: 0, chance: 25 },
    ] },

  // ── Science: field science ──
  { id: 'plasma_burst', name: 'Plasma Burst', divisionId: 'science', level: 1, energy: 6, description: 'Vent a burst of superheated plasma.',
    effects: [{ type: 'damage', element: 'plasma', dice: [9, 14], hit: 88 }] },
  { id: 'cryo_beam', name: 'Cryo Beam', divisionId: 'science', level: 2, energy: 7, description: 'A freezing beam that may chill the target.',
    effects: [
      { type: 'damage', element: 'cryo', dice: [9, 14], hit: 88 },
      { type: 'status', target: 'enemy', status: 'chill', turns: 2, power: 20, chance: 40 },
    ] },
  { id: 'regen_field', name: 'Regen Field', divisionId: 'science', level: 3, energy: 10, description: 'Accelerate cellular repair.',
    effects: [{ type: 'heal', dice: [28, 38] }] },
  { id: 'ion_storm', name: 'Ion Storm', divisionId: 'science', level: 5, energy: 14, description: 'Ionised discharge that arcs through every hostile and may stun. Hard to dodge.',
    effects: [
      { type: 'damage', element: 'ion', dice: [16, 24], aoe: true, hit: 105 },
      { type: 'status', target: 'enemy', status: 'stun', turns: 1, power: 0, chance: 20 },
    ] },
  { id: 'deflector_field', name: 'Deflector Field', divisionId: 'science', level: 7, energy: 14, description: 'Take 50% less damage until the end of your 3rd turn from now.',
    effects: [{ type: 'status', target: 'self', status: 'shield', turns: 3, power: 50 }] },
  { id: 'photon_pulse', name: 'Photon Pulse', divisionId: 'science', level: 9, energy: 20, description: 'Three searing pulses of coherent light.',
    effects: [{ type: 'damage', element: 'photon', dice: [10, 14], hits: 3, hit: 88 }] },
  { id: 'orbital_strike', name: 'Orbital Strike', divisionId: 'science', level: 12, energy: 34, description: 'Paint the target for the ship\'s plasma batteries. Devastating, if it lands.',
    effects: [
      { type: 'damage', element: 'plasma', dice: [54, 72], hit: 75 },
      { type: 'status', target: 'enemy', status: 'burn', turns: 3, power: 8, chance: 60 },
    ] },

  // ── Engineer: gadgets ──
  { id: 'nanite_swarm', name: 'Nanite Swarm', divisionId: 'engineer', level: 1, energy: 5, description: 'A strike that releases corrosive nanites.',
    effects: [
      { type: 'damage', element: 'corrosive', dice: [0, 0], useWeapon: true, mult: 1.1, accuracy: 5 },
      { type: 'status', target: 'enemy', status: 'corrode', turns: 3, power: 4, chance: 75 },
    ] },
  { id: 'target_painter', name: 'Target Painter', divisionId: 'engineer', level: 2, energy: 4, description: 'Laser-mark the target: it is 35% easier to hit for 3 turns.',
    effects: [{ type: 'status', target: 'enemy', status: 'marked', turns: 3, power: 35 }] },
  { id: 'holo_decoy', name: 'Holo-Decoy', divisionId: 'engineer', level: 3, energy: 7, description: 'Project a decoy. +35 evasion until the end of your 2nd turn from now (total evasion caps at 40).',
    effects: [{ type: 'status', target: 'self', status: 'evasive', turns: 2, power: 35 }] },
  { id: 'field_repair', name: 'Field Repair', divisionId: 'engineer', level: 4, energy: 8, description: 'Patch your suit and yourself.',
    effects: [{ type: 'heal', dice: [22, 30] }] },
  { id: 'exploit_weakness', name: 'Exploit Weakness', divisionId: 'engineer', level: 5, energy: 12, description: 'A careful strike: 160% weapon damage, +15% hit, +30% crit chance.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 1.6, extraCrit: 30, accuracy: 15 }] },
  { id: 'cryo_grenade', name: 'Cryo Grenade', divisionId: 'engineer', level: 7, energy: 10, description: 'A canister of liquid coolant that bursts over every hostile.',
    effects: [
      { type: 'damage', element: 'cryo', dice: [16, 24], aoe: true, hit: 86 },
      { type: 'status', target: 'enemy', status: 'chill', turns: 2, power: 20, chance: 50 },
    ] },
  { id: 'overload', name: 'Precision Overload', divisionId: 'engineer', level: 10, energy: 24, description: '260% weapon damage, +10% hit, +25% crit chance.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 2.6, extraCrit: 25, accuracy: 10 }] },
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(abilities.map((s) => [s.id, s]));
