/**
 * The 2D pixel-art stage. It never decides anything about the game:
 * `sync(state)` makes the scene match a state, and `animate(events, ...)`
 * plays a step's events.
 *
 * The scene is drawn at a low resolution (about 200 px tall) and scaled up by
 * a whole number, so every art pixel is the same size. Glowing pixels are
 * also drawn into a glow canvas that is blurred and added on top (bloom).
 */
import { getAbility, getHostile, getWeapon, resolveElement } from '../core';
import type { Element, GameEvent, GameState } from '../core';
import { ELEMENT_COLORS, STATUS_COLORS, STATUS_ICONS } from '../game/elements';
import { Effects } from './fx';
import { Painter, makeCanvas } from './pixel/painter';
import { bayer } from './pixel/noise';
import { fromInt, glowOf } from './pixel/palette';
import type { RGB } from './pixel/palette';
import { buildBackdrop } from './scenes/backdrop';
import type { Backdrop } from './scenes/backdrop';
import { heroFigure, hostileFigure, loadSheets, paintFigure } from './sprites';
import type { Figure } from './sprites';
import { Tweens, easeOutCubic } from './tween';

/** Art pixels per screen height we aim for. */
const TARGET_HEIGHT = 200;
/** Narrowest scene (in art pixels) we accept before shrinking the scale. */
const MIN_WIDTH = 260;

/** Where hostiles stand, by lineup size: [x, y] as fractions of the screen. Back rows are higher. */
const SLOTS: Record<number, [number, number][]> = {
  1: [[0.68, 0.72]],
  2: [[0.62, 0.69], [0.79, 0.75]],
  3: [[0.6, 0.67], [0.73, 0.75], [0.86, 0.69]],
};
const HERO_X = { battle: 0.3, ship: 0.42, field: 0.44 };
const HERO_Y = 0.73;
/** On tall (phone) screens the panels cover more of the bottom, so the action moves up. */
const PORTRAIT_LIFT = 0.11;

interface Actor {
  figure: Figure;
  painter: Painter;
  x: number;
  y: number;
  /** Animated offsets and pose. */
  ox: number;
  oy: number;
  attack: number;
  flash: number;
  /** 0 = whole, 1 = gone (crumbled to ash). */
  dissolve: number;
  /** Lying down (defeat), radians. */
  fall: number;
  visible: boolean;
}

const elementColor = (el: Element): RGB => glowOf(ELEMENT_COLORS[el]);

export class Stage {
  readonly tweens = new Tweens();
  private ctx: CanvasRenderingContext2D;
  private glowCan = makeCanvas(1, 1);
  private glow: CanvasRenderingContext2D;
  private blur = [makeCanvas(1, 1), makeCanvas(1, 1), makeCanvas(1, 1)];
  private W = 1;
  private H = 1;
  private scale = 1;
  /** Figures are drawn smaller on narrow screens. */
  private zoom = 1;
  private lift = 0;
  private fx: Effects;
  private time = 0;
  private last = performance.now();
  private backdrop: Backdrop | null = null;
  private backdropKey = '';
  private location = 'ship';
  private view: keyof typeof HERO_X = 'ship';
  private hero: Actor | null = null;
  private heroKey = '';
  /** One actor per lineup slot (same indices as battle.hostiles). */
  private hostiles: Actor[] = [];
  private hostileKey = '';
  private targetIdx = 0;
  private shake = 0;

  constructor(private canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    this.glow = this.glowCan.getContext('2d')!;
    this.fx = new Effects(overlay, this.tweens, () => this.scale);
    // Rebuild the backdrop once the sprite sheets are in: its distant set pieces are painted into it.
    void loadSheets().then(() => { this.backdropKey = ''; });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Schedule first, so one bad frame can't stop the animation (and with it, every pending tween).
    const loop = () => { requestAnimationFrame(loop); this.frame(); };
    requestAnimationFrame(loop);
  }

