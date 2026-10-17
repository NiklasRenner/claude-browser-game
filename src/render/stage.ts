/**
 * The 2D pixel-art stage. It never decides anything about the game:
 * `sync(state)` makes the scene match a state, and `animate(events, ...)`
 * plays a step's events (director.ts).
 *
 * The scene is always SCENE_H art pixels tall and between MIN_W and MAX_W wide,
 * scaled up by a whole number of device pixels (so pixels stay square and
 * sharp) and centred, with bars beyond that. The fighters stand at fixed pixel
 * spots around the centre (actor.ts); a wider screen only moves the edge pieces
 * outward and shows a little more scenery, so nothing ever ends up on top of a
 * wall. Glowing pixels are also drawn into a glow canvas that is blurred and
 * added on top (bloom.ts).
 *
 *   actor.ts     the figures and where things are on them (pure geometry)
 *   director.ts  playing a step's events
 *   markers.ts   shadows, target marker, shields, marks, decoys
 *   fx.ts        particles, bolts, orbs, rings, floating text; ability-fx.ts each ability's look
 *   scenes/      the locations; sprites/ the figures
 */
import { getHostile } from '../core';
import type { GameEvent, GameState } from '../core';
import { FALLEN, HERO_X, center, hostileSpot, makeActor, pickAt } from './actor';
import type { Actor, View } from './actor';
import { Bloom, occlude } from './bloom';
import { playEvents } from './director';
import type { Scene } from './director';
import { Effects } from './fx';
import { drawHoloDecoy, drawLasting, drawShadow, drawTargetArrow, drawTargetRing } from './markers';
import { makeCanvas } from './pixel/painter';
import { buildBackdrop } from './scenes/backdrop';
import { FEET, MAX_W, MIN_W, SCENE_H, sceneX } from './scenes/scale';
import type { Backdrop } from './scenes/backdrop';
import type { Layout } from './scenes/locations';
import { heroFigure, hostileFigure, loadSheets, paintFigure } from './sprites';
import { Tweens } from './tween';

/** Screen shake fades by this many pixels per second. */
const SHAKE_DECAY = 18;

export class Stage implements Scene {
  readonly tweens = new Tweens();
  readonly fx: Effects;
  W = 1;
  readonly H = SCENE_H;
  time = 0;
  shake = 0;
  hero: Actor | null = null;
  hostiles: Actor[] = [];
  targetIdx = 0;
  /** Draw only the location (no figures or markers): for judging backdrops (`npm run scene`). */
  sceneryOnly = false;

  private ctx: CanvasRenderingContext2D;
  private glowCan = makeCanvas(1, 1);
  private glow: CanvasRenderingContext2D;
  private bloom = new Bloom();
  /** CSS pixels per art pixel, and where the scene's top-left corner sits in the page (CSS pixels). */
  private scale = 1;
  private left = 0;
  private top = 0;
  /** Scene editor (src/editor): an unsaved layout (hidden layers left out), whether to glow, guides drawn on top, the width. */
  private editing: { layout: Layout; bloom: boolean; overlay: (ctx: CanvasRenderingContext2D) => void; width: number } | null = null;
  private last = performance.now();
  private backdrop: Backdrop | null = null;
  private backdropKey = '';
  private location = 'ship';
  private view: View = 'ship';
  private heroKey = '';
  private hostileKey = '';

  constructor(private canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    this.glow = this.glowCan.getContext('2d')!;
    this.fx = new Effects(overlay, this.tweens, (x, y) => [this.left + x * this.scale, this.top + y * this.scale]);
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
    const dpr = window.devicePixelRatio || 1;
    // Device pixels per art pixel: the most whole pixels that fit the height, and the narrowest width
    // (the editor picks the width).
    const fixed = this.editing?.width;
    const k = Math.max(1, Math.floor(Math.min((ch * dpr) / SCENE_H, (cw * dpr) / (fixed ?? MIN_W))));
    this.W = fixed ?? Math.min(MAX_W, Math.max(MIN_W, Math.floor((cw * dpr) / k)));
    this.scale = k / dpr;
    // Centred (on a phone, that's the gap between the top cards and the panels below).
    this.left = Math.round((cw - this.W * this.scale) / 2);
    this.top = Math.round((ch - this.H * this.scale) / 2);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = `${this.W * this.scale}px`;
    this.canvas.style.height = `${this.H * this.scale}px`;
    this.canvas.style.left = `${this.left}px`;
    this.canvas.style.top = `${this.top}px`;
    this.glowCan.width = this.W;
    this.glowCan.height = this.H;
    this.bloom.resize(this.W, this.H);
    this.backdropKey = '';
    this.layout();
  }

  // ─── Scene editor ────────────────────────────────────────────────────────

  /** Show this layout with these parts hidden, `width` art pixels wide (rebuilds the backdrop on the next frame). */
  edit(layout: Layout, bloom: boolean, overlay: (ctx: CanvasRenderingContext2D) => void, width: number) {
    const resize = width !== this.editing?.width;
    this.editing = { layout, bloom, overlay, width };
    this.backdropKey = '';
    if (resize) this.resize();
  }

  /** The scene's size and lines, for the editor. */
  get geometry() {
    return { W: this.W, H: this.H, horizon: this.backdrop?.horizon ?? 0, feet: this.backdrop?.feet ?? 0 };
  }

