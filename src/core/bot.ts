/**
 * A simple but competent autoplayer. It only ever picks from `legalActions`,
 * so it doubles as an integration test of the whole game loop and as a
 * balance probe (`npm run sim`).
 */
import { aliveIndices, averageEffectDamage, hitChance, hostileDamageTaken, playerHitChance, resolveElement, strikeProfile } from './combat';
import { MISSION_ORDER, DIVISIONS, ITEMS, getMission, getHostile } from './data';
import { initialState, step } from './game';
import { missionEncounters } from './flow';
import { checkAction, legalActions } from './rules';
import { countItem, derive, knownAbilities } from './player';
import { BASE_STAT } from './stats';
import type { Action, ArmorDef, DivisionId, GameState, HostileDef, Player, StatusEffect, WeaponDef } from './types';

const ok = (s: GameState, a: Action) => checkAction(s, a) === null;

export function chooseAction(state: GameState): Action {
  const actions = legalActions(state);
  if (actions.length === 0) throw new Error(`No legal actions in mode ${state.mode}`);
  const p = state.player;
  if (!p) return actions[0]!;
  switch (state.mode) {
    case 'ship': return shipAction(state, p);
    case 'mission': return missionAction(state, p);
    case 'battle': return battleAction(state, p);
    default: return actions[0]!;
  }
}

// ─── Ship ──────────────────────────────────────────────────────────────────

function targetMission(state: GameState, p: Player): string {
  let best = MISSION_ORDER[0]!;
  for (const id of MISSION_ORDER) {
    if (ok(state, { type: 'startMission', missionId: id }) && p.level >= getMission(id).minLevel) best = id;
  }
  return best;
}

function missionHostiles(missionId: string): HostileDef[] {
  const mission = getMission(missionId);
  return [...mission.hostiles, mission.boss].map(getHostile);
}

/** Expected weapon damage per attack against the given hostiles (hit chance and strikes included). */
function weaponScore(p: Player, w: WeaponDef, hostiles: HostileDef[]): number {
  const avg = ((w.damage[0] + w.damage[1]) / 2) * derive(p).damage * (w.hits ?? 1);
  const perFoe = hostiles.map((m) => (hostileDamageTaken(m, w.element) / 100) * (hitChance(w.hit, m.evasion) / 100));
  return avg * perFoe.reduce((a, b) => a + b, 0) / hostiles.length;
}

function armorScore(a: ArmorDef): number {
  return a.block * 3 + a.hp + Object.values(a.resist).reduce((s, v) => s + v, 0) * 0.3;
}

function shipAction(state: GameState, p: Player): Action {
  // 1. Spend stat points following the class pattern.
  if (p.statPoints > 0) {
    const cls = DIVISIONS[p.divisionId];
    const spent = Object.values(p.stats).reduce((s, v) => s + v - BASE_STAT, 0);
    return { type: 'allocateStat', stat: cls.statPriority[spent % cls.statPriority.length]! };
  }

  const missionId = targetMission(state, p);
  const hostiles = missionHostiles(missionId);
  const potionReserve = 3 * 25;

  // 2. Buy a clearly better weapon / armor if affordable.
  const weapons = Object.values(ITEMS).filter((i): i is WeaponDef => i.kind === 'weapon');
  const owned = weapons.filter((w) => countItem(p, w.id) > 0);
  const bestOwned = Math.max(...owned.map((w) => weaponScore(p, w, hostiles)));
  const buyWeapon = weapons
    .filter((w) => ok(state, { type: 'buy', itemId: w.id }) && p.credits - w.price >= potionReserve)
    .filter((w) => weaponScore(p, w, hostiles) > bestOwned * 1.15)
    .sort((a, b) => weaponScore(p, b, hostiles) - weaponScore(p, a, hostiles))[0];
  if (buyWeapon) return { type: 'buy', itemId: buyWeapon.id };

  const armors = Object.values(ITEMS).filter((i): i is ArmorDef => i.kind === 'armor');
  const currentArmor = ITEMS[p.armor] as ArmorDef;
  const buyArmor = armors
    .filter((a) => ok(state, { type: 'buy', itemId: a.id }) && p.credits - a.price >= potionReserve)
    .filter((a) => armorScore(a) > armorScore(currentArmor) * 1.2)
    .sort((a, b) => armorScore(b) - armorScore(a))[0];
  if (buyArmor) return { type: 'buy', itemId: buyArmor.id };

  // 3. Equip the best owned gear for the target mission.
  const bestWeapon = owned.sort((a, b) => weaponScore(p, b, hostiles) - weaponScore(p, a, hostiles))[0]!;
  if (bestWeapon.id !== p.weapon && ok(state, { type: 'equip', itemId: bestWeapon.id })) {
    return { type: 'equip', itemId: bestWeapon.id };
  }
  const bestArmor = armors.filter((a) => countItem(p, a.id) > 0 && p.level >= a.level)
    .sort((a, b) => armorScore(b) - armorScore(a))[0];
  if (bestArmor && bestArmor.id !== p.armor) return { type: 'equip', itemId: bestArmor.id };

  // 4. Stock up on potions.
  const potion = p.level >= 8 ? 'trauma_kit' : 'medkit';
  const potions = countItem(p, 'medkit') + countItem(p, 'trauma_kit');
  if (potions < 4 && ok(state, { type: 'buy', itemId: potion })) return { type: 'buy', itemId: potion };
  if (p.divisionId === 'science' && countItem(p, 'energy_cell') < 2 && ok(state, { type: 'buy', itemId: 'energy_cell' })) {
    return { type: 'buy', itemId: 'energy_cell' };
  }

  // 5. Rest, then head out.
  if (ok(state, { type: 'treat' })) return { type: 'treat' };
  return { type: 'startMission', missionId: missionId };
}

