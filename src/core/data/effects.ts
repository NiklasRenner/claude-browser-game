/**
 * What each damage type can do besides damage, and what every status means.
 * An attack of an element is never *guaranteed* to apply its effect; weapons,
 * abilities and hostile attacks opt in with a chance. But the only effect they
 * may carry is their element's own (validateContent checks this), so the damage
 * type always tells you what to expect. Kinetic has no effect (yet).
 */
import type { Element, StatusId } from '../types';

export const ELEMENT_EFFECTS: Record<Element, StatusId | null> = {
  kinetic: null,
  plasma: 'burn',
  corrosive: 'corrode',
  cryo: 'chill',
  ion: 'stun',
  photon: 'blind',
  void: 'exposed',
};

/** Player-facing names and one-line explanations (log, chips, tooltips). */
export const STATUS_INFO: Record<StatusId, { name: string; help: string }> = {
  burn: { name: 'Burn', help: 'Heavy damage every turn for a short while. A new burn replaces the old one.' },
  corrode: { name: 'Corrode', help: 'Poison: lighter damage every turn for longer, and every new dose stacks on top.' },
  chill: { name: 'Chill', help: 'Slowed: speed reduced, so turns come later.' },
  stun: { name: 'Stun', help: 'Skips the next turn.' },
  blind: { name: 'Blind', help: 'Hit chance reduced.' },
  exposed: { name: 'Exposed', help: 'Takes extra damage from everything.' },
  shield: { name: 'Shield', help: 'Takes less damage.' },
  evasive: { name: 'Evasive', help: 'Harder to hit.' },
  marked: { name: 'Marked', help: 'Easier to hit.' },
};
