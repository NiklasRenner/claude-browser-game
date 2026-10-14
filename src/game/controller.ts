/**
 * Owns the live game state and is the only place the UI talks to.
 * Dispatching runs the pure reducer, records the log, autosaves, and hands
 * the events to whoever animates them (the 3D renderer).
 */
import { deserialize, describeStep, initialState, legalActions, serialize, step } from '../core';
import type { Action, GameEvent, GameState } from '../core';

export interface Storage {
  load(): string | null;
  save(data: string): void;
  clear(): void;
}

export const localStorageAdapter = (key = 'questforge.save'): Storage => ({
  load: () => { try { return localStorage.getItem(key); } catch { return null; } },
  save: (data) => { try { localStorage.setItem(key, data); } catch { /* storage full or blocked: play on */ } },
  clear: () => { try { localStorage.removeItem(key); } catch { /* ignore */ } },
});

export const memoryStorage = (): Storage => {
  let data: string | null = null;
  return { load: () => data, save: (d) => { data = d; }, clear: () => { data = null; } };
};

/** Something that can animate a batch of events. Resolves when it's done. */
export type Animator = (events: GameEvent[], before: GameState, after: GameState) => Promise<void>;

export interface LogLine {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'loot' | 'system';
}

const MAX_LOG = 60;

export class GameController {
  state: GameState;
  log: LogLine[] = [];
  busy = false;
  private nextLogId = 1;
  private listeners = new Set<() => void>();
  private animator: Animator | null = null;

  constructor(private storage: Storage, seed = randomSeed()) {
    this.state = initialState(seed);
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
    this.state = result.state;
    this.log = [];
    this.addLog('Welcome back.', 'system');
    this.emit();
    return null;
  }

  /** Returns to the title screen (the save is kept). */
  toTitle() {
    this.state = initialState(randomSeed());
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
      for (const line of describeStep(before, result)) this.addLog(line, 'bad');
      this.emit();
      return result.events;
    }
    this.state = result.state;
    if (this.state.mode !== 'title') this.storage.save(serialize(this.state));
    const lines = describeStep(before, result);
    for (const line of lines) this.addLog(line, classify(line));
    this.busy = this.animator !== null;
    this.emit();
    if (this.animator) {
      try {
        await this.animator(result.events, before, result.state);
      } finally {
        this.busy = false;
        this.emit();
      }
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

function classify(line: string): LogLine['kind'] {
  if (/^(LEVEL UP|Victory|Quest complete|Learned|The Hollow King falls)/.test(line)) return 'good';
  if (/found|Bought|Sold|Equipped/.test(line)) return 'loot';
  if (/defeated|failed|⚠/.test(line)) return 'bad';
  return 'info';
}

export function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  } catch {
    return (Math.random() * 2 ** 32) >>> 0;
  }
}
