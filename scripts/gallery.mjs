/**
 * Screenshots the figure gallery (every officer kit and hostile) to
 * test-results/gallery.png. Run after changing src/render/sprites.
 *
 *   npm run gallery                        (builds first; everything)
 *   npm run gallery -- hostiles 2.5        (one group, clock frozen at 2.5 s)
 *   npm run gallery -- all 1.3 0.4         (everyone mid-attack)
 */
import { OUT, openBrowser } from './browser.mjs';

const browser = await openBrowser();
const page = await browser.newPage({ width: 2100, height: 1400 });
const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : '';
const t = process.argv[3] ?? '1.3';
const attack = process.argv[4] ?? '0';
await page.goto(browser.url(`gallery.html?t=${t}&attack=${attack}${only ? `&only=${only}` : ''}`));
await page.waitForFunction(() => window.galleryReady === true);
const name = `${OUT}/gallery${only ? `-${only}` : ''}${attack !== '0' ? '-attack' : ''}.png`;
await page.locator('#gallery').screenshot({ path: name });
await browser.close();
if (browser.errors.length) { console.error(browser.errors.join('\n')); process.exit(1); }
console.log(`Wrote ${name}`);
