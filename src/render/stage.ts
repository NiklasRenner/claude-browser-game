/**
 * The 3D stage. It never decides anything about the game: `sync(state)` makes
 * the scene match a state, and `animate(events, ...)` plays a step's events.
 */
import * as THREE from 'three';
import { getMonster, getSpell, getWeapon, resolveElement } from '../core';
import type { GameEvent, GameState } from '../core';
import { ELEMENT_COLORS, STATUS_COLORS, STATUS_ICONS } from '../game/elements';
import { buildEnvironment } from './environment';
import type { Environment } from './environment';
import { Effects } from './fx';
import { buildHero, buildMonster, disposeObject } from './models';
import type { Figure } from './models';
import { Tweens, easeOutBack, easeOutCubic } from './tween';

const HERO_BATTLE_X = -2.5;
const HERO_POS = new THREE.Vector3(HERO_BATTLE_X, 0, 0.6);
/**
 * Where hostiles stand, by lineup size: a rank facing the hero, front (nearest
 * the camera) to back. The raised field camera spreads the rank out on screen.
 */
const SLOTS: Record<number, [number, number][]> = {
  1: [[2.6, 0.2]],
  2: [[2.4, 2.3], [3.4, -1.8]],
  3: [[2.4, 3.0], [3.4, 0.2], [2.9, -2.6]],
};
/** Camera presets: the ship's deck is framed at eye level, away missions from a raised 3/4 view. */
const CAMERA = {
  ship: { y: 2.7, z: 9, look: new THREE.Vector3(0, 1.2, 0), yPerExtraZ: 0.12 },
  field: { y: 6.2, z: 9.5, look: new THREE.Vector3(0.4, 1.0, 0), yPerExtraZ: 0.25 },
};
/** Half-width of the action that must stay on screen (fighters + some margin). */
const ACTION_HALF_WIDTH = 5.2;

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
  /** One figure per lineup slot (same indices as battle.monsters). */
  private monsters: Figure[] = [];
  private monsterKey = '';
  /** Lineup slot the player is targeting; the marker follows it. */
  private targetIdx = 0;
  private targetMarker = buildTargetMarker();
  private raycaster = new THREE.Raycaster();
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  /** Back light that outlines figures against dark backdrops. */
  private rim = new THREE.DirectionalLight(0xb8c8ff, 1.4);
  private shake = 0;
  private cameraView: keyof typeof CAMERA = 'ship';
  /** Where the camera is heading (per view, adjusted for screen shape) and where it currently is. */
  private cameraBase = new THREE.Vector3(0, 2.7, 9);
  private cameraPos = new THREE.Vector3(0, 2.7, 9);
  private cameraLook = CAMERA.ship.look.clone();

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
    this.scene.add(this.hemi, this.sun, this.rim, this.targetMarker);
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
    this.updateCameraBase();
    this.camera.updateProjectionMatrix();
  }

  private updateCameraBase() {
    const view = CAMERA[this.cameraView];
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const needed = ACTION_HALF_WIDTH / (Math.tan(halfFov) * this.camera.aspect);
    this.cameraBase.set(0, view.y + Math.max(0, needed - view.z) * view.yPerExtraZ, Math.max(view.z, needed));
  }

  private frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.time += dt;
    this.tweens.tick(dt);
    this.env?.update(dt, this.time);
    this.hero?.idle(this.time);
    this.monsters.forEach((m, i) => m.idle(this.time + 1.3 + i * 0.7));
    this.updateTargetMarker();
    // Gentle camera sway plus impact shake.
    this.shake = Math.max(0, this.shake - dt * 3);
    const s = this.shake * 0.15;
    // Glide between camera views (instantly when animations are skipped).
    const k = this.tweens.speed === 0 ? 1 : 1 - Math.exp(-dt * 3);
    this.cameraPos.lerp(this.cameraBase, k);
    this.cameraLook.lerp(CAMERA[this.cameraView].look, k);
    this.camera.position.set(
      this.cameraPos.x + Math.sin(this.time * 0.3) * 0.3 + (Math.random() - 0.5) * s,
      this.cameraPos.y + (Math.random() - 0.5) * s,
      this.cameraPos.z,
    );
    this.camera.lookAt(this.cameraLook);
    this.renderer.render(this.scene, this.camera);
  }

  // ─── Scene sync ──────────────────────────────────────────────────────────

  /** Makes the scene match `state` immediately (no animation). */
  sync(state: GameState) {
    const areaId = state.quest?.areaId;
    const onMission = areaId && (state.mode === 'battle' || state.mode === 'quest');
    this.setEnvironment(onMission ? areaId : 'ship');
    const view = onMission ? 'field' : 'ship';
    if (view !== this.cameraView) {
      this.cameraView = view;
      this.updateCameraBase();
    }

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
    const mKey = battle ? `${battle.monsters.map((m) => m.defId).join(',')}#${state.stats.battlesWon + state.stats.battlesLost}` : '';
    if (mKey !== this.monsterKey) {
      for (const m of this.monsters) this.removeFigure(m);
      this.monsters = [];
      this.monsterKey = mKey;
      if (battle) {
        const slots = SLOTS[battle.monsters.length]!;
        this.monsters = battle.monsters.map((inst, i) => {
          const def = getMonster(inst.defId);
          const fig = buildMonster(def.look, !!def.boss);
          const [x, z] = slots[i]!;
          fig.root.position.set(x, 0, z);
          // Face the hero, turned slightly toward the camera.
          fig.root.rotation.y = Math.atan2(-(HERO_POS.z - z), HERO_POS.x - x) + 0.3;
          fig.root.userData.slot = i;
          this.scene.add(fig.root);
          return fig;
        });
      }
    }
    if (battle) {
      battle.monsters.forEach((inst, i) => {
        const fig = this.monsters[i];
        if (fig) fig.root.visible = inst.hp > 0;
      });
      this.targetIdx = battle.target;
    }
  }

  // ─── Targeting ─────────────────────────────────────────────────────────────

  private updateTargetMarker() {
    const fig = this.monsters[this.targetIdx];
    const show = this.monsters.length > 1 && !!fig?.root.visible;
    this.targetMarker.visible = show;
    if (!show || !fig) return;
    const { ring, arrow } = this.targetMarker.userData as { ring: THREE.Object3D; arrow: THREE.Object3D };
    this.targetMarker.position.lerp(fig.root.position, 0.35);
    ring.rotation.z = this.time * 1.5;
    ring.scale.setScalar(fig.height * 0.45 + Math.sin(this.time * 4) * 0.04);
    arrow.position.y = fig.height + 0.55 + Math.sin(this.time * 4) * 0.12;
  }

  /** Screen (client) coordinates of a hostile's body centre — used by tests to click it. */
  hostileScreenPoint(slot: number): { x: number; y: number } | null {
    const fig = this.monsters[slot];
    if (!fig || !fig.root.visible) return null;
    const p = this.center(fig).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }

  /** Lineup slot of the hostile under a screen point, or null. */
  pickHostile(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const roots = this.monsters.filter((m) => m.root.visible).map((m) => m.root);
    const hit = this.raycaster.intersectObjects(roots, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.slot === undefined) o = o.parent;
    return o ? (o.userData.slot as number) : null;
  }

  private setEnvironment(key: string) {
    if (key === this.envKey) return;
    if (this.env) {
      this.scene.remove(this.env.group);
      disposeObject(this.env.group);
    }
    const env = buildEnvironment(key);
    this.env = env;
    this.envKey = key;
    this.scene.add(env.group);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(env.fog);
    fog.near = env.fogNear;
    fog.far = env.fogFar;
    this.scene.background = new THREE.Color(env.sky);
    const l = env.lighting;
    this.hemi.color.setHex(l.hemiSky);
    this.hemi.groundColor.setHex(l.hemiGround);
    this.hemi.intensity = l.hemi;
    this.sun.color.setHex(l.sunColor);
    this.sun.intensity = l.sun;
    this.rim.color.setHex(l.rimColor);
    this.rim.intensity = l.rim;
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
    let prev: GameEvent | null = null;
    for (const e of events) {
      // Follow-up strikes of a multi-hit attack play as a quick burst.
      const followUp = e.type === 'attack' && prev?.type === 'attack' && prev.actor === e.actor && prev.foe === e.foe && prev.name === e.name;
      await this.play(e, before, after, pendingSpell, followUp);
      prev = e;
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

  private figureFor(actor: 'player' | 'monster', foe?: number) {
    return actor === 'player' ? this.hero : this.monsters[foe ?? this.targetIdx] ?? null;
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

  /**
   * How an attack looks: abilities that aren't weapon-based fly as an orb, ranged weapons fire a bolt,
   * monsters' elemental attacks are projectiles, everything else is a melee lunge.
   */
  private attackStyle(actor: 'player' | 'monster', element: string, spellId: string | null, state: GameState): 'orb' | 'bolt' | 'melee' {
    if (actor === 'monster') return element === 'kinetic' ? 'melee' : 'orb';
    const spell = spellId ? getSpell(spellId) : null;
    if (spell && !spell.effects.some((x) => x.type === 'damage' && x.useWeapon)) return 'orb';
    return state.player && getWeapon(state.player.weapon).style === 'ranged' ? 'bolt' : 'melee';
  }

  private async recoil(f: Figure, dir: number) {
    await this.tweens.run(0.18, (t) => { f.body.position.x = -Math.sin(t * Math.PI) * 0.12 * dir / f.body.scale.x; });
  }

  private async knockback(f: Figure, dir: number) {
    await this.tweens.run(0.2, (t) => { f.body.position.x = Math.sin(t * Math.PI) * 0.35 * dir / f.body.scale.x; });
  }

  private async play(e: GameEvent, before: GameState, after: GameState, pendingSpell: string | null, followUp = false) {
    switch (e.type) {
      case 'battleStart': {
        this.sync(after);
        // Hostiles materialise one after another.
        await Promise.all(this.monsters.map(async (m, i) => {
          const scale = m.root.scale.clone();
          m.root.scale.setScalar(0.01);
          await this.tweens.wait(i * 0.15);
          void this.fx.burst(m.root.position.clone().setY(0.2), 0xd8c8a8, 30, 2.5, 0.7, -2);
          await this.tweens.run(0.5, (t) => m.root.scale.copy(scale).multiplyScalar(Math.max(0.01, t)), easeOutBack);
        }));
        if (e.boss) {
          const boss = this.monsters[e.monsterIds.findIndex((id) => getMonster(id).boss)];
          this.shake = 1;
          if (boss) this.fx.popText(this.head(boss), '⚠ WARNING', 'pop-boss');
        }
        return;
      }
      case 'targeted':
        this.targetIdx = e.foe;
        return;
      case 'hostileDown': {
        const m = this.monsters[e.foe];
        if (!m) return;
        void this.fx.burst(this.center(m), 0xfff1c2, 40, 3, 0.8, -1);
        await this.tweens.run(0.6, (t) => {
          m.root.position.y = -t * 1.2;
          m.root.rotation.z = t * 0.4;
        });
        m.root.visible = false;
        return;
      }
      case 'attack': {
        const attacker = this.figureFor(e.actor, e.foe);
        const target = e.actor === 'player' ? this.figureFor('monster', e.foe) : this.hero;
        if (!attacker || !target) return;
        const dir = e.actor === 'player' ? 1 : -1;
        const color = ELEMENT_COLORS[e.element];
        const style = this.attackStyle(e.actor, e.element, pendingSpell, after);
        const from = this.center(attacker).add(new THREE.Vector3(0.6 * dir, 0.25, 0.3 * (e.actor === 'player' ? 1 : 0)));
        if (followUp) {
          // Burst: no wind-up, just a fast shot (or nothing extra for melee).
          if (style !== 'melee') await this.fx.bolt(from, this.center(target), color, 0.07);
        } else if (style === 'orb') {
          await this.fx.projectile(from, this.center(target), color);
        } else if (style === 'bolt') {
          void this.recoil(attacker, dir);
          await this.fx.bolt(from, this.center(target), color);
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
        if (style === 'melee' && !followUp) await this.recover(attacker);
        await this.tweens.wait(followUp ? 0.08 : 0.12);
        return;
      }
      case 'cast': {
        const f = this.figureFor(e.actor);
        if (!f) return;
        const spell = getSpell(e.spellId);
        const dmg = spell.effects.find((x) => x.type === 'damage');
        const element = dmg?.type === 'damage' ? resolveElement(after.player!, dmg.element) : 'photon';
        this.fx.popText(this.head(f, 0.6), spell.name, 'pop-spell');
        await this.fx.ring(f.root.position, ELEMENT_COLORS[element]);
        return;
      }
      case 'heal': {
        const f = this.figureFor(e.actor);
        if (!f || (e.amount <= 0 && e.mana <= 0)) return;
        void this.fx.burst(f.root.position.clone().setY(0.3), e.amount > 0 ? 0x7dff8a : 0x7ab8ff, 30, 1.2, 0.8, 3);
        if (e.amount > 0) this.fx.popText(this.head(f), `+${e.amount}`, 'pop-heal');
        if (e.mana > 0) this.fx.popText(this.head(f, 0.7), `+${e.mana} EN`, 'pop-mana');
        await this.tweens.wait(0.35);
        return;
      }
      case 'statusApplied': {
        const f = this.figureFor(e.target, e.foe);
        if (!f) return;
        this.fx.popText(this.head(f, 0.5), `${STATUS_ICONS[e.status]} ${e.status}`, 'pop-status');
        await this.fx.ring(f.root.position, STATUS_COLORS[e.status], 1, 0.4);
        return;
      }
      case 'statusTick': {
        const f = this.figureFor(e.target, e.foe);
        if (!f) return;
        this.flash(f, STATUS_COLORS[e.status]);
        this.fx.popText(this.head(f), `${e.damage}`, `pop-tick el-${e.status === 'burn' ? 'plasma' : 'corrosive'}`);
        await this.tweens.wait(0.3);
        return;
      }
      case 'stunned': {
        const f = this.figureFor(e.actor, e.foe);
        if (!f) return;
        this.fx.popText(this.head(f, 0.4), '💫 Stunned', 'pop-status');
        void this.fx.burst(this.head(f, 0), 0xffe14d, 12, 1, 0.6, 0);
        await this.tweens.wait(0.45);
        return;
      }
      case 'victory': {
        if (this.hero) this.fx.popText(this.head(this.hero), `+${e.gold} credits`, 'pop-gold');
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
        this.fx.popText(this.head(this.hero, 1), 'MISSION COMPLETE', 'pop-level');
        const colors = [0xff6a2b, 0x6cc6ff, 0xffe14d, 0x72e05a, 0xa36bff];
        await Promise.all(colors.map((c, i) => this.fx.burst(this.head(this.hero, i * 0.1), c, 20, 4, 1.2, -3)));
        return;
      }
      default:
        return;
    }
  }
}

/** Cyan ground ring plus a bobbing arrow, shown over the targeted hostile. */
function buildTargetMarker(): THREE.Group {
  const g = new THREE.Group();
  const color = 0x5fd6ff;
  const ringGeo = new THREE.RingGeometry(1.15, 1.32, 6, 1);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  arrow.renderOrder = 10; // always visible, even behind another hostile
  arrow.rotation.x = Math.PI;
  g.add(ring, arrow);
  g.userData = { ring, arrow };
  g.visible = false;
  return g;
}
