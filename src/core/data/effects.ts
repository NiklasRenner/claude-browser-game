/**
 * What each damage type can do besides damage, and what every status means.
 * An attack of an element is never *guaranteed* to apply its effect; weapons,
 * abilities and hostile attacks opt in with a chance. But the only effect they
 * may carry is their element's own (validateContent checks this), so the damage
 * type always tells you what to expect. Kinetic has no effect (yet).
 *
 * Adding a status: add its id to StatusId (types.ts), a row to STATUSES here,
 * and wherever its `power` takes effect in src/core/combat (formulas.ts for
 * numbers like hit and evasion, round.ts for turn skips); icons and colours
 * are in src/game/elements.ts.
 */
import { CORRODE_MAX_STACKS } from '../stats';
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

export interface StatusRule {
  /** Player-facing name (chips, tooltips). */
  name: string;
  /** For the log: "X is burning (2)", "X is no longer burning". */
  adjective: string;
  /** One-line explanation (tooltips). */
  help: string;
  /** What `power` means, in words: "5 damage/turn", "−30% speed"… */
  amount: (power: number) => string;
  /**
   * Damage over time: deals `power` of this element at the start of each of
   * the owner's turns. Only these scale with the attacker's damage (Power,
   * patrol scaling); other statuses keep the power they were authored with.
   */
  dot?: Element;
  /**
   * How a new dose combines with one already running. By default the longer
   * duration and the stronger power win. With `stacks`, powers add up, to at
   * most `stacks` × the new dose.
   */
  stacks?: number;
}

export const STATUSES: Record<StatusId, StatusRule> = {
  burn: {
    name: 'Burn', adjective: 'burning', dot: 'plasma', amount: (p) => `${p} damage/turn`,
    help: "Heavy damage every turn for a short while. Burns don't add up: the stronger and the longer one count.",
  },
  corrode: {
    name: 'Corrode', adjective: 'corroding', dot: 'corrosive', stacks: CORRODE_MAX_STACKS, amount: (p) => `${p} damage/turn`,
    help: 'Poison: lighter damage every turn for longer, and every new dose stacks on top.',
  },
  chill: { name: 'Chill', adjective: 'chilled (slowed)', amount: (p) => `−${p}% speed`, help: 'Slowed: speed reduced, so turns come later.' },
  stun: { name: 'Stun', adjective: 'stunned', amount: () => 'skips a turn', help: 'Skips the next turn.' },
  blind: { name: 'Blind', adjective: 'blinded', amount: (p) => `−${p}% hit`, help: 'Hit chance reduced.' },
  exposed: { name: 'Exposed', adjective: 'exposed', amount: (p) => `+${p}% damage taken`, help: 'Takes extra damage from everything.' },
  shield: { name: 'Shield', adjective: 'shielded', amount: (p) => `−${p}% damage taken`, help: 'Takes less damage.' },
  evasive: { name: 'Evasive', adjective: 'evasive', amount: (p) => `+${p} evasion`, help: 'Harder to hit.' },
  marked: { name: 'Marked', adjective: 'marked', amount: (p) => `−${p} evasion`, help: 'Easier to hit.' },
};

/**
 * A status's power as inflicted by an attacker whose damage is multiplied by
 * `mult` (Power, or a patrol hostile's scaling): damage over time scales with
 * it, everything else doesn't.
 */
export function inflictedPower(id: StatusId, power: number, mult: number): number {
  return STATUSES[id].dot ? Math.round(power * mult) : power;
}
