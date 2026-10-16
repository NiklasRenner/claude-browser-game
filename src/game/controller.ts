/**
 * Owns the live game state and is the only place the UI talks to.
 * Dispatching runs the pure reducer, autosaves, and hands the events to
 * whoever animates them (the stage). While they play, `shown` (what the UI
 * draws) and the log catch up one event at a time, so a bar drops when the
 * hit lands, not when the button is pressed.
 */
import { describeLog, deserialize, getAbility, initialState, legalActions, serialize, step } from '../core';
import type { Action, GameEvent, GameState, Tone } from '../core';

export interface Storage {
  load(): string | null;
  save(data: string): void;
  clear(): void;
}

export const localStorageAdapter = (key = 'starward.save'): Storage => ({
  load: () => { try { return localStorage.getItem(key); } catch { return null; } },
  save: (data) => { try { localStorage.setItem(key, data); } catch { /* storage full or blocked: play on */ } },
  clear: () => { try { localStorage.removeItem(key); } catch { /* ignore */ } },
});

export const memoryStorage = (): Storage => {
  let data: string | null = null;
  return { load: () => data, save: (d) => { data = d; }, clear: () => { data = null; } };
};

/**
 * Something that can animate a batch of events. Calls `played(i)` once event i has played (a hit has
 * landed, a heal has shown...). Resolves when it's done.
 */
export type Animator = (events: GameEvent[], before: GameState, after: GameState, played: (i: number) => void) => Promise<void>;

export interface LogLine {
  id: number;
  text: string;
  kind: Tone | 'system';
}

const MAX_LOG = 60;

export class GameController {
  state: GameState;
  /** What the UI shows: `state`, except while events animate, when it trails behind them. */
  shown: GameState;
  log: LogLine[] = [];
  busy = false;
  private nextLogId = 1;
  private listeners = new Set<() => void>();
  private animator: Animator | null = null;

  constructor(private storage: Storage, seed = randomSeed()) {
    this.state = initialState(seed);
    this.shown = this.state;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setAnimator(animator: Animator | null) {
    this.animator = animator;
  }

  hasSave(): boolean {
    const data = this.storage.load();
    return data !== null && deserialize(data).ok;
  }

  /** Loads the saved game. Returns an error message on failure. */
  continueGame(): string | null {
    const data = this.storage.load();
    if (!data) return 'No saved game';
    const result = deserialize(data);
    if (!result.ok) return result.error;
    this.state = this.shown = result.state;
    this.log = [];
    this.addLog('Welcome back.', 'system');
    this.emit();
    return null;
  }

  /** Replaces the current state with a validated one (debugging / tests). Returns an error message on failure. */
  loadState(state: GameState): string | null {
    const result = deserialize(serialize(state));
    if (!result.ok) return result.error;
    this.state = this.shown = result.state;
    this.emit();
    return null;
  }

  /** Returns to the title screen (the save is kept). */
  toTitle() {
    this.state = this.shown = initialState(randomSeed());
    this.log = [];
    this.emit();
  }

  legal(): Action[] {
    return legalActions(this.state);
  }

  async dispatch(action: Action): Promise<GameEvent[]> {
    if (this.busy) return [];
    const before = this.state;
    const result = step(before, action);
    if (result.events.some((e) => e.type === 'error')) {
      for (const line of describeLog(before, result)) this.addLog(line.text, line.tone);
      this.emit();
      return result.events;
    }
    this.state = result.state;
    if (this.state.mode !== 'title') this.storage.save(serialize(this.state));
    // Each event's log lines, posted as it plays.
    const lines = result.events.map((e) => describeLog(before, { state: result.state, events: [e] }));
    const post = (i: number) => { for (const line of lines[i] ?? []) this.addLog(line.text, line.tone); };
    if (!this.animator) {
      lines.forEach((_, i) => post(i));
      this.shown = this.state;
      this.emit();
      return result.events;
    }
    this.busy = true;
    this.shown = structuredClone(before);
    let done = 0;
    const played = (i: number) => {
      for (; done <= i && done < result.events.length; done++) {
        post(done);
        applyShown(this.shown, result.events[done]!, result.state);
      }
      this.emit();
    };
    // A fight starting switches the screen to the battle at once (the hostiles appearing is part of it).
    played(result.events.findIndex((e) => e.type === 'battleStart'));
    try {
      await this.animator(result.events, before, result.state, played);
    } finally {
      played(result.events.length - 1);
      this.busy = false;
      this.shown = this.state;
      this.emit();
    }
    return result.events;
  }

  private addLog(text: string, kind: LogLine['kind']) {
    this.log.push({ id: this.nextLogId++, text, kind });
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

/** What an event visibly changes (HP, energy, target, a fight starting), applied to the shown state as it plays. */
function applyShown(s: GameState, e: GameEvent, after: GameState) {
  if (e.type === 'battleStart' && after.battle) {
    // The new fight as it stands before anyone acts: the lineup at full health, no statuses yet.
    s.mode = 'battle';
    s.mission = structuredClone(after.mission);
    s.battle = { ...structuredClone(after.battle), target: 0, playerStatuses: [] };
    for (const h of s.battle.hostiles) { h.hp = h.maxHp; h.statuses = []; }
    return;
  }
  const p = s.player, b = s.battle;
  if (!p) return;
  const hostile = (foe: number | undefined) => b?.hostiles[foe ?? 0];
  switch (e.type) {
    case 'attack':
      if (!e.hit) return;
      if (e.actor === 'player') { const h = hostile(e.foe); if (h) h.hp = Math.max(0, h.hp - e.damage); }
      else p.hp = Math.max(0, p.hp - e.damage);
      return;
    case 'statusTick':
      if (e.target === 'player') p.hp = Math.max(0, p.hp - e.damage);
      else { const h = hostile(e.foe); if (h) h.hp = Math.max(0, h.hp - e.damage); }
      return;
    case 'abilityUsed':
      if (e.actor === 'player') p.energy = Math.max(0, p.energy - getAbility(e.abilityId).energy);
      return;
    case 'heal':
      if (e.actor === 'player') { p.hp += e.amount; p.energy += e.energy; }
      return;
    case 'hostileDown': { const h = hostile(e.foe); if (h) h.hp = 0; return; }
    case 'targeted': if (b) b.target = e.foe; return;
    default:
  }
}

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return (Math.random() * 2 ** 32) >>> 0;
  }
}
