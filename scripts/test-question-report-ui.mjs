// Browser-like integration test of the real reporting dialog; no live account/API.
// Prepare: npm install --prefix tmp/question-report-db-test --no-save --package-lock=false @electric-sql/pglite@0.3.14 jsdom@26.1.0
// Run from repository root: node scripts/test-question-report-ui.mjs
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';

const repo = resolve(process.cwd());
const { JSDOM } = jsdom;
const require = createRequire(resolve(repo, 'package.json'));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:3500', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DocumentFragment']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
let user = { id: 'student-1' };
let rpcCalls = 0;
let lastPayload;
let resolveRpc;
const auth = Object.assign((selector) => selector({ user }), { getState: () => ({ user }) });
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  cache.set(filename, mod);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = (name) => {
    if (name === 'next/link') return { __esModule: true, default: (props) => React.createElement('a', props) };
    if (name === '@/features/auth/stores/auth-store') return { useAuthStore: auth };
    if (name === '@/lib/supabase/client') return { getSupabaseClient: () => ({ rpc: (_name, payload) => { rpcCalls++; lastPayload = payload; return new Promise((done) => { resolveRpc = done; }); } }) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.tsx', '.ts'].map((suffix) => base + suffix).find(existsSync);
      if (path) return load(path);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const { ReportQuestionButton } = load(resolve(repo, 'src/features/question-reports/report-question-button.tsx'));
const root = createRoot(document.getElementById('root'));
async function render(id = 'q1') { await React.act(async () => root.render(React.createElement(ReportQuestionButton, { key: id, source: 'practice', questionId: id }))); }
async function click(element) { assert.ok(element); await React.act(async () => element.click()); }
async function submit() { await React.act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }
await render();
await click(document.querySelector('[aria-label="Báo lỗi câu hỏi"]'));
assert.equal(document.querySelectorAll('[type="radio"]').length, 6);
await click(document.querySelector('[value="other"]'));
await submit();
assert.match(document.querySelector('[role="alert"]').textContent, /mô tả/);
assert.equal(rpcCalls, 0);
await React.act(async () => {
  const textarea = document.querySelector('textarea');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Công thức bị lỗi hiển thị');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
});
await submit(); await submit();
assert.equal(rpcCalls, 1);
assert.equal(lastPayload.p_details, 'Công thức bị lỗi hiển thị');
await React.act(async () => resolveRpc({ error: { code: 'PGRST202' } }));
assert.match(document.querySelector('[role="alert"]').textContent, /question-reports.sql/);
assert.equal(document.querySelector('textarea').value, 'Công thức bị lỗi hiển thị');
await submit();
await React.act(async () => resolveRpc({ data: 'report-id', error: null }));
assert.match(document.querySelector('[role="status"]').textContent, /Đã tiếp nhận/);
await render('q2');
await click(document.querySelector('[aria-label="Báo lỗi câu hỏi"]'));
assert.equal(document.querySelectorAll('[type="radio"]').length, 6);
assert.equal(document.querySelector('textarea').value, '');
user = null;
await render('q3');
await click(document.querySelector('[aria-label="Báo lỗi câu hỏi"]'));
assert.equal(document.querySelector('a[href="/login"]').textContent, 'Đăng nhập');
assert.equal(document.querySelector('form'), null);
await React.act(async () => root.unmount());
dom.window.close();
console.log('PASS: real dialog controls, 6 reasons, required details, duplicate submit lock, missing SQL feedback, draft retained on error, successful submit, new-question reset, login prompt.');
