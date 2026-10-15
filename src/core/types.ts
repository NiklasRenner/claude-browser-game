// ─── Shared game types. Everything here is plain, JSON-serializable data. ───
// Internal field names (gold, mp, spells, area, monster) are mechanical; the
// player-facing terms (credits, energy, abilities, mission, hostile) live in UI text.

export const ELEMENTS = ['kinetic', 'plasma', 'cryo', 'ion', 'photon', 'void', 'corrosive'] as const;
export type Element = (typeof ELEMENTS)[number];

/** Power, Speed, Intellect, Endurance, Luck — see stats.ts. (Hit chance and evasion come from gear and abilities, not stats.) */
export const STATS = ['pow', 'spd', 'int', 'end', 'luk'] as const;
export type Stat = (typeof STATS)[number];
export type Stats = Record<Stat, number>;

/** Damage taken in percent per element. 100 = normal, 50 = resist, 150 = weak. */
export type Resistances = Partial<Record<Element, number>>;

export type ClassId = 'security' | 'science' | 'engineer';

/**
 * burn/corrode: damage `power` at the start of each owner turn (plasma / corrosive).
 * stun: owner skips its turn. chill: owner's hit chance −`power`.
 * shield: owner takes `power`% less damage. evasive: owner's evasion +`power`.
 * marked: owner's evasion −`power` (attacks against it land more often).
 * Statuses work the same on the player and on hostiles.
 */
export type StatusId = 'burn' | 'corrode' | 'stun' | 'shield' | 'evasive' | 'chill' | 'marked';

export interface StatusEffect {
  id: StatusId;
  /** Remaining owner-turns. Ticked down at the start of the owner's turn. */
  turns: number;
  /** Meaning depends on status: damage per tick, % reduction, etc. */
  power: number;
}

// ─── Content definitions ───────────────────────────────────────────────────

export interface WeaponDef {
  kind: 'weapon';
  id: string;
  name: string;
  /** Purely visual: melee weapons lunge, ranged weapons fire a bolt. */
  style: 'melee' | 'ranged';
  element: Element;
  /** Damage per hit. */
  damage: [number, number];
  /**
   * Hit chance in percent against a target with 0 evasion. The target's
   * evasion is subtracted, so values above 100 are meaningful: they keep
   * landing against evasive hostiles.
   */
  hit: number;
  /** Strikes per attack (default 1). Each rolls hit, crit, damage and proc on its own. */
  hits?: number;
  /** Extra crit chance in percent. */
  crit: number;
  /** Chance-based on-hit effect (rolled per landed hit). */
  proc?: { chance: number; status: StatusId; turns: number; power: number };
  level: number;
  price: number;
  description: string;
}

export interface ArmorDef {
  kind: 'armor';
  id: string;
  name: string;
  /** Evasion it grants (fixed; the player's total evasion is capped, see PLAYER_EVASION_CAP). */
  block: number;
  /** Speed bonus or penalty in percent (light suits +, heavy armor −). */
  speed?: number;
  /** Percentage points subtracted from damage taken per element. */
  resist: Resistances;
  hp: number;
  mp: number;
  level: number;
  price: number;
  description: string;
}

export interface ConsumableDef {
  kind: 'consumable';
  id: string;
  name: string;
  heal: number;
  mana: number;
  /** Status removed on use (e.g. detox injector). */
  cures?: StatusId[];
  price: number;
  description: string;
}

export type ItemDef = WeaponDef | ArmorDef | ConsumableDef;

