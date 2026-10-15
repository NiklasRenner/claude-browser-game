// Shared esbuild configuration for dev and production builds.
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const outdir = path.join(root, 'dist');

/** @param {{ dev?: boolean }} opts */
export function buildOptions({ dev = false } = {}) {
  return {
    // main = the game; gallery = a model viewer for art work (dist/gallery.html, `npm run gallery`).
    entryPoints: { main: path.join(root, 'src/main.ts'), gallery: path.join(root, 'src/gallery.ts') },
    outdir: path.join(outdir, 'assets'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    minify: !dev,
    legalComments: 'none',
    logLevel: 'info',
    define: { __DEV__: JSON.stringify(dev) },
    // In dev, inject a tiny live-reload client that listens to esbuild's change events.
    banner: dev
      ? { js: "new EventSource('/esbuild').addEventListener('change', () => location.reload());" }
      : undefined,
  };
}

/** Copy static files (index.html, styles, etc.) into dist. */
export async function copyPublic() {
  await mkdir(outdir, { recursive: true });
  await cp(path.join(root, 'public'), outdir, { recursive: true });
}
