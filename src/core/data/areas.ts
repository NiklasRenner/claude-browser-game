import type { AreaDef } from '../types';

const areas: AreaDef[] = [
  {
    id: 'greenwood', name: 'Greenwood Forest', minLevel: 1,
    description: 'Slimes, wolves and the odd bandit. Something large has been tearing up the undergrowth.',
    monsters: ['green_slime', 'forest_wolf', 'bandit'], boss: 'thornback_boar', encounters: 3,
    reward: { xp: 40, gold: 30 },
    palette: { sky: 0x9fd4ff, ground: 0x4f8f3a, fog: 0xbfe3c0 },
  },
  {
    id: 'ashen_caves', name: 'Ashen Caves', minLevel: 4, requires: 'greenwood',
    description: 'Hot tunnels beneath the hills. Imps dance in the lava light; the dead walk the deeper halls.',
    monsters: ['cave_bat', 'fire_imp', 'skeleton'], boss: 'magma_golem', encounters: 3,
    reward: { xp: 120, gold: 90 },
    palette: { sky: 0x2a1410, ground: 0x4a2d22, fog: 0x5a2a1a },
  },
  {
    id: 'frostpeak', name: 'Frostpeak', minLevel: 8, requires: 'ashen_caves',
    description: 'A wind-scoured summit. A drake sleeps in the glacier and does not like visitors.',
    monsters: ['ice_wyrmling', 'yeti', 'frost_wraith'], boss: 'glacius', encounters: 3,
    reward: { xp: 260, gold: 200 },
    palette: { sky: 0xcfe8ff, ground: 0xe8f2fa, fog: 0xdcecf8 },
  },
  {
    id: 'shadow_keep', name: 'Shadow Keep', minLevel: 12, requires: 'frostpeak',
    description: 'The ruined fortress of a king who forgot how to die.',
    monsters: ['shade', 'dark_knight', 'vampire'], boss: 'hollow_king', encounters: 3,
    reward: { xp: 500, gold: 400 },
    palette: { sky: 0x120c1c, ground: 0x251b30, fog: 0x1f1530 },
  },
];

export const AREAS: Record<string, AreaDef> = Object.fromEntries(areas.map((a) => [a.id, a]));
export const AREA_ORDER: string[] = areas.map((a) => a.id);
export const FINAL_AREA = 'shadow_keep';
