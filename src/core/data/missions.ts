import type { MissionDef } from '../types';

const missions: MissionDef[] = [
  {
    id: 'veridia', name: 'Veridia Fen', minLevel: 1,
    description: 'A swamp colony that went quiet. Its chapel-forge still burns: the Choir of the Sunken Engine has been perfecting the colonists with wire and rot, and their Archcantor wants more flesh for the choir.',
    hostiles: ['fen_leech', 'rotwired_penitent', 'choir_cantor'], boss: 'archcantor', encounters: 3,
    reward: { xp: 40, credits: 30 },
    palette: { sky: 0x8fd6c8, ground: 0x2f7a5a, fog: 0xa8e0c8 },
  },
  {
    id: 'kethra', name: 'Kethra Mining Moon', minLevel: 4, requires: 'veridia',
    description: 'A volcanic moon whose mining crew stopped reporting. Their equipment did not stop working.',
    hostiles: ['cave_glider', 'plasma_sprite', 'nanite_husk'], boss: 'magma_colossus', encounters: 3,
    reward: { xp: 120, credits: 90 },
    palette: { sky: 0x2a1410, ground: 0x4a2d22, fog: 0x5a2a1a },
  },
  {
    id: 'glacies', name: 'Glacies IV', minLevel: 8, requires: 'kethra',
    description: 'A frozen world with a research station buried in its glacier, and a very old predator underneath.',
    hostiles: ['frost_serpent', 'tundra_brute', 'cryo_phantom'], boss: 'glacius', encounters: 3,
    reward: { xp: 260, credits: 200 },
    palette: { sky: 0xcfe0f5, ground: 0xe4eef8, fog: 0xd4e4f4 },
  },
  {
    id: 'void_rift', name: 'The Void Rift', minLevel: 12, requires: 'glacies',
    description: 'A tear in space ringed by derelict starships. The flagship\'s admiral is still giving orders.',
    hostiles: ['void_shade', 'phase_wisp', 'rift_marauder', 'void_leech'], boss: 'hollow_admiral', encounters: 3,
    reward: { xp: 500, credits: 400 },
    palette: { sky: 0x0c0818, ground: 0x2a2436, fog: 0x1a1230 },
  },
  {
    id: 'xenith', name: 'Xenith Hive World', minLevel: 14, requires: 'void_rift',
    description: 'The rift\'s collapse woke something on a nearby world. The hive fights in packs: pick your targets.',
    hostiles: ['hive_drone', 'hive_spitter', 'hive_guardian'],
    groups: [
      ['hive_drone', 'hive_drone', 'hive_drone'],
      ['hive_drone', 'hive_spitter'],
      ['hive_spitter', 'hive_spitter'],
      ['hive_guardian'],
      ['hive_drone', 'hive_guardian'],
      ['hive_drone', 'hive_drone', 'hive_spitter'],
    ],
    boss: 'brood_matriarch', bossAdds: ['hive_drone', 'hive_drone'],
    finale: {
      title: 'The hive falls silent!',
      text: 'The Brood Matriarch is dead and the hive falls silent. The Meridian\'s tour is complete!',
    },
    encounters: 5,
    reward: { xp: 900, credits: 700 },
    palette: { sky: 0x6a6a30, ground: 0x4a3a22, fog: 0x8a7a40 },
  },
];

export const MISSIONS: Record<string, MissionDef> = Object.fromEntries(missions.map((a) => [a.id, a]));
export const MISSION_ORDER: string[] = missions.map((a) => a.id);
export const FINAL_MISSION = 'xenith';
