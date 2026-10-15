/** The ship: Mission Board, Quartermaster, Locker, Personnel File and Sickbay tabs. */
import {
  MISSION_ORDER, ELEMENTS, PATROL_CONTACTS, PLAYER_EVASION_CAP, QUARTERMASTER_STOCK, STATS, STAT_INFO, countItem, derive, getMission,
  getItem, isMissionUnlocked, isEquipped, knownAbilities, patrolReward, patrolWorlds, treatmentCost, sellPrice,
} from '../../core';
import type { GameState, ItemDef, Player } from '../../core';
import { ELEMENT_ICONS } from '../../game/elements';
import type { BtnFn } from '../html';
import { abilityTags, itemStats, statEffect, weaponHitText } from '../widgets';

export type ShipTab = 'missions' | 'quartermaster' | 'locker' | 'personnel' | 'sickbay';

export function shipView(s: GameState, btn: BtnFn, tab: ShipTab) {
  const tabs: [ShipTab, string][] = [['missions', 'Mission Board'], ['quartermaster', 'Quartermaster'], ['locker', 'Locker'], ['personnel', 'Personnel File'], ['sickbay', 'Sickbay']];
  const p = s.player!;
  let body = '';
  switch (tab) {
    case 'missions': body = missionBoard(s, btn); break;
    case 'quartermaster': body = quartermaster(p, btn); break;
    case 'locker': body = locker(p, btn); break;
    case 'personnel': body = personnel(p, btn); break;
    case 'sickbay': body = sickbay(p, btn); break;
  }
  return `
    <div class="ship-header"><h2>Meridian <span class="muted small">Exploration Vessel</span></h2><button class="btn ghost small" data-ui="title">Main menu</button></div>
    <div class="tabs">${tabs.map(([id, label]) => `<button class="tab ${tab === id ? 'active' : ''}" data-ui="tab:${id}">${label}${id === 'personnel' && p.statPoints ? ' •' : ''}</button>`).join('')}</div>
    <div class="tab-body">${body}</div>`;
}

function missionBoard(s: GameState, btn: BtnFn) {
  const p = s.player!;
  const reward = patrolReward(p.level);
  const worlds = patrolWorlds(s).map((id) => getMission(id).name);
  const patrol = `<div class="row patrol-row">
      <div class="row-main"><strong>⟳ Patrol</strong> <span class="badge">Random</span> <span class="muted">Hostiles at level ${p.level}</span>
        <div class="muted small">Respond to a random distress call on ${worlds.length > 1 ? 'one of your unlocked worlds' : worlds[0]}:
          ${PATROL_CONTACTS} unpredictable contacts — solo hostiles or packs — then a priority target.
          Repeatable; bonus ${reward.xp} XP and ◈ ${reward.credits} on completion.</div></div>
      ${btn({ type: 'startPatrol' }, 'Launch patrol', 'primary')}
    </div>`;
  return `<h3>Patrol</h3><div class="list">${patrol}</div><h3>Story missions</h3><div class="list">${MISSION_ORDER.map((id) => {
    const a = getMission(id);
    const unlocked = isMissionUnlocked(s, id);
    const cleared = s.clearedMissions.includes(id);
    const danger = p.level < a.minLevel ? `<span class="warn">Recommended level ${a.minLevel}</span>` : `<span class="muted">Level ${a.minLevel}+</span>`;
    return `<div class="row ${unlocked ? '' : 'locked'}">
      <div class="row-main"><strong>${a.name}</strong> ${cleared ? '<span class="badge good">Cleared</span>' : ''} ${danger}
        <div class="muted small">${unlocked ? a.description : `Classified — complete the ${getMission(a.requires!).name} mission first.`}</div></div>
      ${btn({ type: 'startMission', missionId: id }, unlocked ? 'Beam down' : '🔒')}
    </div>`;
  }).join('')}</div>`;
}

function quartermaster(p: Player, btn: BtnFn) {
  const section = (kind: ItemDef['kind'], title: string) => {
    const rows = QUARTERMASTER_STOCK.map(getItem).filter((i) => i.kind === kind).map((item) => `
      <div class="row ${'level' in item && item.level > p.level ? 'locked' : ''}">
        <div class="row-main"><strong>${item.name}</strong> ${itemStats(item)}
          <div class="muted small">${item.description}${'level' in item ? ` · Lv ${item.level}` : ''}${countItem(p, item.id) ? ` · <em>owned${item.kind === 'consumable' ? ` ×${countItem(p, item.id)}` : ''}</em>` : ''}</div></div>
        ${btn({ type: 'buy', itemId: item.id }, `◈ ${item.price}`, 'buy')}
      </div>`).join('');
    return `<h3>${title}</h3><div class="list">${rows}</div>`;
  };
  return section('weapon', 'Weapons') + section('armor', 'Armor & suits') + section('consumable', 'Medical & supplies');
}

function locker(p: Player, btn: BtnFn) {
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

function personnel(p: Player, btn: BtnFn) {
  const d = derive(p);
  const stats = STATS.map((k) => `<div class="row"><div class="row-main"><strong>${STAT_INFO[k].name}</strong> <span class="stat-val">${p.stats[k]}</span>
    <span class="stat-effect">${statEffect(k, p.stats[k])}</span>
    <div class="muted small">${STAT_INFO[k].help}</div></div>${p.statPoints ? btn({ type: 'allocateStat', stat: k }, '+1') : ''}</div>`).join('');
  const resist = ELEMENTS.filter((el) => d.damageTaken[el] !== 100).map((el) => `${ELEMENT_ICONS[el]} ${100 - d.damageTaken[el]}%`).join(', ');
  const abilities = knownAbilities(p).map((sp) => `<div class="row"><div class="row-main"><strong>${sp.name}</strong> <span class="energy-cost">${sp.energy} EN</span>${abilityTags(p, sp, null)}<div class="muted small">${sp.description}</div></div></div>`).join('');
  return `
    <div class="two-col">
      <div><h3>Attributes ${p.statPoints ? `<span class="badge">${p.statPoints} to spend</span>` : ''}</h3><div class="list">${stats}</div></div>
      <div><h3>Combat</h3>
        <div class="kv"><span>Weapon hit chance</span><b>${weaponHitText(p)}</b><span>Speed</span><b>${Math.round(d.speed * 10) / 10}</b>
        <span>Evasion (armor)</span><b title="Armor and abilities; never above ${PLAYER_EVASION_CAP}">${d.evasion.toFixed(0)}</b>
        <span>Critical chance</span><b>${d.critChance.toFixed(0)}%</b><span>Resistances</span><b>${resist || '—'}</b></div>
        <h3>Abilities</h3><div class="list">${abilities}</div>
      </div>
    </div>`;
}

function sickbay(p: Player, btn: BtnFn) {
  return `<div class="inn"><p>The ship's doctor looks you over. A regen bed restores all HP and energy.</p>
    ${btn({ type: 'treat' }, `Treatment ◈ ${treatmentCost(p)}`, 'primary', 'You are already at full health')}</div>`;
}
