/** Human-readable text for events — used by the in-game log and golden test transcripts. */
import { getArea, getItem, getMonster } from './data';
import type { GameEvent, GameState, StepResult } from './types';

const STATUS_TEXT: Record<string, string> = {
  burn: 'burning', corrode: 'corroding', stun: 'stunned', shield: 'shielded', evasive: 'evasive', chill: 'chilled',
};

export interface DescribeContext {
  you: string;
  /** Display label per hostile index (see hostileLabels). */
  foes: string[];
}

/**
 * Display names for a lineup. Duplicates get letters so they can be told apart:
 * ['hive_drone', 'hive_drone', 'hive_spitter'] → ['Hive Drone A', 'Hive Drone B', 'Hive Spitter'].
 */
export function hostileLabels(defIds: string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of defIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const seen = new Map<string, number>();
  return defIds.map((id) => {
    const name = getMonster(id).name;
    if (counts.get(id)! < 2) return name;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return `${name} ${String.fromCharCode(65 + n)}`;
  });
}

const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** Log lines for one reducer step. `before` is the state the action was applied to. */
export function describeStep(before: GameState, result: StepResult): string[] {
  const battle = result.state.battle ?? before.battle;
  const ctx: DescribeContext = {
    you: result.state.player?.name ?? 'You',
    foes: battle ? hostileLabels(battle.monsters.map((m) => m.defId)) : [],
  };
  return result.events.map((e) => describeEvent(e, ctx)).filter((line): line is string => line !== null);
}

export function describeEvent(event: GameEvent, { you, foes }: DescribeContext): string | null {
  const foeName = (i: number | undefined) => foes[i ?? 0] ?? 'The hostile';
  const who = (actor: 'player' | 'monster', foe?: number) => (actor === 'player' ? you : foeName(foe));
  switch (event.type) {
    case 'error': return `⚠ ${event.reason}`;
    case 'message': return event.text;
    case 'battleStart': {
      const names = hostileLabels(event.monsterIds);
      if (event.boss) {
        const bossAt = event.monsterIds.findIndex((id) => getMonster(id).boss);
        const escorts = names.filter((_, i) => i !== bossAt);
        return `PRIORITY TARGET — ${names[bossAt]}!${escorts.length ? ` Escorts: ${listJoin(escorts)}.` : ''}`;
      }
      return names.length === 1 ? `Hostile detected: ${names[0]}.` : `Hostiles detected: ${listJoin(names)}.`;
    }
    case 'attack': {
      if (event.actor === 'player') {
        const on = foes.length > 1 ? ` on ${foeName(event.foe)}` : '';
        if (!event.hit) return `${you}'s ${event.name} misses${on}.`;
        return `${you}'s ${event.name} hits${on} for ${event.damage} ${event.element}${event.crit ? ' — CRITICAL!' : '.'}`;
      }
      const by = foeName(event.foe);
      if (!event.hit) return `${by}'s ${event.name} misses.`;
      return `${by}'s ${event.name} hits for ${event.damage} ${event.element}${event.crit ? ' — CRITICAL!' : '.'}`;
    }
    case 'hostileDown': return foes.length > 1 ? `${foeName(event.foe)} is down!` : null;
    case 'targeted': return null;
    case 'cast': return `${who(event.actor)} uses ${event.name}.`;
    case 'heal': {
      const parts = [event.amount > 0 && `+${event.amount} HP`, event.mana > 0 && `+${event.mana} EN`].filter(Boolean);
      return parts.length ? `${who(event.actor)} recovers ${parts.join(', ')}.` : null;
    }
    case 'statusApplied': return `${who(event.target, event.foe)} is ${STATUS_TEXT[event.status]} (${event.turns}).`;
    case 'statusTick': return `${who(event.target, event.foe)} takes ${event.damage} from ${event.status}.`;
    case 'statusExpired': return `${who(event.target, event.foe)} is no longer ${STATUS_TEXT[event.status]}.`;
    case 'stunned': return `${who(event.actor, event.foe)} is stunned and cannot act!`;
    case 'equip': return `Equipped ${getItem(event.itemId).name}.`;
    case 'fled': return event.success ? 'Emergency beam-out successful!' : 'Transporter lock failed!';
    case 'victory': {
      const drops = event.drops.map((d) => getItem(d).name);
      return `Hostile neutralised! +${event.xp} XP, +${event.gold} credits${drops.length ? `, salvaged ${drops.join(', ')}` : ''}.`;
    }
    case 'defeat': return `You're down! Emergency beam-out… (lost ${event.goldLost} credits)`;
    case 'levelUp': return `LEVEL UP! You are now level ${event.level}.`;
    case 'questComplete':
      return `Mission complete: ${getArea(event.areaId).name}! +${event.xp} XP, +${event.gold} credits${event.firstClear ? ' (first clear!)' : ''}.`;
    case 'patrolComplete':
      return `Patrol complete: ${getArea(event.areaId).name} sector (level ${event.level})! +${event.xp} XP, +${event.gold} credits.`;
    case 'gameComplete': return 'The Brood Matriarch is dead and the hive falls silent. The Meridian\'s tour is complete!';
    case 'gold': return null;
    case 'rested': return `Treated in sickbay${event.cost ? ` (${event.cost} credits)` : ''}. Fully restored.`;
  }
}
