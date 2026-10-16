/** Title screen and the end-of-campaign modal. */
import { BASE_STAT, FINAL_MISSION, START_POINTS, START_WEAPON, STATS, STAT_INFO, abilitiesFor, getItem, getMission } from '../../core';
import type { GameState, Stats } from '../../core';
import { esc } from '../html';

/** Working title — change it here (and in public/index.html). */
const GAME_TITLE = 'STARWARD';

/**
 * `start`: the starting points as spread so far; `customizing` shows the +/− controls;
 * `problem`: why the officer can't enlist yet (checkAction), or null.
 */
export function titleScreen(start: Stats, customizing: boolean, problem: string | null, hasSave: boolean) {
  const left = STATS.reduce((n, k) => n - start[k], START_POINTS);
  const rows = STATS.map((k) => {
    const info = STAT_INFO[k];
    const ctl = customizing
      ? `<span class="start-ctl"><button class="btn tiny" data-ui="stat-:${k}" ${start[k] > 0 ? '' : 'disabled'} aria-label="Less ${info.name}">−</button><button class="btn tiny" data-ui="stat+:${k}" ${left > 0 ? '' : 'disabled'} aria-label="More ${info.name}">+</button></span>`
      : '';
    return `<div class="start-stat" title="${esc(info.help)}"><span class="start-name">${info.name}</span><strong>${BASE_STAT + start[k]}</strong>${ctl}</div>`;
  }).join('');
  const kit = abilitiesFor(99).map((a) => `${a.name} <span class="muted">(Lv ${a.level})</span>`).join(' · ');
  return `
    <div class="title-screen">
      <h1>${GAME_TITLE}</h1>
      <p class="tagline">Five worlds. One starship. Report for duty, Ensign.</p>
      ${hasSave ? '<button class="btn primary big" data-ui="continue">Resume duty</button><div class="or">or enlist a new officer</div>' : ''}
      <label class="name-field">Officer name <input id="hero-name" maxlength="20" placeholder="Hero" autocomplete="off"></label>
      <div class="start-card">
        <div class="start-head"><strong>Starting attributes</strong>
          ${customizing ? `<span class="badge">${left} to spend</span>` : ''}
          <button class="btn small" data-ui="customize">${customizing ? 'Reset' : 'Customize'}</button></div>
        <div class="start-stats">${rows}</div>
        <div class="muted small">${getItem(START_WEAPON).name} · learns ${kit}</div>
      </div>
      <button class="btn primary big" data-ui="start" id="start-game" ${problem ? `disabled title="${esc(problem)}"` : ''}>Report for duty</button>
      <p class="muted small">Combat: A attack · 1–9 abilities · Tab switch target · F beam out. Between fights: Enter/Space advance · R return to ship.</p>
    </div>`;
}

/** Shown once, when the final mission is cleared for the first time. */
export function victoryModal(s: GameState) {
  const finale = getMission(FINAL_MISSION).finale;
  return `<div class="modal-backdrop"><div class="modal panel">
    <h2>${finale?.title ?? 'Tour complete!'}</h2>
    <p>${finale?.text ?? ''} ${esc(s.player!.name)} reached level ${s.player!.level} after ${s.stats.battlesWon} victories.</p>
    <p class="muted">Your tour of duty continues — every mission can be replayed.</p>
    <button class="btn primary" data-ui="close-modal">Continue tour</button></div></div>`;
}
