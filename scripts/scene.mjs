/**
 * Screenshots each mission's location on its own: no figures, markers or UI,
 * just the backdrop with its weather and set pieces, as the game draws it.
 * Use it to judge backdrops and set pieces. Writes test-results/scene-<mission>.png.
 *
 *   npm run scene                 (builds first; every mission)
 *   npm run scene -- veridia      (one mission)
 *   npm run scene -- veridia 1700x720   (another viewport; default 1280x720, a 16:9 screen)
 */
import { OUT, openBrowser } from './browser.mjs';

// A hostile from each world: a drill against it shows that world's backdrop.
const WORLDS = { ship: null, veridia: 'fen_leech', kethra: 'cave_glider', glacies: 'frost_serpent', void_rift: 'void_shade', xenith: 'hive_drone' };
const only = process.argv[2];
const [width, height] = (process.argv[3] ?? '1280x720').split('x').map(Number);
const suffix = process.argv[3] ? `-${process.argv[3]}` : '';

const browser = await openBrowser();
const page = await browser.newPage({ width, height });
for (const [mission, hostile] of Object.entries(WORLDS)) {
  if (only && only !== mission) continue;
  await page.goto(browser.url());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#start-game');
  await page.click('#start-game');
  await page.waitForFunction(() => window.__qf.state.mode === 'ship');
  // The ship (and title screen) is where a new game starts; worlds through a drill.
  if (hostile) await page.evaluate((id) => window.__qf.dispatch({ type: 'startDrill', hostileIds: [id] }), hostile);
  await page.waitForFunction(() => !window.__qf.busy, null, { timeout: 30000 });
  await page.evaluate(() => window.__qf.scenery(true));
  await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/scene-${mission}${suffix}.png` });
  console.log(`Wrote ${OUT}/scene-${mission}${suffix}.png`);
}
await browser.close();
if (browser.errors.length) { console.error(browser.errors.join('\n')); process.exit(1); }
