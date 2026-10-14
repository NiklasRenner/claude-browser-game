import type { MonsterDef } from '../types';

const monsters: MonsterDef[] = [
  // ── Veridia Prime (jungle colony world) ──
  { id: 'protoplasm', name: 'Protoplasm', level: 1, hp: 26, stats: { dex: 2, luk: 0 }, evasion: 0,
    resist: { plasma: 150, cryo: 75, corrosive: 50 },
    attacks: [
      { name: 'Engulf', element: 'kinetic', damage: [3, 6], weight: 3 },
      { name: 'Acid Spit', element: 'corrosive', damage: [2, 4], weight: 1, effect: { status: 'corrode', chance: 30, turns: 2, power: 2 } },
    ],
    xp: 14, gold: [6, 12], drops: [{ itemId: 'medkit', chance: 10 }],
    look: { body: 'blob', color: 0x45d8c0, accent: 0x1a6b7a, scale: 0.9 } },
  { id: 'razorback_hound', name: 'Razorback Hound', level: 2, hp: 34, stats: { dex: 8, luk: 3 }, evasion: 5,
    resist: { plasma: 125 },
    attacks: [
      { name: 'Bite', element: 'kinetic', damage: [4, 7], weight: 3 },
      { name: 'Savage Maul', element: 'kinetic', damage: [6, 9], weight: 1 },
    ],
    xp: 20, gold: [8, 15],
    look: { body: 'beast', color: 0x6e5a8a, accent: 0x2e2440, scale: 1 } },
  { id: 'raider', name: 'Raider', level: 3, hp: 42, stats: { dex: 6, luk: 5 }, evasion: 3,
    resist: {},
    attacks: [
      { name: 'Shock Baton', element: 'kinetic', damage: [5, 8], weight: 3 },
      { name: 'Flashbang', element: 'kinetic', damage: [3, 5], weight: 1, effect: { status: 'stun', chance: 15, turns: 1, power: 0 } },
    ],
    xp: 26, gold: [15, 30], drops: [{ itemId: 'medkit', chance: 25 }],
    look: { body: 'humanoid', color: 0x6b6f78, accent: 0xff7a1a, scale: 1 } },
  { id: 'thornhide_behemoth', name: 'Thornhide Behemoth', level: 4, hp: 115, stats: { dex: 4, luk: 2 }, evasion: 0, boss: true,
    resist: { kinetic: 85, plasma: 125 },
    attacks: [
      { name: 'Gore', element: 'kinetic', damage: [7, 11], weight: 3 },
      { name: 'Spore Barrage', element: 'kinetic', damage: [5, 8], weight: 2, effect: { status: 'corrode', chance: 25, turns: 3, power: 3 } },
      { name: 'Trample', element: 'kinetic', damage: [10, 14], weight: 1, effect: { status: 'stun', chance: 20, turns: 1, power: 0 } },
    ],
    xp: 70, gold: [60, 90], drops: [{ itemId: 'trauma_kit', chance: 50 }],
    look: { body: 'beast', color: 0x4a3a5e, accent: 0xc8f04a, scale: 1.55 } },

  // ── Kethra Mining Moon (volcanic) ──
  { id: 'cave_glider', name: 'Cave Glider', level: 4, hp: 36, stats: { dex: 14, luk: 4 }, evasion: 12,
    resist: { photon: 150, void: 50 },
    attacks: [
      { name: 'Bite', element: 'kinetic', damage: [4, 7], weight: 3 },
      { name: 'Sonic Shriek', element: 'ion', damage: [3, 6], weight: 1, effect: { status: 'stun', chance: 15, turns: 1, power: 0 } },
    ],
    xp: 40, gold: [12, 21],
    look: { body: 'flyer', color: 0x4b3b5c, accent: 0xd94a4a, scale: 0.8 } },
  { id: 'plasma_sprite', name: 'Plasma Sprite', level: 5, hp: 48, stats: { dex: 9, luk: 5 }, evasion: 6,
    resist: { plasma: 25, cryo: 160 },
    attacks: [
      { name: 'Plasma Spit', element: 'plasma', damage: [7, 11], weight: 3, effect: { status: 'burn', chance: 25, turns: 3, power: 3 } },
      { name: 'Claw', element: 'kinetic', damage: [5, 8], weight: 2 },
    ],
    xp: 50, gold: [15, 27], drops: [{ itemId: 'energy_cell', chance: 20 }],
    look: { body: 'humanoid', color: 0xe0482b, accent: 0xffb000, scale: 0.75 } },
  { id: 'nanite_husk', name: 'Nanite Husk', level: 6, hp: 62, stats: { dex: 6, luk: 2 }, evasion: 3,
    resist: { kinetic: 80, corrosive: 0, photon: 175, void: 50 },
    attacks: [
      { name: 'Drill Arm', element: 'kinetic', damage: [8, 12], weight: 3 },
      { name: 'Nanite Spray', element: 'void', damage: [5, 8], weight: 1 },
    ],
    xp: 60, gold: [21, 36], drops: [{ itemId: 'medkit', chance: 25 }],
    look: { body: 'humanoid', color: 0x8a929c, accent: 0x3fe0ff, scale: 1 } },
  { id: 'magma_colossus', name: 'Magma Colossus', level: 8, hp: 250, stats: { dex: 3, luk: 2 }, evasion: 0, boss: true,
    resist: { plasma: 0, kinetic: 70, cryo: 175, corrosive: 50 },
    attacks: [
      { name: 'Molten Fist', element: 'plasma', damage: [12, 17], weight: 3, effect: { status: 'burn', chance: 30, turns: 3, power: 4 } },
      { name: 'Rockslide', element: 'kinetic', damage: [10, 15], weight: 2 },
      { name: 'Eruption', element: 'plasma', damage: [16, 22], weight: 1 },
    ],
    xp: 220, gold: [180, 240], drops: [{ itemId: 'nano_restorer', chance: 40 }],
    look: { body: 'golem', color: 0x3a2a24, accent: 0xff5a1f, scale: 1.6 } },

  // ── Glacies IV (ice world) ──
  { id: 'frost_serpent', name: 'Frost Serpent', level: 8, hp: 72, stats: { dex: 9, luk: 4 }, evasion: 5,
    resist: { cryo: 25, plasma: 160 },
    attacks: [
      { name: 'Frost Breath', element: 'cryo', damage: [10, 15], weight: 2, effect: { status: 'chill', chance: 30, turns: 2, power: 15 } },
      { name: 'Bite', element: 'kinetic', damage: [9, 13], weight: 3 },
    ],
    xp: 85, gold: [30, 48],
    look: { body: 'dragon', color: 0x7fc8f8, accent: 0xeaf6ff, scale: 0.85 } },
  { id: 'tundra_brute', name: 'Tundra Brute', level: 9, hp: 98, stats: { dex: 5, luk: 3 }, evasion: 0,
    resist: { cryo: 50, plasma: 140 },
    attacks: [
      { name: 'Pummel', element: 'kinetic', damage: [12, 17], weight: 3 },
      { name: 'Avalanche', element: 'cryo', damage: [15, 20], weight: 1, effect: { status: 'stun', chance: 20, turns: 1, power: 0 } },
    ],
    xp: 95, gold: [36, 54], drops: [{ itemId: 'trauma_kit', chance: 20 }],
    look: { body: 'beast', color: 0xf2f2f2, accent: 0x7a9cc6, scale: 1.3 } },
  { id: 'cryo_phantom', name: 'Cryo Phantom', level: 10, hp: 76, stats: { dex: 14, luk: 6 }, evasion: 10,
    resist: { kinetic: 60, cryo: 0, photon: 175, plasma: 140, void: 50 },
    attacks: [
      { name: 'Cryo Touch', element: 'cryo', damage: [10, 15], weight: 3, effect: { status: 'chill', chance: 30, turns: 2, power: 15 } },
      { name: 'Entropy Drain', element: 'void', damage: [12, 16], weight: 1 },
    ],
    xp: 105, gold: [39, 60], drops: [{ itemId: 'energy_cell', chance: 30 }],
    look: { body: 'wraith', color: 0xbfe6ff, accent: 0x3b7bbf, scale: 1.1 } },
  { id: 'glacius', name: 'Glacius, the Ice Wyrm', level: 12, hp: 440, stats: { dex: 8, luk: 5 }, evasion: 3, boss: true,
    resist: { cryo: 0, plasma: 165, kinetic: 85 },
    attacks: [
      { name: 'Glacial Breath', element: 'cryo', damage: [18, 26], weight: 2, effect: { status: 'chill', chance: 40, turns: 2, power: 20 } },
      { name: 'Tail Sweep', element: 'kinetic', damage: [16, 22], weight: 3 },
      { name: 'Blizzard', element: 'cryo', damage: [24, 30], weight: 1 },
    ],
    xp: 450, gold: [390, 510], drops: [{ itemId: 'nano_restorer', chance: 60 }],
    look: { body: 'dragon', color: 0x5aa9e6, accent: 0xe6f7ff, scale: 1.7 } },

  // ── The Void Rift (derelict fleet) ──
  { id: 'void_shade', name: 'Void Shade', level: 12, hp: 92, stats: { dex: 16, luk: 6 }, evasion: 12,
    resist: { void: 0, photon: 180, kinetic: 70, corrosive: 0 },
    attacks: [
      { name: 'Void Claw', element: 'void', damage: [13, 18], weight: 3 },
      { name: 'Psychic Scream', element: 'void', damage: [8, 12], weight: 1, effect: { status: 'stun', chance: 20, turns: 1, power: 0 } },
    ],
    xp: 140, gold: [48, 72], drops: [{ itemId: 'energy_cell', chance: 30 }],
    look: { body: 'wraith', color: 0x45346a, accent: 0xc49bff, scale: 1.15 } },
  { id: 'rift_marauder', name: 'Rift Marauder', level: 13, hp: 145, stats: { dex: 8, luk: 4 }, evasion: 2,
    resist: { kinetic: 70, void: 50, photon: 150, ion: 125 },
    attacks: [
      { name: 'Rift Blade', element: 'kinetic', damage: [16, 22], weight: 3 },
      { name: 'Shield Bash', element: 'kinetic', damage: [12, 16], weight: 1, effect: { status: 'stun', chance: 20, turns: 1, power: 0 } },
    ],
    xp: 160, gold: [60, 90], drops: [{ itemId: 'trauma_kit', chance: 30 }],
    look: { body: 'humanoid', color: 0x1e1e26, accent: 0xb3122e, scale: 1.25 } },
  { id: 'void_leech', name: 'Void Leech', level: 14, hp: 124, stats: { dex: 13, luk: 8 }, evasion: 8,
    resist: { void: 25, photon: 175, plasma: 140, corrosive: 0 },
    attacks: [
      { name: 'Life Drain', element: 'void', damage: [15, 21], weight: 3 },
      { name: 'Tendril Lash', element: 'kinetic', damage: [10, 15], weight: 2 },
    ],
    xp: 175, gold: [66, 99], drops: [{ itemId: 'nano_restorer', chance: 10 }],
    look: { body: 'humanoid', color: 0x2b0a14, accent: 0xd8d8e8, scale: 1.05 } },
  { id: 'hollow_admiral', name: 'The Hollow Admiral', level: 16, hp: 720, stats: { dex: 10, luk: 8 }, evasion: 4, boss: true,
    resist: { void: 0, photon: 160, kinetic: 80, corrosive: 25 },
    attacks: [
      { name: 'Void Cannon', element: 'void', damage: [22, 30], weight: 3 },
      { name: 'Nanite Plague', element: 'void', damage: [16, 22], weight: 2, effect: { status: 'corrode', chance: 40, turns: 3, power: 8 } },
      { name: 'Event Horizon', element: 'void', damage: [32, 42], weight: 1 },
    ],
    xp: 1000, gold: [900, 1200],
    look: { body: 'humanoid', color: 0x101018, accent: 0xffd34d, scale: 1.7 } },
];

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(monsters.map((m) => [m.id, m]));
