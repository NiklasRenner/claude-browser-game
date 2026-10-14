/**
 * Browser smoke test. Serves dist/, drives the real UI in headless Chromium,
 * and fails on any console error, blank canvas, or UI/state mismatch.
 * Screenshots land in test-results/ for a quick visual check.
 *
 *   npm run test:e2e
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const OUT = 'test-results';
await mkdir(OUT, { recursive: true });
const server = await serve('dist', 4199);
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const errors = [];
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`);
  if (!ok) failures++;
};

async function newPage(viewport) {
  const page = await browser.newPage({ viewport });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return page;
}

/** Fraction of distinct colours in a downscaled canvas snapshot — near 0 means a blank render. */
const canvasVariety = (page) => page.evaluate(() => {
  const src = document.querySelector('#scene');
  const c = document.createElement('canvas');
  c.width = 64; c.height = 36;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, 64, 36);
  const data = ctx.getImageData(0, 0, 64, 36).data;
  const colours = new Set();
  for (let i = 0; i < data.length; i += 4) colours.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
  return colours.size;
});

const waitIdle = (page) => page.waitForFunction(() => !window.__qf.busy, null, { timeout: 15000 });

try {
  console.log('Desktop flow');
  const page = await newPage({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:4199/');
  await page.waitForSelector('#start-game');
  check(await page.evaluate(() => window.__qf.webgl), 'WebGL stage initialised');
  await page.waitForTimeout(500);
  check((await canvasVariety(page)) > 20, 'title scene renders (canvas not blank)');
  await page.screenshot({ path: `${OUT}/01-title.png` });

  await page.fill('#hero-name', 'Playwright');
  await page.click('[data-ui="class:science"]');
  await page.click('#start-game');
  await page.waitForSelector('text=Meridian');
  const s1 = await page.evaluate(() => window.__qf.state);
  check(s1.mode === 'town' && s1.player.name === 'Playwright' && s1.player.classId === 'science', 'new game created from title screen');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/02-town.png` });

  // Visit each town tab; the header and tab bar must stay fully visible even when the list is long.
  const squashed = [];
  for (const tab of ['shop', 'inventory', 'character', 'inn', 'quests']) {
    await page.click(`[data-ui="tab:${tab}"]`);
    const ok = await page.evaluate(() => {
      const tabs = document.querySelector('.tabs');
      const header = document.querySelector('.town-header');
      return tabs.clientHeight >= 30 && tabs.scrollHeight <= tabs.clientHeight && header.getBoundingClientRect().top >= 0;
    });
    if (!ok) squashed.push(tab);
  }
  check(squashed.length === 0, `town tab bar stays visible on every tab${squashed.length ? ` (broken on: ${squashed.join(', ')})` : ''}`);

  // Start a quest through the real button and fight with real clicks at normal animation speed.
  await page.click('[data-action*="veridia"]');
  await page.waitForSelector('.monster-card');
  await waitIdle(page);
  await page.click('[data-ui="menu:skills"]');
  await page.click('[data-action*="plasma_burst"]');
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/03-battle-mid-animation.png` });
  await waitIdle(page);
  check((await canvasVariety(page)) > 20, 'battle scene renders');
  check(await page.locator('.log').innerText().then((t) => t.includes('Plasma Burst')), 'combat log shows the cast');

  // Speed up and let the bot play a long stretch through the real controller + renderer.
  await page.evaluate(() => window.__qf.speed(0));
  let mismatch = null;
  for (let i = 0; i < 400; i++) {
    await page.evaluate(() => window.__qf.botStep());
    if (i % 25 === 0) {
      mismatch = await page.evaluate(() => {
        const s = window.__qf.state;
        const hp = document.querySelector('.bar-hp span')?.textContent ?? '';
        return hp.startsWith(`HP ${s.player.hp} /`) ? null : `HUD "${hp}" vs state hp ${s.player.hp}`;
      });
      if (mismatch) break;
    }
  }
  check(mismatch === null, `HUD stays in sync with game state${mismatch ? ` (${mismatch})` : ''}`);
  const s2 = await page.evaluate(() => window.__qf.state);
  check(s2.player.level > 1 && s2.clearedAreas.length >= 1, `bot progressed via UI (level ${s2.player.level}, cleared ${s2.clearedAreas.join(', ')})`);
  await page.evaluate(() => window.__qf.speed(1));

  // Get into a battle for a screenshot with a monster on stage.
  for (let i = 0; i < 50 && (await page.evaluate(() => window.__qf.state.mode)) !== 'battle'; i++) {
    await page.evaluate(() => window.__qf.botStep());
  }
  await waitIdle(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/04-later-battle.png` });

  // One screenshot per mission backdrop (state is injected via the debug hook; purely visual).
  for (const areaId of ['veridia', 'kethra', 'glacies', 'void_rift']) {
    await page.evaluate(async (areaId) => {
      const qf = window.__qf;
      while (qf.state.mode !== 'town') await qf.botStep();
      return qf.dispatch({ type: 'startQuest', areaId });
    }, areaId);
    await waitIdle(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/area-${areaId}.png` });
    await page.evaluate(() => window.__qf.dispatch({ type: 'flee' }));
    await waitIdle(page);
  }

  // Save / continue.
  const before = await page.evaluate(() => JSON.stringify(window.__qf.state));
  await page.reload();
  await page.waitForSelector('[data-ui="continue"]');
  await page.click('[data-ui="continue"]');
  const after = await page.evaluate(() => JSON.stringify(window.__qf.state));
  check(before === after, 'autosave restores the exact game after a reload');
  await page.close();

  console.log('Mobile layout');
  const mobile = await newPage({ width: 390, height: 844 });
  await mobile.goto('http://127.0.0.1:4199/');
  await mobile.waitForSelector('[data-ui="continue"]').catch(() => {});
  await mobile.click('#start-game');
  await mobile.click('[data-action*="veridia"]');
  await mobile.waitForSelector('.monster-card');
  await waitIdle(mobile);
  await mobile.waitForTimeout(300);
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'no horizontal overflow on a phone-sized screen');
  await mobile.screenshot({ path: `${OUT}/05-mobile-battle.png` });
  await mobile.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await browser.close();
  server.close();
}

check(errors.length === 0, `no console errors${errors.length ? `:\n    ${errors.join('\n    ')}` : ''}`);
console.log(failures ? `\n${failures} e2e check(s) failed` : `\nAll e2e checks passed. Screenshots in ${OUT}/`);
process.exit(failures ? 1 : 0);
