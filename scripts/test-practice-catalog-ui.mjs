// Isolated component checks; no real Supabase writes, login or progress deletion.
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';

const repo = resolve(process.cwd());
const require = createRequire(resolve(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/practice?grade=8', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DocumentFragment']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
const routes = [];
const confirmations = [];
window.confirm = message => { confirmations.push(message); return false; };
const state = {
  loading: false,
  grades: [{ id: 8, label: 'Lớp 8', chapters: [
    { id: 'poly', title: 'ĐA THỨC', lessons: [{ id: 'mono', title: 'BÀI 1 - ĐƠN THỨC' }, { id: 'multi', title: 'BÀI 2 - ĐA THỨC' }] },
    { id: 'geometry', title: 'TỨ GIÁC', lessons: [{ id: 'quad', title: 'BÀI 10 - TỨ GIÁC' }, { id: 'empty', title: 'BÀI 11 - HÌNH THANG' }] },
    { id: 'no-lessons', title: 'DỮ LIỆU', lessons: [] },
  ] }, { id: 9, label: 'Lớp 9', chapters: [] }],
  progress: { mono: { answered: 30, total: 90 }, mono_1: { answered: 30, total: 30 }, mono_2: { answered: 0, total: 30 }, mono_3: { answered: 0, total: 30 }, multi: { answered: 0, total: 30 }, multi_4: { answered: 0, total: 30 }, quad: { answered: 0, total: 30 }, quad_2: { answered: 0, total: 30 }, empty: { answered: 0, total: 0 } },
  wrongCounts: { mono_1: 20 }, savedCounts: { mono_1: 4 },
};
let params = new URLSearchParams('grade=8');
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  cache.set(filename, mod);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = name => {
    if (name === '@/features/practice/hooks/use-practice-data') return { usePracticeData: () => state };
    if (name === '@/features/auth/stores/auth-store') return { useAuthStore: () => ({ user: { id: 'test-student' } }) };
    if (name === '@/lib/supabase/client') return { getSupabaseClient: () => { throw new Error('Browsing/canceling reset must never write to the database'); } };
    if (name === 'next/navigation') return { useSearchParams: () => params, useRouter: () => ({ push: route => routes.push(route), refresh() {} }) };
    if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.tsx', '.ts'].map(suffix => base + suffix).find(existsSync);
      if (path) return load(path);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const Page = load(resolve(repo, 'src/app/practice/page.tsx')).default;
const root = createRoot(document.getElementById('root'));
const render = async () => { await React.act(async () => root.render(React.createElement(Page))); };
const click = async node => { assert.ok(node, 'Missing clickable element'); await React.act(async () => node.click()); };
const byText = (value, scope = document) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === value);
const input = async (node, value) => {
  assert.ok(node, 'Missing input');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const headings = () => [...document.querySelectorAll('h3')].map(node => node.textContent);
await render();
assert.equal(document.querySelector('h1').textContent, 'Toán Lớp 8');
assert.deepEqual(headings(), ['BÀI 1 - ĐƠN THỨC', 'BÀI 2 - ĐA THỨC']);
assert.equal(document.querySelector('[aria-current="page"]').getAttribute('href'), '/practice?grade=8');
assert.equal(document.querySelector('a[href="/practice/wrong"]').textContent, 'Ôn câu sai');
assert.equal(document.querySelectorAll('h4').length, 4, 'Level 4 remains available when its questions exist');
const first = document.querySelector('section[aria-labelledby="lesson-mono"]');
assert.equal(first.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '30');
assert.ok(first.textContent.includes('33%'));
for (const label of ['Thi lại câu sai (20)', 'Câu hỏi đã lưu (4)']) {
  const control = first.querySelector(`[aria-label="${label}"]`);
  assert.ok(control.querySelector('span[aria-hidden="true"]'), 'Count badge remains above the icon');
  await click(control);
}
await click(byText('Luyện tập', first));
assert.deepEqual(routes, ['/practice/wrong/mono?level=1', '/practice/saved/mono?level=1', '/practice/mono?level=1']);
await click(document.querySelector('[aria-label="Thi lại câu sai (0)"]'));
await click(document.querySelector('[aria-label="Câu hỏi đã lưu (0)"]'));
assert.equal(routes.length, 3, 'Empty tools must not navigate');
await click(first.querySelector('[aria-label="Xóa tiến độ Level này"]'));
assert.deepEqual(confirmations, ['Xóa toàn bộ tiến độ Level 1 của bài này?']);
await click(document.querySelector('[aria-disabled="true"][aria-label="Xóa tiến độ Level này"]'));
assert.equal(confirmations.length, 1);

await input(document.getElementById('practice-search'), 'DON THUC');
assert.deepEqual(headings(), ['BÀI 1 - ĐƠN THỨC']);
await input(document.getElementById('practice-search'), 'da thuc');
assert.deepEqual(headings(), ['BÀI 2 - ĐA THỨC']);
assert.equal(document.querySelector('section > div > div > span').textContent, '02', 'Searching must not renumber lessons');
await input(document.getElementById('practice-search'), 'khong-co-bai');
assert.ok(document.querySelector('[role="status"]').textContent.includes('Không tìm thấy bài phù hợp'));
await click(byText('Hiện tất cả bài trong chương'));
assert.equal(headings().length, 2);
await click(document.querySelector('nav[aria-label="Chương học"] button[aria-pressed="false"]'));
assert.equal(document.querySelector('h2').textContent, 'TỨ GIÁC');
assert.equal(document.getElementById('practice-search').value, '');
assert.ok(document.body.textContent.includes('Bài này chưa có câu hỏi để luyện tập.'));
assert.equal(document.querySelectorAll('h4').length, 1);
assert.equal(byText('Trộn câu theo tỉ lệ'), undefined, 'Single-level lessons do not offer mixing');
const chapterSelect = document.getElementById('practice-chapter');
await React.act(async () => { chapterSelect.value = 'no-lessons'; chapterSelect.dispatchEvent(new Event('change', { bubbles: true })); });
assert.ok(document.querySelector('[role="status"]').textContent.includes('Chương này chưa có bài học'));
await React.act(async () => { chapterSelect.value = 'poly'; chapterSelect.dispatchEvent(new Event('change', { bubbles: true })); });

await click(byText('Trộn câu theo tỉ lệ'));
let dialog = document.querySelector('[role="dialog"]');
assert.ok(dialog);
const countLabel = [...dialog.querySelectorAll('label')].find(node => node.textContent === 'Tổng số câu muốn làm');
assert.equal(document.getElementById(countLabel.htmlFor).value, '20');
for (const label of dialog.querySelectorAll('label')) assert.ok(document.getElementById(label.htmlFor), 'Every input has an associated label');
const levelLabel = [...dialog.querySelectorAll('label')].find(node => node.textContent === 'Level 1 (Nhận biết)');
await input(document.getElementById(levelLabel.htmlFor), '50');
assert.ok(byText('Bắt đầu làm bài', dialog).disabled);
assert.ok(dialog.textContent.includes('Tổng: 110%'));
await input(document.getElementById(levelLabel.htmlFor), '40');
await input(document.getElementById(countLabel.htmlFor), '0');
assert.ok(byText('Bắt đầu làm bài', dialog).disabled);
await input(document.getElementById(countLabel.htmlFor), '25');
await click(byText('Bắt đầu làm bài', dialog));
assert.equal(routes.at(-1), '/practice/mono?mode=mix&count=25&l1=40&l2=30&l3=20&l4=10');
assert.equal(document.querySelector('[role="dialog"]'), null);

params = new URLSearchParams('grade=9');
await render();
assert.equal(document.querySelector('h1').textContent, 'Toán Lớp 9');
assert.ok(document.body.textContent.includes('Lớp này chưa có chương'));
params = new URLSearchParams();
await render();
assert.equal(document.querySelector('h1').textContent, 'Tự luyện Toán');
state.loading = true;
await render();
assert.ok(document.querySelector('[role="status"]').textContent.includes('Đang tải'));
await React.act(async () => root.unmount());
dom.window.close();
console.log('PASS: class/chapter navigation, accent-free search, stable lesson numbers, all difficulty levels, progress/count badges, original routes, reset cancellation, empty/loading states and mix dialog validation.');
