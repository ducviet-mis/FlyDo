// Runs real layout components with isolated auth/navigation boundaries.
// No live account, payment or database requests are made.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';

const repo = resolve(process.cwd());
const require = createRequire(resolve(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3500/home', pretendToBeVisual: true,
});
for (const key of ['window', 'self', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
let pathname = '/home';
let initialized = true;
const redirects = [];
const router = { replace: (path) => redirects.push(path) };
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  cache.set(filename, mod);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = (name) => {
    if (name === 'next/navigation') return {
      useRouter: () => router, usePathname: () => pathname,
    };
    if (name === '@/features/auth/stores/auth-store') return {
      useAuthStore: (selector) => selector({ user: null, initialized }),
    };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.tsx', '.ts'].map((suffix) => base + suffix).find(existsSync);
      if (path) return load(path);
    }
    return require(name);
  };
  const ts = require('typescript');
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}
const { AuthGuard } = load(resolve(repo, 'src/components/layout/auth-guard.tsx'));
const { Footer } = load(resolve(repo, 'src/components/layout/footer.tsx'));
const container = document.getElementById('root');
const policyRoutes = ['/terms', '/privacy', '/payment-policy', '/support'];

// Catches an omitted public route, including an auth-loading flash on legal pages.
for (const route of policyRoutes) {
  test(`a signed-out visitor can read ${route} before and after auth initialization`, async () => {
    pathname = route;
    redirects.length = 0;
    const root = createRoot(container);
    try {
      for (const ready of [false, true]) {
        initialized = ready;
        await React.act(async () => root.render(React.createElement(AuthGuard, null,
          React.createElement('article', { 'aria-label': 'Policy content' }, 'Public policy'),
        )));
        assert.equal(container.querySelector('article')?.textContent, 'Public policy');
        assert.deepEqual(redirects, [], 'Policy pages must not redirect to login');
      }
    } finally { await React.act(async () => root.unmount()); }
  });
}

test('making legal pages public does not expose private routes or lookalike subpaths', async () => {
  initialized = true;
  for (const route of ['/profile', '/admin/gift-codes', '/practice/lesson-8', '/privacy/private', '/support-admin']) {
    pathname = route;
    redirects.length = 0;
    const root = createRoot(container);
    try {
      await React.act(async () => root.render(React.createElement(AuthGuard, null,
        React.createElement('article', null, 'Private content'),
      )));
      assert.equal(container.querySelector('article'), null, route);
      assert.deepEqual(redirects, ['/login'], route);
    } finally { await React.act(async () => root.unmount()); }
  }
});

// Catches missing/dead footer destinations and a non-operable support address.
test('the footer exposes all policy destinations and an email support action', async () => {
  const root = createRoot(container);
  try {
    await React.act(async () => root.render(React.createElement(Footer)));
    const footer = container.querySelector('footer');
    for (const href of policyRoutes) {
      const link = footer.querySelector(`a[href="${href}"]`);
      assert.ok(link, `Missing footer destination ${href}`);
      assert.ok(link.textContent.trim(), `Unnamed footer link ${href}`);
    }
    assert.ok(footer.querySelector('a[href="mailto:supports@flydovn.com"]'));
    assert.equal(footer.querySelector('a[target="_blank"]'), null, 'Policy links should stay in the current tab');
  } finally { await React.act(async () => root.unmount()); }
});

// Catches mismatched page/metadata, broken section anchors and a tall expanded
// contents panel that pushes the actual policy out of view on small screens.
test('each policy route renders readable content with a working, initially compact contents panel', () => {
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const route of policyRoutes) {
    const page = load(resolve(repo, `src/app${route}/page.tsx`));
    const parsed = new jsdom.JSDOM(renderToStaticMarkup(React.createElement(page.default)));
    try {
      const pageDocument = parsed.window.document;
      const title = pageDocument.querySelector('h1')?.textContent;
      assert.ok(title, route);
      assert.equal(pageDocument.querySelectorAll('h1').length, 1, route);
      assert.ok(page.metadata.title.includes(title), route);
      assert.ok(pageDocument.querySelector('article')?.textContent.length > 500, route);
      assert.equal(pageDocument.querySelector('details').open, false, 'Keep the contents panel compact by default');
      assert.equal(pageDocument.querySelectorAll('a[aria-current="page"]').length, 1, route);
      assert.equal(pageDocument.querySelector('a[aria-current="page"]').getAttribute('href'), route);
      for (const anchor of pageDocument.querySelectorAll('a[href^="#"]')) {
        const target = pageDocument.getElementById(anchor.getAttribute('href').slice(1));
        assert.ok(target, `Broken section link ${route}${anchor.getAttribute('href')}`);
      }
      for (const section of pageDocument.querySelectorAll('article section')) {
        const heading = pageDocument.getElementById(section.getAttribute('aria-labelledby'));
        assert.equal(heading?.tagName, 'H2', route);
        assert.equal(heading.closest('section'), section, route);
      }
      assert.ok(pageDocument.querySelector('a[href="mailto:supports@flydovn.com"]'), route);
    } finally { parsed.window.close(); }
  }
});

test.after(() => dom.window.close());
