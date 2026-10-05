// Visual integration check against a local production server only.
// Uses an existing Playwright installation and a fresh, signed-out Chrome context.
// Set FLYDO_BROWSER_MODULES to its node_modules directory if not installed locally.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const runtimeRequire = createRequire(resolve(process.env.FLYDO_BROWSER_MODULES || 'node_modules', '../package.json'));
const { chromium } = runtimeRequire('playwright');
const base = new URL(process.env.FLYDO_LAYOUT_TEST_URL || 'http://localhost:3503');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a local test server only');
const output = resolve('tmp/footer-layout');
mkdirSync(output, { recursive: true });
let browser;
test.before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
test.after(async () => { await browser?.close(); });

const viewports = [
  { name: 'desktop', width: 1440, height: 900, maxFooterHeight: 160 },
  { name: 'phone', width: 375, height: 812, maxFooterHeight: 220 },
  { name: 'landscape', width: 844, height: 390, maxFooterHeight: 180 },
];
for (const theme of ['light', 'dark']) {
  for (const viewport of viewports) {
    // Catches a return to stacked policy columns, clipped links, cramped targets
    // or the wrong theme. Measures rendered UI, not Tailwind class strings.
    test(`the ${theme} footer stays compact and operable on ${viewport.name}`, async () => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme, reducedMotion: 'reduce',
      });
      try {
        await context.route('**/*', (route) => {
          if (new URL(route.request().url()).origin === base.origin) return route.continue();
          return route.abort(); // No live auth, analytics or database requests.
        });
        await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(new URL('/terms', base).href, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const footer = page.locator('footer');
        await footer.waitFor({ state: 'visible' });
        await footer.scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(output, `${theme}-${viewport.name}.png`) });
        await footer.screenshot({ path: resolve(output, `${theme}-${viewport.name}-footer.png`) });
        const layout = await footer.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const links = [...element.querySelectorAll('a')].map((link) => {
            const rect = link.getBoundingClientRect();
            return { href: link.getAttribute('href'), name: link.getAttribute('aria-label') || link.textContent.trim(),
              width: rect.width, height: rect.height, left: rect.left, right: rect.right };
          });
          return { height: bounds.height, viewportWidth: window.innerWidth,
            pageWidth: document.documentElement.scrollWidth, theme: document.documentElement.className, links };
        });
        console.log(`${theme}/${viewport.name}: footer ${Math.round(layout.height)}px`);
        assert.equal(errors.length, 0, errors.join('\n'));
        assert.ok(layout.theme.split(' ').includes(theme), 'Check the requested theme, not its default');
        assert.ok(layout.height <= viewport.maxFooterHeight,
          `Footer is ${Math.round(layout.height)}px; expected at most ${viewport.maxFooterHeight}px`);
        assert.ok(layout.pageWidth <= layout.viewportWidth, 'Page must not scroll horizontally');
        for (const href of ['/home', '/terms', '/privacy', '/payment-policy', '/support', 'mailto:supports@flydovn.com']) {
          const link = layout.links.find((item) => item.href === href);
          assert.ok(link?.name, `Missing or unnamed ${href}`);
          assert.ok(link.width >= 44 && link.height >= 44, `Small touch target ${href}`);
          assert.ok(link.left >= 0 && link.right <= layout.viewportWidth, `Clipped ${href}`);
        }
        // Keyboard users must be able to reach the policy directly in the footer.
        await footer.locator('a[href="/privacy"]').focus();
        await page.keyboard.press('Enter');
        await page.waitForURL(new URL('/privacy', base).href);
        assert.equal(await page.locator('h1').textContent(), 'Chính sách bảo mật');
      } finally { await context.close(); }
    });
  }
}
