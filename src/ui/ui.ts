/**
 * DOM user interface. Re-renders from game state on every change; buttons
 * carry their game action as JSON in `data-action`, and are enabled only when
 * `legalActions` contains that exact action.
 */
import {
  AREA_ORDER, CLASSES, ELEMENTS, SHOP_STOCK, STATS, checkAction, countItem, derive, getArea, getClass,
  PATROL_CONTACTS, getItem, getMonster, getWeapon, hostileLabels, hostileLevel, isAreaUnlocked, patrolReward, patrolWorlds, questEncounters, isEquipped, knownSpells, monsterDamageTaken, resolveElement, restCost,
  sellPrice, xpToNext,
} from '../core';
import type { Action, ClassId, Element, GameState, ItemDef, MonsterDef, Player, SpellDef, Stat, StatusEffect } from '../core';
import type { GameController } from '../game/controller';
import { ELEMENT_ICONS, STATUS_ICONS } from '../game/elements';

/** Working title — change it here (and in public/index.html). */
export const GAME_TITLE = 'STARWARD';

type TownTab = 'quests' | 'shop' | 'inventory' | 'character' | 'inn';
type BattleMenu = 'main' | 'skills' | 'items' | 'gear';

const STAT_NAMES: Record<Stat, string> = {
  str: 'Strength', dex: 'Agility', int: 'Intellect', end: 'Endurance', luk: 'Luck',
};
const STAT_HELP: Record<Stat, string> = {
  str: 'Security Officer damage. Slight accuracy.',
  dex: 'Accuracy & evasion. Engineer damage.',
  int: 'Science Officer damage. Max energy.',
  end: 'Max HP.',
  luk: 'Critical hits, credits and emergency beam-outs.',
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const actionAttr = (a: Action) => `data-action='${esc(JSON.stringify(a))}'`;
const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (100 * v) / Math.max(1, max)))}%`;

export class UI {
  private tab: TownTab = 'quests';
  private battleMenu: BattleMenu = 'main';
  private titleName = '';
  private titleClass: ClassId = 'security';
  private seenGameComplete = false;
  private lastLogId = 0;
  /**
   * Keys pressed while an animation plays (max 3), run in order as soon as it finishes.
   * Stored raw and resolved at run time, so e.g. Tab, Tab, 1 targets correctly.
   */
  private keyQueue: { key: string; shift: boolean }[] = [];
  private showVictoryModal = false;

  constructor(private root: HTMLElement, private game: GameController) {
    game.subscribe(() => {
      this.render();
      if (!game.busy && this.keyQueue.length) queueMicrotask(() => this.flushKeyQueue());
    });
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'hero-name') this.titleName = t.value;
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.render();
  }

  // ─── Input ───────────────────────────────────────────────────────────────

  private async run(action: Action) {
    const events = await this.game.dispatch(action);
    if (events.some((e) => e.type === 'gameComplete') && !this.seenGameComplete) {
      this.seenGameComplete = true;
      this.showVictoryModal = true;
      this.render();
    }
  }

  private onClick(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action],[data-ui]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    if (el.dataset.action) {
      const action = JSON.parse(el.dataset.action) as Action;
      if (['attack', 'cast', 'useItem', 'equip', 'flee'].includes(action.type) && this.game.state.mode === 'battle') {
        this.battleMenu = 'main';
      }
      void this.run(action);
      return;
    }
    const [kind, value] = (el.dataset.ui ?? '').split(':');
    switch (kind) {
      case 'tab': this.tab = value as TownTab; break;
      case 'menu': this.battleMenu = value as BattleMenu; break;
      case 'class': this.titleClass = value as ClassId; break;
      case 'start':
        void this.run({ type: 'newGame', name: this.titleName || 'Hero', classId: this.titleClass });
        this.tab = 'quests';
        return;
      case 'continue': {
        const err = this.game.continueGame();
        if (err) alert(err);
        return;
      }
      case 'title': this.game.toTitle(); return;
      case 'close-modal': this.showVictoryModal = false; break;
    }
    this.render();
  }

  private onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' && this.game.state.mode === 'battle') {
      this.battleMenu = 'main';
      this.render();
      e.preventDefault();
      return;
    }
    const action = keyAction(this.game.state, k, e.shiftKey);
    if (!action) return;
    // Enter/Space would otherwise also "click" whatever button has focus; Tab would move focus.
    e.preventDefault();
    if (e.repeat && k !== 'tab') return; // holding a key must not fire a stream of actions
    if (this.game.busy) {
      if (this.keyQueue.length < 3) this.keyQueue.push({ key: k, shift: e.shiftKey });
    } else {
      void this.run(action);
    }
  }

  private flushKeyQueue() {
    if (this.game.busy) return;
    const next = this.keyQueue.shift();
    if (!next) return;
    // Resolve against the current state; drop keys that no longer apply (e.g. the fight ended).
    const action = keyAction(this.game.state, next.key, next.shift);
    if (action && checkAction(this.game.state, action) === null) void this.run(action);
    else this.flushKeyQueue();
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  render() {
    const s = this.game.state;
    const legal = new Set(this.game.legal().map((a) => JSON.stringify(a)));
    const btn = (action: Action, label: string, cls = '', hint = '') => {
      const ok = legal.has(JSON.stringify(action)) && !this.game.busy;
      const reason = ok ? hint : checkAction(s, action) ?? (this.game.busy ? '' : hint);
      return `<button class="btn ${cls}" ${actionAttr(action)} ${ok ? '' : 'disabled'} title="${esc(reason)}">${label}</button>`;
    };

    let main = '';
    switch (s.mode) {
      case 'title': main = this.titleScreen(); break;
      case 'town': main = this.town(s, btn); break;
      case 'quest': main = this.questPanel(s, btn); break;
      case 'battle': main = this.battlePanel(s, btn); break;
      case 'defeated': main = this.defeatedPanel(btn); break;
    }

    this.root.innerHTML = `
      ${s.player ? this.hud(s.player, s.battle?.playerStatuses ?? []) : ''}
      ${s.battle ? this.monsterCard(s) : ''}
      <div class="main-panel mode-${s.mode}">${main}</div>
      ${s.mode !== 'title' ? this.logPanel() : ''}
      ${this.showVictoryModal ? this.victoryModal(s) : ''}
    `;
    const input = this.root.querySelector<HTMLInputElement>('#hero-name');
    if (input) input.value = this.titleName;
  }

  private hud(p: Player, statuses: StatusEffect[]) {
    const d = derive(p);
    const cls = getClass(p.classId);
    return `
      <div class="hud panel">
        <div class="hud-name"><strong>${esc(p.name)}</strong> <span class="muted">Lv ${p.level} ${cls.name}</span></div>
        ${bar('hp', p.hp, d.maxHp, 'HP')}
        ${bar('mp', p.mp, d.maxMp, 'EN')}
        <div class="bar bar-xp" title="XP ${p.xp} / ${xpToNext(p.level)}"><div class="fill" style="width:${pct(p.xp, xpToNext(p.level))}"></div></div>
        <div class="hud-row"><span class="gold" title="Credits">◈ ${p.gold}</span><span class="muted small">XP ${p.xp}/${xpToNext(p.level)}</span>${p.statPoints ? `<span class="badge">+${p.statPoints} stat pts</span>` : ''}
        ${statusChips(statuses)}</div>
      </div>`;
  }

  private monsterCard(s: GameState) {
    const b = s.battle!;
    const target = b.monsters[b.target]!;
    const def = getMonster(target.defId);
    const labels = hostileLabels(b.monsters.map((m) => m.defId));
    const weak = ELEMENTS.filter((el) => (def.resist[el] ?? 100) > 100);
    const strong = ELEMENTS.filter((el) => (def.resist[el] ?? 100) < 100);
    const chips = (els: typeof weak) => els.map((el) => `<span class="el el-${el}">${ELEMENT_ICONS[el]} ${el}</span>`).join(' ');
    // With several hostiles: a clickable list (Tab / Shift+Tab or click a hostile in the scene also work).
    const roster = b.monsters.length < 2 ? '' : `
        <div class="roster" role="listbox" aria-label="Targets">
          ${b.monsters.map((m, i) => {
            const down = m.hp <= 0;
            const current = i === b.target;
            return `<button class="roster-item ${current ? 'current' : ''} ${down ? 'down' : ''}" role="option" aria-selected="${current}"
              ${down || current || this.game.busy ? 'disabled' : ''} ${actionAttr({ type: 'target', index: i })} title="${esc(labels[i]!)}">
              <span class="roster-name">${current ? '▸ ' : ''}${esc(labels[i]!)}</span>
              <span class="roster-hp"><span style="width:${pct(m.hp, m.maxHp)}"></span></span>
            </button>`;
          }).join('')}
          <div class="roster-hint muted">Tab to switch target</div>
        </div>`;
    return `
      <div class="monster-card panel ${def.boss ? 'boss' : ''}">
        ${roster}
        <div class="hud-name"><strong>${esc(labels[b.target]!)}</strong> <span class="muted">Lv ${hostileLevel(target)}${def.boss ? ' · PRIORITY TARGET' : ''}</span></div>
        ${bar('hp enemy', target.hp, target.maxHp, 'HP')}
        <div class="hud-row">${statusChips(target.statuses)}</div>
        ${weak.length ? `<div class="res">Vulnerable: ${chips(weak)}</div>` : ''}
        ${strong.length ? `<div class="res">Resists: ${chips(strong)}</div>` : ''}
      </div>`;
  }

  private logPanel() {
    const lines = this.game.log.slice(-7);
    const html = lines.map((l) => `<div class="log-${l.kind}${l.id > this.lastLogId ? ' new' : ''}">${esc(l.text)}</div>`).join('');
    this.lastLogId = lines.at(-1)?.id ?? this.lastLogId;
    return `<div class="log panel" aria-live="polite">${html}</div>`;
  }

  private titleScreen() {
    const cards = (Object.keys(CLASSES) as ClassId[]).map((id) => {
      const c = CLASSES[id];
      const stats = STATS.map((k) => `<span>${k.toUpperCase()} ${c.baseStats[k]}</span>`).join('');
      return `<button class="class-card ${id === this.titleClass ? 'selected' : ''}" data-ui="class:${id}" style="--division:#${c.color.toString(16).padStart(6, '0')}">
        <strong>${c.name}</strong><span class="desc">${c.description}</span><span class="stats">${stats}</span></button>`;
    }).join('');
    return `
      <div class="title-screen">
        <h1>${GAME_TITLE}</h1>
        <p class="tagline">Four worlds. One starship. Report for duty, Ensign.</p>
        ${this.game.hasSave() ? '<button class="btn primary big" data-ui="continue">Resume duty</button><div class="or">or enlist a new officer</div>' : ''}
        <label class="name-field">Officer name <input id="hero-name" maxlength="20" placeholder="Hero" autocomplete="off"></label>
        <div class="class-cards">${cards}</div>
        <button class="btn primary big" data-ui="start" id="start-game">Report for duty</button>
        <p class="muted small">Combat: A attack · 1–9 abilities · Tab switch target · F beam out. Between fights: Enter/Space advance · R return to ship.</p>
      </div>`;
  }

  private town(s: GameState, btn: BtnFn) {
    const tabs: [TownTab, string][] = [['quests', 'Mission Board'], ['shop', 'Quartermaster'], ['inventory', 'Locker'], ['character', 'Personnel File'], ['inn', 'Sickbay']];
    const p = s.player!;
    let body = '';
    switch (this.tab) {
      case 'quests': body = this.questBoard(s, btn); break;
      case 'shop': body = this.shop(p, btn); break;
      case 'inventory': body = this.inventory(p, btn); break;
      case 'character': body = this.character(p, btn); break;
      case 'inn': body = this.inn(p, btn); break;
    }
    return `
      <div class="town-header"><h2>Meridian <span class="muted small">Exploration Vessel</span></h2><button class="btn ghost small" data-ui="title">Main menu</button></div>
      <div class="tabs">${tabs.map(([id, label]) => `<button class="tab ${this.tab === id ? 'active' : ''}" data-ui="tab:${id}">${label}${id === 'character' && p.statPoints ? ' •' : ''}</button>`).join('')}</div>
      <div class="tab-body">${body}</div>`;
  }

  private questBoard(s: GameState, btn: BtnFn) {
    const p = s.player!;
    const reward = patrolReward(p.level);
    const worlds = patrolWorlds(s).map((id) => getArea(id).name);
    const patrol = `<div class="row patrol-row">
        <div class="row-main"><strong>⟳ Patrol</strong> <span class="badge">Random</span> <span class="muted">Hostiles at level ${p.level}</span>
          <div class="muted small">Respond to a random distress call on ${worlds.length > 1 ? 'one of your unlocked worlds' : worlds[0]}:
            ${PATROL_CONTACTS} unpredictable contacts — solo hostiles or packs — then a priority target.
            Repeatable; bonus ${reward.xp} XP and ◈ ${reward.gold} on completion.</div></div>
        ${btn({ type: 'startPatrol' }, 'Launch patrol', 'primary')}
      </div>`;
    return `<h3>Patrol</h3><div class="list">${patrol}</div><h3>Story missions</h3><div class="list">${AREA_ORDER.map((id) => {
      const a = getArea(id);
      const unlocked = isAreaUnlocked(s, id);
      const cleared = s.clearedAreas.includes(id);
      const danger = p.level < a.minLevel ? `<span class="warn">Recommended level ${a.minLevel}</span>` : `<span class="muted">Level ${a.minLevel}+</span>`;
      return `<div class="row ${unlocked ? '' : 'locked'}">
        <div class="row-main"><strong>${a.name}</strong> ${cleared ? '<span class="badge good">Cleared</span>' : ''} ${danger}
          <div class="muted small">${unlocked ? a.description : `Classified — complete the ${getArea(a.requires!).name} mission first.`}</div></div>
        ${btn({ type: 'startQuest', areaId: id }, unlocked ? 'Beam down' : '🔒')}
      </div>`;
    }).join('')}</div>`;
  }

  private shop(p: Player, btn: BtnFn) {
    const section = (kind: ItemDef['kind'], title: string) => {
      const rows = SHOP_STOCK.map(getItem).filter((i) => i.kind === kind).map((item) => `
        <div class="row ${'level' in item && item.level > p.level ? 'locked' : ''}">
          <div class="row-main"><strong>${item.name}</strong> ${itemStats(item)}
            <div class="muted small">${item.description}${'level' in item ? ` · Lv ${item.level}` : ''}${countItem(p, item.id) ? ` · <em>owned${item.kind === 'consumable' ? ` ×${countItem(p, item.id)}` : ''}</em>` : ''}</div></div>
          ${btn({ type: 'buy', itemId: item.id }, `◈ ${item.price}`, 'buy')}
        </div>`).join('');
      return `<h3>${title}</h3><div class="list">${rows}</div>`;
    };
    return section('weapon', 'Weapons') + section('armor', 'Armor & suits') + section('consumable', 'Medical & supplies');
  }

  private inventory(p: Player, btn: BtnFn) {
    const rows = Object.entries(p.inventory).map(([id, n]) => {
      const item = getItem(id);
      const actions: string[] = [];
      if (item.kind === 'consumable') actions.push(btn({ type: 'useItem', itemId: id }, 'Use'));
      else actions.push(isEquipped(p, id) ? '<span class="badge good">Equipped</span>' : btn({ type: 'equip', itemId: id }, 'Equip'));
      actions.push(btn({ type: 'sell', itemId: id }, `Sell ◈${sellPrice(id)}`, 'ghost'));
      return `<div class="row"><div class="row-main"><strong>${item.name}</strong>${n > 1 ? ` ×${n}` : ''} ${itemStats(item)}
        <div class="muted small">${item.description}</div></div><div class="row-actions">${actions.join('')}</div></div>`;
    }).join('');
    return `<div class="list">${rows}</div>`;
  }

  private character(p: Player, btn: BtnFn) {
    const d = derive(p);
    const stats = STATS.map((k) => `<div class="row"><div class="row-main"><strong>${STAT_NAMES[k]}</strong> <span class="stat-val">${p.stats[k]}</span>
      <div class="muted small">${STAT_HELP[k]}</div></div>${p.statPoints ? btn({ type: 'allocateStat', stat: k }, '+1') : ''}</div>`).join('');
    const resist = ELEMENTS.filter((el) => d.damageTaken[el] !== 100).map((el) => `${ELEMENT_ICONS[el]} ${100 - d.damageTaken[el]}%`).join(', ');
    const spells = knownSpells(p).map((sp) => `<div class="row"><div class="row-main"><strong>${sp.name}</strong> <span class="mp-cost">${sp.mp} EN</span>${abilityTags(p, sp, null)}<div class="muted small">${sp.description}</div></div></div>`).join('');
    return `
      <div class="two-col">
        <div><h3>Attributes ${p.statPoints ? `<span class="badge">${p.statPoints} to spend</span>` : ''}</h3><div class="list">${stats}</div></div>
        <div><h3>Combat</h3>
          <div class="kv"><span>Accuracy bonus</span><b>+${d.accuracy.toFixed(0)}</b><span>Evasion</span><b>${d.evasion.toFixed(0)}</b>
          <span>Critical chance</span><b>${d.critChance.toFixed(0)}%</b><span>Resistances</span><b>${resist || '—'}</b></div>
          <h3>Abilities</h3><div class="list">${spells}</div>
        </div>
      </div>`;
  }

  private inn(p: Player, btn: BtnFn) {
    return `<div class="inn"><p>The ship's doctor looks you over. A regen bed restores all HP and energy.</p>
      ${btn({ type: 'rest' }, `Treatment ◈ ${restCost(p)}`, 'primary', 'You are already at full health')}</div>`;
  }

  private questPanel(s: GameState, btn: BtnFn) {
    const q = s.quest!;
    const area = getArea(q.areaId);
    const contacts = questEncounters(q);
    const total = contacts + 1;
    const pips = Array.from({ length: total }, (_, i) => `<span class="pip ${i < q.cleared ? 'done' : ''} ${i === total - 1 ? 'boss' : ''}"></span>`).join('');
    const bossNext = q.cleared >= contacts;
    const potions = Object.keys(s.player!.inventory).filter((id) => getItem(id).kind === 'consumable');
    return `
      <h2>${q.patrol ? `<span class="muted">Patrol ·</span> ` : ''}${area.name}${q.patrol ? ` <span class="badge">Lv ${q.patrol.level}</span>` : ''}</h2>
      <div class="pips">${pips}</div>
      <p class="muted">${bossNext ? 'Sensors show a massive life sign ahead…' : `Contact ${q.cleared + 1} of ${contacts}, then the priority target.`} Earned so far: ${q.earnedXp} XP, ◈ ${q.earnedGold}.</p>
      <div class="actions">${btn({ type: 'continue' }, `<span class="key">Enter</span>${bossNext ? 'Engage priority target' : 'Advance'}`, 'primary big')}${btn({ type: 'retreat' }, '<span class="key">R</span>Beam up to ship', 'ghost')}</div>
      ${potions.length ? `<div class="actions small-actions">${potions.map((id) => btn({ type: 'useItem', itemId: id }, `${getItem(id).name} ×${countItem(s.player!, id)}`, 'small')).join('')}</div>` : ''}`;
  }

  private battlePanel(s: GameState, btn: BtnFn) {
    const p = s.player!;
    const foe = s.battle ? getMonster(s.battle.monsters[s.battle.target]!.defId) : null;
    const back = '<button class="btn ghost" data-ui="menu:main">◂ Back</button>';
    switch (this.battleMenu) {
      case 'skills':
        return `<div class="actions grid">${knownSpells(p).map((sp, i) => btn({ type: 'cast', spellId: sp.id },
          `<span class="key">${i + 1}</span><span class="skill-name">${sp.name}</span> <span class="mp-cost">${sp.mp} EN</span>${abilityTags(p, sp, foe)}`,
          'skill', sp.description)).join('')}${back}</div>`;
      case 'items': {
        const items = Object.keys(p.inventory).filter((id) => getItem(id).kind === 'consumable');
        return `<div class="actions grid">${items.map((id) => btn({ type: 'useItem', itemId: id }, `${getItem(id).name} ×${countItem(p, id)}`, '', getItem(id).description)).join('') || '<span class="muted">No items.</span>'}${back}</div>`;
      }
      case 'gear': {
        const weapons = Object.keys(p.inventory).filter((id) => getItem(id).kind === 'weapon' && id !== p.weapon);
        return `<div class="actions grid">${weapons.map((id) => btn({ type: 'equip', itemId: id }, `${getItem(id).name} ${itemStats(getItem(id))}`, '', 'Swapping weapons uses your turn')).join('') || '<span class="muted">No other weapons.</span>'}${back}</div>`;
      }
      default:
        return `<div class="actions battle-main">
          ${btn({ type: 'attack' }, `<span class="key">A</span>Attack ${elementChip(getWeapon(p.weapon).element, foe, true)}`, 'primary big')}
          <button class="btn big" data-ui="menu:skills" ${this.game.busy ? 'disabled' : ''}>Abilities ▸</button>
          <button class="btn" data-ui="menu:items" ${this.game.busy ? 'disabled' : ''}>Items ▸</button>
          <button class="btn" data-ui="menu:gear" ${this.game.busy ? 'disabled' : ''}>Swap weapon ▸</button>
          ${btn({ type: 'flee' }, '<span class="key">F</span>Beam out', 'ghost')}
        </div>`;
    }
  }

  private defeatedPanel(btn: BtnFn) {
    return `<h2>Officer down</h2><p class="muted">An emergency transport pulled you out just in time. Some credits were lost in the chaos.</p>
      <div class="actions">${btn({ type: 'returnToTown' }, '<span class="key">Enter</span>Wake up in sickbay', 'primary big')}</div>`;
  }

  private victoryModal(s: GameState) {
    return `<div class="modal-backdrop"><div class="modal panel">
      <h2>The rift is sealed!</h2>
      <p>The Hollow Admiral is gone and the Meridian is safe. ${esc(s.player!.name)} reached level ${s.player!.level} after ${s.stats.battlesWon} victories.</p>
      <p class="muted">Your tour of duty continues — every mission can be replayed.</p>
      <button class="btn primary" data-ui="close-modal">Continue tour</button></div></div>`;
  }
}

/**
 * Keyboard shortcuts. Returns the game action for a key in the current mode, or null.
 * Kept as a pure function of state so it can be unit-tested and reused (e.g. for a help overlay).
 */
export function keyAction(s: GameState, key: string, shift = false): Action | null {
  const k = key.toLowerCase();
  const advance = k === 'enter' || k === ' ' || k === 'c';
  switch (s.mode) {
    case 'battle': {
      if (k === 'tab') {
        // Cycle through living hostiles (Shift+Tab goes backwards).
        const b = s.battle!;
        const n = b.monsters.length;
        for (let step = 1; step < n; step++) {
          const i = (b.target + (shift ? n - step : step)) % n;
          if (b.monsters[i]!.hp > 0) return { type: 'target', index: i };
        }
        return null;
      }
      if (k === 'a') return { type: 'attack' };
      if (k === 'f') return { type: 'flee' };
      if (/^[1-9]$/.test(k)) {
        const spell = knownSpells(s.player!)[Number(k) - 1];
        return spell ? { type: 'cast', spellId: spell.id } : null;
      }
      return null;
    }
    case 'quest':
      if (advance) return { type: 'continue' };
      if (k === 'r') return { type: 'retreat' };
      return null;
    case 'defeated':
      return advance ? { type: 'returnToTown' } : null;
    default:
      return null;
  }
}

// ─── Ability / element tags ─────────────────────────────────────────────────

const STATUS_NAMES: Record<StatusEffect['id'], string> = {
  burn: 'burn', corrode: 'corrode', stun: 'stun', shield: 'shield', evasive: 'evade', chill: 'chill',
};

/**
 * Damage-type chip. With a foe, adds how well it works against them:
 * ▲ vulnerable, ▼ resisted, ✕ immune.
 */
function elementChip(el: Element, foe: MonsterDef | null, iconOnly = false): string {
  let eff = '';
  let title = el;
  if (foe) {
    const pct = monsterDamageTaken(foe, el);
    if (pct === 0) { eff = '<b class="eff eff-immune">✕</b>'; title += ` — ${foe.name} is immune`; }
    else if (pct > 100) { eff = '<b class="eff eff-good">▲</b>'; title += ` — ${foe.name} is vulnerable (${pct}%)`; }
    else if (pct < 100) { eff = '<b class="eff eff-bad">▼</b>'; title += ` — ${foe.name} resists (${pct}%)`; }
  }
  return `<span class="chip el el-${el}" title="${esc(title)}">${ELEMENT_ICONS[el]}${iconOnly ? '' : ` ${el}`}${eff}</span>`;
}

/** Chips for everything an ability does: damage types, heals and status effects. */
function abilityTags(p: Player, spell: SpellDef, foe: MonsterDef | null): string {
  const tags: string[] = [];
  for (const e of spell.effects) {
    if (e.type === 'damage') {
      tags.push(elementChip(resolveElement(p, e.element), foe));
      if (e.aoe) tags.push('<span class="chip tag-aoe" title="Hits every hostile">⇶ all</span>');
    } else if (e.type === 'heal') {
      tags.push('<span class="chip tag-heal" title="Restores HP">✚ heal</span>');
    } else {
      const who = e.target === 'self' ? 'You gain' : 'Inflicts';
      const chance = e.chance !== undefined ? ` (${e.chance}%)` : '';
      tags.push(`<span class="chip tag-status tag-${e.status}" title="${who} ${STATUS_NAMES[e.status]} for ${e.turns} turn(s)${chance}">${STATUS_ICONS[e.status]} ${STATUS_NAMES[e.status]}${chance}</span>`);
    }
  }
  return `<span class="tags">${tags.join('')}</span>`;
}

type BtnFn = (action: Action, label: string, cls?: string, hint?: string) => string;

function bar(kind: string, value: number, max: number, label: string) {
  return `<div class="bar bar-${kind.replace(' ', ' bar-')}"><div class="fill" style="width:${pct(value, max)}"></div><span>${label} ${value} / ${max}</span></div>`;
}

function statusChips(statuses: StatusEffect[]) {
  return statuses.map((st) => `<span class="status" title="${st.id} (${st.turns} turns)">${STATUS_ICONS[st.id]}${st.turns}</span>`).join('');
}

function itemStats(item: ItemDef): string {
  if (item.kind === 'weapon') {
    return `<span class="el el-${item.element}">${ELEMENT_ICONS[item.element]} ${item.damage[0]}–${item.damage[1]}</span>`;
  }
  if (item.kind === 'armor') {
    const res = Object.entries(item.resist).map(([el, v]) => `${ELEMENT_ICONS[el as keyof typeof ELEMENT_ICONS]}${v}%`).join(' ');
    return `<span class="muted">🛡${item.block}${item.hp ? ` +${item.hp}HP` : ''}${item.mp ? ` +${item.mp}EN` : ''}${res ? ` ${res}` : ''}</span>`;
  }
  return '';
}