  /** A page point in scene pixels. */
  toScene(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * this.W, ((clientY - r.top) / r.height) * this.H];
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
      const key = `${p.weapon}|${p.armor}`;
      if (key !== this.heroKey) {
        const figure = heroFigure(p.weapon, p.armor);
        this.hero = this.hero ? { ...this.hero, figure } : makeActor(figure, 1);
        this.heroKey = key;
      }
      const h = this.hero!;
      h.visible = true;
      h.ox = 0; h.oy = 0; h.attack = 0; h.dissolve = 0;
      h.fall = state.mode === 'defeated' ? FALLEN : 0;
      h.statuses = new Set(state.battle?.playerStatuses.map((x) => x.id) ?? []);
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
        return makeActor(hostileFigure(def.look, !!def.boss), -1);
      });
    }
    if (battle) {
      battle.hostiles.forEach((inst, i) => {
        const a = this.hostiles[i];
        if (a) { a.visible = inst.hp > 0; a.ox = 0; a.oy = 0; a.attack = 0; a.dissolve = 0; a.statuses = new Set(inst.statuses.map((x) => x.id)); }
      });
      this.targetIdx = battle.target;
    }
    this.layout();
  }

  /** Puts everyone on their spot (see actor.ts). */
  private layout() {
    if (this.hero) { this.hero.x = sceneX(this.W, HERO_X[this.view]); this.hero.y = FEET; }
    this.hostiles.forEach((a, i) => {
      const [x, y] = hostileSpot(this.hostiles.length, i);
      a.x = sceneX(this.W, x);
      a.y = Math.round(this.H * y);
    });
  }

  /** Plays a step's events in order; `played(i)` is called as each one finishes (the UI's bars follow it). */
  animate(events: GameEvent[], before: GameState, after: GameState, played: (i: number) => void = () => {}): Promise<void> {
    return playEvents(this, events, before, after, played);
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
      this.backdrop = buildBackdrop(this.location, this.W, this.H, this.editing ?? {});
      this.backdropKey = key;
    }
    const { ctx, glow, W, H } = this;
    glow.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    this.shake = Math.max(0, this.shake - dt * SHAKE_DECAY);
    const sx = Math.round((Math.random() - 0.5) * this.shake), sy = Math.round((Math.random() - 0.5) * this.shake);
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    glow.setTransform(1, 0, 0, 1, sx, sy);

    // The location's layers, with the fighters (and their effects) where the fighters' layer is.
    this.backdrop!.draw(ctx, glow, this.time, dt, () => {
      if (this.sceneryOnly) return;
      const actors = [...(this.hero ? [this.hero] : []), ...this.hostiles].filter((a) => a.visible);
      const target = this.shownTarget();
      for (const a of actors) drawShadow(ctx, a);
      if (target) drawTargetRing(ctx, glow, target, this.time);
      // The officer first, then the hostiles in lineup order: each one to the right is drawn over the one
      // to its left (a boss stands in the middle, see bossInMiddle in src/core/flow.ts).
      actors.forEach((a, i) => this.drawActor(a, i));
      for (const a of actors) drawLasting(ctx, glow, a, this.time);
      if (target) drawTargetArrow(ctx, glow, target, this.time);
      this.fx.draw(ctx, glow, dt);
    });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    glow.setTransform(1, 0, 0, 1, 0, 0);
    if (this.editing?.bloom !== false) this.bloom.apply(ctx, this.glowCan, W, H);
    this.editing?.overlay(ctx);
  }

  private drawActor(a: Actor, i: number) {
    const f = a.figure, hero = a === this.hero;
    // Hostiles' idle motion is offset, so a lineup doesn't bob in step.
    const { ax, ay } = paintFigure(a.painter, f, { t: this.time + (hero ? 0 : 1.3 + i * 0.7), attack: a.attack }, {
      rimDir: hero ? [1, 0] : [0, -1], rimCol: this.backdrop!.rim, rimAmt: 0.3, flash: a.flash, dissolve: a.dissolve,
    });
    if (a.fall) {
      for (const c of [this.ctx, this.glow]) {
        c.save();
        c.translate(a.x + a.ox, a.y);
        c.rotate(a.fall);
      }
      this.ctx.drawImage(a.painter.canvas, -ax, -ay);
      occlude(this.glow, a.painter.canvas, -ax, -ay);
      this.ctx.restore();
      this.glow.restore();
      return;
    }
    const x = Math.round(a.x + a.ox - ax), y = Math.round(a.y + a.oy - ay - f.hover * f.scale);
    if (a.statuses.has('evasive')) drawHoloDecoy(this.ctx, this.glow, a, x, y, this.time);
    this.ctx.drawImage(a.painter.canvas, x, y);
    // The figure hides the glow behind it (a burning wall doesn't shine through the golem), then adds its own.
    occlude(this.glow, a.painter.canvas, x, y);
    this.glow.drawImage(a.painter.glowCanvas, x, y);
  }

  /** The target, when it needs marking: there's more than one hostile and it's still standing. */
  private shownTarget(): Actor | null {
    const a = this.hostiles[this.targetIdx];
    return this.hostiles.length > 1 && a?.visible && a.dissolve < 0.5 ? a : null;
  }

  // ─── Targeting ───────────────────────────────────────────────────────────

  /** Screen (client) coordinates of a hostile's body centre — used by tests to click it. */
  hostileScreenPoint(slot: number): { x: number; y: number } | null {
    const a = this.hostiles[slot];
    if (!a || !a.visible) return null;
    const [cx, cy] = center(a);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (cx / this.W) * r.width, y: r.top + (cy / this.H) * r.height };
  }

  /** Lineup slot of the hostile under a screen point, or null. Nearest body centre wins. */
  pickHostile(clientX: number, clientY: number): number | null {
    return pickAt(this.hostiles, ...this.toScene(clientX, clientY));
  }
}
