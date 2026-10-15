/**
 * Screenshots the figure gallery (every officer kit and hostile) to
 * test-results/gallery.png. Run after changing src/render/sprites.
 *
 *   npm run gallery                        (builds first; everything)
 *   npm run gallery -- hostiles 2.5        (one group, clock frozen at 2.5 s)
 *   npm run gallery -- all 1.3 0.4         (everyone mid-attack)
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

await mkdir('test-results', { recursive: true });
const server = await serve('dist', 4197);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2100, height: 1400 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : '';
const t = process.argv[3] ?? '1.3';
const attack = process.argv[4] ?? '0';
await page.goto(`http://localhost:4197/gallery.html?t=${t}&attack=${attack}${only ? `&only=${only}` : ''}`);
await page.waitForFunction(() => window.galleryReady === true);
const name = `test-results/gallery${only ? `-${only}` : ''}${attack !== '0' ? '-attack' : ''}.png`;
await page.locator('#gallery').screenshot({ path: name });
await browser.close();
server.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Wrote ${name}`);
