// Regenerates tests/golden/*.json. Run after an intentional gameplay change, then review `git diff tests/golden`.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['tsx', '--test', 'tests/**/*.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, UPDATE_GOLDEN: '1' },
});
process.exit(result.status ?? 1);
