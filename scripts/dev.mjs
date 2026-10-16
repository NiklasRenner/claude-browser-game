// Dev server: rebuilds on change and live-reloads the browser. It also takes
// the scene editor's saves (POST /__layout) and writes them to layouts.json.
import * as esbuild from 'esbuild';
import { watch } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import path from 'node:path';
import { buildOptions, copyPublic, outdir, root } from './esbuild.config.mjs';

const LAYOUTS = path.join(root, 'src/render/scenes/layouts.json');

await copyPublic();
const ctx = await esbuild.context(buildOptions({ dev: true }));
await ctx.watch();

// Re-copy static files when public/ changes, then trigger a rebuild so the page reloads.
watch(path.join(root, 'public'), { recursive: true }, async () => {
  await copyPublic();
  await ctx.rebuild();
});

const port = Number(process.env.PORT ?? 5173);
// esbuild serves the files on the next port; this server sits in front of it.
const inner = await ctx.serve({ servedir: outdir, port: port + 1, host: '127.0.0.1' });

/** layouts.json with one line per body, props list and set piece, so diffs stay readable. */
export function formatLayouts(all) {
  const one = (v) => Array.isArray(v) ? `[${v.map(one).join(', ')}]`
    : v && typeof v === 'object' ? (Object.keys(v).length ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${one(x)}`).join(', ')} }` : '{}')
    : JSON.stringify(v);
  const blocks = Object.entries(all).map(([id, l]) => {
    const lines = [];
    if (l.body) lines.push(`    "body": ${one(l.body)}`);
    lines.push(`    "props": ${one(l.props ?? [])}`);
    const pieces = (l.pieces ?? []).map((p) => `      ${one(p)}`);
    lines.push(pieces.length ? `    "pieces": [\n${pieces.join(',\n')}\n    ]` : '    "pieces": []');
    return `  ${JSON.stringify(id)}: {\n${lines.join(',\n')}\n  }`;
  });
  return `{\n${blocks.join(',\n')}\n}\n`;
}

async function saveLayout(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    const { id, layout } = JSON.parse(body);
    const all = JSON.parse(await readFile(LAYOUTS, 'utf8'));
    if (!(id in all) || !Array.isArray(layout?.pieces) || !Array.isArray(layout?.props)) throw new Error(`bad layout for ${id}`);
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
