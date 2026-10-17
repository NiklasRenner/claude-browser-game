/**
 * Plays a step's events on the stage, one after another: hostiles condensing
 * out of the dark, attacks (lunges, bolts, orbs, or an ability's own look),
 * hits and misses, statuses, heals, level-ups, defeat. It only animates; the
 * state it ends on is the one core already decided (`after`).
 */
import { STATUSES, getAbility, getHostile, getWeapon, resolveElement } from '../core';
import type { Element, GameEvent, GameState } from '../core';
import { ELEMENT_COLORS, STATUS_COLORS, STATUS_ICONS } from '../game/elements';
import { ABILITY_LOOKS, playCast, playTravel } from './ability-fx';
import { FALLEN, center, groupCenter, hand, head, shot } from './actor';
import type { Actor } from './actor';
import { FX_COLORS } from './fx';
import type { Effects } from './fx';
import { fromInt, glowOf } from './pixel/palette';
import type { RGB } from './pixel/palette';
import type { Tweens } from './tween';
import { easeOutCubic } from './tween';

/** What the director needs from the stage. */
export interface Scene {
  readonly hero: Actor | null;
  /** One per lineup slot (same indices as battle.hostiles). */
  readonly hostiles: Actor[];
  targetIdx: number;
  /** Screen shake in pixels; decays by itself. */
  shake: number;
  readonly W: number;
  readonly H: number;
  /** Seconds since the stage started (drives idle motion). */
  readonly time: number;
  readonly fx: Effects;
  readonly tweens: Tweens;
  /** Makes the scene match a state at once. */
  sync(state: GameState): void;
}

const elementColor = (el: Element): RGB => glowOf(ELEMENT_COLORS[el]);
/** How far the officer runs off to the left when beaming out, as a share of the scene's width. */
const BEAM_OUT = 0.45;
const CONFETTI: RGB[] = (['plasma', 'cryo', 'ion', 'corrosive', 'void'] as const).map((el) => fromInt(ELEMENT_COLORS[el]));

/** Plays a step's events in order; `played(i)` is called as each one finishes (the UI's bars follow it). */
export async function playEvents(scene: Scene, events: GameEvent[], before: GameState, after: GameState, played: (i: number) => void) {
  if (before.mode !== 'title') scene.sync({ ...before });
  // Strikes of the player's current ability played so far (an AoE ability strikes each target).
  let strikes = 0;
  for (const [i, e] of events.entries()) {
    if (e.type === 'abilityUsed' && e.actor === 'player') strikes = 0;
    await play(scene, e, before, after, strikes);
    played(i);
    if (e.type === 'attack' && e.abilityId) strikes++;
  }
  scene.tweens.flush();
  scene.sync(after);
}

const actorFor = (scene: Scene, actor: 'player' | 'hostile', foe?: number): Actor | null =>
  actor === 'player' ? scene.hero : scene.hostiles[foe ?? scene.targetIdx] ?? null;

function flash(scene: Scene, a: Actor, strength = 0.85) {
  a.flash = strength;
  void scene.tweens.run(0.25, (t) => { a.flash = strength * (1 - t); });
}

/**
 * How long attack animations play (seconds). Slow enough to see the art: a hostile's melee swing
 * (lunge, then recover) takes about 0.8 s for its six frames.
 *   lunge/strike/recover: a melee attack's step in, the officer's swing, and the step back;
 *   shot: a gun firing; cast: an orb thrown; ability: an ability with its own effect.
 */
const SWING = { lunge: 0.32, strike: 0.14, recover: 0.48, shot: 0.35, cast: 0.8, ability: 0.6 };

/** How an attack looks: non-weapon abilities fly as an orb, ranged weapons fire a bolt, the rest is melee. */
function attackStyle(actor: 'player' | 'hostile', element: Element, abilityId: string | undefined, state: GameState): 'orb' | 'bolt' | 'melee' {
  if (actor === 'hostile') return element === 'kinetic' ? 'melee' : 'orb';
  const ability = abilityId ? getAbility(abilityId) : null;
  if (ability && !ability.effects.some((x) => x.type === 'damage' && x.useWeapon)) return 'orb';
  return state.player && getWeapon(state.player.weapon).style === 'ranged' ? 'bolt' : 'melee';
}

