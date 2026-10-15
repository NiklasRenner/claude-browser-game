/** In-mission views: the HUD, the target card, the turn-order strip, and the quest / battle / defeat panels. */
import {
  ELEMENTS, countItem, derive, getArea, getClass, getItem, getMonster, getWeapon, hostileEvasion, hostileHitChance,
  hostileLabels, hostileLevel, knownSpells, questEncounters, upcomingTurns, xpToNext,
} from '../../core';
import type { GameState, Player, StatusEffect } from '../../core';
import { ELEMENT_ICONS } from '../../game/elements';
import { actionAttr, bar, esc, pct } from '../html';
import type { BtnFn } from '../html';
import { abilityTags, elementChip, hitChip, itemStats, statusChips } from '../widgets';

/** Which battle sub-menu is open. */
export type BattleMenu = 'main' | 'skills' | 'items' | 'gear';

export function hud(p: Player, statuses: StatusEffect[]) {
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

export function turnOrder(s: GameState) {
  const b = s.battle!;
  const labels = hostileLabels(b.monsters.map((m) => m.defId));
  const turns = upcomingTurns(s.player!, b, 7);
  const chips = turns.map((who, i) => {
    const you = who === 'player';
    const again = i > 0 && turns[i - 1] === who;
    const name = you ? 'You' : labels[who]!;
    const cls = `turn ${you ? 'turn-you' : 'turn-foe'}${i === 0 ? ' turn-now' : ''}${i >= 5 ? ' turn-far' : ''}${again ? ' turn-again' : ''}${!you && who === b.target ? ' turn-target' : ''}`;
    return `${i ? `<span class="turn-sep${i >= 5 ? ' turn-far' : ''}">›</span>` : ''}<span class="${cls}" title="${esc(name)}${again ? ' — again before anyone else' : ''}">${esc(name)}</span>`;
  }).join('');
  return `<div class="turn-order panel" aria-label="Turn order"><span class="turn-label">Next</span>${chips}</div>`;
}

export function monsterCard(s: GameState, busy: boolean) {
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
            ${down || current || busy ? 'disabled' : ''} ${actionAttr({ type: 'target', index: i })} title="${esc(labels[i]!)}">
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
      <div class="res profile">Speed <b>${def.speed}</b> · Evasion <b>${Math.round(hostileEvasion(target))}</b> · Hits you <b>${Math.round(hostileHitChance(s.player!, b, b.target))}%</b></div>
      ${weak.length ? `<div class="res">Vulnerable: ${chips(weak)}</div>` : ''}
      ${strong.length ? `<div class="res">Resists: ${chips(strong)}</div>` : ''}
    </div>`;
}

export function questPanel(s: GameState, btn: BtnFn) {
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

export function battlePanel(s: GameState, btn: BtnFn, menu: BattleMenu, busy: boolean) {
  const p = s.player!;
  const b = s.battle;
  const foe = b ? getMonster(b.monsters[b.target]!.defId) : null;
  const back = '<button class="btn ghost" data-ui="menu:main">◂ Back</button>';
  switch (menu) {
    case 'skills':
      return `<div class="actions grid">${knownSpells(p).map((sp, i) => btn({ type: 'cast', spellId: sp.id },
        `<span class="key">${i + 1}</span><span class="skill-name">${sp.name}</span> <span class="mp-cost">${sp.mp} EN</span>${abilityTags(p, sp, b)}`,
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
        ${btn({ type: 'attack' }, `<span class="key">A</span>Attack ${elementChip(getWeapon(p.weapon).element, foe, true)}${hitChip(p, b)}`, 'primary big')}
        <button class="btn big" data-ui="menu:skills" ${busy ? 'disabled' : ''}>Abilities ▸</button>
        <button class="btn" data-ui="menu:items" ${busy ? 'disabled' : ''}>Items ▸</button>
        <button class="btn" data-ui="menu:gear" ${busy ? 'disabled' : ''}>Swap weapon ▸</button>
        ${btn({ type: 'flee' }, '<span class="key">F</span>Beam out', 'ghost')}
      </div>`;
  }
}

export function defeatedPanel(btn: BtnFn) {
  return `<h2>Officer down</h2><p class="muted">An emergency transport pulled you out just in time. Some credits were lost in the chaos.</p>
    <div class="actions">${btn({ type: 'returnToTown' }, '<span class="key">Enter</span>Wake up in sickbay', 'primary big')}</div>`;
}
