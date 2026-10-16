/** Human-readable text for events — used by the in-game log and golden test transcripts. */
import { FINAL_MISSION, STATUSES, getMission, getItem, getHostile, getAbility } from './data';
import type { GameEvent, GameState, StepResult } from './types';

interface DescribeContext {
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
    const name = getHostile(id).name;
    if (counts.get(id)! < 2) return name;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    return `${name} ${String.fromCharCode(65 + n)}`;
  });
}

const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** How a log line should read: good news, bad news, loot, or plain information. */
export type Tone = 'info' | 'good' | 'bad' | 'loot';

export interface LogEntry {
  text: string;
  tone: Tone;
}

/** Log entries for one reducer step. `before` is the state the action was applied to. */
export function describeLog(before: GameState, result: StepResult): LogEntry[] {
  const battle = result.state.battle ?? before.battle;
  const ctx: DescribeContext = {
    you: result.state.player?.name ?? 'You',
    foes: battle ? hostileLabels(battle.hostiles.map((m) => m.defId)) : [],
  };
  const out: LogEntry[] = [];
  for (const e of result.events) {
    const text = describeEvent(e, ctx);
    if (text !== null) out.push({ text, tone: toneOf(e) });
  }
  return out;
}

/** Just the text of describeLog (golden transcripts). */
export function describeStep(before: GameState, result: StepResult): string[] {
  return describeLog(before, result).map((l) => l.text);
}

function toneOf(e: GameEvent): Tone {
  switch (e.type) {
    case 'error': case 'defeat': return 'bad';
    case 'fled': return e.success ? 'info' : 'bad';
    case 'victory': case 'levelUp': case 'learned': case 'missionComplete': case 'patrolComplete': case 'gameComplete': return 'good';
    case 'drillEnded': return e.outcome === 'won' ? 'good' : 'info';
    case 'bought': case 'sold': case 'equip': return 'loot';
    default: return 'info';
  }
}

function describeEvent(event: GameEvent, { you, foes }: DescribeContext): string | null {
  const foeName = (i: number | undefined) => foes[i ?? 0] ?? 'The hostile';
  const who = (actor: 'player' | 'hostile', foe?: number) => (actor === 'player' ? you : foeName(foe));
  switch (event.type) {
    case 'error': return `⚠ ${event.reason}`;
    case 'message': return event.text;
    case 'battleStart': {
      const names = hostileLabels(event.hostileIds);
      if (event.boss) {
        const bossAt = event.hostileIds.findIndex((id) => getHostile(id).boss);
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
    case 'abilityUsed': return `${who(event.actor)} uses ${event.name}.`;
    case 'heal': {
      const parts = [event.amount > 0 && `+${event.amount} HP`, event.energy > 0 && `+${event.energy} EN`].filter(Boolean);
      return parts.length ? `${who(event.actor)} recovers ${parts.join(', ')}.` : null;
    }
    case 'statusApplied': return `${who(event.target, event.foe)} is ${STATUSES[event.status].adjective} (${event.turns}).`;
    case 'statusTick': return `${who(event.target, event.foe)} takes ${event.damage} from ${event.status}.`;
    case 'statusExpired': return `${who(event.target, event.foe)} is no longer ${STATUSES[event.status].adjective}.`;
    case 'stunned': return `${who(event.actor, event.foe)} is stunned and cannot act!`;
    case 'equip': return `Equipped ${getItem(event.itemId).name}.`;
    case 'fled': return event.success ? 'Emergency beam-out successful!' : 'Transporter lock failed!';
    case 'victory': {
      const drops = event.drops.map((d) => getItem(d).name);
      return `Hostile neutralised! +${event.xp} XP, +${event.credits} credits${drops.length ? `, salvaged ${drops.join(', ')}` : ''}.`;
    }
    case 'defeat': return `You're down! Emergency beam-out… (lost ${event.creditsLost} credits)`;
    case 'levelUp': return `LEVEL UP! You are now level ${event.level}.`;
    case 'missionComplete':
      return `Mission complete: ${getMission(event.missionId).name}! +${event.xp} XP, +${event.credits} credits${event.firstClear ? ' (first clear!)' : ''}.`;
    case 'patrolComplete':
      return `Patrol complete: ${getMission(event.missionId).name} sector (level ${event.level})! +${event.xp} XP, +${event.credits} credits.`;
    case 'drillEnded':
      return `${{ won: 'Drill complete: all hostiles neutralised.', lost: 'Drill failed: you went down.', ended: 'Drill ended.' }[event.outcome]} Simulation off, fully restored.`;
    case 'gameComplete': return getMission(FINAL_MISSION).finale?.text ?? 'The tour is complete!';
    case 'bought': return `Bought ${getItem(event.itemId).name}.`;
    case 'sold': return `Sold ${getItem(event.itemId).name}.`;
    case 'learned': return `Learned ${getAbility(event.abilityId).name}!`;
    case 'treated': return `Treated in sickbay${event.cost ? ` (${event.cost} credits)` : ''}. Fully restored.`;
  }
}
