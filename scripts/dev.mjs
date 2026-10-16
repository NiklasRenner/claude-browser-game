// Dev server: rebuilds on change and live-reloads the browser. It also takes
// the scene editor's saves (POST /__layout) and writes them to layouts.json.
import * as esbuild from 'esbuild';
import { watch } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import path from 'node:path';
import { buildOptions, copyPublic, outdir, root } from './esbuild.config.mjs';
import { formatLayouts, isLayout } from './layouts.mjs';

const LAYOUTS = path.join(root, 'src/render/scenes/layouts.json');

await copyPublic();
const ctx = await esbuild.context(buildOptions({ dev: true }));
await ctx.watch();

// Re-copy static files when public/ changes, then trigger a rebuild so the page reloads. One change
// fires several events, so copy once they settle (overlapping copies trip over each other).
let pending = null;
watch(path.join(root, 'public'), { recursive: true }, () => {
  clearTimeout(pending);
  pending = setTimeout(async () => {
    try { await copyPublic(); await ctx.rebuild(); } catch (err) { console.warn('  Copying public/ failed:', err.message); }
  }, 100);
});

const port = Number(process.env.PORT ?? 5173);
// esbuild serves the files on the next port; this server sits in front of it.
const inner = await ctx.serve({ servedir: outdir, port: port + 1, host: '127.0.0.1' });

async function saveLayout(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    const { id, layout } = JSON.parse(body);
    const all = JSON.parse(await readFile(LAYOUTS, 'utf8'));
    if (!(id in all) || !isLayout(layout)) throw new Error(`bad layout for ${id}`);
    all[id] = layout;
    await writeFile(LAYOUTS, formatLayouts(all));
    console.log(`  Saved the ${id} layout to src/render/scenes/layouts.json`);
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  } catch (err) {
    res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(err) }));
  }
}

createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/__layout') return void saveLayout(req, res);
  // Everything else (files, and the live-reload event stream) goes to esbuild.
  const upstream = request({ host: inner.hosts[0], port: inner.port, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  upstream.on('error', () => res.writeHead(502).end());
  req.pipe(upstream);
}).listen(port, () => {
  console.log(`\n  Starward dev server: http://localhost:${port}`);
  console.log(`  Scene editor:        http://localhost:${port}/editor.html\n`);
});
