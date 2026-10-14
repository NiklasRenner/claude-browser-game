/** Human-readable text for events — used by the in-game log and golden test transcripts. */
import { getArea, getItem, getMonster } from './data';
import type { GameEvent, GameState, StepResult } from './types';

const STATUS_TEXT: Record<string, string> = {
  burn: 'burning', poison: 'poisoned', stun: 'stunned', guard: 'guarded', evasive: 'evasive', chill: 'chilled',
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
      return event.boss ? `BOSS — ${name} blocks the way!` : `A ${name} appears!`;
    }
    case 'attack': {
      const by = event.actor === 'player' ? you : foe;
      if (!event.hit) return `${by}'s ${event.name} misses.`;
      return `${by}'s ${event.name} hits for ${event.damage} ${event.element}${event.crit ? ' — CRITICAL!' : '.'}`;
    }
    case 'cast': return `${who(event.actor)} uses ${event.name}.`;
    case 'heal': {
      const parts = [event.amount > 0 && `+${event.amount} HP`, event.mana > 0 && `+${event.mana} MP`].filter(Boolean);
      return parts.length ? `${who(event.actor)} recovers ${parts.join(', ')}.` : null;
    }
    case 'statusApplied': return `${who(event.target)} is ${STATUS_TEXT[event.status]} (${event.turns}).`;
    case 'statusTick': return `${who(event.target)} takes ${event.damage} from ${event.status}.`;
    case 'statusExpired': return `${who(event.target)} is no longer ${STATUS_TEXT[event.status]}.`;
    case 'stunned': return `${who(event.actor)} is stunned and cannot act!`;
    case 'equip': return `Equipped ${getItem(event.itemId).name}.`;
    case 'fled': return event.success ? 'You escaped!' : 'You failed to escape!';
    case 'victory': {
      const drops = event.drops.map((d) => getItem(d).name);
      return `Victory! +${event.xp} XP, +${event.gold} gold${drops.length ? `, found ${drops.join(', ')}` : ''}.`;
    }
    case 'defeat': return `You were defeated… (lost ${event.goldLost} gold)`;
    case 'levelUp': return `LEVEL UP! You are now level ${event.level}.`;
    case 'questComplete':
      return `Quest complete: ${getArea(event.areaId).name}! +${event.xp} XP, +${event.gold} gold${event.firstClear ? ' (first clear!)' : ''}.`;
    case 'gameComplete': return 'The Hollow King falls. Brightwater is saved!';
    case 'gold': return null;
    case 'rested': return `You rest at the inn${event.cost ? ` (${event.cost} gold)` : ''}. Fully restored.`;
  }
}