  private resize() {
    const host = this.canvas.parentElement ?? this.canvas;
    const cw = Math.max(1, host.clientWidth), ch = Math.max(1, host.clientHeight);
    const portrait = ch > cw * 1.2;
    this.scale = portrait
      ? Math.max(1, Math.round(cw / 195))
      : Math.max(1, Math.min(Math.round(ch / TARGET_HEIGHT), Math.floor(cw / MIN_WIDTH)));
    this.lift = portrait ? PORTRAIT_LIFT : 0;
    this.W = Math.ceil(cw / this.scale);
    this.H = Math.ceil(ch / this.scale);
    this.zoom = Math.min(1, this.W / 300, this.H / 170);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = `${this.W * this.scale}px`;
    this.canvas.style.height = `${this.H * this.scale}px`;
    this.glowCan.width = this.W;
    this.glowCan.height = this.H;
    const sizes = [2, 4, 8];
    this.blur.forEach((c, i) => { c.width = Math.ceil(this.W / sizes[i]!); c.height = Math.ceil(this.H / sizes[i]!); });
    this.backdropKey = '';
    this.layout();
  }

  // ─── Scene sync ──────────────────────────────────────────────────────────

  /** Makes the scene match `state` immediately (no animation). */
  sync(state: GameState) {
    const missionId = state.mission?.missionId;
    const onMission = !!missionId && (state.mode === 'battle' || state.mode === 'mission');
    this.location = onMission ? missionId : 'ship';
    this.view = state.mode === 'battle' ? 'battle' : onMission ? 'field' : 'ship';

    const p = state.player;
    if (p) {
      const key = `${p.divisionId}|${p.weapon}|${p.armor}`;
      if (key !== this.heroKey) {
        const figure = heroFigure(p.divisionId, p.weapon, p.armor);
        this.hero = this.hero ? { ...this.hero, figure } : makeActor(figure);
        this.heroKey = key;
      }
      const h = this.hero!;
      h.visible = true;
      h.ox = 0; h.oy = 0; h.attack = 0; h.dissolve = 0;
      h.fall = state.mode === 'defeated' ? -Math.PI / 2 : 0;
    } else {
      this.hero = null;
      this.heroKey = '';
    }

    const battle = state.battle;
    const key = battle ? `${battle.hostiles.map((m) => m.defId).join(',')}#${state.stats.battlesWon + state.stats.battlesLost}` : '';
    if (key !== this.hostileKey) {
      this.hostileKey = key;
      this.hostiles = (battle?.hostiles ?? []).map((inst) => {
        const def = getHostile(inst.defId);
        return makeActor(hostileFigure(def.look, !!def.boss));
      });
    }
    if (battle) {
      battle.hostiles.forEach((inst, i) => {
        const a = this.hostiles[i];
        if (a) { a.visible = inst.hp > 0; a.ox = 0; a.oy = 0; a.attack = 0; a.dissolve = 0; }
      });
      this.targetIdx = battle.target;
    }
    this.layout();
  }

  private layout() {
    if (this.hero) { this.hero.x = Math.round(this.W * HERO_X[this.view]); this.hero.y = Math.round(this.H * (HERO_Y - this.lift)); }
    const slots = SLOTS[this.hostiles.length] ?? [];
    this.hostiles.forEach((a, i) => {
      const [x, y] = slots[i] ?? [0.7, 0.72];
      a.x = Math.round(this.W * x);
      a.y = Math.round(this.H * (y - this.lift));
    });
  }