export type SpellEffect =
  | {
      type: 'damage';
      element: Element | 'weapon';
      dice: [number, number];
      /** Multiplier applied to the rolled dice (e.g. 1.6 for a power attack). */
      mult?: number;
      /** If true, rolls the equipped weapon's damage instead of `dice`. */
      useWeapon?: boolean;
      /** Hits every living hostile (each rolls separately). */
      aoe?: boolean;
      extraCrit?: number;
      /**
       * Hit chance before the target's evasion. Defaults: the weapon's hit for
       * `useWeapon` effects, ABILITY_HIT otherwise.
       */
      hit?: number;
      /** Added to the hit chance above (e.g. a careful aimed shot: +15). */
      accuracy?: number;
      /** Strikes per target. Defaults: the weapon's hits for `useWeapon`, else 1. */
      hits?: number;
    }
  | { type: 'heal'; dice: [number, number] }
  | { type: 'status'; target: 'self' | 'enemy'; status: StatusId; turns: number; power: number; chance?: number };

export interface SpellDef {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
  mp: number;
  effects: SpellEffect[];
  description: string;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  description: string;
  /** Repeating pattern the bot (and auto-allocate) uses to spend stat points. */
  statPriority: Stat[];
  startWeapon: string;
  startArmor: string;
  color: number;
}

export interface MonsterAttack {
  name: string;
  element: Element;
  /** Damage per hit. */
  damage: [number, number];
  weight: number;
  /** Overrides the hostile's `accuracy` for this attack. */
  hit?: number;
  /** Strikes per use (default 1), each rolled separately. */
  hits?: number;
  effect?: { status: StatusId; chance: number; turns: number; power: number };
}

/** Purely visual description; the renderer builds a mesh from this. */
export interface MonsterLook {
  body: 'blob' | 'beast' | 'humanoid' | 'flyer' | 'golem' | 'dragon' | 'wraith';
  color: number;
  accent: number;
  scale: number;
}

export interface MonsterDef {
  id: string;
  name: string;
  level: number;
  /**
   * Combat profile, in the same units the player's stats turn into (HP, hit
   * chance, evasion %, crit %). Hostiles are authored directly in these units,
   * so they are not bound by the player's diminishing-returns curves: a 70%
   * evasion wisp or a 75%-accuracy brute is just a number here.
   */
  hp: number;
  /** Hit chance of its attacks against a target with 0 evasion (like a weapon's `hit`). */
  accuracy: number;
  /** Subtracted from the attacker's hit chance. */
  evasion: number;
  /** Critical-hit chance in percent. */
  crit: number;
  /** Turn speed; 100 = normal. 120 acts 1.2× as often as a speed-100 opponent. */
  speed: number;
  resist: Resistances;
  attacks: MonsterAttack[];
  xp: number;
  gold: [number, number];
  drops?: { itemId: string; chance: number }[];
  boss?: boolean;
  look: MonsterLook;
}

export interface AreaDef {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  /** Pool for regular single-hostile encounters (used when `groups` is not set). */
  monsters: string[];
  /**
   * Optional group encounters: each regular encounter picks one of these lineups
   * (1–3 hostile ids). Lets an area mix solo fights and packs.
   */
  groups?: string[][];
  boss: string;
  /** Hostiles that fight alongside the boss (max 2, so the boss fight has up to 3). */
  bossAdds?: string[];
  /** Regular encounters before the boss. */
  encounters: number;
  reward: { xp: number; gold: number };
  /** Area required to be cleared before this one unlocks. */
  requires?: string;
  palette: { sky: number; ground: number; fog: number };
}

// ─── Runtime state ─────────────────────────────────────────────────────────

export interface Player {
  name: string;
  classId: ClassId;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  mp: number;
  stats: Stats;
  statPoints: number;
  weapon: string;
  armor: string;
  /** Item id → count. Equipped items are also listed here (count ≥ 1). */
  inventory: Record<string, number>;
}

export interface MonsterInstance {
  defId: string;
  hp: number;
  maxHp: number;
  statuses: StatusEffect[];
  /** Battle timeline: time of this hostile's next turn (unset = fresh battle, see combat.ts). */
  next?: number;
  /** Patrol scaling (absent in regular missions): effective level, damage and reward multipliers. */
  level?: number;
  power?: number;
  reward?: number;
}

