// ─── Shared game types. Everything here is plain, JSON-serializable data. ───
// Internal field names (credits, energy, abilities, mission, hostile) are mechanical; the
// player-facing terms (credits, energy, abilities, mission, hostile) live in UI text.

export const ELEMENTS = ['kinetic', 'plasma', 'cryo', 'ion', 'photon', 'void', 'corrosive'] as const;
export type Element = (typeof ELEMENTS)[number];

/** Power, Speed, Intellect, Endurance, Luck — see stats.ts. (Hit chance and evasion come from gear and abilities, not stats.) */
export const STATS = ['pow', 'spd', 'int', 'end', 'luk'] as const;
export type Stat = (typeof STATS)[number];
export type Stats = Record<Stat, number>;

/** Damage taken in percent per element. 100 = normal, 50 = resist, 150 = weak. */
export type Resistances = Partial<Record<Element, number>>;

export type DivisionId = 'security' | 'science' | 'engineer';

/**
 * Element effects (one per damage type, see ELEMENT_EFFECTS; an attack *may* carry it):
 *   burn (plasma): heavy damage `power` at the start of each owner turn; short, doesn't stack.
 *   corrode (corrosive): weaker damage per turn, but every new dose adds to it (up to CORRODE_MAX_STACKS×); long.
 *   chill (cryo): owner's speed −`power`%. stun (ion): owner skips its next turn.
 *   blind (photon): owner's hit chance −`power`. exposed (void): owner takes +`power`% damage.
 * Other statuses: shield: owner takes `power`% less damage. evasive: owner's evasion +`power`.
 * marked: owner's evasion −`power`. Statuses work the same on the player and on hostiles.
 */
export type StatusId = 'burn' | 'corrode' | 'chill' | 'stun' | 'blind' | 'exposed' | 'shield' | 'evasive' | 'marked';

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
  energy: number;
  level: number;
  price: number;
  description: string;
}

export interface ConsumableDef {
  kind: 'consumable';
  id: string;
  name: string;
  heal: number;
  energy: number;
  /** Status removed on use (e.g. detox injector). */
  cures?: StatusId[];
  price: number;
  description: string;
}

export type ItemDef = WeaponDef | ArmorDef | ConsumableDef;

export type AbilityEffect =
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

export interface AbilityDef {
  id: string;
  name: string;
  divisionId: DivisionId;
  level: number;
  energy: number;
  effects: AbilityEffect[];
  description: string;
}

export interface DivisionDef {
  id: DivisionId;
  name: string;
  description: string;
  /** Repeating pattern the bot (and auto-allocate) uses to spend stat points. */
  statPriority: Stat[];
  startWeapon: string;
  startArmor: string;
  color: number;
}

