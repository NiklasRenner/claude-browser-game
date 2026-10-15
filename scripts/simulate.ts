/**
 * Balance report: lets the bot play full games for every class over many
 * seeds and prints completion rates, run length and difficulty spikes.
 *
 *   npm run sim            # 20 seeds per class
 *   npm run sim -- 100     # 100 seeds per class
 */
import { AREA_ORDER, CLASSES, chooseAction, initialState, runBot, step } from '../src/core';
import type { Action, ClassId, GameState } from '../src/core';

const seeds = Number(process.argv[2] ?? 20);
const maxSteps = 30000;

console.log(`Balance sim — ${seeds} seeds per class, max ${maxSteps} steps\n`);
console.log('class    done   avg steps  avg lvl  win%   deaths  level when each area first cleared');

for (const classId of Object.keys(CLASSES) as ClassId[]) {
  const clearLevels: Record<string, number[]> = Object.fromEntries(AREA_ORDER.map((a) => [a, []]));
  let done = 0, steps = 0, levels = 0, won = 0, lost = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const seen = new Set<string>();
    const r = runBot(classId, seed, maxSteps, (s) => {
      for (const a of s.clearedAreas) if (!seen.has(a)) { seen.add(a); clearLevels[a]!.push(s.player!.level); }
    });
    done += r.completed ? 1 : 0;
    steps += r.steps; levels += r.level; won += r.battlesWon; lost += r.battlesLost;
  }
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—');
  console.log(
    `${classId.padEnd(8)} ${`${done}/${seeds}`.padEnd(6)} ${String(Math.round(steps / seeds)).padStart(9)}  `
    + `${(levels / seeds).toFixed(1).padStart(7)}  ${((100 * won) / (won + lost)).toFixed(1).padStart(5)}  `
    + `${(lost / seeds).toFixed(1).padStart(6)}  ${AREA_ORDER.map((a) => `${a}:${avg(clearLevels[a]!)}`).join('  ')}`,
  );
}

// ─── Patrols ───────────────────────────────────────────────────────────────
// Snapshot bot characters at several levels during the campaign, then let them
// run patrols (the bot's normal town prep, but launching patrols instead of missions).

const PATROL_LEVELS = [3, 6, 9, 12, 16];
const patrolsPerSnapshot = 6;

function patrolAction(s: GameState): Action {
  const a = chooseAction(s);
  return a.type === 'startQuest' ? { type: 'startPatrol' } : a;
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
    if (r.events.some((e) => e.type === 'defeat') && s.quest?.patrol) deaths++;
    s = r.state;
    steps++;
  }
  return { done, deaths, startLevel, endLevel: s.player!.level, state: s };
}

console.log(`\nPatrols — ${patrolsPerSnapshot} per snapshot, ${Math.min(seeds, 10)} seeds per class`);
console.log('class    at level  patrols  deaths  death%');
for (const classId of Object.keys(CLASSES) as ClassId[]) {
  const byLevel = new Map<number, { done: number; deaths: number }>();
  let post = { levels: 0, deaths: 0, patrols: 0 };
  for (let seed = 1; seed <= Math.min(seeds, 10); seed++) {
    let s = step(initialState(seed), { type: 'newGame', name: 'Bot', classId, seed }).state;
    const pending = [...PATROL_LEVELS];
    let finished = false;
    for (let i = 0; i < 30000 && !finished; i++) {
      if (pending.length && s.mode === 'town' && s.player!.level >= pending[0]!) {
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
    `${classId.padEnd(8)} ${String(lvl).padStart(8)}  ${String(v.done + v.deaths).padStart(7)}  ${String(v.deaths).padStart(6)}  ${(100 * v.deaths / Math.max(1, v.done + v.deaths)).toFixed(0).padStart(5)}%`);
  console.log(rows.join('\n'));
  const n = Math.min(seeds, 10);
  console.log(`${classId.padEnd(8)} post-game (from level ~16): level ${(post.levels / n).toFixed(1)} after 40 patrols, deaths ${post.deaths}/${post.patrols} (${(100 * post.deaths / post.patrols).toFixed(0)}%)`);
}
