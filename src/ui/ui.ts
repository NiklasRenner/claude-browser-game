/**
 * DOM user interface. Re-renders from game state on every change; buttons
 * carry their game action as JSON in `data-action`, and are enabled only when
 * `legalActions` contains that exact action.
 */
import {
  AREA_ORDER, CLASSES, ELEMENTS, SHOP_STOCK, STATS, checkAction, countItem, derive, getArea, getClass,
  getItem, getMonster, isAreaUnlocked, isEquipped, knownSpells, restCost, sellPrice, xpToNext,
} from '../core';
import type { Action, ClassId, GameState, ItemDef, Player, Stat, StatusEffect } from '../core';
import type { GameController } from '../game/controller';
import { ELEMENT_ICONS, STATUS_ICONS } from '../game/elements';

type TownTab = 'quests' | 'shop' | 'inventory' | 'character' | 'inn';
type BattleMenu = 'main' | 'skills' | 'items' | 'gear';

const STAT_NAMES: Record<Stat, string> = {
  str: 'Strength', dex: 'Dexterity', int: 'Intellect', end: 'Endurance', luk: 'Luck',
};
const STAT_HELP: Record<Stat, string> = {
  str: 'Warrior damage. Slight accuracy.',
  dex: 'Accuracy & evasion. Rogue damage.',
  int: 'Mage damage. Max MP.',
  end: 'Max HP.',
  luk: 'Critical hits, gold and escaping.',
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const actionAttr = (a: Action) => `data-action='${esc(JSON.stringify(a))}'`;
const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (100 * v) / Math.max(1, max)))}%`;

export class UI {
  private tab: TownTab = 'quests';
  private battleMenu: BattleMenu = 'main';
  private titleName = '';
  private titleClass: ClassId = 'warrior';
  private seenGameComplete = false;
  private lastLogId = 0;
  private showVictoryModal = false;

  constructor(private root: HTMLElement, private game: GameController) {
    game.subscribe(() => this.render());
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
    if ((e.target as HTMLElement).tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
    const s = this.game.state;
    const k = e.key.toLowerCase();
    if (s.mode === 'battle') {
      if (k === 'a') void this.run({ type: 'attack' });
      else if (k === 'f') void this.run({ type: 'flee' });
      else if (k === 'escape') { this.battleMenu = 'main'; this.render(); }
      else if (/^[1-9]$/.test(k)) {
        const spell = knownSpells(s.player!)[Number(k) - 1];
        if (spell) void this.run({ type: 'cast', spellId: spell.id });
      } else return;
    } else if (s.mode === 'quest') {
      if (k === 'enter' || k === 'c') void this.run({ type: 'continue' });
      else if (k === 'r') void this.run({ type: 'retreat' });
      else return;
    } else if (s.mode === 'defeated' && (k === 'enter' || k === ' ')) {
      void this.run({ type: 'returnToTown' });
    } else return;
    e.preventDefault();
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
        ${bar('mp', p.mp, d.maxMp, 'MP')}
        <div class="bar bar-xp" title="XP ${p.xp} / ${xpToNext(p.level)}"><div class="fill" style="width:${pct(p.xp, xpToNext(p.level))}"></div></div>
        <div class="hud-row"><span class="gold">◉ ${p.gold}</span><span class="muted small">XP ${p.xp}/${xpToNext(p.level)}</span>${p.statPoints ? `<span class="badge">+${p.statPoints} stat pts</span>` : ''}
        ${statusChips(statuses)}</div>
      </div>`;
  }

  private monsterCard(s: GameState) {
    const b = s.battle!;
    const def = getMonster(b.monster.defId);
    const weak = ELEMENTS.filter((el) => (def.resist[el] ?? 100) > 100);
    const strong = ELEMENTS.filter((el) => (def.resist[el] ?? 100) < 100);
    const chips = (els: typeof weak) => els.map((el) => `<span class="el el-${el}">${ELEMENT_ICONS[el]} ${el}</span>`).join(' ');
    return `
      <div class="monster-card panel ${def.boss ? 'boss' : ''}">
        <div class="hud-name"><strong>${esc(def.name)}</strong> <span class="muted">Lv ${def.level}${def.boss ? ' · BOSS' : ''}</span></div>
        ${bar('hp enemy', b.monster.hp, b.monster.maxHp, 'HP')}
        <div class="hud-row">${statusChips(b.monster.statuses)}</div>
        ${weak.length ? `<div class="res">Weak: ${chips(weak)}</div>` : ''}
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
      return `<button class="class-card ${id === this.titleClass ? 'selected' : ''}" data-ui="class:${id}" style="--accent:#${c.color.toString(16).padStart(6, '0')}">
        <strong>${c.name}</strong><span class="desc">${c.description}</span><span class="stats">${stats}</span></button>`;
    }).join('');
    return `
      <div class="title-screen">
        <h1>QuestForge</h1>
        <p class="tagline">Four lands. Four bosses. One very determined hero.</p>
        ${this.game.hasSave() ? '<button class="btn primary big" data-ui="continue">Continue adventure</button><div class="or">or start anew</div>' : ''}
        <label class="name-field">Hero name <input id="hero-name" maxlength="20" placeholder="Hero" autocomplete="off"></label>
        <div class="class-cards">${cards}</div>
        <button class="btn primary big" data-ui="start" id="start-game">Begin adventure</button>
        <p class="muted small">Battle keys: A attack · 1–9 skills · F flee. Quest: Enter continue · R retreat.</p>
      </div>`;
  }

  private town(s: GameState, btn: BtnFn) {
    const tabs: [TownTab, string][] = [['quests', 'Quest Board'], ['shop', 'Shop'], ['inventory', 'Inventory'], ['character', 'Character'], ['inn', 'Inn']];
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
      <div class="town-header"><h2>Brightwater</h2><button class="btn ghost small" data-ui="title">Main menu</button></div>
      <div class="tabs">${tabs.map(([id, label]) => `<button class="tab ${this.tab === id ? 'active' : ''}" data-ui="tab:${id}">${label}${id === 'character' && p.statPoints ? ' •' : ''}</button>`).join('')}</div>
      <div class="tab-body">${body}</div>`;
  }

  private questBoard(s: GameState, btn: BtnFn) {
    const p = s.player!;
    return `<div class="list">${AREA_ORDER.map((id) => {
      const a = getArea(id);
      const unlocked = isAreaUnlocked(s, id);
      const cleared = s.clearedAreas.includes(id);
      const danger = p.level < a.minLevel ? `<span class="warn">Recommended level ${a.minLevel}</span>` : `<span class="muted">Level ${a.minLevel}+</span>`;
      return `<div class="row ${unlocked ? '' : 'locked'}">
        <div class="row-main"><strong>${a.name}</strong> ${cleared ? '<span class="badge good">Cleared</span>' : ''} ${danger}
          <div class="muted small">${unlocked ? a.description : `Locked — defeat the boss of ${getArea(a.requires!).name}.`}</div></div>
        ${btn({ type: 'startQuest', areaId: id }, unlocked ? 'Set out' : '🔒')}
      </div>`;
    }).join('')}</div>`;
  }

  private shop(p: Player, btn: BtnFn) {
    const section = (kind: ItemDef['kind'], title: string) => {
      const rows = SHOP_STOCK.map(getItem).filter((i) => i.kind === kind).map((item) => `
        <div class="row ${'level' in item && item.level > p.level ? 'locked' : ''}">
          <div class="row-main"><strong>${item.name}</strong> ${itemStats(item)}
            <div class="muted small">${item.description}${'level' in item ? ` · Lv ${item.level}` : ''}${countItem(p, item.id) ? ` · <em>owned${item.kind === 'consumable' ? ` ×${countItem(p, item.id)}` : ''}</em>` : ''}</div></div>
          ${btn({ type: 'buy', itemId: item.id }, `◉ ${item.price}`, 'buy')}
        </div>`).join('');
      return `<h3>${title}</h3><div class="list">${rows}</div>`;
    };
    return section('weapon', 'Weapons') + section('armor', 'Armor') + section('consumable', 'Potions & supplies');
  }

  private inventory(p: Player, btn: BtnFn) {
    const rows = Object.entries(p.inventory).map(([id, n]) => {
      const item = getItem(id);
      const actions: string[] = [];
      if (item.kind === 'consumable') actions.push(btn({ type: 'useItem', itemId: id }, 'Use'));
      else actions.push(isEquipped(p, id) ? '<span class="badge good">Equipped</span>' : btn({ type: 'equip', itemId: id }, 'Equip'));
      if (item.price > 0) actions.push(btn({ type: 'sell', itemId: id }, `Sell ◉${sellPrice(id)}`, 'ghost'));
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
    const spells = knownSpells(p).map((sp) => `<div class="row"><div class="row-main"><strong>${sp.name}</strong> <span class="mp-cost">${sp.mp} MP</span><div class="muted small">${sp.description}</div></div></div>`).join('');
    return `
      <div class="two-col">
        <div><h3>Attributes ${p.statPoints ? `<span class="badge">${p.statPoints} to spend</span>` : ''}</h3><div class="list">${stats}</div></div>
        <div><h3>Combat</h3>
          <div class="kv"><span>Accuracy bonus</span><b>+${d.accuracy.toFixed(0)}</b><span>Evasion</span><b>${d.evasion.toFixed(0)}</b>
          <span>Critical chance</span><b>${d.critChance.toFixed(0)}%</b><span>Resistances</span><b>${resist || '—'}</b></div>
          <h3>Skills</h3><div class="list">${spells}</div>
        </div>
      </div>`;
  }

  private inn(p: Player, btn: BtnFn) {
    return `<div class="inn"><p>The Sleepy Griffin welcomes you. A hot meal and a warm bed restore all HP and MP.</p>
      ${btn({ type: 'rest' }, `Rest for ◉ ${restCost(p)}`, 'primary', 'You are already fully rested')}</div>`;
  }

  private questPanel(s: GameState, btn: BtnFn) {
    const q = s.quest!;
    const area = getArea(q.areaId);
    const total = area.encounters + 1;
    const pips = Array.from({ length: total }, (_, i) => `<span class="pip ${i < q.cleared ? 'done' : ''} ${i === total - 1 ? 'boss' : ''}"></span>`).join('');
    const bossNext = q.cleared >= area.encounters;
    const potions = Object.keys(s.player!.inventory).filter((id) => getItem(id).kind === 'consumable');
    return `
      <h2>${area.name}</h2>
      <div class="pips">${pips}</div>
      <p class="muted">${bossNext ? 'You sense something big ahead…' : `Encounter ${q.cleared + 1} of ${area.encounters}, then the boss.`} Earned so far: ${q.earnedXp} XP, ◉ ${q.earnedGold}.</p>
      <div class="actions">${btn({ type: 'continue' }, bossNext ? 'Face the boss!' : 'Press on', 'primary big')}${btn({ type: 'retreat' }, 'Return to town', 'ghost')}</div>
      ${potions.length ? `<div class="actions small-actions">${potions.map((id) => btn({ type: 'useItem', itemId: id }, `${getItem(id).name} ×${countItem(s.player!, id)}`, 'small')).join('')}</div>` : ''}`;
  }

  private battlePanel(s: GameState, btn: BtnFn) {
    const p = s.player!;
    const back = '<button class="btn ghost" data-ui="menu:main">◂ Back</button>';
    switch (this.battleMenu) {
      case 'skills':
        return `<div class="actions grid">${knownSpells(p).map((sp, i) => btn({ type: 'cast', spellId: sp.id },
          `<span class="key">${i + 1}</span>${sp.name} <span class="mp-cost">${sp.mp} MP</span>`, 'skill', sp.description)).join('')}${back}</div>`;
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
          ${btn({ type: 'attack' }, '<span class="key">A</span>Attack', 'primary big')}
          <button class="btn big" data-ui="menu:skills" ${this.game.busy ? 'disabled' : ''}>Skills ▸</button>
          <button class="btn" data-ui="menu:items" ${this.game.busy ? 'disabled' : ''}>Items ▸</button>
          <button class="btn" data-ui="menu:gear" ${this.game.busy ? 'disabled' : ''}>Swap weapon ▸</button>
          ${btn({ type: 'flee' }, '<span class="key">F</span>Flee', 'ghost')}
        </div>`;
    }
  }

  private defeatedPanel(btn: BtnFn) {
    return `<h2>You have fallen…</h2><p class="muted">The townsfolk drag you back to Brightwater. You lost some gold along the way.</p>
      <div class="actions">${btn({ type: 'returnToTown' }, 'Wake up in town', 'primary big')}</div>`;
  }

  private victoryModal(s: GameState) {
    return `<div class="modal-backdrop"><div class="modal panel">
      <h2>Brightwater is saved!</h2>
      <p>The Hollow King is no more. ${esc(s.player!.name)} reached level ${s.player!.level} after ${s.stats.battlesWon} victories.</p>
      <p class="muted">You can keep adventuring — every area can be replayed.</p>
      <button class="btn primary" data-ui="close-modal">Keep playing</button></div></div>`;
  }
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
    return `<span class="muted">🛡${item.block}${item.hp ? ` +${item.hp}HP` : ''}${item.mp ? ` +${item.mp}MP` : ''}${res ? ` ${res}` : ''}</span>`;
  }
  return '';
}

