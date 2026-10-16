/**
 * Shared set-up for the browser scripts (e2e, gallery, scene): serves dist/ on a free port and opens
 * headless Chromium. Every page it opens records console errors and page errors in `errors`.
 *
 *   const b = await openBrowser();
 *   const page = await b.newPage({ width: 1280, height: 720 });
 *   await page.goto(b.url('editor.html'));
 *   …
 *   await b.close();   // then check b.errors
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

export const OUT = 'test-results';

export async function openBrowser() {
  await mkdir(OUT, { recursive: true });
  const server = await serve('dist', 0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];
  return {
    errors,
    /** A page URL on the local server (`''` = the game). */
    url: (path = '') => base + path,
    /** A new page with this viewport, reporting its errors. */
    async newPage(viewport) {
      const page = await browser.newPage({ viewport });
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      return page;
    },
    async close() {
      await browser.close();
      server.close();
    },
  };
}
