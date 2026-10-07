// Visual QA of real mounted component snapshots using fake accounts, never live data.
// Export snapshots with test-device-link-{auth,account}-ui.mjs --snapshots <dir>,
// build and start locally, then run this script. Uses the existing bundled runtime.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const runtime = createRequire('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = runtime('playwright');
const directory = resolve(process.argv[2] || 'tmp/device-link-visual');
const base = process.argv[3] || 'http://localhost:3514';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local preview only');
const styles = readdirSync('.next/static/css').filter(f => f.endsWith('.css')).map(f =>
  readFileSync(resolve('.next/static/css', f), 'utf8').replace(/url\((['"]?)\.\.\/media\//g, 'url($1/_next/static/media/'));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [375, 1280]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname === '/__flydo_visual_preview__') return route.fulfill({ contentType: 'text/html', body: '<html><head></head><body></body></html>' });
      return route.continue();
    });
    await page.goto(`${base}/__flydo_visual_preview__`, { waitUntil: 'domcontentloaded' });
    for (const section of ['account', 'login']) for (const file of readdirSync(resolve(directory, section)).filter(f => f.endsWith('.html'))) {
      await page.setContent(readFileSync(resolve(directory, section, file), 'utf8'));
      await page.evaluate(({ theme, section }) => {
        document.documentElement.className = theme;
        document.body.style.fontFamily = 'Inter,Arial,sans-serif';
        const root = document.getElementById('root');
        if (root) {
          root.style.maxWidth = section === 'login' ? '448px' : '744px';
          root.style.margin = '24px auto';
          root.style.padding = '0 16px';
        }
      }, { theme, section });
      for (const css of styles) await page.addStyleTag({ content: css });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
      assert.ok(overflow.width <= overflow.viewport + 1, `${section}/${file}/${theme}/${width}: horizontal overflow`);
      for (const input of await page.locator('input[type=text],input:not([type])').all()) {
        const bounds = await input.boundingBox();
        if (bounds) assert.ok(bounds.width >= 120, `${file}: code/email field too narrow`);
      }
      const dialog = page.locator('[role=alertdialog]');
      if (await dialog.count()) {
        const bounds = await dialog.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'Dialog must fit mobile');
      }
      await page.screenshot({ path: resolve(directory, section, `${file.slice(0, -5)}-${theme}-${width}.png`), fullPage: true });
      console.log(`PASS layout ${section}/${file}: ${theme}, ${width}px`);
    }
    await page.close();
  }
} finally { await browser.close(); }
