// ─── Shared game types. Everything here is plain, JSON-serializable data. ───

export const ELEMENTS = ['physical', 'fire', 'ice', 'energy', 'light', 'darkness', 'poison'] as const;
export type Element = (typeof ELEMENTS)[number];

export const STATS = ['str', 'dex', 'int', 'end', 'luk'] as const;
export type Stat = (typeof STATS)[number];
export type Stats = Record<Stat, number>;

/** Damage taken in percent per element. 100 = normal, 50 = resist, 150 = weak. */
export type Resistances = Partial<Record<Element, number>>;

export type ClassId = 'warrior' | 'mage' | 'rogue';

/**
 * burn/poison: damage `power` at the start of each owner turn.
 * stun: owner skips its turn. chill: owner's accuracy −`power`.
 * guard: owner takes `power`% less damage. evasive: owner's evasion +`power`.
 */
export type StatusId = 'burn' | 'poison' | 'stun' | 'guard' | 'evasive' | 'chill';

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
  element: Element;
  damage: [number, number];
  /** Flat to-hit bonus. */
  bonus: number;
  /** Extra crit chance in percent. */
  crit: number;
  /** Chance-based on-hit effect. */
  proc?: { chance: number; status: StatusId; turns: number; power: number };
  level: number;
  price: number;
  description: string;
}

export interface ArmorDef {
  kind: 'armor';
  id: string;
  name: string;
  /** Reduces enemy to-hit chance. */
  block: number;
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
  /** Status removed on use (e.g. antidote). */
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
      scaling: Stat;
      /** Multiplier applied to the rolled dice (e.g. 1.6 for a power attack). */
      mult?: number;
      /** If true, rolls the equipped weapon's damage instead of `dice`. */
      useWeapon?: boolean;
      extraCrit?: number;
    }
  | { type: 'heal'; dice: [number, number]; scaling: Stat }
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
  baseStats: Stats;
  /** Stat that amplifies weapon damage for this class. */
  attackStat: Stat;
  /** Multiplier on weapon damage (mages hit softer with weapons). */
  weaponMult: number;
  /** Extra innate crit chance in percent. */
  critBonus: number;
  /** Multiplier on max HP. */
  hpMult: number;
  /** Repeating pattern the bot (and auto-allocate) uses to spend stat points. */
  statPriority: Stat[];
  startWeapon: string;
  startArmor: string;
  color: number;
}

export interface MonsterAttack {
  name: string;
  element: Element;
  damage: [number, number];
  weight: number;
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
  hp: number;
  stats: Pick<Stats, 'dex' | 'luk'>;
  /** Natural evasion bonus. */
  evasion: number;
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
  monsters: string[];
  boss: string;
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
}

export interface BattleState {
  monster: MonsterInstance;
  playerStatuses: StatusEffect[];
  round: number;
}

export interface QuestState {
  areaId: string;
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
  | { type: 'continue' }
  | { type: 'retreat' }
  | { type: 'attack' }
  | { type: 'cast'; spellId: string }
  | { type: 'useItem'; itemId: string }
  | { type: 'flee' }
  | { type: 'returnToTown' };

export type Actor = 'player' | 'monster';

/** Events describe what happened; UI and renderer animate them. */
export type GameEvent =
  | { type: 'error'; reason: string }
  | { type: 'message'; text: string }
  | { type: 'battleStart'; monsterId: string; boss: boolean }
  | { type: 'attack'; actor: Actor; name: string; element: Element; hit: boolean; crit: boolean; damage: number }
  | { type: 'cast'; actor: Actor; spellId: string; name: string }
  | { type: 'heal'; actor: Actor; amount: number; mana: number }
  | { type: 'statusApplied'; target: Actor; status: StatusId; turns: number }
  | { type: 'statusTick'; target: Actor; status: StatusId; damage: number }
  | { type: 'statusExpired'; target: Actor; status: StatusId }
  | { type: 'stunned'; actor: Actor }
  | { type: 'equip'; itemId: string }
  | { type: 'fled'; success: boolean }
  | { type: 'victory'; xp: number; gold: number; drops: string[] }
  | { type: 'defeat'; goldLost: number }
  | { type: 'levelUp'; level: number }
  | { type: 'questComplete'; areaId: string; xp: number; gold: number; firstClear: boolean }
  | { type: 'gameComplete' }
  | { type: 'gold'; amount: number }
  | { type: 'rested'; cost: number };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
