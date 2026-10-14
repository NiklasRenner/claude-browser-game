import type { Element, StatusId } from '../core';

export const ELEMENT_COLORS: Record<Element, number> = {
  kinetic: 0xd0d4dc,
  plasma: 0xff6a2b,
  cryo: 0x6cd6ff,
  ion: 0xffe14d,
  photon: 0xfff4c0,
  void: 0xa36bff,
  corrosive: 0x8ee84a,
};

export const ELEMENT_ICONS: Record<Element, string> = {
  kinetic: '◆', plasma: '🔥', cryo: '❄', ion: '⚡', photon: '✦', void: '◐', corrosive: '☣',
};

export const ELEMENT_NAMES: Record<Element, string> = {
  kinetic: 'kinetic', plasma: 'plasma', cryo: 'cryo', ion: 'ion', photon: 'photon', void: 'void', corrosive: 'corrosive',
};

export const STATUS_ICONS: Record<StatusId, string> = {
  burn: '🔥', corrode: '☣', stun: '💫', shield: '🛡', evasive: '◌', chill: '❄',
};

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
