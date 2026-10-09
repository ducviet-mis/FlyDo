// Static fixtures from the real mounted ADMIN components; no live authentication or DB.
// First run each ADMIN UI test with --snapshots tmp/direct-import-visuals, then build.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const runtime = createRequire('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = runtime('playwright');
const directory = resolve(process.argv[2] || 'tmp/direct-import-visuals');
const styles = readdirSync('.next/static/css').filter(file => file.endsWith('.css'))
  .map(file => readFileSync(resolve('.next/static/css', file), 'utf8'));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [375, 812, 1280]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width, height: width === 812 ? 375 : 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await page.route('**/*', route => route.abort());
    for (const name of ['exam-direct-import', 'mock-exam-scoring']) {
      await page.setContent(readFileSync(resolve(directory, `${name}.html`), 'utf8'));
      await page.evaluate(theme => {
        document.documentElement.className = theme;
        document.body.style.fontFamily = 'Inter,Arial,sans-serif';
      }, theme);
      for (const css of styles) await page.addStyleTag({ content: css });
      const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, width: document.documentElement.scrollWidth }));
      assert.ok(dimensions.width <= dimensions.viewport + 1, `${name}/${theme}/${width}: horizontal overflow ${JSON.stringify(dimensions)}`);
      const action = page.getByRole('button', { name: name === 'exam-direct-import' ? 'Nhập và đưa đề vào sử dụng' : 'Lưu cấu trúc điểm', exact: true });
      assert.equal(await action.count(), 1);
      const box = await action.boundingBox();
      assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1, 'Primary action must fit and remain touch-friendly');
      assert.equal(await page.getByRole('button', { name: 'Đưa vào sử dụng', exact: true }).count(), 0, 'No second publication action');
      await page.screenshot({ path: resolve(directory, `${name}-${theme}-${width}.png`), fullPage: true });
      console.log(`PASS ${name}: ${theme}, ${width}px, no horizontal overflow, primary action >=44px`);
    }
    await page.close();
  }
} finally { await browser.close(); }