  // ─── Drawing ─────────────────────────────────────────────────────────────

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.tweens.tick(dt);
    const key = `${this.location}@${this.W}x${this.H}`;
    if (key !== this.backdropKey) {
      this.backdrop = buildBackdrop(this.location, this.W, this.H, this.lift);
      this.backdropKey = key;
    }
    const { ctx, glow, W, H } = this;
    const bd = this.backdrop!;
    glow.clearRect(0, 0, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this.shake = Math.max(0, this.shake - dt * 18);
    const sx = Math.round((Math.random() - 0.5) * this.shake), sy = Math.round((Math.random() - 0.5) * this.shake);
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    glow.setTransform(1, 0, 0, 1, sx, sy);

    bd.drawBack(ctx, glow, this.time, dt);
    const actors = [...(this.hero ? [this.hero] : []), ...this.hostiles].filter((a) => a.visible);
    for (const a of actors) this.shadow(a);
    this.targetRing();
    actors.sort((a, b) => a.y - b.y);
    actors.forEach((a, i) => this.drawActor(a, a === this.hero, i));
    this.targetArrow();
    this.fx.draw(ctx, glow, dt);
    bd.drawFront(ctx, glow, this.time, dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    glow.setTransform(1, 0, 0, 1, 0, 0);
    this.bloom();
  }

  private drawActor(a: Actor, isHero: boolean, i: number) {
    const f = a.figure, z = this.zoom;
    const fig = z === 1 ? f : { ...f, scale: f.scale * z };
    const { ax, ay } = paintFigure(a.painter, fig, { t: this.time + (isHero ? 0 : 1.3 + i * 0.7), attack: a.attack }, {
      rimDir: isHero ? [1, 0] : [0, -1], rimCol: this.backdrop!.rim, rimAmt: 0.3, flash: a.flash, dissolve: a.dissolve,
    });
    const x = Math.round(a.x + a.ox - ax), y = Math.round(a.y + a.oy - ay - f.hover * fig.scale);
    if (a.fall) {
      this.ctx.save();
      this.ctx.translate(a.x + a.ox, a.y);
      this.ctx.rotate(a.fall);
      this.ctx.drawImage(a.painter.canvas, -ax, -ay);
      this.ctx.restore();
      return;
    }
    this.ctx.drawImage(a.painter.canvas, x, y);
    this.glow.drawImage(a.painter.glowCanvas, x, y);
  }

  private shadow(a: Actor) {
    const f = a.figure, rx = Math.round(((f.left + f.right) / 2) * f.scale * this.zoom * 0.55), ry = 2;
    const cx = Math.round(a.x + a.ox), cy = a.y + 1, alpha = f.hover ? 0.35 : 0.55;
    this.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (d <= 1 && (d < 0.6 || bayer(x, y) < 0.1)) this.ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }

  private showTarget(): Actor | null {
    const a = this.hostiles[this.targetIdx];
    return this.hostiles.length > 1 && a?.visible && a.dissolve < 0.5 ? a : null;
  }

  private targetRing() {
    const a = this.showTarget();
    if (!a) return;
    const rx = Math.round(((a.figure.left + a.figure.right) / 2) * a.figure.scale * this.zoom * 0.7);
    for (let t = 0; t < Math.PI * 2; t += 1 / rx) {
      const px = Math.round(a.x + a.ox + Math.cos(t) * rx), py = Math.round(a.y + 1 + Math.sin(t) * 3);
      if (Math.sin(t * 6 + this.time * 3) < -0.3) continue;
      this.ctx.fillStyle = '#fff2c8'; this.ctx.fillRect(px, py, 1, 1);
      this.glow.fillStyle = '#e2b25e'; this.glow.fillRect(px, py, 1, 1);
    }
  }

  private targetArrow() {
    const a = this.showTarget();
    if (!a) return;
    const [, hy] = this.head(a, 10);
    const top = Math.round(hy) + Math.round(Math.sin(this.time * 4) * 1.5);
    const mx = Math.round(a.x + a.ox);
    for (let r = 0; r < 5; r++) {
      for (let x = -4 + r; x <= 4 - r; x++) {
        const edge = Math.abs(x) === 4 - r || r === 0;
        this.ctx.fillStyle = edge ? '#08060a' : r === 1 ? '#fff2c8' : '#e2b25e';
        this.ctx.fillRect(mx + x, top + r, 1, 1);
      }
    }
    this.glow.fillStyle = '#e2b25e';
    this.glow.fillRect(mx - 2, top + 1, 5, 2);
  }

  private bloom() {
    const [b1, b2, b3] = this.blur as [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement];
    let src: HTMLCanvasElement = this.glowCan;
    for (const c of [b1, b2, b3]) {
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = true;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(src, 0, 0, c.width, c.height);
      src = c;
    }
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.55; ctx.drawImage(b2, 0, 0, this.W, this.H);
    ctx.globalAlpha = 0.45; ctx.drawImage(b3, 0, 0, this.W, this.H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
  }

  // ─── Targeting ─────────────────────────────────────────────────────────────

  private toScene(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * this.W, ((clientY - r.top) / r.height) * this.H];
  }

  /** Screen (client) coordinates of a hostile's body centre — used by tests to click it. */
  hostileScreenPoint(slot: number): { x: number; y: number } | null {
    const a = this.hostiles[slot];
    if (!a || !a.visible) return null;
    const [cx, cy] = this.center(a);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (cx / this.W) * r.width, y: r.top + (cy / this.H) * r.height };
  }

