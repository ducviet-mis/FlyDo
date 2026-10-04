// Actual Analytics SDK and FlyDo component, with only Next router hooks supplied.
// No external script is fetched and no live analytics event is sent.
// Reuses the UI test runtime documented in docs/admin-ui-verification.md.
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Module, createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';

const repo = resolve(process.cwd());
const require = createRequire(join(repo, 'package.json'));
const ts = require('typescript');
const React = require('react');
const dom = new jsdom.JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'https://flydovn.vercel.app/home',
});
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require('react-dom/client');
let pathname = '/home';
let params = {};
let searchParams = new URLSearchParams('student%40example.test=home');
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'next/navigation.js' || name === 'next/navigation') return {
    useParams: () => params, usePathname: () => pathname,
    useSearchParams: () => searchParams,
  };
  return originalLoad.call(this, name, ...args);
};
const modules = new Map();
function load(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(dirname(filename));
  const nativeRequire = mod.require.bind(mod);
  mod.require = (name) => {
    if (name.startsWith('@/') || name.startsWith('.')) {
      let target = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      if (!existsSync(target)) target += existsSync(target + '.ts') ? '.ts' : '.tsx';
      return load(target);
    }
    return nativeRequire(name);
  };
  modules.set(filename, mod);
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}

const root = createRoot(document.getElementById('root'));
try {
  const { SiteAnalytics } = load(resolve(repo, 'src/components/analytics/site-analytics.tsx'));
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(SiteAnalytics))));
  const scripts = document.head.querySelectorAll('script[data-sdkn="@vercel/analytics/next"]');
  assert.equal(scripts.length, 1, 'One Next.js analytics script, including under Strict Mode');
  assert.equal(scripts[0].dataset.disableAutoTrack, '1', 'Use router pageviews without duplicate auto-tracking');
  assert.equal(scripts[0].defer, true);
  assert.equal(document.getElementById('root').childElementCount, 0, 'Analytics adds no visible UI');
  const filters = window.vaq.filter(([type]) => type === 'beforeSend');
  assert.ok(filters.length > 0, 'Privacy filter is registered with the actual SDK');
  const filter = filters.at(-1)[1];
  assert.deepEqual(filter({ type: 'pageview', url: 'https://flydovn.vercel.app/home?email=student%40example.test#secret' }), {
    type: 'pageview', url: 'https://flydovn.vercel.app/home',
  });
  assert.equal(filter({ type: 'pageview', url: 'https://flydovn.vercel.app/auth/callback?code=secret' }), null);
  assert.ok(window.vaq.some(([type, payload]) => type === 'pageview' && payload.path === '/home'));
  assert.deepEqual(window.vaq.filter(([type]) => type === 'pageview').at(-1)[1], {
    route: '/home', path: '/home',
  }, 'Query names must never enter separately collected route metadata');
  const initialViews = window.vaq.filter(([type]) => type === 'pageview').length;
  pathname = '/practice';
  searchParams = new URLSearchParams('grade=8');
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(SiteAnalytics))));
  assert.equal(window.vaq.filter(([type]) => type === 'pageview').length, initialViews + 1, 'One pageview per client navigation');
  assert.deepEqual(window.vaq.filter(([type]) => type === 'pageview').at(-1)[1], { route: '/practice', path: '/practice' });
  pathname = '/practice/lesson-8';
  params = { lessonId: 'lesson-8', optional: undefined };
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(SiteAnalytics))));
  assert.deepEqual(window.vaq.filter(([type]) => type === 'pageview').at(-1)[1], {
    route: '/practice/[lessonId]', path: '/practice/lesson-8',
  }, 'Dynamic pages retain route grouping using only filesystem-defined parameters');
  const viewsBeforeQueryChange = window.vaq.filter(([type]) => type === 'pageview').length;
  searchParams = new URLSearchParams('email=another%40example.test&token=secret');
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(SiteAnalytics))));
  assert.equal(window.vaq.filter(([type]) => type === 'pageview').length, viewsBeforeQueryChange, 'Changing a query cannot fabricate route labels or duplicate a pageview');
  assert.equal(document.head.querySelectorAll('script[data-sdkn="@vercel/analytics/next"]').length, 1);
  console.log('PASS: actual SDK mounted once, no visible UI, registered privacy filter, safe static/dynamic route metadata and one pageview per navigation.');
} finally {
  await React.act(async () => root.unmount());
  Module._load = originalLoad;
  dom.window.close();
}
