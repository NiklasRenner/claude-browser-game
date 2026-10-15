/**
 * DOM user interface. Re-renders from game state on every change; buttons
 * carry their game action as JSON in `data-action`, and are enabled only when
 * `legalActions` contains that exact action.
 *
 * This class owns input handling and UI-only state (open tab, menu, key
 * queue). The markup lives in views/ (pure functions of state → HTML), shared
 * chips in widgets.ts, string helpers in html.ts, key bindings in keys.ts.
 */
import { checkAction } from '../core';
import type { Action, ClassId } from '../core';
import type { GameController } from '../game/controller';
import { actionAttr, esc } from './html';
import { keyAction } from './keys';
import { battlePanel, defeatedPanel, hud, monsterCard, questPanel, turnOrder } from './views/mission';
import type { BattleMenu } from './views/mission';
import { titleScreen, victoryModal } from './views/title';
import { town } from './views/town';
import type { TownTab } from './views/town';

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
      case 'title': main = titleScreen(this.titleClass, this.game.hasSave()); break;
      case 'town': main = town(s, btn, this.tab); break;
      case 'quest': main = questPanel(s, btn); break;
      case 'battle': main = battlePanel(s, btn, this.battleMenu, this.game.busy); break;
      case 'defeated': main = defeatedPanel(btn); break;
    }

    this.root.innerHTML = `
      ${s.player ? hud(s.player, s.battle?.playerStatuses ?? []) : ''}
      ${s.battle ? monsterCard(s, this.game.busy) : ''}
      ${s.battle ? turnOrder(s) : ''}
      <div class="main-panel mode-${s.mode}">${main}</div>
      ${s.mode !== 'title' ? this.logPanel() : ''}
      ${this.showVictoryModal ? victoryModal(s) : ''}
    `;
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
