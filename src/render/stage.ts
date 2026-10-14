/**
 * The 3D stage. It never decides anything about the game: `sync(state)` makes
 * the scene match a state, and `animate(events, ...)` plays a step's events.
 */
import * as THREE from 'three';
import { getArea, getMonster, getSpell, getWeapon } from '../core';
import type { GameEvent, GameState } from '../core';
import { ELEMENT_COLORS, STATUS_ICONS } from '../game/elements';
import { TOWN_PALETTE, buildEnvironment } from './environment';
import type { Environment } from './environment';
import { Effects } from './fx';
import { buildHero, buildMonster, disposeObject } from './models';
import type { Figure } from './models';
import { Tweens, easeOutBack, easeOutCubic } from './tween';

const HERO_BATTLE_X = -2.5;
const MONSTER_X = 2.6;
/** Half-width of the action that must stay on screen (fighters + some margin). */
const ACTION_HALF_WIDTH = 4.2;
const STATUS_COLORS: Record<string, number> = {
  burn: 0xff6a2b, poison: 0x72e05a, stun: 0xffe14d, guard: 0x9ab8ff, evasive: 0xc9d6ff, chill: 0x6cc6ff,
};

export class Stage {
  readonly tweens = new Tweens();
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  private fx: Effects;
  private clock = new THREE.Clock();
  private time = 0;
  private env: Environment | null = null;
  private envKey = '';
  private hero: Figure | null = null;
  private heroKey = '';
  private monster: Figure | null = null;
  private monsterKey = '';
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  /** Back light that outlines figures against dark backdrops. */
  private rim = new THREE.DirectionalLight(0xb8c8ff, 1.4);
  private shake = 0;
  private cameraBase = new THREE.Vector3(0, 2.7, 9);

  constructor(private canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.sun.position.set(-6, 10, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    this.rim.position.set(3, 6, -8);
    this.scene.add(this.hemi, this.sun, this.rim);
    this.scene.fog = new THREE.Fog(0xffffff, 14, 45);
    this.fx = new Effects(this.scene, this.camera, overlay, this.tweens);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas.parentElement ?? this.canvas;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    // Pull the camera back on narrow (portrait) screens so both fighters stay in frame.
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const needed = ACTION_HALF_WIDTH / (Math.tan(halfFov) * this.camera.aspect);
    this.cameraBase.set(0, 2.7 + Math.max(0, needed - 9) * 0.12, Math.max(9, needed));
    this.camera.updateProjectionMatrix();
  }

  private frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.time += dt;
    this.tweens.tick(dt);
    this.env?.update(dt, this.time);
    this.hero?.idle(this.time);
    this.monster?.idle(this.time + 1.3);
    // Gentle camera sway plus impact shake.
    this.shake = Math.max(0, this.shake - dt * 3);
    const s = this.shake * 0.15;
    this.camera.position.set(
      this.cameraBase.x + Math.sin(this.time * 0.3) * 0.3 + (Math.random() - 0.5) * s,
      this.cameraBase.y + (Math.random() - 0.5) * s,
      this.cameraBase.z,
    );
    this.camera.lookAt(0, 1.2, 0);
    this.renderer.render(this.scene, this.camera);
  }

  // ─── Scene sync ──────────────────────────────────────────────────────────

