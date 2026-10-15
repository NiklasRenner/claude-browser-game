import type { SpellDef } from '../types';

const spells: SpellDef[] = [
  // ── Security: combat tactics ──
  { id: 'overcharge', name: 'Overcharge', classId: 'security', level: 1, mp: 6, description: 'Overload your weapon for 200% damage.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 2 }] },
  { id: 'personal_shield', name: 'Personal Shield', classId: 'security', level: 3, mp: 8, description: 'Take 40% less damage for 3 enemy turns.',
    effects: [{ type: 'status', target: 'self', status: 'shield', turns: 3, power: 40 }] },
  { id: 'combat_stim', name: 'Combat Stim', classId: 'security', level: 5, mp: 12, description: 'A shot of adrenaline and coagulant. Recovers health.',
    effects: [{ type: 'heal', dice: [26, 36] }] },
  { id: 'photon_grenade', name: 'Photon Grenade', classId: 'security', level: 4, mp: 14, description: 'A blinding burst of photon energy.',
    effects: [{ type: 'damage', element: 'photon', dice: [24, 34], hit: 86 }] },
  { id: 'suppressive_fire', name: 'Suppressive Fire', classId: 'security', level: 11, mp: 22, description: 'Sweep every hostile for 240% weapon damage (−10% hit), with a chance to stun.',
    effects: [
      { type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 2.4, aoe: true, accuracy: -10 },
      { type: 'status', target: 'enemy', status: 'stun', turns: 1, power: 0, chance: 25 },
    ] },

  // ── Science: field science ──
  { id: 'plasma_burst', name: 'Plasma Burst', classId: 'science', level: 1, mp: 6, description: 'Vent a burst of superheated plasma.',
    effects: [{ type: 'damage', element: 'plasma', dice: [9, 14], hit: 88 }] },
  { id: 'cryo_beam', name: 'Cryo Beam', classId: 'science', level: 2, mp: 7, description: 'A freezing beam that may chill the target.',
    effects: [
      { type: 'damage', element: 'cryo', dice: [9, 14], hit: 88 },
      { type: 'status', target: 'enemy', status: 'chill', turns: 2, power: 20, chance: 40 },
    ] },
  { id: 'regen_field', name: 'Regen Field', classId: 'science', level: 3, mp: 10, description: 'Accelerate cellular repair.',
    effects: [{ type: 'heal', dice: [28, 38] }] },
  { id: 'ion_storm', name: 'Ion Storm', classId: 'science', level: 5, mp: 14, description: 'Ionised discharge that arcs through every hostile and may stun. Hard to dodge.',
    effects: [
      { type: 'damage', element: 'ion', dice: [16, 24], aoe: true, hit: 105 },
      { type: 'status', target: 'enemy', status: 'stun', turns: 1, power: 0, chance: 20 },
    ] },
  { id: 'deflector_field', name: 'Deflector Field', classId: 'science', level: 7, mp: 14, description: 'Take 50% less damage for 3 enemy turns.',
    effects: [{ type: 'status', target: 'self', status: 'shield', turns: 3, power: 50 }] },
  { id: 'photon_pulse', name: 'Photon Pulse', classId: 'science', level: 9, mp: 20, description: 'Three searing pulses of coherent light.',
    effects: [{ type: 'damage', element: 'photon', dice: [10, 14], hits: 3, hit: 88 }] },
  { id: 'orbital_strike', name: 'Orbital Strike', classId: 'science', level: 12, mp: 34, description: 'Paint the target for the ship\'s plasma batteries. Devastating, if it lands.',
    effects: [
      { type: 'damage', element: 'plasma', dice: [54, 72], hit: 75 },
      { type: 'status', target: 'enemy', status: 'burn', turns: 3, power: 8, chance: 60 },
    ] },

  // ── Engineer: gadgets ──
  { id: 'nanite_swarm', name: 'Nanite Swarm', classId: 'engineer', level: 1, mp: 5, description: 'A strike that releases corrosive nanites.',
    effects: [
      { type: 'damage', element: 'corrosive', dice: [0, 0], useWeapon: true, mult: 1.1, accuracy: 5 },
      { type: 'status', target: 'enemy', status: 'corrode', turns: 3, power: 4, chance: 75 },
    ] },
  { id: 'target_painter', name: 'Target Painter', classId: 'engineer', level: 2, mp: 4, description: 'Laser-mark the target: it is 35% easier to hit for 3 turns.',
    effects: [{ type: 'status', target: 'enemy', status: 'marked', turns: 3, power: 35 }] },
  { id: 'holo_decoy', name: 'Holo-Decoy', classId: 'engineer', level: 3, mp: 7, description: 'Project a decoy. Hard to hit for 2 enemy turns.',
    effects: [{ type: 'status', target: 'self', status: 'evasive', turns: 2, power: 35 }] },
  { id: 'field_repair', name: 'Field Repair', classId: 'engineer', level: 4, mp: 8, description: 'Patch your suit and yourself.',
    effects: [{ type: 'heal', dice: [22, 30] }] },
  { id: 'exploit_weakness', name: 'Exploit Weakness', classId: 'engineer', level: 5, mp: 12, description: 'A careful strike: 160% weapon damage, +15% hit, +30% crit chance.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 1.6, extraCrit: 30, accuracy: 15 }] },
  { id: 'cryo_grenade', name: 'Cryo Grenade', classId: 'engineer', level: 7, mp: 10, description: 'A canister of liquid coolant that bursts over every hostile.',
    effects: [
      { type: 'damage', element: 'cryo', dice: [16, 24], aoe: true, hit: 86 },
      { type: 'status', target: 'enemy', status: 'chill', turns: 2, power: 20, chance: 50 },
    ] },
  { id: 'overload', name: 'Precision Overload', classId: 'engineer', level: 10, mp: 24, description: '260% weapon damage, +10% hit, +25% crit chance.',
    effects: [{ type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true, mult: 2.6, extraCrit: 25, accuracy: 10 }] },
];

export const SPELLS: Record<string, SpellDef> = Object.fromEntries(spells.map((s) => [s.id, s]));
