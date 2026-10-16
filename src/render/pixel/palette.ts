/**
 * Colour ramps. A ramp is a short list of shades from darkest to lightest;
 * the painter picks one per pixel from the surface's lighting. Shadows lean
 * cold and purple, highlights lean warm, which is what keeps the art dark
 * without going muddy.
 */

export type RGB = readonly [number, number, number];
/** Any list of shades, darkest first. */
export type Shades = readonly RGB[];
/** A full ramp: at least five shades, so indices 0–4 are always there. */
export type Ramp = readonly [RGB, RGB, RGB, RGB, RGB, ...RGB[]];

export const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const fromInt = (n: number): RGB => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const ramp = (...hs: string[]): Ramp => hs.map(hex) as unknown as Ramp;
export const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Shared material ramps. */
export const R = {
  iron: ramp('#0e0d14', '#1b1c26', '#2b2e3c', '#454b5e', '#737c92'),
  gold: ramp('#24160b', '#563414', '#93612a', '#cf9a45', '#f2d589'),
  coat: ramp('#0c0b10', '#17151d', '#24212c', '#35303f', '#4b4456'),
  bone: ramp('#231d1a', '#4e4236', '#83715a', '#b5a07c', '#e0d0a8'),
  leather: ramp('#140d09', '#2c1d15', '#4b3121', '#6e4a30', '#956844'),
  rust: ramp('#140c0b', '#2c1813', '#4a2619', '#6e3a1f', '#97582c'),
  steel: ramp('#1c222a', '#3e4a57', '#73828f', '#b0c0cb', '#eaf4f8'),
  wood: ramp('#120c09', '#271a12', '#40291b', '#5c3c27', '#7c5436'),
  skin: ramp('#2a1a18', '#5a3a32', '#8c6352', '#b88a70', '#dcb69a'),
  flesh: ramp('#24191c', '#4e383a', '#7d625b', '#a98a78', '#d0b49b'),
  stone: ramp('#0d0c11', '#17161d', '#211f28', '#2d2b35', '#3d3a46', '#4f4b58'),
  snow: ramp('#2a3446', '#46546c', '#6c7c96', '#9eaec4', '#d4dde8', '#f2f6fa'),
  void: [hex('#040306')] as Shades,
} as const;

export const FIRE = ramp('#5a1a12', '#a8361c', '#e0662a', '#ffa842', '#ffe08a', '#fff8d8');
export const WARP = ramp('#1c0a28', '#3e1458', '#6b228f', '#a44ccc', '#d98cf0', '#fbe6ff');

/** Hue in degrees, saturation and lightness 0–1. */
export function toHsl([r, g, b]: RGB): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Moves hue `h` toward `target` by up to `by` degrees, the short way round. */
function lean(h: number, target: number, by: number): number {
  const d = ((target - h + 540) % 360) - 180;
  return (h + Math.sign(d) * Math.min(Math.abs(d), by) + 360) % 360;
}

/**
 * A five-shade ramp built around one colour (e.g. a hostile's `look.color`),
 * darkened to sit in the game's gloomy palette.
 */
export function rampOf(color: number | RGB, brightness = 1): Ramp {
  const [h, s, l] = toHsl(typeof color === 'number' ? fromInt(color) : color);
  const lift = (0.55 + l * 0.75) * brightness;
  const steps = [0.07, 0.14, 0.24, 0.36, 0.52];
  return steps.map((step, i): RGB => {
    const hue = i < 2 ? lean(h, 255, 18 - i * 6) : i > 2 ? lean(h, 45, (i - 2) * 7) : h;
    const sat = Math.min(1, s * (i === 4 ? 0.8 : 0.9));
    return fromHsl(hue, sat, Math.min(0.92, step * lift));
  }) as unknown as Ramp;
}

/** A bright colour for glowing details (eyes, energy), never darker than mid-tone. */
export function glowOf(color: number): RGB {
  const [h, s, l] = toHsl(fromInt(color));
  return fromHsl(h, Math.min(1, s * 1.05), Math.max(0.58, l));
}