export const MAX_HOSTILES = 3;

export interface BattleState {
  /** 1–3 hostiles. Defeated ones stay in the list with hp 0 so indices are stable. */
  monsters: MonsterInstance[];
  /** Index of the hostile the player is targeting (always a living one while the battle lasts). */
  target: number;
  playerStatuses: StatusEffect[];
  /** Battle timeline: time of the player's next turn (unset = fresh battle, see combat.ts). */
  playerNext?: number;
  round: number;
}

export interface QuestState {
  /** For a patrol: the randomly chosen world (backdrop and hostile pool). */
  areaId: string;
  /** Set for a random patrol: every hostile is scaled to this level. */
  patrol?: { level: number };
  /** Number of encounters won so far in this quest (boss is the last one). */
  cleared: number;
  earnedXp: number;
  earnedGold: number;
}

export type Mode = 'title' | 'town' | 'quest' | 'battle' | 'defeated';

export interface GameState {
  version: number;
  mode: Mode;
  rng: number;
  player: Player | null;
  quest: QuestState | null;
  battle: BattleState | null;
  /** Areas whose boss has been defeated at least once. */
  clearedAreas: string[];
  stats: { battlesWon: number; battlesLost: number; actions: number };
}

// ─── Actions & events ──────────────────────────────────────────────────────

export type Action =
  | { type: 'newGame'; name: string; classId: ClassId; seed?: number }
  | { type: 'rest' }
  | { type: 'buy'; itemId: string }
  | { type: 'sell'; itemId: string }
  | { type: 'equip'; itemId: string }
  | { type: 'allocateStat'; stat: Stat }
  | { type: 'startQuest'; areaId: string }
  /** Random run: unlocked world, random lineups scaled to the player's level, then a boss. */
  | { type: 'startPatrol' }
  | { type: 'continue' }
  | { type: 'retreat' }
  /** `target` (optional) retargets first; otherwise the current target is used. */
  | { type: 'attack'; target?: number }
  | { type: 'cast'; spellId: string; target?: number }
  /** Change target without spending a turn. */
  | { type: 'target'; index: number }
  | { type: 'useItem'; itemId: string }
  | { type: 'flee' }
  | { type: 'returnToTown' };

export type Actor = 'player' | 'monster';

/**
 * Events describe what happened; UI and renderer animate them.
 * `foe` is the index of the hostile involved (the attacker for monster attacks,
 * the target for player attacks, the owner for status events on hostiles).
 */
export type GameEvent =
  | { type: 'error'; reason: string }
  | { type: 'message'; text: string }
  | { type: 'battleStart'; monsterIds: string[]; boss: boolean }
  | { type: 'attack'; actor: Actor; foe: number; name: string; element: Element; hit: boolean; crit: boolean; damage: number }
  | { type: 'cast'; actor: Actor; spellId: string; name: string }
  | { type: 'heal'; actor: Actor; amount: number; mana: number }
  | { type: 'statusApplied'; target: Actor; foe?: number; status: StatusId; turns: number }
  | { type: 'statusTick'; target: Actor; foe?: number; status: StatusId; damage: number }
  | { type: 'statusExpired'; target: Actor; foe?: number; status: StatusId }
  | { type: 'stunned'; actor: Actor; foe?: number }
  | { type: 'targeted'; foe: number }
  | { type: 'hostileDown'; foe: number }
  | { type: 'equip'; itemId: string }
  | { type: 'fled'; success: boolean }
  | { type: 'victory'; xp: number; gold: number; drops: string[] }
  | { type: 'defeat'; goldLost: number }
  | { type: 'levelUp'; level: number }
  | { type: 'questComplete'; areaId: string; xp: number; gold: number; firstClear: boolean }
  | { type: 'patrolComplete'; areaId: string; level: number; xp: number; gold: number }
  | { type: 'gameComplete' }
  | { type: 'gold'; amount: number }
  | { type: 'rested'; cost: number };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