export interface HostileAttack {
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

/** Optional parts a body plan can show (each body uses the ones that make sense for it). */
export type LookFeature =
  | 'spikes' | 'tusks' | 'horns' | 'tail' | 'wings' | 'sac' | 'armor' | 'crown' | 'ice'
  | 'helmet' | 'baton' | 'blade' | 'shield' | 'staff' | 'coat' | 'tendrils';

/** Purely visual description; the renderer builds the figure from this (see src/render/sprites). */
export interface HostileLook {
  body: 'blob' | 'beast' | 'brute' | 'humanoid' | 'husk' | 'elemental' | 'flyer' | 'golem' | 'serpent' | 'dragon' | 'insect' | 'wraith' | 'wisp';
  color: number;
  accent: number;
  scale: number;
  features?: LookFeature[];
  /**
   * Drawn from a sprite sheet (public/sprites) instead of the body plan: frames
   * to cycle while idle (`fps` per second, default 1.4), and frames played over
   * an attack (wind-up, strike, recover; the strike lands 40% of the way in).
   * The body plan is the fallback until the sheet has loaded.
   */
  sprite?: { sheet: string; idle: number[]; attack?: number[]; fps?: number };
}

export interface HostileDef {
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
  attacks: HostileAttack[];
  xp: number;
  credits: [number, number];
  drops?: { itemId: string; chance: number }[];
  boss?: boolean;
  look: HostileLook;
}

export interface MissionDef {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  /** Pool for regular single-hostile encounters (used when `groups` is not set). */
  hostiles: string[];
  /**
   * Optional group encounters: each regular encounter picks one of these lineups
   * (1–3 hostile ids). Lets an mission mix solo fights and packs.
   */
  groups?: string[][];
  boss: string;
  /** Hostiles that fight alongside the boss (max 2, so the boss fight has up to 3). */
  bossAdds?: string[];
  /** The boss's level in this mission (default: minLevel + 1, see bossLevel()). */
  bossLevel?: number;
  /** Ending text, for the final mission (FINAL_MISSION): shown in the log and the victory screen. */
  finale?: { title: string; text: string };
  /** Regular encounters before the boss. */
  encounters: number;
  reward: { xp: number; credits: number };
  /** Mission required to be cleared before this one unlocks. */
  requires?: string;
  palette: { sky: number; ground: number; fog: number };
}

// ─── Runtime state ─────────────────────────────────────────────────────────

export interface Player {
  name: string;
  divisionId: DivisionId;
  level: number;
  xp: number;
  credits: number;
  hp: number;
  energy: number;
  stats: Stats;
  statPoints: number;
  weapon: string;
  armor: string;
  /** Item id → count. Equipped items are also listed here (count ≥ 1). */
  inventory: Record<string, number>;
}

export interface Hostile {
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
  hostiles: Hostile[];
  /** Index of the hostile the player is targeting (always a living one while the battle lasts). */
  target: number;
  playerStatuses: StatusEffect[];
  /** Battle timeline: time of the player's next turn (unset = fresh battle, see combat.ts). */
  playerNext?: number;
  round: number;
}

export interface MissionRun {
  /** For a patrol: the randomly chosen world (backdrop and hostile pool). */
  missionId: string;
  /** Set for a random patrol: every hostile is scaled to this level. */
  patrol?: { level: number };
  /** Number of encounters won so far in this run (boss is the last one). */
  cleared: number;
  earnedXp: number;
  earnedCredits: number;
}

export type Mode = 'title' | 'ship' | 'mission' | 'battle' | 'defeated';

export interface GameState {
  version: number;
  mode: Mode;
  rng: number;
  player: Player | null;
  mission: MissionRun | null;
  battle: BattleState | null;
  /** Missions whose boss has been defeated at least once. */
  clearedMissions: string[];
  stats: { battlesWon: number; battlesLost: number; actions: number };
}

// ─── Actions & events ──────────────────────────────────────────────────────

export type Action =
  | { type: 'newGame'; name: string; divisionId: DivisionId; seed?: number }
  | { type: 'treat' }
  | { type: 'buy'; itemId: string }
  | { type: 'sell'; itemId: string }
  | { type: 'equip'; itemId: string }
  | { type: 'allocateStat'; stat: Stat }
  | { type: 'startMission'; missionId: string }
  /** Random run: unlocked world, random lineups scaled to the player's level, then a boss. */
  | { type: 'startPatrol' }
  | { type: 'continue' }
  | { type: 'retreat' }
  /** `target` (optional) retargets first; otherwise the current target is used. */
  | { type: 'attack'; target?: number }
  | { type: 'useAbility'; abilityId: string; target?: number }
  /** Change target without spending a turn. */
  | { type: 'target'; index: number }
  | { type: 'useItem'; itemId: string }
  | { type: 'flee' }
  | { type: 'returnToShip' };

export type Actor = 'player' | 'hostile';

/**
 * Events describe what happened; UI and renderer animate them.
 * `foe` is the index of the hostile involved (the attacker for hostile attacks,
 * the target for player attacks, the owner for status events on hostiles).
 */
export type GameEvent =
  | { type: 'error'; reason: string }
  | { type: 'message'; text: string }
  | { type: 'battleStart'; hostileIds: string[]; boss: boolean }
  | { type: 'attack'; actor: Actor; foe: number; name: string; element: Element; hit: boolean; crit: boolean; damage: number }
  | { type: 'abilityUsed'; actor: Actor; abilityId: string; name: string }
  | { type: 'heal'; actor: Actor; amount: number; energy: number }
  | { type: 'statusApplied'; target: Actor; foe?: number; status: StatusId; turns: number }
  | { type: 'statusTick'; target: Actor; foe?: number; status: StatusId; damage: number }
  | { type: 'statusExpired'; target: Actor; foe?: number; status: StatusId }
  | { type: 'stunned'; actor: Actor; foe?: number }
  | { type: 'targeted'; foe: number }
  | { type: 'hostileDown'; foe: number }
  | { type: 'equip'; itemId: string }
  | { type: 'fled'; success: boolean }
  | { type: 'victory'; xp: number; credits: number; drops: string[] }
  | { type: 'defeat'; creditsLost: number }
  | { type: 'levelUp'; level: number }
  | { type: 'missionComplete'; missionId: string; xp: number; credits: number; firstClear: boolean }
  | { type: 'patrolComplete'; missionId: string; level: number; xp: number; credits: number }
  | { type: 'gameComplete' }
  | { type: 'bought'; itemId: string; price: number }
  | { type: 'sold'; itemId: string; credits: number }
  | { type: 'learned'; abilityId: string }
  | { type: 'treated'; cost: number };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
