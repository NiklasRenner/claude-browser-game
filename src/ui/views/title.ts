/** Title screen and the end-of-campaign modal. */
import { CLASSES, FINAL_AREA, getArea, getItem, spellsFor } from '../../core';
import type { ClassId, GameState } from '../../core';
import { esc } from '../html';

/** Working title — change it here (and in public/index.html). */
const GAME_TITLE = 'STARWARD';

export function titleScreen(selected: ClassId, hasSave: boolean) {
  const cards = (Object.keys(CLASSES) as ClassId[]).map((id) => {
    const c = CLASSES[id];
    const kit = spellsFor(id, 7).map((sp) => sp.name).join(' · ');
    const stats = `<span>${getItem(c.startWeapon).name}</span><span class="muted">${kit}</span>`;
    return `<button class="class-card ${id === selected ? 'selected' : ''}" data-ui="class:${id}" style="--division:#${c.color.toString(16).padStart(6, '0')}">
      <strong>${c.name}</strong><span class="desc">${c.description}</span><span class="stats">${stats}</span></button>`;
  }).join('');
  return `
    <div class="title-screen">
      <h1>${GAME_TITLE}</h1>
      <p class="tagline">Five worlds. One starship. Report for duty, Ensign.</p>
      ${hasSave ? '<button class="btn primary big" data-ui="continue">Resume duty</button><div class="or">or enlist a new officer</div>' : ''}
      <label class="name-field">Officer name <input id="hero-name" maxlength="20" placeholder="Hero" autocomplete="off"></label>
      <div class="class-cards">${cards}</div>
      <button class="btn primary big" data-ui="start" id="start-game">Report for duty</button>
      <p class="muted small">Combat: A attack · 1–9 abilities · Tab switch target · F beam out. Between fights: Enter/Space advance · R return to ship.</p>
    </div>`;
}

/** Shown once, when the final mission is cleared for the first time. */
export function victoryModal(s: GameState) {
  const finale = getArea(FINAL_AREA).finale;
  return `<div class="modal-backdrop"><div class="modal panel">
    <h2>${finale?.title ?? 'Tour complete!'}</h2>
    <p>${finale?.text ?? ''} ${esc(s.player!.name)} reached level ${s.player!.level} after ${s.stats.battlesWon} victories.</p>
    <p class="muted">Your tour of duty continues — every mission can be replayed.</p>
    <button class="btn primary" data-ui="close-modal">Continue tour</button></div></div>`;
}
