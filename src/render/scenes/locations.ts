/**
 * What each location is made of. 'ship' is the hub (and the title screen);
 * the rest are mission ids. Unknown ids fall back to the first world.
 *
 * The painted parts (sky, skyline, ground, weather) are defined here; where
 * things stand (the body in the sky, props, set pieces) is the location's
 * layout, in layouts.json, so the scene editor (dist/editor.html) can save it.
 */
import type { AmbientSpec } from './ambient';
import type { GroundSpec } from './ground';
import type { Piece } from './pieces';
import type { SkySpec } from './sky';
import type { Rank } from './skyline';
import type { FrameStyle, PropStyle } from './structures';
import LAYOUTS from './layouts.json';

/** Where things stand in a location (edited with the scene editor). */
export interface Layout {
  /** Something big in the sky: x as a fraction of the width, y of the horizon height; r in pixels (planet: fraction of the width). */
  body?: { kind: 'moon' | 'eclipse' | 'planet'; x: number; y: number; r: number; col: string };
  /** Painted props on the ground (x as a fraction of the width). */
  props: { style: PropStyle; x: number }[];
  /** PixelLab set pieces (sprite sheets), drawn over the painted scene. */
  pieces: Piece[];
}

interface Look {
  sky: SkySpec;
  /** The ship's nave: a vaulted wall with a great window instead of a skyline. */
  interior?: boolean;
  skyline: Rank[];
  haze: string;
  ground: GroundSpec;
  frames: [FrameStyle, FrameStyle];
  /** Banner / crystal / egg colour. */
  accent: number;
  ambient: AmbientSpec;
  /** Rim light on the figures. */
  rim: [number, number, number];
}

export type Location = Look & Layout;

