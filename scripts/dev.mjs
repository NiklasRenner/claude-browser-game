// Dev server: rebuilds on change and live-reloads the browser.
import * as esbuild from 'esbuild';
import { watch } from 'node:fs';
import path from 'node:path';
import { buildOptions, copyPublic, outdir, root } from './esbuild.config.mjs';

await copyPublic();
const ctx = await esbuild.context(buildOptions({ dev: true }));
await ctx.watch();

// Re-copy static files when public/ changes, then trigger a rebuild so the page reloads.
watch(path.join(root, 'public'), { recursive: true }, async () => {
  await copyPublic();
  await ctx.rebuild();
});

const port = Number(process.env.PORT ?? 5173);
const { hosts } = await ctx.serve({ servedir: outdir, port });
console.log(`\n  QuestForge dev server: http://${hosts[0] === '0.0.0.0' ? 'localhost' : hosts[0]}:${port}\n`);
