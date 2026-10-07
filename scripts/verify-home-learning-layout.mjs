// Run test-home-learning-ui.mjs --snapshots tmp/home-learning-visual first.
// Browser QA of real mounted components + source modules + compiled global CSS; synthetic data only.
// Setup and optional portable runtime/browser paths: docs/homepage-ui-verification.md.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const runtime = createRequire(resolve(process.env.FLYDO_QA_RUNTIME_PACKAGE || 'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const { chromium } = runtime('playwright');
const directory = resolve(process.argv[2] || 'tmp/home-learning-visual');
const snapshots = readdirSync(directory).filter(f => f.endsWith('.html') && !f.endsWith('-exams.html'));
for (const scenario of ['dark-long-title', 'dark-recent', 'light-anonymous', 'light-complete', 'light-long-title', 'light-new', 'light-no-wrong', 'light-recent']) {
  assert.ok(snapshots.includes(`${scenario}.html`), `Missing snapshot ${scenario}; run node scripts/test-home-learning-ui.mjs --snapshots ${directory} first`);
}
const styles = readdirSync('.next/static/css').filter(f => f.endsWith('.css')).map(f => readFileSync(resolve('.next/static/css', f), 'utf8'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.FLYDO_QA_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const failures = [];
try {
  for (const viewport of [{ width: 320, height: 740 }, { width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 844, height: 390 }]) {
    for (const file of snapshots) {
      const theme = file.startsWith('dark') ? 'dark' : 'light';
      const page = await browser.newPage({ viewport, reducedMotion: 'no-preference', serviceWorkers: 'block' });
      // No requests to real services or CDN assets; use existing local built fonts.
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        const media = url.pathname.split('/media/')[1];
        if (url.hostname === 'localhost' && media && /^[a-zA-Z0-9_.-]+$/.test(media)) return route.fulfill({ body: readFileSync(resolve('.next/static/media', media)) });
        return route.abort();
      });
      await page.setContent(readFileSync(resolve(directory, file), 'utf8'));
      await page.evaluate(theme => {
        document.documentElement.className = theme;
        document.body.style.fontFamily = 'Inter,Arial,sans-serif';
        document.body.style.paddingTop = '72px'; // Same reserved header height as ClientLayout.
        const root = document.getElementById('root');
        root.className = 'vivux-page'; root.setAttribute('data-star-page', 'home');
        root.style.paddingBottom = 'calc(6rem + env(safe-area-inset-bottom))';
      }, theme);
      for (const css of styles) await page.addStyleTag({ content: css.replace(/url\((['"]?)\.\.\/media\//g, 'url($1http://localhost/_next/static/media/') });
      await page.evaluate(() => document.fonts.ready);
      const label = `${file}/${viewport.width}x${viewport.height}`;
      try {
        const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
        assert.ok(size.width <= size.viewport + 1, `${label}: horizontal overflow`);
        const hero = page.locator('section[aria-labelledby="sol-heading"], section[aria-labelledby="luna-heading"]');
        const bounds = await hero.boundingBox();
        assert.ok(bounds.height < (viewport.width < 768 ? 560 : 410), `${label}: hero too tall (${bounds.height}px)`);
        const action = page.locator('#continue-learning a').first();
        const actionBounds = await action.boundingBox();
        assert.ok(actionBounds.y + actionBounds.height < (viewport.height < 500 ? 500 : 550), `${label}: primary action too far below greeting`);
        assert.ok(actionBounds.height >= 44, `${label}: primary action needs a comfortable touch target`);
        const controls = await hero.locator('a,button').all();
        const boxes = [];
        for (const control of controls) {
          const box = await control.boundingBox();
          assert.ok(box && box.width >= 44 && box.height >= 44, `${label}: small hero target`);
          assert.ok(box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width + 1 && box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height + 1, `${label}: clipped hero control`);
          boxes.push({ ...box, name: await control.getAttribute('aria-label') || await control.textContent() });
        }
        for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
          const x = Math.min(boxes[a].x + boxes[a].width, boxes[b].x + boxes[b].width) - Math.max(boxes[a].x, boxes[b].x);
          const y = Math.min(boxes[a].y + boxes[a].height, boxes[b].y + boxes[b].height) - Math.max(boxes[a].y, boxes[b].y);
          assert.ok(x <= 1 || y <= 1, `${label}: overlapping targets ${boxes[a].name} / ${boxes[b].name}`);
        }
        const animations = await hero.evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations === Infinity).length);
        assert.equal(animations, 0, `${label}: static hero must not retain continuous effects`);
        assert.equal(await hero.locator('button').count(), 0, `${label}: remove obsolete effects control`);
        assert.equal(await hero.locator('svg path[stroke-dasharray]').count(), 0, `${label}: remove connecting dashed lines`);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await hero.evaluate(el => el.getAnimations({ subtree: true }).filter(a => a instanceof CSSAnimation).length), 0, `${label}: reduced motion must disable decorative animations`);
        console.log(`PASS ${label}: hero ${Math.round(bounds.height)}px, action ${Math.round(actionBounds.y)}px`);
      } catch (error) { failures.push(error.message); console.error(`FAIL ${error.message}`); }
      await page.screenshot({ path: resolve(directory, `${file.slice(0, -5)}-${viewport.width}.png`), fullPage: true });
      await page.close();
    }
  }
} finally { await browser.close(); }
assert.deepEqual(failures, [], 'Homepage layout failures');
