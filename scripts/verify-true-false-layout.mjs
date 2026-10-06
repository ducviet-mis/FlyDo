// Visual QA of actual mounted DOM exported by component tests, never live user data.
// Run the two TF UI tests with --snapshots tmp/scoring-visuals, build, start locally.
// Requires the existing bundled Playwright runtime and installed Chrome; no installs.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const runtime = createRequire('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = runtime('playwright');
const directory = resolve(process.argv[2] || 'tmp/scoring-visuals');
const base = process.argv[3] || 'http://localhost:3514';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname), 'Local preview only');
const styles = readdirSync('.next/static/css').filter(f=>f.endsWith('.css'))
  .map(f=>readFileSync(resolve('.next/static/css',f),'utf8').replace(/url\((['"]?)\.\.\/media\//g,'url($1/_next/static/media/'));
const browser = await chromium.launch({ headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [375,1280]) for (const theme of ['light','dark']) {
    const page = await browser.newPage({ viewport:{width,height:900}, reducedMotion:'reduce', serviceWorkers:'block' });
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!==new URL(base).origin) return route.abort();
      if(url.pathname==='/__flydo_visual_preview__') return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body></body></html>'});
      return route.continue();
    });
    // A script-free same-origin document prevents pending Next hydration from
    // replacing a static fixture after the screenshot checks begin.
    await page.goto(`${base}/__flydo_visual_preview__`,{waitUntil:'domcontentloaded'});
    for (const name of ['mock-exam-scoring','mock-exam-create','room-partial-2-of-4','result-weighted-statements']) {
      await page.setContent(readFileSync(resolve(directory,`${name}.html`),'utf8'));
      await page.evaluate(theme=>{
        document.documentElement.className=theme;
        document.body.style.fontFamily='Inter,Arial,sans-serif';
        const root=document.getElementById('root');
        if(root && !root.closest('main')) { const main=document.createElement('main');main.id='main-content';main.dataset.starPage='mock-exams';root.replaceWith(main);main.append(root); }
      },theme);
      for(const css of styles) await page.addStyleTag({content:css});
      await page.evaluate(()=>document.fonts.ready);
      if(name==='mock-exam-scoring') {
        assert.equal(await page.locator('#scoring-panel-title').count(),1,'Scoring panel, not a redirect/offline screen');
        for(const field of await page.locator('input[id^="scoring-override-"]').all()) {
          assert.ok((await field.boundingBox()).width>=120,'Per-question point input must remain readable on mobile');
        }
      }
      if(name==='mock-exam-create') assert.equal(await page.locator('#exam-create-points-true_false').count(),1,'Creation form must remain mounted');
      const overflow=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,width:document.documentElement.scrollWidth}));
      assert.ok(overflow.width<=overflow.viewport+1,`${name}/${theme}/${width} horizontal overflow: ${JSON.stringify(overflow)}`);
      const colors=await page.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.body).color}));
      assert.notEqual(colors.background,colors.text,'Theme contrast tokens must differ');
      if(name==='room-partial-2-of-4') {
        assert.equal(await page.locator('input[type=radio]').count(),8);
        assert.equal(await page.locator('input[type=radio]:checked').count(),2);
        await page.locator('input[type=radio]').first().focus();
        assert.equal(await page.locator('input[type=radio]').first().evaluate(el=>el===document.activeElement),true);
      }
      await page.screenshot({path:resolve(directory,`${name}-${theme}-${width}.png`),fullPage:true});
      console.log(`PASS visual layout ${name}: ${theme}, ${width}px, no horizontal overflow`);
    }
    await page.close();
  }
} finally { await browser.close(); }
