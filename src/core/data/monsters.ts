import type { MonsterDef } from '../types';

const monsters: MonsterDef[] = [
  // ── Greenwood Forest ──
  { id: 'green_slime', name: 'Green Slime', level: 1, hp: 26, stats: { dex: 2, luk: 0 }, evasion: 0,
    resist: { fire: 150, ice: 75, poison: 50 },
    attacks: [
      { name: 'Ooze Slam', element: 'physical', damage: [3, 6], weight: 3 },
      { name: 'Acid Splash', element: 'poison', damage: [2, 4], weight: 1, effect: { status: 'poison', chance: 30, turns: 2, power: 2 } },
    ],
    xp: 14, gold: [6, 12], drops: [{ itemId: 'health_potion', chance: 10 }],
    look: { body: 'blob', color: 0x5fd35f, accent: 0x2b7a2b, scale: 0.9 } },
  { id: 'forest_wolf', name: 'Forest Wolf', level: 2, hp: 34, stats: { dex: 8, luk: 3 }, evasion: 5,
    resist: { fire: 125 },
    attacks: [
      { name: 'Bite', element: 'physical', damage: [4, 7], weight: 3 },
      { name: 'Savage Maul', element: 'physical', damage: [6, 9], weight: 1 },
    ],
    xp: 20, gold: [8, 15],
    look: { body: 'beast', color: 0x8a8a8a, accent: 0x444444, scale: 1 } },
  { id: 'bandit', name: 'Bandit', level: 3, hp: 42, stats: { dex: 6, luk: 5 }, evasion: 3,
    resist: {},
    attacks: [
      { name: 'Slash', element: 'physical', damage: [5, 8], weight: 3 },
      { name: 'Dirty Trick', element: 'physical', damage: [3, 5], weight: 1, effect: { status: 'stun', chance: 15, turns: 1, power: 0 } },
    ],
    xp: 26, gold: [15, 30], drops: [{ itemId: 'health_potion', chance: 25 }],
    look: { body: 'humanoid', color: 0xa0522d, accent: 0x222222, scale: 1 } },
  { id: 'thornback_boar', name: 'Thornback Boar', level: 4, hp: 115, stats: { dex: 4, luk: 2 }, evasion: 0, boss: true,
    resist: { physical: 85, fire: 125 },
    attacks: [
      { name: 'Gore', element: 'physical', damage: [7, 11], weight: 3 },
      { name: 'Thorn Barrage', element: 'physical', damage: [5, 8], weight: 2, effect: { status: 'poison', chance: 25, turns: 3, power: 3 } },
      { name: 'Trample', element: 'physical', damage: [10, 14], weight: 1, effect: { status: 'stun', chance: 20, turns: 1, power: 0 } },
    ],
    xp: 70, gold: [60, 90], drops: [{ itemId: 'greater_health_potion', chance: 50 }],
    look: { body: 'beast', color: 0x6b4423, accent: 0x2e8b57, scale: 1.55 } },

  // ── Ashen Caves ──
  { id: 'cave_bat', name: 'Cave Bat', level: 4, hp: 36, stats: { dex: 14, luk: 4 }, evasion: 12,
    resist: { light: 150, darkness: 50 },
    attacks: [
      { name: 'Bite', element: 'physical', damage: [4, 7], weight: 3 },
      { name: 'Screech', element: 'energy', damage: [3, 6], weight: 1, effect: { status: 'stun', chance: 15, turns: 1, power: 0 } },
    ],
    xp: 40, gold: [12, 21],
    look: { body: 'flyer', color: 0x4b3b5c, accent: 0xd94a4a, scale: 0.8 } },
  { id: 'fire_imp', name: 'Fire Imp', level: 5, hp: 48, stats: { dex: 9, luk: 5 }, evasion: 6,
    resist: { fire: 25, ice: 160 },
    attacks: [
      { name: 'Firebolt', element: 'fire', damage: [7, 11], weight: 3, effect: { status: 'burn', chance: 25, turns: 3, power: 3 } },
      { name: 'Claw', element: 'physical', damage: [5, 8], weight: 2 },
    ],
    xp: 50, gold: [15, 27], drops: [{ itemId: 'mana_potion', chance: 20 }],
    look: { body: 'humanoid', color: 0xe0482b, accent: 0xffb000, scale: 0.75 } },
  { id: 'skeleton', name: 'Skeleton', level: 6, hp: 62, stats: { dex: 6, luk: 2 }, evasion: 3,
    resist: { physical: 80, poison: 0, light: 175, darkness: 50 },
    attacks: [
      { name: 'Bone Club', element: 'physical', damage: [8, 12], weight: 3 },
      { name: 'Rattle', element: 'darkness', damage: [5, 8], weight: 1 },
    ],
    xp: 60, gold: [21, 36], drops: [{ itemId: 'health_potion', chance: 25 }],
    look: { body: 'humanoid', color: 0xe8e2cf, accent: 0x55504a, scale: 1 } },
  { id: 'magma_golem', name: 'Magma Golem', level: 8, hp: 250, stats: { dex: 3, luk: 2 }, evasion: 0, boss: true,
    resist: { fire: 0, physical: 70, ice: 175, poison: 50 },
    attacks: [
      { name: 'Molten Fist', element: 'fire', damage: [12, 17], weight: 3, effect: { status: 'burn', chance: 30, turns: 3, power: 4 } },
      { name: 'Rockslide', element: 'physical', damage: [10, 15], weight: 2 },
      { name: 'Eruption', element: 'fire', damage: [16, 22], weight: 1 },
    ],
    xp: 220, gold: [180, 240], drops: [{ itemId: 'elixir', chance: 40 }],
    look: { body: 'golem', color: 0x3a2a24, accent: 0xff5a1f, scale: 1.6 } },

  // ── Frostpeak ──
  { id: 'ice_wyrmling', name: 'Ice Wyrmling', level: 8, hp: 72, stats: { dex: 9, luk: 4 }, evasion: 5,
    resist: { ice: 25, fire: 160 },
    attacks: [
      { name: 'Frost Breath', element: 'ice', damage: [10, 15], weight: 2, effect: { status: 'chill', chance: 30, turns: 2, power: 15 } },
      { name: 'Bite', element: 'physical', damage: [9, 13], weight: 3 },
    ],
    xp: 85, gold: [30, 48],
    look: { body: 'dragon', color: 0x7fc8f8, accent: 0xeaf6ff, scale: 0.85 } },
  { id: 'yeti', name: 'Yeti', level: 9, hp: 98, stats: { dex: 5, luk: 3 }, evasion: 0,
    resist: { ice: 50, fire: 140 },
    attacks: [
      { name: 'Pummel', element: 'physical', damage: [12, 17], weight: 3 },
      { name: 'Avalanche', element: 'ice', damage: [15, 20], weight: 1, effect: { status: 'stun', chance: 20, turns: 1, power: 0 } },
    ],
    xp: 95, gold: [36, 54], drops: [{ itemId: 'greater_health_potion', chance: 20 }],
    look: { body: 'beast', color: 0xf2f2f2, accent: 0x7a9cc6, scale: 1.3 } },
  { id: 'frost_wraith', name: 'Frost Wraith', level: 10, hp: 76, stats: { dex: 14, luk: 6 }, evasion: 10,
    resist: { physical: 60, ice: 0, light: 175, fire: 140, darkness: 50 },
    attacks: [
      { name: 'Chill Touch', element: 'ice', damage: [10, 15], weight: 3, effect: { status: 'chill', chance: 30, turns: 2, power: 15 } },
      { name: 'Soul Drain', element: 'darkness', damage: [12, 16], weight: 1 },
    ],
    xp: 105, gold: [39, 60], drops: [{ itemId: 'mana_potion', chance: 30 }],
    look: { body: 'wraith', color: 0xbfe6ff, accent: 0x3b7bbf, scale: 1.1 } },
  { id: 'glacius', name: 'Glacius the Frost Drake', level: 12, hp: 440, stats: { dex: 8, luk: 5 }, evasion: 3, boss: true,
    resist: { ice: 0, fire: 165, physical: 85 },
    attacks: [
      { name: 'Glacial Breath', element: 'ice', damage: [18, 26], weight: 2, effect: { status: 'chill', chance: 40, turns: 2, power: 20 } },
      { name: 'Tail Sweep', element: 'physical', damage: [16, 22], weight: 3 },
      { name: 'Blizzard', element: 'ice', damage: [24, 30], weight: 1 },
    ],
    xp: 450, gold: [390, 510], drops: [{ itemId: 'elixir', chance: 60 }],
    look: { body: 'dragon', color: 0x5aa9e6, accent: 0xe6f7ff, scale: 1.7 } },

  // ── Shadow Keep ──
  { id: 'shade', name: 'Shade', level: 12, hp: 92, stats: { dex: 16, luk: 6 }, evasion: 12,
    resist: { darkness: 0, light: 180, physical: 70, poison: 0 },
    attacks: [
      { name: 'Shadow Claw', element: 'darkness', damage: [13, 18], weight: 3 },
      { name: 'Terrify', element: 'darkness', damage: [8, 12], weight: 1, effect: { status: 'stun', chance: 20, turns: 1, power: 0 } },
    ],
    xp: 140, gold: [48, 72], drops: [{ itemId: 'mana_potion', chance: 30 }],
    look: { body: 'wraith', color: 0x45346a, accent: 0xc49bff, scale: 1.15 } },
  { id: 'dark_knight', name: 'Dark Knight', level: 13, hp: 145, stats: { dex: 8, luk: 4 }, evasion: 2,
    resist: { physical: 70, darkness: 50, light: 150, energy: 125 },
    attacks: [
      { name: 'Cleave', element: 'physical', damage: [16, 22], weight: 3 },
      { name: 'Shield Bash', element: 'physical', damage: [12, 16], weight: 1, effect: { status: 'stun', chance: 20, turns: 1, power: 0 } },
    ],
    xp: 160, gold: [60, 90], drops: [{ itemId: 'greater_health_potion', chance: 30 }],
    look: { body: 'humanoid', color: 0x1e1e26, accent: 0xb3122e, scale: 1.25 } },
  { id: 'vampire', name: 'Vampire', level: 14, hp: 124, stats: { dex: 13, luk: 8 }, evasion: 8,
    resist: { darkness: 25, light: 175, fire: 140, poison: 0 },
    attacks: [
      { name: 'Drain Bite', element: 'darkness', damage: [15, 21], weight: 3 },
      { name: 'Bat Swarm', element: 'physical', damage: [10, 15], weight: 2 },
    ],
    xp: 175, gold: [66, 99], drops: [{ itemId: 'elixir', chance: 10 }],
    look: { body: 'humanoid', color: 0x2b0a14, accent: 0xd8d8e8, scale: 1.05 } },
  { id: 'hollow_king', name: 'The Hollow King', level: 16, hp: 720, stats: { dex: 10, luk: 8 }, evasion: 4, boss: true,
    resist: { darkness: 0, light: 160, physical: 80, poison: 25 },
    attacks: [
      { name: 'Void Blade', element: 'darkness', damage: [22, 30], weight: 3 },
      { name: 'Crown of Thorns', element: 'darkness', damage: [16, 22], weight: 2, effect: { status: 'poison', chance: 40, turns: 3, power: 8 } },
      { name: 'Oblivion', element: 'darkness', damage: [32, 42], weight: 1 },
    ],
    xp: 1000, gold: [900, 1200],
    look: { body: 'humanoid', color: 0x101018, accent: 0xffd34d, scale: 1.7 } },
];

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(monsters.map((m) => [m.id, m]));
