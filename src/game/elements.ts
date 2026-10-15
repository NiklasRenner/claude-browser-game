/** Colours and icons for damage types and statuses, shared by the UI and the 3D stage. */
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

export const STATUS_COLORS: Record<StatusId, number> = {
  burn: 0xff6a2b, corrode: 0x8ee84a, stun: 0xffe14d, shield: 0x6cc6ff, evasive: 0xc9d6ff, chill: 0x6cd6ff, marked: 0xff4d6d,
};

export const STATUS_ICONS: Record<StatusId, string> = {
  burn: '🔥', corrode: '☣', stun: '💫', shield: '🛡', evasive: '◌', chill: '❄', marked: '⌖',
};