  /** Makes the scene match `state` immediately (no animation). */
  sync(state: GameState) {
    const areaId = state.quest?.areaId;
    const key = state.mode === 'title' ? 'title' : areaId && (state.mode === 'battle' || state.mode === 'quest') ? areaId : 'town';
    this.setEnvironment(key === 'title' ? 'greenwood' : key);

    const p = state.player;
    if (p) {
      const heroKey = `${p.classId}|${p.weapon}|${p.armor}`;
      if (heroKey !== this.heroKey) {
        const old = this.hero;
        this.hero = buildHero(p.classId, p.weapon, p.armor);
        this.heroKey = heroKey;
        if (old) {
          this.hero.root.position.copy(old.root.position);
          this.hero.root.rotation.copy(old.root.rotation);
          this.removeFigure(old);
        }
        this.scene.add(this.hero.root);
      }
      const hero = this.hero!;
      const hx = state.mode === 'battle' ? HERO_BATTLE_X : state.mode === 'town' ? -1.2 : -0.6;
      hero.root.position.set(hx, 0, 0.6);
      hero.root.rotation.set(0, state.mode === 'battle' ? -0.35 : -0.9, state.mode === 'defeated' ? Math.PI / 2 : 0);
      hero.body.position.x = 0;
      hero.root.visible = true;
    } else if (this.hero) {
      this.removeFigure(this.hero);
      this.hero = null;
      this.heroKey = '';
    }

    const battle = state.battle;
    const mKey = battle ? `${battle.monster.defId}#${state.stats.battlesWon + state.stats.battlesLost}` : '';
    if (mKey !== this.monsterKey) {
      if (this.monster) this.removeFigure(this.monster);
      this.monster = null;
      this.monsterKey = mKey;
      if (battle) {
        const def = getMonster(battle.monster.defId);
        this.monster = buildMonster(def.look, !!def.boss);
        this.monster.root.position.set(MONSTER_X, 0, 0.2);
        this.monster.root.rotation.y = Math.PI + 0.4;
        this.scene.add(this.monster.root);
      }
    }
  }

  private setEnvironment(key: string) {
    if (key === this.envKey) return;
    if (this.env) {
      this.scene.remove(this.env.group);
      disposeObject(this.env.group);
    }
    const palette = key === 'town' ? TOWN_PALETTE : getArea(key).palette;
    this.env = buildEnvironment(key, palette);
    this.envKey = key;
    this.scene.add(this.env.group);
    (this.scene.fog as THREE.Fog).color.setHex(palette.fog);
    this.scene.background = new THREE.Color(palette.sky);
    const dark = key === 'ashen_caves' || key === 'shadow_keep';
    this.hemi.color.setHex(dark ? 0xffb38a : 0xffffff);
    this.hemi.groundColor.setHex(palette.ground);
    this.hemi.intensity = dark ? 1.5 : 1.4;
    this.sun.intensity = dark ? 1.6 : 2.2;
    this.sun.color.setHex(key === 'shadow_keep' ? 0xc8a8ff : key === 'ashen_caves' ? 0xff9a5a : 0xffffff);
    this.rim.intensity = dark ? 3 : 1.2;
    this.rim.color.setHex(key === 'ashen_caves' ? 0xff7a3a : key === 'shadow_keep' ? 0xd0a8ff : 0xb8c8ff);
  }

  private removeFigure(f: Figure) {
    this.scene.remove(f.root);
    disposeObject(f.root);
  }

  // ─── Event animation ─────────────────────────────────────────────────────

  async animate(events: GameEvent[], before: GameState, after: GameState): Promise<void> {
    // Make sure the "before" scene is present (e.g. after loading a save).
    if (before.mode !== 'title') this.sync({ ...before });
    let pendingSpell: string | null = null;
    for (const e of events) {
      await this.play(e, before, after, pendingSpell);
      pendingSpell = e.type === 'cast' && e.actor === 'player' ? e.spellId : e.type === 'attack' ? null : pendingSpell;
    }
    this.tweens.flush();
    this.sync(after);
  }

  private head(f: Figure | null, extra = 0.3): THREE.Vector3 {
    if (!f) return new THREE.Vector3();
    return f.root.position.clone().add(new THREE.Vector3(0, f.height + extra, 0));
  }

  private center(f: Figure | null): THREE.Vector3 {
    if (!f) return new THREE.Vector3();
    return f.root.position.clone().add(new THREE.Vector3(0, f.height * 0.55, 0));
  }

  private figureFor(actor: 'player' | 'monster') {
    return actor === 'player' ? this.hero : this.monster;
  }

