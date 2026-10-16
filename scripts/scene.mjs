/**
 * Screenshots each mission's location on its own: no figures, markers or UI,
 * just the backdrop with its weather and set pieces, as the game draws it.
 * Use it to judge backdrops and set pieces. Writes test-results/scene-<mission>.png.
 *
 *   npm run scene                 (builds first; every mission)
 *   npm run scene -- veridia      (one mission)
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

// A hostile from each world: a drill against it shows that world's backdrop.
const WORLDS = { veridia: 'fen_leech', kethra: 'cave_glider', glacies: 'frost_serpent', void_rift: 'void_shade', xenith: 'hive_drone' };
const only = process.argv[2];

await mkdir('test-results', { recursive: true });
const server = await serve('dist', 4195);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
for (const [mission, hostile] of Object.entries(WORLDS)) {
  if (only && only !== mission) continue;
  await page.goto('http://127.0.0.1:4195/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#start-game');
  await page.click('#start-game');
  await page.waitForFunction(() => window.__qf.state.mode === 'ship');
  await page.evaluate((id) => window.__qf.dispatch({ type: 'startDrill', hostileIds: [id] }), hostile);
  await page.waitForFunction(() => !window.__qf.busy, null, { timeout: 30000 });
  await page.evaluate(() => window.__qf.scenery(true));
  await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `test-results/scene-${mission}.png` });
  console.log(`Wrote test-results/scene-${mission}.png`);
}
await browser.close();
server.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
