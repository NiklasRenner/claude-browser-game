/**
 * Screenshots the model gallery (every officer kit and hostile) to
 * test-results/gallery.png. Run after changing src/render/models.ts.
 *
 *   npm run gallery                    (builds first; all figures)
 *   npm run gallery -- heroes 2.5      (one group, animation time 2.5 s)
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

await mkdir('test-results', { recursive: true });
const server = await serve('dist', 4197);
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : '';
const t = process.argv[3] ?? '1.3';
await page.goto(`http://localhost:4197/gallery.html?t=${t}${only ? `&only=${only}` : ''}`);
await page.waitForFunction(() => window.galleryReady === true);
await page.waitForTimeout(1500);
await page.screenshot({ path: `test-results/gallery${only ? `-${only}` : ''}.png` });
await browser.close();
server.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Wrote test-results/gallery${only ? `-${only}` : ''}.png`);
