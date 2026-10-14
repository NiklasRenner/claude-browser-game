/** Human-readable text for events — used by the in-game log and golden test transcripts. */
import { getArea, getItem, getMonster } from './data';
import type { GameEvent, GameState, StepResult } from './types';

const STATUS_TEXT: Record<string, string> = {
  burn: 'burning', corrode: 'corroding', stun: 'stunned', shield: 'shielded', evasive: 'evasive', chill: 'chilled',
};

export interface DescribeContext {
  you: string;
  foe: string;
}

/** Log lines for one reducer step. `before` is the state the action was applied to. */
export function describeStep(before: GameState, result: StepResult): string[] {
  const battle = result.state.battle ?? before.battle;
  const ctx: DescribeContext = {
    you: result.state.player?.name ?? 'You',
    foe: battle ? getMonster(battle.monster.defId).name : 'The enemy',
  };
  return result.events.map((e) => describeEvent(e, ctx)).filter((line): line is string => line !== null);
}

export function describeEvent(event: GameEvent, { you, foe }: DescribeContext): string | null {
  const who = (actor: 'player' | 'monster') => (actor === 'player' ? you : foe);
  switch (event.type) {
    case 'error': return `⚠ ${event.reason}`;
    case 'message': return event.text;
    case 'battleStart': {
      const name = getMonster(event.monsterId).name;
      return event.boss ? `PRIORITY TARGET — ${name}!` : `Hostile detected: ${name}.`;
    }
    case 'attack': {
      const by = event.actor === 'player' ? you : foe;
      if (!event.hit) return `${by}'s ${event.name} misses.`;
      return `${by}'s ${event.name} hits for ${event.damage} ${event.element}${event.crit ? ' — CRITICAL!' : '.'}`;
    }
    case 'cast': return `${who(event.actor)} uses ${event.name}.`;
    case 'heal': {
      const parts = [event.amount > 0 && `+${event.amount} HP`, event.mana > 0 && `+${event.mana} EN`].filter(Boolean);
      return parts.length ? `${who(event.actor)} recovers ${parts.join(', ')}.` : null;
    }
    case 'statusApplied': return `${who(event.target)} is ${STATUS_TEXT[event.status]} (${event.turns}).`;
    case 'statusTick': return `${who(event.target)} takes ${event.damage} from ${event.status}.`;
    case 'statusExpired': return `${who(event.target)} is no longer ${STATUS_TEXT[event.status]}.`;
    case 'stunned': return `${who(event.actor)} is stunned and cannot act!`;
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
    case 'gameComplete': return 'The Hollow Admiral falls and the rift collapses. The Meridian is safe!';
    case 'gold': return null;
    case 'rested': return `Treated in sickbay${event.cost ? ` (${event.cost} credits)` : ''}. Fully restored.`;
  }
}