  private async lunge(f: Figure, dir: number, distance = 1.3) {
    await this.tweens.run(0.16, (t) => { f.body.position.x = t * distance * dir / f.body.scale.x; }, easeOutCubic);
  }

  private async recover(f: Figure) {
    const start = f.body.position.x;
    await this.tweens.run(0.22, (t) => { f.body.position.x = start * (1 - t); });
  }

  /** Briefly tints a figure. Original emissive values are remembered once, so overlapping flashes are safe. */
  private flash(f: Figure, color = 0xffffff) {
    const from = new THREE.Color(color);
    for (const m of f.materials) {
      m.userData.baseEmissive ??= m.emissive.getHex();
      m.userData.baseIntensity ??= m.emissiveIntensity;
    }
    void this.tweens.run(0.25, (t) => {
      for (const m of f.materials) {
        m.emissive.copy(from).lerp(new THREE.Color(m.userData.baseEmissive as number), t);
        m.emissiveIntensity = THREE.MathUtils.lerp(1.2, m.userData.baseIntensity as number, t);
      }
    });
  }

  private async knockback(f: Figure, dir: number) {
    await this.tweens.run(0.2, (t) => { f.body.position.x = Math.sin(t * Math.PI) * 0.35 * dir / f.body.scale.x; });
  }

