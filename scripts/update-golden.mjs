// Regenerates tests/golden/*.json. Run after an intentional gameplay change, then review `git diff tests/golden`.
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';

// Start from an empty folder so goldens no test writes any more don't linger.
for (const f of readdirSync('tests/golden')) if (f.endsWith('.json')) rmSync(`tests/golden/${f}`);

const result = spawnSync('npx', ['tsx', '--test', '--experimental-test-isolation=none', 'tests/**/*.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, UPDATE_GOLDEN: '1' },
});
process.exit(result.status ?? 1);
