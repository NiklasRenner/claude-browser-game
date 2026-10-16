/**
 * What each location is made of. 'ship' is the hub (and the title screen);
 * the rest are mission ids. Unknown ids fall back to the first world.
 *
 * A location's look (sky, tree lines, ground, weather...) is defined here.
 * Its layout, in layouts.json, is the list of layers it's drawn from, back to
 * front: painted parts of the look, generated sprites, and the fighters. The
 * scene editor (dist/editor.html) edits and saves it.
 */
import type { AmbientSpec } from './ambient';
import type { GroundSpec } from './ground';
import type { SkySpec } from './sky';
import type { Rank } from './skyline';
import type { FrameStyle, PropStyle } from './structures';
import type { SheetId } from '../sprites/sheet-data';
import LAYOUTS from './layouts.json';

/**
 * Where a placed layer is: its top-left corner in the narrowest scene (MIN_W × SCENE_H, see scale.ts).
 * On wider screens it stays with the centre (like the fighters), or, `pinned`, with its nearest edge.
 */
export interface Spot { x: number; y: number; pinned?: boolean }

/** One layer of a scene. */
export type SceneLayer =
  /** The look's sky, sky effects (lightning, aurora...), the ship's nave wall, the haze along the horizon, the ground, weather and fog, the darkened corners. */
  | { part: 'sky' | 'sky-fx' | 'nave' | 'haze' | 'ground' | 'weather' | 'vignette' }
  /** Where the fighters are drawn. */
  | { part: 'fighters' }
  /** One of the look's skyline ranks (tree lines, spires...). */
  | { part: 'skyline'; rank: number }
  /** The look's painted structure framing one edge of the screen. */
  | { part: 'frame'; side: 'left' | 'right' }
  /** The look's moon, eclipse or planet. */
  | ({ part: 'body' } & Spot)
  /** A small painted prop (brazier, candles...). */
  | ({ part: 'prop'; style: PropStyle } & Spot)
  /** A generated sprite: looping its frames at `fps` (default 6), mirrored with `flip`, tinted toward the location's haze by `fog` (0–1). */
  | ({ part: 'sprite'; sheet: SheetId; flip?: boolean; fps?: number; fog?: number } & Spot);

export interface Layout { layers: SceneLayer[] }

interface Look {
  sky: SkySpec;
  /** Something big in the sky (r in pixels); placed by its 'body' layer. */
  body?: { kind: 'moon' | 'eclipse' | 'planet'; r: number; col: string };
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
    body: { kind: 'planet', r: 51, col: '#4a6a7a' },
    skyline: [],
    haze: '#14121c',
    ground: { style: 'deck', shades: ['#08090d', '#11131a', '#1a1d27', '#252935', '#333846', '#464c5e'], haze: '#161822', pools: { col: '#0e1018', glint: '#2a3a5a', amount: 0.15 } },
    frames: ['column', 'column'],
    accent: 0x8f2a32,
    ambient: { weather: 'dust', tint: '#8a8070', fog: '#2a2433' },
    rim: [210, 160, 110],
  },
  veridia: {
    sky: { bands: ['#05080a', '#0a1214', '#0f1c1c', '#152824', '#1d362c', '#284434', '#34543e'], clouds: 1, tint: { x: 0.7, y: 0.6, r: 0.4, col: '#5a6a2a' } },
    body: { kind: 'moon', r: 9, col: '#c8d8a8' },
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
    body: { kind: 'moon', r: 14, col: '#a8644a' },
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
    body: { kind: 'moon', r: 11, col: '#dce8f4' },
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
    body: { kind: 'eclipse', r: 12, col: '#ffb040' },
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
  return { ...LOOKS[id]!, ...(layout ?? LAYOUT_DATA[id] ?? { layers: [{ part: 'sky' }, { part: 'ground' }, { part: 'fighters' }] }) };
}
