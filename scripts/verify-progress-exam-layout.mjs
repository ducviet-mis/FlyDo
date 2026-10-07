// Real rendered DOM from the component tests; local CSS/fonts only, no live data.
// Setup: docs/homepage-ui-verification.md, then export both home and catalog snapshots.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const runtime = createRequire(resolve(process.env.FLYDO_QA_RUNTIME_PACKAGE || 'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const { chromium } = runtime('playwright');
const directory = resolve(process.argv[2] || 'tmp/progress-exam-visual');
const scenarios = ['light-recent', 'dark-recent', 'light-progress-all', 'dark-progress-all', 'light-exams', 'dark-exams'];
const styles = readdirSync('.next/static/css').filter(f => f.endsWith('.css')).map(f => readFileSync(resolve('.next/static/css', f), 'utf8'));
assert.ok(styles.length, 'Build the project before checking layout');
const browser = await chromium.launch({ headless: true, executablePath: process.env.FLYDO_QA_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const failures = [];
try {
  for (const viewport of [{ width: 320, height: 740 }, { width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }, { width: 844, height: 390 }]) {
    for (const scenario of scenarios) {
      const page = await browser.newPage({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
      try {
        await page.route('**/*', async route => {
          const url = new URL(route.request().url());
          const media = url.pathname.split('/media/')[1];
          if (url.hostname === 'localhost' && media && /^[a-zA-Z0-9_.-]+$/.test(media)) return route.fulfill({ body: readFileSync(resolve('.next/static/media', media)) });
          return route.abort();
        });
        await page.setContent(readFileSync(resolve(directory, `${scenario}.html`), 'utf8'));
        await page.evaluate(({ theme, exams }) => {
          document.documentElement.className = theme;
          document.body.style.fontFamily = 'Inter,Arial,sans-serif';
          document.body.style.paddingTop = '72px';
          const root = document.getElementById('root');
          root.className = 'vivux-page'; root.dataset.starPage = exams ? 'mock-exams' : 'home';
          root.style.paddingBottom = 'calc(6rem + env(safe-area-inset-bottom))';
        }, { theme: scenario.startsWith('dark') ? 'dark' : 'light', exams: scenario.endsWith('exams') });
        for (const css of styles) await page.addStyleTag({ content: css.replace(/url\((['"]?)\.\.\/media\//g, 'url($1http://localhost/_next/static/media/') });
        await page.evaluate(() => document.fonts.ready);
        const label = `${scenario}/${viewport.width}x${viewport.height}`;
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `${label}: horizontal overflow ${overflow}px`);
        if (scenario.endsWith('exams')) {
          assert.equal(await page.locator('article').count(), 3);
          for (const article of await page.locator('article').all()) {
            const box = await article.boundingBox();
            const controls = [];
            for (const control of await article.locator('a,button').all()) {
              const rect = await control.boundingBox();
              assert.ok(rect.width >= 44 && rect.height >= 44, `${label}: small exam action`);
              assert.ok(rect.x >= box.x && rect.x + rect.width <= box.x + box.width + 1, `${label}: clipped action`);
              controls.push(rect);
            }
            for (let a = 0; a < controls.length; a++) for (let b = a + 1; b < controls.length; b++) {
              const x = Math.min(controls[a].x + controls[a].width, controls[b].x + controls[b].width) - Math.max(controls[a].x, controls[b].x);
              const y = Math.min(controls[a].y + controls[a].height, controls[b].y + controls[b].height) - Math.max(controls[a].y, controls[b].y);
              assert.ok(x <= 1 || y <= 1, `${label}: overlapping exam actions`);
            }
            assert.ok(await article.locator('h3').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${label}: clipped title`);
          }
          assert.ok(await page.locator('[aria-label^="Lịch sử 3 lần thi"]').isVisible());
        } else {
          const stats = page.locator('[data-vivux-card]').filter({ has: page.getByRole('heading', { name: 'Kết quả học tập', exact: true }) });
          const values = await stats.locator('dl').boundingBox();
          const chart = await stats.locator('[role="img"]').boundingBox();
          assert.ok(chart.y >= values.y + values.height, `${label}: chart competes with primary numbers`);
          for (const tab of await stats.getByRole('tab').all()) {
            const box = await tab.boundingBox();
            assert.ok(box.width >= 44 && box.height >= 44, `${label}: small period filter`);
            assert.ok(await tab.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1), `${label}: clipped period label`);
          }
          const today = page.locator('[data-vivux-card]').filter({ has: page.getByRole('heading', { name: 'Hôm nay của bạn', exact: true }) });
          for (const cell of await today.locator('dl > div').all()) assert.ok(await cell.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${label}: clipped daily metric`);
        }
        // 125% root text size is an extra text-reflow check, not a physical-device claim.
        await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${label}: overflow with enlarged text`);
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
        await page.screenshot({ path: resolve(directory, `${scenario}-${viewport.width}-progress.png`), fullPage: true });
        console.log(`PASS ${label}: readable values, labels and actions`);
      } catch (error) { failures.push(`${scenario}/${viewport.width}: ${error.message}`); }
      finally { await page.close(); }
    }
  }
} finally { await browser.close(); }
assert.deepEqual(failures, [], 'Progress/exam layout failures');