  /** Lineup slot of the hostile under a screen point, or null. Nearest body centre wins. */
  pickHostile(clientX: number, clientY: number): number | null {
    const [x, y] = this.toScene(clientX, clientY);
    let best: number | null = null, bestD = Infinity;
    this.hostiles.forEach((a, i) => {
      if (!a.visible) return;
      const f = a.figure, s = f.scale * this.zoom;
      const left = a.x - f.left * s * 0.7, right = a.x + f.right * s * 0.7, top = a.y - (f.height + f.hover) * s;
      if (x < left || x > right || y < top || y > a.y + 3) return;
      const [cx, cy] = this.center(a), d = Math.hypot(x - cx, y - cy);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  // ─── Event animation ─────────────────────────────────────────────────────

  private center(a: Actor | null): [number, number] {
    if (!a) return [0, 0];
    const s = a.figure.scale * this.zoom;
    return [a.x + a.ox + (a.figure.right - a.figure.left) * s * 0.15, a.y - (a.figure.height * 0.5 + a.figure.hover) * s];
  }

  /**
   * A gun's shot at a target: from the muzzle, straight along the barrel to where it crosses the target's
   * middle (it can pass over or under a small one). Null for figures without a gun.
   */
  private shot(a: Actor, target: Actor): { from: [number, number]; to: [number, number] } | null {
    const m = a.figure.muzzle?.(this.time);
    if (!m) return null;
    const s = a.figure.scale * this.zoom;
    const from: [number, number] = [a.x + a.ox + m[0] * s, a.y + a.oy + (m[1] - a.figure.hover) * s];
    const tx = this.center(target)[0];
    return { from, to: [tx, from[1] + Math.tan(m[2]) * (tx - from[0])] };
  }

  private head(a: Actor | null, extra = 4): [number, number] {
    if (!a) return [0, 0];
    const s = a.figure.scale * this.zoom;
    return [a.x + a.ox, a.y - (a.figure.height * 0.85 + a.figure.hover) * s - extra];
  }

  private actorFor(actor: 'player' | 'hostile', foe?: number) {
    return actor === 'player' ? this.hero : this.hostiles[foe ?? this.targetIdx] ?? null;
  }

  private flash(a: Actor, strength = 0.85) {
    a.flash = strength;
    void this.tweens.run(0.25, (t) => { a.flash = strength * (1 - t); });
  }

  /** How an attack looks: non-weapon abilities fly as an orb, ranged weapons fire a bolt, the rest is melee. */
  private attackStyle(actor: 'player' | 'hostile', element: Element, abilityId: string | null, state: GameState): 'orb' | 'bolt' | 'melee' {
    if (actor === 'hostile') return element === 'kinetic' ? 'melee' : 'orb';
    const ability = abilityId ? getAbility(abilityId) : null;
    if (ability && !ability.effects.some((x) => x.type === 'damage' && x.useWeapon)) return 'orb';
    return state.player && getWeapon(state.player.weapon).style === 'ranged' ? 'bolt' : 'melee';
  }

  async animate(events: GameEvent[], before: GameState, after: GameState): Promise<void> {
    if (before.mode !== 'title') this.sync({ ...before });
    let pendingAbility: string | null = null;
    let prev: GameEvent | null = null;
    for (const e of events) {
      const followUp = e.type === 'attack' && prev?.type === 'attack' && prev.actor === e.actor && prev.foe === e.foe && prev.name === e.name;
      await this.play(e, before, after, pendingAbility, followUp);
      prev = e;
      pendingAbility = e.type === 'abilityUsed' && e.actor === 'player' ? e.abilityId : e.type === 'attack' ? null : pendingAbility;
    }
    this.tweens.flush();
    this.sync(after);
  }

  private async play(e: GameEvent, before: GameState, after: GameState, pendingAbility: string | null, followUp: boolean) {
    switch (e.type) {
      case 'battleStart': {
        this.sync(after);
        // Hostiles condense out of the dark one after another.
        await Promise.all(this.hostiles.map(async (a, i) => {
          a.dissolve = 1;
          await this.tweens.wait(i * 0.15);
          this.fx.burst(...this.center(a), [216, 200, 168], 20, 30, 0.6, -20);
          await this.tweens.run(0.5, (t) => { a.dissolve = 1 - t; });
        }));
        if (e.boss) {
          const boss = this.hostiles[e.hostileIds.findIndex((id) => getHostile(id).boss)];
          this.shake = 5;
          if (boss) this.fx.popText(...this.head(boss, 8), '⚠ WARNING', 'pop-boss');
        }
        return;
      }
      case 'targeted':
        this.targetIdx = e.foe;
        return;
      case 'hostileDown': {
        const a = this.hostiles[e.foe];
        if (!a) return;
        this.fx.ash(a.x, a.y, 24 * a.figure.scale, a.figure.height * a.figure.scale);
        await this.tweens.run(0.6, (t) => { a.dissolve = t; });
        a.visible = false;
        return;
      }
      case 'attack': {
        const attacker = this.actorFor(e.actor, e.foe);
        const target = e.actor === 'player' ? this.actorFor('hostile', e.foe) : this.hero;
        if (!attacker || !target) return;
        const dir = e.actor === 'player' ? 1 : -1;
        const col = elementColor(e.element);
        const style = this.attackStyle(e.actor, e.element, pendingAbility, after);
        const [cx, cy] = this.center(attacker);
        // Gun shots fly straight out of the muzzle; anything else from the front of the body to the target.
        const shot = this.shot(attacker, target);
        const from = shot?.from ?? [cx + 12 * dir, cy - 4];
        const impact = style === 'melee' ? this.center(target) : shot?.to ?? this.center(target);
        if (followUp) {
          if (style !== 'melee') await this.fx.bolt(from, impact, col, 0.07);
        } else if (style === 'orb') {
          void this.tweens.run(0.45, (t) => { attacker.attack = t >= 1 ? 0 : t; });
          await this.fx.projectile(from, impact, col, 0.35, shot ? 0 : 12);
        } else if (style === 'bolt') {
          void this.tweens.run(0.18, (t) => { attacker.attack = t >= 1 ? 0 : t; });
          await this.fx.bolt(from, impact, col);
        } else {
          const gap = ((target.figure.left + attacker.figure.right) * 0.45) * this.zoom;
          const dist = Math.max(0, Math.abs(target.x - attacker.x) - gap - 10) * dir;
          await this.tweens.run(0.16, (t) => { attacker.ox = t * dist; attacker.attack = t * (e.actor === 'player' ? 0.3 : 0.4); }, easeOutCubic);
          if (e.actor === 'player') await this.tweens.run(0.08, (t) => { attacker.attack = 0.3 + t * 0.7; }, (t) => t);
          if (e.hit) void this.fx.slash(...this.center(target), e.crit ? [255, 220, 140] : col, e.crit ? 18 : 14);
        }
        if (e.hit) {
          this.flash(target);
          this.shake = e.crit ? 5 : 2;
          this.fx.burst(...impact, col, e.crit ? 30 : 14, e.crit ? 70 : 45, 0.45);
          this.fx.popText(...this.head(target), `${e.damage}${e.crit ? '!' : ''}`,
            `${e.actor === 'player' ? 'pop-dmg' : 'pop-hurt'}${e.crit ? ' pop-crit' : ''} el-${e.element}`);
          void this.tweens.run(0.2, (t) => { target.ox = Math.sin(t * Math.PI) * 4 * dir; });
        } else {
          this.fx.popText(...this.head(target), 'MISS', 'pop-miss');
        }
        if (style === 'melee' && !followUp) {
          const start = attacker.ox, a0 = attacker.attack;
          // The swing plays on to its end while stepping back (never in reverse).
          await this.tweens.run(0.22, (t) => { attacker.ox = start * (1 - t); attacker.attack = a0 + (1 - a0) * t; });
          attacker.attack = 0;
        }
        await this.tweens.wait(followUp ? 0.08 : 0.12);
        return;
      }
      case 'abilityUsed': {
        const a = this.actorFor(e.actor);
        if (!a) return;
        const ability = getAbility(e.abilityId);
        const dmg = ability.effects.find((x) => x.type === 'damage');
        const el = dmg?.type === 'damage' ? resolveElement(after.player!, dmg.element) : 'photon';
        this.fx.popText(...this.head(a, 10), ability.name, 'pop-ability');
        await this.fx.ring(a.x, a.y, elementColor(el));
        return;
      }
      case 'heal': {
        const a = this.actorFor(e.actor);
        if (!a || (e.amount <= 0 && e.energy <= 0)) return;
        this.fx.burst(a.x, a.y - 4, e.amount > 0 ? [125, 255, 138] : [122, 184, 255], 24, 25, 0.8, -50);
        if (e.amount > 0) this.fx.popText(...this.head(a), `+${e.amount}`, 'pop-heal');
        if (e.energy > 0) this.fx.popText(...this.head(a, 14), `+${e.energy} EN`, 'pop-energy');
        await this.tweens.wait(0.35);
        return;
      }
      case 'statusApplied': {
        const a = this.actorFor(e.target, e.foe);
        if (!a) return;
        this.fx.popText(...this.head(a, 10), `${STATUS_ICONS[e.status]} ${e.status}`, 'pop-status');
        await this.fx.ring(a.x, a.y, glowOf(STATUS_COLORS[e.status]), 16, 0.4);
        return;
      }
      case 'statusTick': {
        const a = this.actorFor(e.target, e.foe);
        if (!a) return;
        this.flash(a, 0.5);
        this.fx.burst(...this.center(a), fromInt(STATUS_COLORS[e.status]), 10, 25, 0.5, -30);
        this.fx.popText(...this.head(a), `${e.damage}`, `pop-tick el-${e.status === 'burn' ? 'plasma' : 'corrosive'}`);
        await this.tweens.wait(0.3);
        return;
      }
      case 'stunned': {
        const a = this.actorFor(e.actor, e.foe);
        if (!a) return;
        this.fx.popText(...this.head(a, 8), '💫 Stunned', 'pop-status');
        this.fx.burst(...this.head(a, 0), [255, 225, 77], 12, 20, 0.6, 0);
        await this.tweens.wait(0.45);
        return;
      }
      case 'victory': {
        if (this.hero) this.fx.popText(...this.head(this.hero), `+${e.credits} credits`, 'pop-credits');
        await this.tweens.wait(0.3);
        return;
      }
      case 'defeat': {
        const h = this.hero;
        if (!h) return;
        await this.tweens.run(0.7, (t) => { h.fall = -t * Math.PI / 2; });
        return;
      }
      case 'drillEnded': {
        // Win: let the last hostile fade; loss: the officer drops; broken off: beamed out.
        const h = this.hero;
        if (!h) return;
        if (e.outcome === 'lost') await this.tweens.run(0.7, (t) => { h.fall = -t * Math.PI / 2; });
        else if (e.outcome === 'ended') await this.tweens.run(0.5, (t) => { h.ox = -t * this.W * 0.45; });
        else await this.tweens.wait(0.5);
        return;
      }
      case 'levelUp': {
        if (!this.hero) return;
        this.fx.popText(...this.head(this.hero, 16), `LEVEL ${e.level}!`, 'pop-level');
        void this.fx.ring(this.hero.x, this.hero.y, [255, 211, 77], 34, 0.9);
        this.fx.burst(this.hero.x, this.hero.y - 4, [255, 211, 77], 40, 40, 1, -40);
        await this.tweens.wait(0.6);
        return;
      }
      case 'fled': {
        const h = this.hero;
        if (!h) return;
        if (e.success) await this.tweens.run(0.5, (t) => { h.ox = -t * this.W * 0.45; });
        else {
          this.fx.popText(...this.head(h), "Can't escape!", 'pop-miss');
          await this.tweens.wait(0.3);
        }
        return;
      }
      case 'equip': {
        this.sync({ ...before, player: after.player });
        if (this.hero) this.fx.burst(...this.center(this.hero), [255, 241, 194], 20, 30, 0.5, 0);
        await this.tweens.wait(0.3);
        return;
      }
      case 'missionComplete': {
        if (!this.hero) return;
        this.fx.popText(...this.head(this.hero, 22), 'MISSION COMPLETE', 'pop-level');
        for (const c of [[255, 106, 43], [108, 198, 255], [255, 225, 77], [114, 224, 90], [163, 107, 255]] as RGB[]) {
          this.fx.burst(this.hero.x, this.hero.y - 40, c, 16, 60, 1.2, 40);
        }
        await this.tweens.wait(1);
        return;
      }
      default:
        return;
    }
  }
}

function makeActor(figure: Figure): Actor {
  return { figure, painter: new Painter(1, 1), x: 0, y: 0, ox: 0, oy: 0, attack: 0, flash: 0, dissolve: 0, fall: 0, visible: true };
}
