/**
 * Balance report: lets the bot play full games for every class over many
 * seeds and prints completion rates, run length and difficulty spikes.
 *
 *   npm run sim            # 20 seeds per class
 *   npm run sim -- 100     # 100 seeds per class
 */
import { AREA_ORDER, CLASSES, runBot } from '../src/core';
import type { ClassId } from '../src/core';

const seeds = Number(process.argv[2] ?? 20);
const maxSteps = 30000;

console.log(`QuestForge balance sim — ${seeds} seeds per class, max ${maxSteps} steps\n`);
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
