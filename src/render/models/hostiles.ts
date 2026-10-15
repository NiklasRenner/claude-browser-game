/** Builds a hostile's figure from its `look` (body plan, colours, features). */
import type { HostileLook, LookFeature } from '../../core';
import { blob, elemental, golem, humanoid, husk, wisp, wraith } from './beings';
import { Builder } from './builder';
import type { Figure } from './builder';
import { bat, beast, brute, dragon, insect, serpent } from './creatures';
import type { Rig } from './creatures';

type BodyBuilder = (b: Builder, look: HostileLook, boss: boolean, has: (f: LookFeature) => boolean) => Rig;

const BODIES: Record<HostileLook['body'], BodyBuilder> = {
  blob, beast, brute, humanoid, husk, elemental, flyer: bat, golem, serpent, dragon, insect, wraith, wisp,
};

export function buildHostile(look: HostileLook, boss: boolean): Figure {
  const b = new Builder();
  const features = new Set<LookFeature>(look.features ?? []);
  const rig = BODIES[look.body](b, look, boss, (f) => features.has(f));
  return b.figure(look.scale, rig.idle, rig.attack);
}
