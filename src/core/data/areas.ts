import type { AreaDef } from '../types';

const areas: AreaDef[] = [
  {
    id: 'veridia', name: 'Veridia Prime', minLevel: 1,
    description: 'A jungle colony that went quiet. Raiders are picking over the outposts, and something huge is moving through the canopy.',
    monsters: ['protoplasm', 'razorback_hound', 'raider'], boss: 'thornhide_behemoth', encounters: 3,
    reward: { xp: 40, gold: 30 },
    palette: { sky: 0x8fd6c8, ground: 0x2f7a5a, fog: 0xa8e0c8 },
  },
  {
    id: 'kethra', name: 'Kethra Mining Moon', minLevel: 4, requires: 'veridia',
    description: 'A volcanic moon whose mining crew stopped reporting. Their equipment did not stop working.',
    monsters: ['cave_glider', 'plasma_sprite', 'nanite_husk'], boss: 'magma_colossus', encounters: 3,
    reward: { xp: 120, gold: 90 },
    palette: { sky: 0x2a1410, ground: 0x4a2d22, fog: 0x5a2a1a },
  },
  {
    id: 'glacies', name: 'Glacies IV', minLevel: 8, requires: 'kethra',
    description: 'A frozen world with a research station buried in its glacier, and a very old predator underneath.',
    monsters: ['frost_serpent', 'tundra_brute', 'cryo_phantom'], boss: 'glacius', encounters: 3,
    reward: { xp: 260, gold: 200 },
    palette: { sky: 0xcfe0f5, ground: 0xe4eef8, fog: 0xd4e4f4 },
  },
  {
    id: 'void_rift', name: 'The Void Rift', minLevel: 12, requires: 'glacies',
    description: 'A tear in space ringed by derelict starships. The flagship\'s admiral is still giving orders.',
    monsters: ['void_shade', 'rift_marauder', 'void_leech'], boss: 'hollow_admiral', encounters: 3,
    reward: { xp: 500, gold: 400 },
    palette: { sky: 0x0c0818, ground: 0x2a2436, fog: 0x1a1230 },
  },
];

export const AREAS: Record<string, AreaDef> = Object.fromEntries(areas.map((a) => [a.id, a]));
export const AREA_ORDER: string[] = areas.map((a) => a.id);
export const FINAL_AREA = 'void_rift';
