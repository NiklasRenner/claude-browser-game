/**
 * Balance report: lets the bot play full games over many
 * seeds and prints completion rates, run length and difficulty spikes.
 *
 *   npm run sim            # 20 seeds
 *   npm run sim -- 100     # 100 seeds
 */
import { MISSION_ORDER, STATS, STAT_INFO, chooseAction, derive, fullRestore, initialState, runBot, step } from '../src/core';
import type { Action, GameState } from '../src/core';

const seeds = Number(process.argv[2] ?? 20);
const maxSteps = 30000;

console.log(`Balance sim — ${seeds} seeds, max ${maxSteps} steps\n`);
console.log('         done   avg steps  avg lvl  win%   deaths  level when each mission first cleared');

for (const label of ['officer']) {
  const clearLevels: Record<string, number[]> = Object.fromEntries(MISSION_ORDER.map((a) => [a, []]));
  let done = 0, steps = 0, levels = 0, won = 0, lost = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const seen = new Set<string>();
    const r = runBot(seed, maxSteps, (s) => {
      for (const a of s.clearedMissions) if (!seen.has(a)) { seen.add(a); clearLevels[a]!.push(s.player!.level); }
    });
    done += r.completed ? 1 : 0;
    steps += r.steps; levels += r.level; won += r.battlesWon; lost += r.battlesLost;
  }
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—');
  console.log(
    `${label.padEnd(8)} ${`${done}/${seeds}`.padEnd(6)} ${String(Math.round(steps / seeds)).padStart(9)}  `
    + `${(levels / seeds).toFixed(1).padStart(7)}  ${((100 * won) / (won + lost)).toFixed(1).padStart(5)}  `
    + `${(lost / seeds).toFixed(1).padStart(6)}  ${MISSION_ORDER.map((a) => `${a}:${avg(clearLevels[a]!)}`).join('  ')}`,
  );
}

// ─── Patrols ───────────────────────────────────────────────────────────────
// Snapshot bot characters at several levels during the campaign, then let them
// run patrols (the bot's normal ship prep, but launching patrols instead of missions).

const PATROL_LEVELS = [3, 6, 9, 12, 16];
const patrolsPerSnapshot = 6;

function patrolAction(s: GameState): Action {
  const a = chooseAction(s);
  return a.type === 'startMission' ? { type: 'startPatrol' } : a;
}

/** Runs `count` patrols from state `s`; returns stats. */
function runPatrols(start: GameState, count: number) {
  let s = start;
  let done = 0, deaths = 0, steps = 0;
  const startLevel = s.player!.level;
  while (done + deaths < count && steps < 20000) {
    const r = step(s, patrolAction(s));
    if (r.events.some((e) => e.type === 'error')) throw new Error(JSON.stringify(r.events));
    if (r.events.some((e) => e.type === 'patrolComplete')) done++;
    if (r.events.some((e) => e.type === 'defeat') && s.mission?.patrol) deaths++;
    s = r.state;
    steps++;
  }
  return { done, deaths, startLevel, endLevel: s.player!.level, state: s };
}