  private async play(e: GameEvent, before: GameState, after: GameState, pendingSpell: string | null) {
    switch (e.type) {
      case 'battleStart': {
        this.sync(after);
        const m = this.monster;
        if (!m) return;
        const target = m.root.scale.clone();
        void this.fx.burst(m.root.position.clone().setY(0.2), 0xd8c8a8, 30, 2.5, 0.7, -2);
        await this.tweens.run(0.5, (t) => m.root.scale.copy(target).multiplyScalar(Math.max(0.01, t)), easeOutBack);
        if (e.boss) {
          this.shake = 1;
          this.fx.popText(this.head(m), 'BOSS', 'pop-boss');
        }
        return;
      }
      case 'attack': {
        const attacker = this.figureFor(e.actor);
        const target = this.figureFor(e.actor === 'player' ? 'monster' : 'player');
        if (!attacker || !target) return;
        const dir = e.actor === 'player' ? 1 : -1;
        const color = ELEMENT_COLORS[e.element];
        const spell = pendingSpell ? getSpell(pendingSpell) : null;
        const ranged = spell && !spell.effects.some((x) => x.type === 'damage' && x.useWeapon);
        if (ranged) {
          await this.fx.projectile(this.center(attacker).add(new THREE.Vector3(0.5 * dir, 0.3, 0)), this.center(target), color);
        } else {
          await this.lunge(attacker, dir, e.actor === 'monster' ? 1.6 : 1.3);
        }
        if (e.hit) {
          this.flash(target);
          this.shake = e.crit ? 1 : 0.4;
          void this.fx.burst(this.center(target), color, e.crit ? 40 : 18, e.crit ? 4 : 2.5);
          this.fx.popText(this.head(target), `${e.damage}${e.crit ? '!' : ''}`,
            `${e.actor === 'player' ? 'pop-dmg' : 'pop-hurt'}${e.crit ? ' pop-crit' : ''} el-${e.element}`);
          void this.knockback(target, dir);
        } else {
          this.fx.popText(this.head(target), 'MISS', 'pop-miss');
        }
        if (!ranged) await this.recover(attacker);
        await this.tweens.wait(0.12);
        return;
      }
      case 'cast': {
        const f = this.figureFor(e.actor);
        if (!f) return;
        const spell = getSpell(e.spellId);
        const dmg = spell.effects.find((x) => x.type === 'damage');
        const element = dmg?.type === 'damage'
          ? (dmg.element === 'weapon' ? getWeapon(after.player!.weapon).element : dmg.element)
          : 'light';
        this.fx.popText(this.head(f, 0.6), spell.name, 'pop-spell');
        await this.fx.ring(f.root.position, ELEMENT_COLORS[element]);
        return;
      }
      case 'heal': {
        const f = this.figureFor(e.actor);
        if (!f || (e.amount <= 0 && e.mana <= 0)) return;
        void this.fx.burst(f.root.position.clone().setY(0.3), e.amount > 0 ? 0x7dff8a : 0x7ab8ff, 30, 1.2, 0.8, 3);
        if (e.amount > 0) this.fx.popText(this.head(f), `+${e.amount}`, 'pop-heal');
        if (e.mana > 0) this.fx.popText(this.head(f, 0.7), `+${e.mana} MP`, 'pop-mana');
        await this.tweens.wait(0.35);
        return;
      }
      case 'statusApplied': {
        const f = this.figureFor(e.target);
        if (!f) return;
        this.fx.popText(this.head(f, 0.5), `${STATUS_ICONS[e.status]} ${e.status}`, 'pop-status');
        await this.fx.ring(f.root.position, STATUS_COLORS[e.status] ?? 0xffffff, 1, 0.4);
        return;
      }
      case 'statusTick': {
        const f = this.figureFor(e.target);
        if (!f) return;
        this.flash(f, STATUS_COLORS[e.status]);
        this.fx.popText(this.head(f), `${e.damage}`, `pop-tick el-${e.status === 'burn' ? 'fire' : 'poison'}`);
        await this.tweens.wait(0.3);
        return;
      }
      case 'stunned': {
        const f = this.figureFor(e.actor);
        if (!f) return;
        this.fx.popText(this.head(f, 0.4), '💫 Stunned', 'pop-status');
        void this.fx.burst(this.head(f, 0), 0xffe14d, 12, 1, 0.6, 0);
        await this.tweens.wait(0.45);
        return;
      }
      case 'victory': {
        const m = this.monster;
        if (m) {
          void this.fx.burst(this.center(m), 0xfff1c2, 40, 3, 0.8, -1);
          await this.tweens.run(0.6, (t) => {
            m.root.position.y = -t * 1.2;
            m.root.rotation.z = t * 0.4;
          });
          m.root.visible = false;
        }
        if (this.hero) this.fx.popText(this.head(this.hero), `+${e.gold} gold`, 'pop-gold');
        await this.tweens.wait(0.3);
        return;
      }
      case 'defeat': {
        const h = this.hero;
        if (!h) return;
        await this.tweens.run(0.7, (t) => { h.root.rotation.z = t * Math.PI / 2; h.root.position.y = t * 0.2; });
        return;
      }
      case 'levelUp': {
        if (!this.hero) return;
        this.fx.popText(this.head(this.hero, 0.8), `LEVEL ${e.level}!`, 'pop-level');
        void this.fx.ring(this.hero.root.position, 0xffd34d, 2.2, 0.9);
        await this.fx.burst(this.hero.root.position.clone().setY(0.2), 0xffd34d, 50, 2, 1, 4);
        return;
      }
      case 'fled': {
        const h = this.hero;
        if (!h) return;
        if (e.success) {
          await this.tweens.run(0.5, (t) => { h.body.position.x = -t * 4; });
        } else {
          this.fx.popText(this.head(h), "Can't escape!", 'pop-miss');
          await this.tweens.wait(0.3);
        }
        return;
      }
      case 'equip': {
        this.sync({ ...before, player: after.player });
        if (this.hero) await this.fx.burst(this.center(this.hero), 0xfff1c2, 20, 1.5, 0.5, 0);
        return;
      }
      case 'questComplete': {
        if (!this.hero) return;
        this.fx.popText(this.head(this.hero, 1), 'QUEST COMPLETE', 'pop-level');
        const colors = [0xff6a2b, 0x6cc6ff, 0xffe14d, 0x72e05a, 0xa36bff];
        await Promise.all(colors.map((c, i) => this.fx.burst(this.head(this.hero, i * 0.1), c, 20, 4, 1.2, -3)));
        return;
      }
      default:
        return;
    }
  }
}
