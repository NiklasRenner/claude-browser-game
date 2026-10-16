/** Builds a hostile's figure from its `look`: body plan, colours, features, scale. */
import type { HostileLook, LookFeature } from '../../core';
import { glowOf, rampOf } from '../pixel/palette';
import { blob, elemental, golem, humanoid, husk, wisp, wraith } from './beings';
import { beast, brute, dragon, flyer, insect, serpent } from './creatures';
import type { Figure } from './figure';
import type { Body, Kit } from './kit';
import { SHEETS } from './sheet-data';
import type { SheetId } from './sheet-data';
import { framesOf, isSheet } from './sheets';

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
  const painted: Figure = {
    left: body.left, right: body.right, height: body.height, hover: body.hover ?? 0, scale: look.scale * (body.size ?? 1),
    draw: (p, pose) => body.draw(p, pose, kit),
  };
  return look.sprite && isSheet(look.sprite.sheet) ? spriteFigure(look.sprite.sheet, look.sprite, painted) : painted;
}

/**
 * A hostile drawn from a sprite sheet at its native pixel size (scale 1, so
 * pixels stay square). Until the sheet loads, the painted body stands in
 * (drawn at the sprite's scale).
 */
function spriteFigure(id: SheetId, anim: NonNullable<HostileLook['sprite']>, painted: Figure): Figure {
  const { w, h, ax } = SHEETS[id];
  return {
    left: ax + 2, right: w - ax + 2, height: h + 2, hover: 0, scale: 1,
    draw: (p, pose) => {
      const frames = framesOf(id);
      if (!frames) { painted.draw(p, pose); return; }
      const frame = frames[frameAt(anim, pose.t, pose.attack)] ?? frames[0]!;
      p.image(frame, -ax, -frame.h);
    },
  };
}

/**
 * Which sheet frame to show: the idle loop, or during an attack the frame for
 * how far through it is (0..1, evenly spread; the stage lands the strike at 0.4).
 */
export function frameAt(anim: NonNullable<HostileLook['sprite']>, t: number, attack: number): number {
  const swing = anim.attack;
  if (attack > 0 && swing?.length) return swing[Math.min(swing.length - 1, Math.floor(attack * swing.length))]!;
  return anim.idle[Math.floor(t * (anim.fps ?? 1.4)) % anim.idle.length]!;
}
