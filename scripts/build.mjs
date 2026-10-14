// Production build: bundles src/main.ts and copies public/ into dist/.
import * as esbuild from 'esbuild';
import { rm } from 'node:fs/promises';
import { buildOptions, copyPublic, outdir } from './esbuild.config.mjs';

await rm(outdir, { recursive: true, force: true });
await copyPublic();
const result = await esbuild.build({ ...buildOptions({ dev: false }), metafile: true });
const bytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
console.log(`Built dist/ (${(bytes / 1024).toFixed(0)} KiB incl. sourcemaps)`);
