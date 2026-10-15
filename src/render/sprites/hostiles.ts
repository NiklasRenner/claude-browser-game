/** Builds a hostile's figure from its `look`: body plan, colours, features, scale. */
import type { HostileLook, LookFeature } from '../../core';
import { glowOf, rampOf } from '../pixel/palette';
import { blob, elemental, golem, humanoid, husk, wisp, wraith } from './beings';
import { beast, brute, dragon, flyer, insect, serpent } from './creatures';
import type { Figure } from './figure';
import type { Body, Kit } from './kit';

const BODIES: Record<HostileLook['body'], Body> = {
  blob, beast, brute, humanoid, husk, elemental, flyer, golem, serpent, dragon, insect, wraith, wisp,
};

export function hostileFigure(look: HostileLook, boss: boolean): Figure {
  const body = BODIES[look.body];
  const features = new Set<LookFeature>(look.features ?? []);
  const kit: Kit = {
    body: rampOf(look.color),
    dark: rampOf(look.color, 0.72),
    accent: rampOf(look.accent),
    glow: glowOf(look.accent),
    boss,
    has: (f) => features.has(f),
  };
  return {
    left: body.left, right: body.right, height: body.height, hover: body.hover ?? 0, scale: look.scale * (body.size ?? 1),
    draw: (p, pose) => body.draw(p, pose, kit),
  };
}