async function play(scene: Scene, e: GameEvent, before: GameState, after: GameState, strikes: number) {
  const { fx, tweens, hero } = scene;
  switch (e.type) {
    case 'battleStart': {
      scene.sync(after);
      // Hostiles condense out of the dark one after another.
      await Promise.all(scene.hostiles.map(async (a, i) => {
        a.dissolve = 1;
        await tweens.wait(i * 0.15);
        fx.burst(...center(a), FX_COLORS.dust, 20, 30, 0.6, -20);
        await tweens.run(0.5, (t) => { a.dissolve = 1 - t; });
      }));
      if (e.boss) {
        const boss = scene.hostiles[e.hostileIds.findIndex((id) => getHostile(id).boss)];
        scene.shake = 5;
        if (boss) fx.popText(...head(boss, 8), '⚠ WARNING', 'pop-boss');
      }
      return;
    }
    case 'targeted':
      scene.targetIdx = e.foe;
      return;
    case 'hostileDown': {
      const a = scene.hostiles[e.foe];
      if (!a) return;
      fx.ash(a.x, a.y, 24 * a.figure.scale, a.figure.height * a.figure.scale);
      await tweens.run(0.6, (t) => { a.dissolve = t; });
      a.visible = false;
      return;
    }
    case 'attack': {
      const attacker = actorFor(scene, e.actor, e.foe);
      const target = e.actor === 'player' ? actorFor(scene, 'hostile', e.foe) : hero;
      if (!attacker || !target) return;
      const followUp = e.strike > 0;
      const dir = attacker.facing;
      const col = elementColor(e.element);
      const style = attackStyle(e.actor, e.element, e.abilityId, after);
      // Gun shots fly straight out of the muzzle; anything else from the front of the body to the target.
      const gun = shot(attacker, target, scene.time);
      const from = gun?.from ?? hand(attacker, scene.time);
      const impact = style === 'melee' ? center(target) : gun?.to ?? center(target);
      const travel = e.abilityId ? ABILITY_LOOKS[e.abilityId]?.travel : undefined;
      let swing: Promise<void> = Promise.resolve();
      if (travel && style !== 'melee' && (!followUp || travel === 'pulses')) {
        // The ability's own way of striking (see ability-fx.ts).
        swing = tweens.run(SWING.ability, (t) => { attacker.attack = t >= 1 ? 0 : t; });
        if (travel === 'orbital' || travel === 'heavy') scene.shake = 4;
        await playTravel(fx, travel, col, from, impact, strikes === 0, groupCenter(scene.hostiles, [scene.W * 0.7, scene.H * 0.6]));
      } else if (followUp) {
        if (style !== 'melee') await fx.bolt(from, impact, col, 0.07);
      } else if (style === 'orb') {
        swing = tweens.run(SWING.cast, (t) => { attacker.attack = t >= 1 ? 0 : t; });
        await fx.projectile(from, impact, col, 0.35, gun ? 0 : 12);
      } else if (style === 'bolt') {
        swing = tweens.run(SWING.shot, (t) => { attacker.attack = t >= 1 ? 0 : t; });
        await fx.bolt(from, impact, col);
      } else {
        // Melee: lunge up to the target, swing, and step back.
        const gap = (target.figure.left + attacker.figure.right) * 0.45;
        const dist = Math.max(0, Math.abs(target.x - attacker.x) - gap - 10) * dir;
        await tweens.run(SWING.lunge, (t) => { attacker.ox = t * dist; attacker.attack = t * (e.actor === 'player' ? 0.3 : 0.4); }, easeOutCubic);
        if (e.actor === 'player') await tweens.run(SWING.strike, (t) => { attacker.attack = 0.3 + t * 0.7; }, (t) => t);
        if (e.hit) void fx.slash(...center(target), e.crit ? FX_COLORS.crit : col, e.crit ? 18 : 14);
      }
      if (e.hit) {
        flash(scene, target);
        scene.shake = e.crit ? 5 : 2;
        fx.burst(...impact, col, e.crit ? 30 : 14, e.crit ? 70 : 45, 0.45);
        fx.popText(...head(target), `${e.damage}${e.crit ? '!' : ''}`,
          `${e.actor === 'player' ? 'pop-dmg' : 'pop-hurt'}${e.crit ? ' pop-crit' : ''} el-${e.element}`);
        void tweens.run(0.2, (t) => { target.ox = Math.sin(t * Math.PI) * 4 * dir; });
      } else {
        fx.popText(...head(target), 'MISS', 'pop-miss');
      }
      if (style === 'melee' && !followUp) {
        const start = attacker.ox, a0 = attacker.attack;
        // The swing plays on to its end while stepping back (never in reverse).
        await tweens.run(SWING.recover, (t) => { attacker.ox = start * (1 - t); attacker.attack = a0 + (1 - a0) * t; });
        attacker.attack = 0;
      }
      // A shot or cast plays its whole animation before the next thing happens.
      await swing;
      await tweens.wait(followUp ? 0.08 : 0.12);
      return;
    }
    case 'abilityUsed': {
      const a = actorFor(scene, e.actor);
      if (!a) return;
      const ability = getAbility(e.abilityId);
      const dmg = ability.effects.find((x) => x.type === 'damage');
      const el = dmg?.type === 'damage' ? resolveElement(after.player!, dmg.element) : 'photon';
      fx.popText(...head(a, 10), ability.name, 'pop-ability');
      const look = e.actor === 'player' ? ABILITY_LOOKS[ability.id] : undefined;
      if (look?.cast) {
        const target = scene.hostiles[scene.targetIdx];
        const at = hand(a, scene.time);
        await playCast(fx, look.cast, elementColor(el), center(a), at, target ? center(target) : at, a.figure.height * a.figure.scale);
      } else {
        await fx.ring(a.x, a.y, elementColor(el));
      }
      return;
    }
    case 'heal': {
      const a = actorFor(scene, e.actor);
      if (!a || (e.amount <= 0 && e.energy <= 0)) return;
      fx.burst(a.x, a.y - 4, e.amount > 0 ? FX_COLORS.heal : FX_COLORS.energy, 24, 25, 0.8, -50);
      if (e.amount > 0) fx.popText(...head(a), `+${e.amount}`, 'pop-heal');
      if (e.energy > 0) fx.popText(...head(a, 14), `+${e.energy} EN`, 'pop-energy');
      await tweens.wait(0.35);
      return;
    }
    case 'statusExpired':
      actorFor(scene, e.target, e.foe)?.statuses.delete(e.status);
      return;
    case 'statusApplied': {
      const a = actorFor(scene, e.target, e.foe);
      if (!a) return;
      a.statuses.add(e.status);
      fx.popText(...head(a, 10), `${STATUS_ICONS[e.status]} ${e.status}`, 'pop-status');
      await fx.ring(a.x, a.y, glowOf(STATUS_COLORS[e.status]), 16, 0.4);
      return;
    }
    case 'statusTick': {
      const a = actorFor(scene, e.target, e.foe);
      if (!a) return;
      flash(scene, a, 0.5);
      fx.burst(...center(a), fromInt(STATUS_COLORS[e.status]), 10, 25, 0.5, -30);
      fx.popText(...head(a), `${e.damage}`, `pop-tick el-${STATUSES[e.status].dot}`);
      await tweens.wait(0.3);
      return;
    }
    case 'stunned': {
      const a = actorFor(scene, e.actor, e.foe);
      if (!a) return;
      fx.popText(...head(a, 8), `${STATUS_ICONS.stun} Stunned`, 'pop-status');
      fx.burst(...head(a, 0), fromInt(STATUS_COLORS.stun), 12, 20, 0.6, 0);
      await tweens.wait(0.45);
      return;
    }
    case 'victory':
      if (hero) fx.popText(...head(hero), `+${e.credits} credits`, 'pop-credits');
      await tweens.wait(0.3);
      return;
    case 'defeat':
      if (hero) await tweens.run(0.7, (t) => { hero.fall = t * FALLEN; });
      return;
    case 'drillEnded':
      // Win: let the last hostile fade; loss: the officer drops; broken off: beamed out.
      if (!hero) return;
      if (e.outcome === 'lost') await tweens.run(0.7, (t) => { hero.fall = t * FALLEN; });
      else if (e.outcome === 'ended') await tweens.run(0.5, (t) => { hero.ox = -t * scene.W * BEAM_OUT; });
      else await tweens.wait(0.5);
      return;
    case 'levelUp':
      if (!hero) return;
      fx.popText(...head(hero, 16), `LEVEL ${e.level}!`, 'pop-level');
      void fx.ring(hero.x, hero.y, FX_COLORS.gold, 34, 0.9);
      fx.burst(hero.x, hero.y - 4, FX_COLORS.gold, 40, 40, 1, -40);
      await tweens.wait(0.6);
      return;
    case 'fled':
      if (!hero) return;
      if (e.success) await tweens.run(0.5, (t) => { hero.ox = -t * scene.W * BEAM_OUT; });
      else {
        fx.popText(...head(hero), "Can't escape!", 'pop-miss');
        await tweens.wait(0.3);
      }
      return;
    case 'equip':
      scene.sync({ ...before, player: after.player });
      if (scene.hero) fx.burst(...center(scene.hero), FX_COLORS.cream, 20, 30, 0.5, 0);
      await tweens.wait(0.3);
      return;
    case 'missionComplete':
      if (!hero) return;
      fx.popText(...head(hero, 22), 'MISSION COMPLETE', 'pop-level');
      for (const c of CONFETTI) fx.burst(hero.x, hero.y - 40, c, 16, 60, 1.2, 40);
      await tweens.wait(1);
      return;
    default:
  }
}
