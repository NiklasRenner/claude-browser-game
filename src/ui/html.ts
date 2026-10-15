/** Small HTML-string helpers shared by every view. */
import type { Action } from '../core';

/** Renders a button for a game action; enabled only when the action is legal right now (see UI.render). */
export type BtnFn = (action: Action, label: string, cls?: string, hint?: string) => string;

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const actionAttr = (a: Action) => `data-action='${esc(JSON.stringify(a))}'`;
export const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (100 * v) / Math.max(1, max)))}%`;

export function bar(kind: string, value: number, max: number, label: string) {
  return `<div class="bar bar-${kind.replace(' ', ' bar-')}"><div class="fill" style="width:${pct(value, max)}"></div><span>${label} ${value} / ${max}</span></div>`;
}
