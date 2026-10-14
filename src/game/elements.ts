import type { Element, StatusId } from '../core';

export const ELEMENT_COLORS: Record<Element, number> = {
  physical: 0xd0d4dc,
  fire: 0xff6a2b,
  ice: 0x6cc6ff,
  energy: 0xffe14d,
  light: 0xfff1a8,
  darkness: 0xa36bff,
  poison: 0x72e05a,
};

export const ELEMENT_ICONS: Record<Element, string> = {
  physical: '⚔', fire: '🔥', ice: '❄', energy: '⚡', light: '☀', darkness: '☾', poison: '☠',
};

export const STATUS_ICONS: Record<StatusId, string> = {
  burn: '🔥', poison: '☠', stun: '💫', guard: '🛡', evasive: '💨', chill: '❄',
};

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