// ─── Between encounters ────────────────────────────────────────────────────

function bestHealthPotion(p: Player): string | null {
  const d = derive(p);
  const missing = d.maxHp - p.hp;
  if (countItem(p, 'trauma_kit') > 0 && (missing > 80 || countItem(p, 'medkit') === 0)) {
    return 'trauma_kit';
  }
  if (countItem(p, 'medkit') > 0) return 'medkit';
  if (countItem(p, 'nano_restorer') > 0) return 'nano_restorer';
  return null;
}

function missionAction(state: GameState, p: Player): Action {
  const d = derive(p);
  const run = state.mission!;
  const bossNext = run.cleared >= missionEncounters(run);
  const want = bossNext ? 0.8 : 0.5;
  if (p.hp < d.maxHp * want) {
    const potion = bestHealthPotion(p);
    if (potion) return { type: 'useItem', itemId: potion };
    if (p.hp < d.maxHp * 0.4 || bossNext) return { type: 'retreat' };
  }
  return { type: 'continue' };
}

// ─── Battle ────────────────────────────────────────────────────────────────

function battleAction(state: GameState, p: Player): Action {
  const d = derive(p);
  const battle = state.battle!;
  const alive = aliveIndices(battle);
  const abilities = knownAbilities(p);

  // Focus fire: target the hostile closest to going down (fewer attackers sooner).
  if (alive.length > 1) {
    const weakest = alive.reduce((a, b) => (battle.hostiles[b]!.hp < battle.hostiles[a]!.hp ? b : a));
    if (weakest !== battle.target) return { type: 'target', index: weakest };
  }
  const target = battle.hostiles[battle.target]!;
  const hostile = getHostile(target.defId);
  const others = alive.map((i) => getHostile(battle.hostiles[i]!.defId));

  // Emergency healing.
  if (p.hp < d.maxHp * 0.35) {
    const heal = abilities.find((s) => s.effects.some((e) => e.type === 'heal') && p.energy >= s.energy);
    if (heal) return { type: 'useAbility', abilityId: heal.id };
    const potion = bestHealthPotion(p);
    if (potion) return { type: 'useItem', itemId: potion };
  }

  // Bosses: keep a defensive buff up.
  if (others.some((m) => m.boss) && p.hp < d.maxHp * 0.85 && !hasBuff(battle.playerStatuses)) {
    const buff = abilities.find((s) => s.effects.some((e) => e.type === 'status' && e.target === 'self') && p.energy >= s.energy);
    if (buff) return { type: 'useAbility', abilityId: buff.id };
  }

  // Out of energy as a caster: drink.
  const cheapest = Math.min(...abilities.map((s) => s.energy));
  if (p.energy < cheapest && p.divisionId === 'science' && countItem(p, 'energy_cell') > 0) {
    return { type: 'useItem', itemId: 'energy_cell' };
  }

  // Wrong tool for this hostile (e.g. plasma against a magma creature)? Swap to a much better owned weapon.
  if (target.hp > d.maxHp * 0.5) {
    const owned = Object.values(ITEMS).filter((i): i is WeaponDef => i.kind === 'weapon' && countItem(p, i.id) > 0);
    const current = weaponScore(p, ITEMS[p.weapon] as WeaponDef, [hostile]);
    const better = owned.filter((w) => w.id !== p.weapon && weaponScore(p, w, [hostile]) > current * 1.6)
      .sort((x, y) => weaponScore(p, y, [hostile]) - weaponScore(p, x, [hostile]))[0];
    if (better && ok(state, { type: 'equip', itemId: better.id })) return { type: 'equip', itemId: better.id };
  }

  // Otherwise pick the highest expected damage option.
  let best: Action = { type: 'attack' };
  const weapon = ITEMS[p.weapon] as WeaponDef;
  const weaponHit = playerHitChance(p, battle, battle.target) / 100;
  let bestScore = averageEffectDamage(p, { type: 'damage', element: 'weapon', dice: [0, 0], useWeapon: true })
    * (weapon.hits ?? 1) * (hostileDamageTaken(hostile, weapon.element) / 100) * weaponHit;

  // Keep enough MP for an emergency heal unless the hostile is almost dead.
  const attackScore = bestScore;
  const healReserve = abilities.find((s) => s.effects.some((e) => e.type === 'heal'))?.energy ?? 0;
  for (const ability of abilities) {
    if (!ok(state, { type: 'useAbility', abilityId: ability.id })) continue;
    if (p.energy - ability.energy < healReserve && target.hp > attackScore * 1.5) continue;
    let score = 0;
    for (const e of ability.effects) {
      if (e.type === 'damage') {
        const element = resolveElement(p, e.element);
        const hitList = e.aoe ? alive : [battle.target];
        const strikes = strikeProfile(p, e).hits;
        for (const i of hitList) {
          const m = getHostile(battle.hostiles[i]!.defId);
          score += averageEffectDamage(p, e) * strikes * (hostileDamageTaken(m, element) / 100) * (playerHitChance(p, battle, i, e) / 100);
        }
      } else if (e.type === 'status' && e.target === 'enemy' && (e.status === 'corrode' || e.status === 'burn')) {
        if (!target.statuses.some((s) => s.id === e.status)) score += e.power * e.turns * ((e.chance ?? 100) / 100);
      } else if (e.type === 'status' && e.target === 'enemy' && e.status === 'marked') {
        // Painting pays off when the next few attacks would otherwise miss a lot, on something worth the time.
        if (!target.statuses.some((s) => s.id === 'marked') && weaponHit < 0.7 && target.hp > attackScore * 2) {
          const gain = Math.min(1, weaponHit + e.power / 100) - weaponHit;
          score += (attackScore / Math.max(weaponHit, 0.05)) * gain * Math.min(e.turns, 3);
        }
      }
    }
    if (score > bestScore * 1.1) {
      bestScore = score;
      best = { type: 'useAbility', abilityId: ability.id };
    }
  }
  return best;
}