const LOOKS: Record<string, Look> = {
  ship: {
    sky: { bands: ['#030308', '#06060f', '#0b0a18', '#120e22', '#1a1230'], clouds: 0.5, stars: 0.02, tint: { x: 0.62, y: 0.5, r: 0.35, col: '#3a1a4a' } },
    interior: true,
    skyline: [],
    haze: '#14121c',
    ground: { style: 'flagstone', shades: ['#0d0c11', '#17161d', '#211f28', '#2d2b35', '#3d3a46', '#4f4b58'], haze: '#1a1822', pools: { col: '#120f18', glint: '#3a2a4a', amount: 0.25 } },
    frames: ['column', 'column'],
    accent: 0x8f2a32,
    ambient: { weather: 'dust', tint: '#8a8070', fog: '#2a2433' },
    rim: [210, 160, 110],
  },
  veridia: {
    sky: { bands: ['#05080a', '#0a1214', '#0f1c1c', '#152824', '#1d362c', '#284434', '#34543e'], clouds: 1, tint: { x: 0.7, y: 0.6, r: 0.4, col: '#5a6a2a' } },
    skyline: [
      { style: 'trees', tones: ['#1c2a26', '#162220'], density: 3, height: [0.35, 0.65], seed: 3 },
      { style: 'spires', tones: ['#141c1a', '#0e1413'], density: 1.4, height: [0.25, 0.55], lights: { col: '#d89a4a', chance: 0.12 }, seed: 8 },
      { style: 'trees', tones: ['#0f1714', '#0a100e'], density: 1.2, height: [0.5, 0.85], seed: 11 },
    ],
    haze: '#2a3a32',
    ground: { style: 'moss', shades: ['#0c0e0c', '#151a16', '#1f261f', '#2a332a', '#384336', '#4a5646'], haze: '#22302a', pools: { col: '#0c1a18', glint: '#2a5a4a', amount: 0.3 } },
    frames: ['trunk', 'wall'],
    accent: 0x3a6a3a,
    ambient: { weather: 'spores', tint: '#9affb0', fog: '#4a6a5a', sky: ['lightning'], skyAt: [0.6, 0.2] },
    rim: [150, 210, 170],
  },
  kethra: {
    sky: { bands: ['#080303', '#140505', '#240a08', '#3a100a', '#56180e', '#742612', '#8a3416'], clouds: 1, tint: { x: 0.3, y: 0.9, r: 0.5, col: '#a8401a' } },
    skyline: [
      { style: 'rigs', tones: ['#2a1210', '#200d0c'], density: 2.4, height: [0.2, 0.5], lights: { col: '#ff8a3a', chance: 0.08 }, seed: 5 },
      { style: 'rigs', tones: ['#170a09', '#110707'], density: 1.6, height: [0.3, 0.7], lights: { col: '#ffb060', chance: 0.12 }, seed: 9 },
    ],
    haze: '#5a2010',
    ground: { style: 'rock', shades: ['#0a0708', '#151012', '#201819', '#2c2122', '#3a2b2a', '#4a3632'], haze: '#3a1a12', seams: '#ff6a2a' },
    frames: ['gantry', 'gantry'],
    accent: 0x8a3a1a,
    ambient: { weather: 'embers', tint: '#ff9a40', fog: '#5a2a1a' },
    rim: [255, 140, 80],
  },
  glacies: {
    sky: { bands: ['#03050c', '#060b18', '#0a1424', '#102034', '#182e46', '#243e58', '#344e68'], clouds: 0.6, stars: 0.015 },
    skyline: [
      { style: 'ice', tones: ['#3a4a60', '#2a3850'], density: 3, height: [0.2, 0.6], seed: 4 },
      { style: 'spires', tones: ['#1c2638', '#141c2a'], density: 1.2, height: [0.3, 0.6], lights: { col: '#8ac8ff', chance: 0.08 }, seed: 6 },
      { style: 'ice', tones: ['#24324a', '#1a2438'], density: 1.4, height: [0.35, 0.75], seed: 12 },
    ],
    haze: '#40506a',
    ground: { style: 'snow', shades: ['#1a2232', '#2a3448', '#46546c', '#6c7c96', '#9eaec4', '#c8d4e2'], haze: '#3a4a62', pools: { col: '#2a4a68', glint: '#8ac8ef', amount: 0.25 } },
    frames: ['cliff', 'wall'],
    accent: 0x3a6aa0,
    ambient: { weather: 'snow', tint: '#e6eef8', fog: '#7a90a8', sky: ['aurora'] },
    rim: [170, 210, 255],
  },
  void_rift: {
    sky: { bands: ['#020104', '#05030a', '#0a0612', '#100a1c', '#160e26'], clouds: 0.7, stars: 0.025, tint: { x: 0.55, y: 0.35, r: 0.4, col: '#54226e' } },
    skyline: [
      { style: 'wrecks', tones: ['#1e1a28', '#16121e'], density: 1.6, height: [0.3, 0.6], lights: { col: '#a44ccc', chance: 0.05 }, seed: 7 },
      { style: 'wrecks', tones: ['#120f18', '#0c0a10'], density: 1, height: [0.3, 0.6], lights: { col: '#e0a24a', chance: 0.05 }, seed: 13 },
    ],
    haze: '#24182e',
    ground: { style: 'deck', shades: ['#0b0a10', '#15131c', '#1f1c28', '#2a2735', '#383444', '#4a4558'], haze: '#1c1626', pools: { col: '#120c1a', glint: '#6b228f', amount: 0.15 } },
    frames: ['hull', 'hull'],
    accent: 0x6b228f,
    ambient: { weather: 'debris', tint: '#4a4458', fog: '#3a2a4a', sky: ['rift', 'lightning'], skyAt: [0.55, 0.35] },
    rim: [190, 130, 230],
  },
  xenith: {
    sky: { bands: ['#0a0705', '#160f08', '#24180a', '#38240e', '#4c3212', '#644216', '#7a521c'], clouds: 1, tint: { x: 0.5, y: 0.9, r: 0.6, col: '#8a5a1a' } },
    skyline: [
      { style: 'hive', tones: ['#2a1e10', '#20170c'], density: 3, height: [0.25, 0.6], lights: { col: '#ffb000', chance: 0.06 }, seed: 2 },
      { style: 'hive', tones: ['#170f08', '#110b06'], density: 1.6, height: [0.4, 0.85], lights: { col: '#ffc040', chance: 0.05 }, seed: 10 },
    ],
    haze: '#4a3416',
    ground: { style: 'resin', shades: ['#0e0906', '#1a110a', '#281a0e', '#382412', '#4a3016', '#5e3e1c'], haze: '#3a2812', seams: '#c88a2a' },
    frames: ['pillar', 'pillar'],
    accent: 0xb07a2a,
    ambient: { weather: 'spores', tint: '#ffd060', fog: '#6a5020' },
    rim: [255, 190, 110],
  },
};

/** Every location's saved layout. */
export const LAYOUT_DATA = LAYOUTS as unknown as Record<string, Layout>;

/** Location ids (the ship, then the missions' worlds). */
export const LOCATION_IDS = Object.keys(LOOKS);

/** A location, optionally with another layout (the scene editor's unsaved one). */
export function locationOf(key: string, layout?: Layout): Location {
  const id = key in LOOKS ? key : 'veridia';
  return { ...LOOKS[id]!, ...(layout ?? LAYOUT_DATA[id] ?? { props: [], pieces: [] }) };
}
