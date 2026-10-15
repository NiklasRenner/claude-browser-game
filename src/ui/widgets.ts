/** Reusable bits of UI: chips for damage types, hit chances, statuses and item stats. */
import {
  damageMultiplier, enduranceHp, getHostile, intellectEnergy, luckCrit, hostileDamageTaken, playerHitChance,
  resolveElement, speedBonus, strikeProfile,
} from '../core';
import type { BattleState, DamageEffect, Element, ItemDef, HostileDef, Player, AbilityDef, Stat, StatusEffect } from '../core';
import { ELEMENT_ICONS, STATUS_ICONS } from '../game/elements';
import { esc } from './html';

/** What a stat value currently gives, in plain numbers. */
export function statEffect(stat: Stat, v: number): string {
  switch (stat) {
    case 'pow': return `+${Math.round((damageMultiplier(v) - 1) * 100)}% damage`;
    case 'spd': return `+${speedBonus(v).toFixed(1)}% speed`;
    case 'int': return `+${intellectEnergy(v)} max energy`;
    case 'end': return `+${enduranceHp(v)} max HP`;
    case 'luk': return `+${luckCrit(v).toFixed(1)}% crit chance`;
  }
}

// ─── Ability / element tags ─────────────────────────────────────────────────

const STATUS_NAMES: Record<StatusEffect['id'], string> = {
  burn: 'burn', corrode: 'corrode', stun: 'stun', shield: 'shield', evasive: 'evade', chill: 'chill', marked: 'marked',
};

/**
 * Damage-type chip. With a foe, adds how well it works against them:
 * ▲ vulnerable, ▼ resisted, ✕ immune.
 */
export function elementChip(el: Element, foe: HostileDef | null, iconOnly = false): string {
  let eff = '';
  let title = el;
  if (foe) {
    const pct = hostileDamageTaken(foe, el);
    if (pct === 0) { eff = '<b class="eff eff-immune">✕</b>'; title += ` — ${foe.name} is immune`; }
    else if (pct > 100) { eff = '<b class="eff eff-good">▲</b>'; title += ` — ${foe.name} is vulnerable (${pct}%)`; }
    else if (pct < 100) { eff = '<b class="eff eff-bad">▼</b>'; title += ` — ${foe.name} resists (${pct}%)`; }
  }
  return `<span class="chip el el-${el}" title="${esc(title)}">${ELEMENT_ICONS[el]}${iconOnly ? '' : ` ${el}`}${eff}</span>`;
}

/** Chips for everything an ability does: damage types, heals and status effects. */
export function abilityTags(p: Player, ability: AbilityDef, battle: BattleState | null): string {
  const foe = battle ? getHostile(battle.hostiles[battle.target]!.defId) : null;
  const tags: string[] = [];
  for (const e of ability.effects) {
    if (e.type === 'damage') {
      tags.push(elementChip(resolveElement(p, e.element), foe));
      tags.push(hitChip(p, battle, e));
      if (e.aoe) tags.push('<span class="chip tag-aoe" title="Hits every hostile">⇶ all</span>');
    } else if (e.type === 'heal') {
      tags.push('<span class="chip tag-heal" title="Restores HP">✚ heal</span>');
    } else {
      const who = e.target === 'self' ? 'You gain' : 'Inflicts';
      const chance = e.chance !== undefined ? ` (${e.chance}%)` : '';
      tags.push(`<span class="chip tag-status tag-${e.status}" title="${who} ${STATUS_NAMES[e.status]} for ${e.turns} turn(s)${chance}">${STATUS_ICONS[e.status]} ${STATUS_NAMES[e.status]}${chance}</span>`);
    }
  }
  return `<span class="tags">${tags.join('')}</span>`;
}

export function statusChips(statuses: StatusEffect[]) {
  return statuses.map((st) => `<span class="status" title="${st.id} (${st.turns} turns)">${STATUS_ICONS[st.id]}${st.turns}</span>`).join('');
}

/** "88%" or "76% ×3" for the equipped weapon. */
export function weaponHitText(p: Player): string {
  const { hit, hits } = strikeProfile(p);
  return `${hit}%${hits > 1 ? ` ×${hits}` : ''}`;
}

/**
 * Hit-chance chip for a weapon attack (no effect) or an ability's damage
 * effect. In battle it shows the real chance against the current target;
 * otherwise the base value, before the target's evasion.
 */
export function hitChip(p: Player, battle: BattleState | null, effect?: DamageEffect): string {
  const { hit, hits } = strikeProfile(p, effect);
  const strikes = hits > 1 ? ` ×${hits}` : '';
  if (battle) {
    const chance = Math.round(playerHitChance(p, battle, battle.target, effect));
    const cls = chance < 50 ? 'hit-low' : chance < 75 ? 'hit-mid' : 'hit-high';
    return `<span class="chip tag-hit ${cls}" title="Chance for each strike to hit the current target${hits > 1 ? ` (${hits} strikes)` : ''}">◎ ${chance}%${strikes}</span>`;
  }
  return `<span class="chip tag-hit" title="Hit chance before the target's evasion${hits > 1 ? ` (${hits} strikes)` : ''}">◎ ${hit}${strikes}</span>`;
}

export function itemStats(item: ItemDef): string {
  if (item.kind === 'weapon') {
    const hits = item.hits ?? 1;
    return `<span class="el el-${item.element}">${ELEMENT_ICONS[item.element]} ${item.damage[0]}–${item.damage[1]}${hits > 1 ? ` ×${hits}` : ''}</span>`
      + ` <span class="chip tag-hit" title="Hit chance before the target's evasion">◎ ${item.hit}</span>`
      + (item.crit ? ` <span class="muted" title="Extra critical-hit chance">+${item.crit}% crit</span>` : '');
  }
  if (item.kind === 'armor') {
    const res = Object.entries(item.resist).map(([el, v]) => `${ELEMENT_ICONS[el as keyof typeof ELEMENT_ICONS]}${v}%`).join(' ');
    return `<span class="muted">🛡${item.block}${item.speed ? ` ${item.speed > 0 ? '+' : '−'}${Math.abs(item.speed)}% speed` : ''}${item.hp ? ` +${item.hp}HP` : ''}${item.energy ? ` +${item.energy}EN` : ''}${res ? ` ${res}` : ''}</span>`;
  }
  return '';
}