function hasBuff(statuses: StatusEffect[]) {
  return statuses.some((s) => s.id === 'shield' || s.id === 'evasive');
}

// ─── Whole-game runner ─────────────────────────────────────────────────────

interface BotRunSummary {
  divisionId: DivisionId;
  seed: number;
  steps: number;
  completed: boolean;
  level: number;
  credits: number;
  cleared: string[];
  battlesWon: number;
  battlesLost: number;
}

/** Plays from a new game until the final mission is cleared or `maxSteps` is reached. */
export function runBot(divisionId: DivisionId, seed: number, maxSteps = 20000, onStep?: (s: GameState) => void): BotRunSummary {
  let state = step(initialState(seed), { type: 'newGame', name: 'Bot', divisionId: divisionId, seed }).state;
  let completed = false;
  let steps = 0;
  while (steps < maxSteps && !completed) {
    const action = chooseAction(state);
    const result = step(state, action);
    const err = result.events.find((e) => e.type === 'error');
    if (err) throw new Error(`Bot chose illegal action ${JSON.stringify(action)}: ${JSON.stringify(err)}`);
    if (state.mode === 'defeated' && action.type !== 'returnToShip') throw new Error('Bot did not return to ship');
    completed = result.events.some((e) => e.type === 'gameComplete');
    state = result.state;
    steps++;
    onStep?.(state);
  }
  const p = state.player!;
  return {
    divisionId, seed, steps, completed, level: p.level, credits: p.credits,
    cleared: [...state.clearedMissions], battlesWon: state.stats.battlesWon, battlesLost: state.stats.battlesLost,
  };
}