console.log(`\nPatrols — ${patrolsPerSnapshot} per snapshot, ${Math.min(seeds, 10)} seeds`);
console.log('         at level  patrols  deaths  death%');
for (const label of ['officer']) {
  const byLevel = new Map<number, { done: number; deaths: number }>();
  let post = { levels: 0, deaths: 0, patrols: 0 };
  for (let seed = 1; seed <= Math.min(seeds, 10); seed++) {
    let s = step(initialState(seed), { type: 'newGame', name: 'Bot', seed }).state;
    const pending = [...PATROL_LEVELS];
    let finished = false;
    for (let i = 0; i < 30000 && !finished; i++) {
      if (pending.length && s.mode === 'ship' && s.player!.level >= pending[0]!) {
        const r = runPatrols(s, patrolsPerSnapshot);
        const agg = byLevel.get(pending[0]!) ?? { done: 0, deaths: 0 };
        byLevel.set(pending[0]!, { done: agg.done + r.done, deaths: agg.deaths + r.deaths });
        pending.shift();
      }
      const r = step(s, chooseAction(s));
      finished = r.events.some((e) => e.type === 'gameComplete');
      s = r.state;
    }
    const r = runPatrols(s, 40);
    post = { levels: post.levels + r.endLevel, deaths: post.deaths + r.deaths, patrols: post.patrols + r.done + r.deaths };
  }
  const rows = [...byLevel].map(([lvl, v]) =>
    `${label.padEnd(8)} ${String(lvl).padStart(8)}  ${String(v.done + v.deaths).padStart(7)}  ${String(v.deaths).padStart(6)}  ${(100 * v.deaths / Math.max(1, v.done + v.deaths)).toFixed(0).padStart(5)}%`);
  console.log(rows.join('\n'));
  const n = Math.min(seeds, 10);
  console.log(`${label.padEnd(8)} post-game (from level ~16): level ${(post.levels / n).toFixed(1)} after 40 patrols, deaths ${post.deaths}/${post.patrols} (${(100 * post.deaths / post.patrols).toFixed(0)}%)`);
}

// ─── Stat weights ──────────────────────────────────────────────────────────
// How much is +1 point in each stat worth? For bot characters snapshotted at a
// few levels, add +BUMP to one stat, replay the same missions many times and
// compare a combat score:
//   score = (damage dealt per turn) × maxHP ÷ (damage taken per turn)
// i.e. "damage per turn × effective HP". Reported as % score per point.

const WEIGHT_LEVELS = [5, 10, 15];
const BUMP = 5;
const RUNS = 300;

function missionScore(start: GameState, runs: number): number {
  let dealt = 0, taken = 0, turns = 0;
  const maxHp = derive(start.player!).maxHp;
  for (let r = 0; r < runs; r++) {
    let s = structuredClone(start);
    s.rng = (r * 2654435761) >>> 0;
    let steps = 0;
    // Play exactly one mission (from launch back to the ship or sickbay).
    while (steps++ < 600) {
      const action = chooseAction(s);
      const res = step(s, action);
      if (s.mode === 'battle' && ['attack', 'useAbility', 'useItem', 'equip', 'flee'].includes(action.type)) turns++;
      for (const e of res.events) {
        if (e.type === 'attack') { if (e.actor === 'player') dealt += e.damage; else taken += e.damage; }
        if (e.type === 'statusTick') { if (e.target === 'hostile') dealt += e.damage; else taken += e.damage; }
      }
      s = res.state;
      if (action.type === 'startMission') continue;
      if (s.mode === 'ship' || s.mode === 'defeated') break;
    }
  }
  return (dealt / turns) * maxHp / Math.max(1, taken / turns);
}

console.log(`\nStat weights — % combat score per +1 point (+${BUMP} points, ${RUNS} missions each)`);
console.log(`         level  ${STATS.map((k) => STAT_INFO[k].short.padStart(6)).join('')}`);
for (const label of ['officer']) {
  let s = step(initialState(11), { type: 'newGame', name: 'Bot', seed: 11 }).state;
  const pending = [...WEIGHT_LEVELS];
  for (let i = 0; i < 30000 && pending.length; i++) {
    const a = chooseAction(s);
    // Snapshot at the moment the bot launches a mission at/after the target level.
    if (a.type === 'startMission' && s.player!.level >= pending[0]!) {
      const level = pending.shift()!;
      const base = missionScore(s, RUNS);
      const cells = STATS.map((stat) => {
        const v = structuredClone(s);
        v.player!.stats[stat] += BUMP;
        fullRestore(v.player!);
        const pct = ((missionScore(v, RUNS) / base - 1) * 100) / BUMP;
        return pct.toFixed(1).padStart(6);
      });
      console.log(`${label.padEnd(8)} ${String(level).padStart(5)}  ${cells.join('')}`);
    }
    s = step(s, a).state;
  }
}
