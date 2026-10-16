/**
 * DOM user interface. Re-renders from game state on every change; buttons
 * carry their game action as JSON in `data-action`, and are enabled only when
 * `checkAction` allows that exact action.
 *
 * This class owns input handling and UI-only state (open tab, menu, key
 * queue). The markup lives in views/ (pure functions of state → HTML), shared
 * chips in widgets.ts, string helpers in html.ts, key bindings in keys.ts.
 */
import { START_POINTS, STATS, checkAction, defaultStart, drillRoster } from '../core';
import type { Action, Stat, Stats } from '../core';
import type { GameController } from '../game/controller';
import { actionAttr, esc } from './html';
import { keyAction } from './keys';
import { battlePanel, defeatedPanel, hud, hostileCard, missionPanel, turnOrder } from './views/mission';
import type { BattleMenu } from './views/mission';
import { titleScreen, victoryModal } from './views/title';
import { shipView } from './views/ship';
import type { ShipTab } from './views/ship';

/** Containers whose scroll position survives a re-render. */
const SCROLLERS = '.tab-body, .main-panel.mode-title';

export class UI {
  private tab: ShipTab = 'missions';
  /** Combat drill lineup picked on the Mission Board (one hostile id per slot, '' = empty). */
  private drill: string[] = [drillRoster()[0]!.hostileIds[0]!, '', ''];
  private battleMenu: BattleMenu = 'main';
  private titleName = '';
  /** Starting points as spread on the title screen; `customizing` shows the +/− controls. */
  private titleStart: Stats = defaultStart();
  private customizing = false;
  private seenGameComplete = false;
  private lastLogId = 0;
  /**
   * Keys pressed while an animation plays (max 3), run in order as soon as it finishes.
   * Stored raw and resolved at run time, so e.g. Tab, Tab, 1 targets correctly.
   */
  private keyQueue: { key: string; shift: boolean }[] = [];
  private showVictoryModal = false;
  /** Mode + tab of the last render, to tell a refresh from a screen change. */
  private lastView = '';

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
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.drill === undefined) return;
      this.drill[Number(t.dataset.drill)] = t.value;
      this.render();
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
      if (['attack', 'useAbility', 'useItem', 'equip', 'flee'].includes(action.type) && this.game.state.mode === 'battle') {
        this.battleMenu = 'main';
      }
      void this.run(action);
      return;
    }
    const [kind, value] = (el.dataset.ui ?? '').split(':');
    switch (kind) {
      case 'tab': this.tab = value as ShipTab; break;
      case 'menu': this.battleMenu = value as BattleMenu; break;
      case 'customize': this.customizing = !this.customizing; if (!this.customizing) this.titleStart = defaultStart(); break;
      case 'stat+': case 'stat-': {
        const k = value as Stat;
        const left = STATS.reduce((n, x) => n - this.titleStart[x], START_POINTS);
        if (kind === 'stat+' && left > 0) this.titleStart[k] += 1;
        if (kind === 'stat-' && this.titleStart[k] > 0) this.titleStart[k] -= 1;
        break;
      }
      case 'start':
        void this.run(this.newGameAction());
        this.tab = 'missions';
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

  private newGameAction(): Action {
    return { type: 'newGame', name: this.titleName || 'Hero', stats: { ...this.titleStart } };
  }

  render() {
    // What's on screen trails the true state while events animate (see GameController.shown).
    const s = this.game.shown;
    const btn = (action: Action, label: string, cls = '', hint = '') => {
      const why = checkAction(s, action);
      const ok = why === null && !this.game.busy;
      const reason = ok ? hint : why ?? (this.game.busy ? '' : hint);
      return `<button class="btn ${cls}" ${actionAttr(action)} ${ok ? '' : 'disabled'} title="${esc(reason)}">${label}</button>`;
    };

    let main = '';
    switch (s.mode) {
      case 'title': main = titleScreen(this.titleStart, this.customizing, checkAction(this.game.state, this.newGameAction()), this.game.hasSave()); break;
      case 'ship': main = shipView(s, btn, this.tab, this.drill); break;
      case 'mission': main = missionPanel(s, btn); break;
      case 'battle': main = battlePanel(s, btn, this.battleMenu, this.game.busy); break;
      case 'defeated': main = defeatedPanel(btn); break;
    }

    // Re-rendering replaces the DOM; keep scrolled lists where they were (same screen only).
    const view = `${s.mode}:${this.tab}`;
    const scroll = view === this.lastView
      ? [...this.root.querySelectorAll<HTMLElement>(SCROLLERS)].map((el) => el.scrollTop) : [];
    this.lastView = view;
    this.root.dataset.mode = s.mode;
    this.root.innerHTML = `
      ${s.player ? hud(s.player, s.battle?.playerStatuses ?? []) : ''}
      ${s.battle ? hostileCard(s, this.game.busy) : ''}
      ${s.battle ? turnOrder(s) : ''}
      <div class="main-panel mode-${s.mode}">${main}</div>
      ${s.mode !== 'title' ? this.logPanel() : ''}
      ${this.showVictoryModal ? victoryModal(s) : ''}
    `;
    this.root.querySelectorAll<HTMLElement>(SCROLLERS).forEach((el, i) => { el.scrollTop = scroll[i] ?? 0; });
    const input = this.root.querySelector<HTMLInputElement>('#hero-name');
    if (input) input.value = this.titleName;
  }

  private logPanel() {
    const lines = this.game.log.slice(-7);
    const html = lines.map((l) => `<div class="log-${l.kind}${l.id > this.lastLogId ? ' new' : ''}">${esc(l.text)}</div>`).join('');
    this.lastLogId = lines.at(-1)?.id ?? this.lastLogId;
    return `<div class="log panel" aria-live="polite">${html}</div>`;
  }
}
