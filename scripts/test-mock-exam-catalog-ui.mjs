// Actual catalog components with controlled read-only data. No real exams or accounts.
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';

const repo = resolve(process.cwd());
const require = createRequire(resolve(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/mock-exams?grade=8', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DocumentFragment']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
let desktop = false;
let fullscreenCalls = 0;
window.matchMedia = () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} });
document.documentElement.requestFullscreen = () => { fullscreenCalls++; return Promise.resolve(); };
let params = new URLSearchParams('grade=8&extra=keep');
const routes = [];
const queries = [];
const user = { id: 'test-student' };
const topics = [{ id: 'poly', name: 'ĐA THỨC', grade: 8 }, { id: 'empty', name: 'TỨ GIÁC', grade: 8 }];
const exams = [
  { id: 'one', title: 'ĐỀ GIỮA HỌC KÌ 1 - SỐ 03', duration: 90, grade: 8, category: 'midterm_1' },
  { id: 'two', title: 'ĐỀ GIỮA HỌC KÌ 1 - SỐ 02', duration: 75, grade: 8, category: 'midterm_1' },
  { id: 'three', title: 'ĐỀ GIỮA HỌC KÌ 1 - SỐ 01', duration: 90, grade: 8, category: 'midterm_1' },
  { id: 'topic-exam', title: 'ĐỀ CHUYÊN ĐỀ SỐ 01', duration: 60, grade: 8, category: 'topic', topic_id: 'poly' },
  { id: 'draft', title: 'BẢN NHÁP CHƯA CÔNG BỐ', duration: 60, grade: 8, category: 'midterm_1', scoring_mode: 'sectioned', scoring_ready: false },
];
const attempt = (id, exam_id, score, days) => ({ id, exam_id, score, correct_count: score * 4, total_questions: 40, duration_used: 1501, created_at: new Date(Date.now() - days * 86400000).toISOString(), user_id: user.id });
const attempts = [attempt('latest', 'one', 8.5, 1), attempt('best', 'one', 9, 2), attempt('older', 'one', 7.5, 3), attempt('other', 'three', 5, 4)];
const db = {
  from(table) {
    assert.ok(['mock_exams', 'mock_exam_topics', 'mock_exam_attempts'].includes(table));
    const filters = [];
    const query = { select(columns) { queries.push({ table, columns, filters }); return this; }, eq(key, value) { filters.push([key, value]); return this; }, in(key, values) { filters.push([key, values]); return this; }, order() { return this; },
      then(done) {
        const rows = table === 'mock_exams' ? exams : table === 'mock_exam_topics' ? topics : attempts;
        return Promise.resolve({ data: rows.filter(row => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value)), error: null }).then(done);
      },
    };
    return query;
  },
  rpc() { throw new Error('Catalog must not start a server session or grade answers'); },
};
const router = { push(path) { routes.push(path); }, replace(path) { routes.push(path); params = new URLSearchParams(path.split('?')[1]); } };
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  cache.set(filename, mod);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = name => {
    if (name === '@/features/auth/stores/auth-store') return { useAuthStore: () => ({ user }) };
    if (name === '@/lib/supabase/client') return { getSupabaseClient: () => db };
    if (name === 'next/navigation') return { useSearchParams: () => params, useRouter: () => router };
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
const Page = load(resolve(repo, 'src/app/mock-exams/page.tsx')).default;
const root = createRoot(document.getElementById('root'));
const render = async () => { await React.act(async () => root.render(React.createElement(Page))); };
const click = async node => { assert.ok(node, 'Missing control'); await React.act(async () => node.click()); };
const button = (text, scope = document) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const cards = () => [...document.querySelectorAll('article')];
const input = async value => {
  const node = document.getElementById('mock-exam-search');
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const select = async (id, value) => {
  await React.act(async () => { const node = document.getElementById(id); node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); });
  await render();
};

await render();
assert.equal(document.querySelector('h1').textContent, 'Thi thử lớp 8');
assert.equal(document.querySelector('h2').textContent, 'Giữa HK1');
assert.equal(cards().length, 3);
assert.ok(!document.body.textContent.includes('BẢN NHÁP CHƯA CÔNG BỐ'), 'Drafts must never appear as playable student exams');
assert.equal(queries.filter(item => item.table === 'mock_exam_attempts').length, 1);
assert.ok(queries.find(item => item.table === 'mock_exam_attempts').filters.some(([key, value]) => key === 'user_id' && value === user.id));
assert.equal(document.querySelector('a[href="/personal-exams?source=mock-exams"]').textContent, 'Tạo đề cá nhân');
const first = cards()[0];
assert.ok(first.textContent.includes('9.00'));
assert.ok(first.textContent.includes('Đã thi 3 lần'));
assert.equal(first.querySelector('a[aria-label^="Xem kết quả gần nhất"]').getAttribute('href'), '/mock-exams/one/result?attemptId=latest');
const historyButton = first.querySelector('[aria-label^="Lịch sử 3 lần thi"]');
assert.equal(historyButton.querySelector('span[aria-hidden="true"]').textContent, '3');
assert.equal(cards()[1].querySelector('[aria-label^="Lịch sử"]'), null);
assert.equal(document.querySelector('[aria-label="Tùy chọn đề thi"]'), null, 'Results/history should no longer be hidden in a menu');

await click(historyButton);
const dialog = document.querySelector('[role="dialog"]');
assert.ok(dialog.textContent.includes('Lịch sử làm bài'));
assert.equal(dialog.querySelectorAll('ol > li').length, 3);
assert.ok(dialog.querySelector('ol > li').textContent.includes('Mới nhất'));
assert.ok(dialog.querySelectorAll('ol > li')[1].textContent.includes('Cao nhất'));
assert.deepEqual([...dialog.querySelectorAll('ol a')].map(node => node.getAttribute('href')), ['/mock-exams/one/result?attemptId=latest', '/mock-exams/one/result?attemptId=best', '/mock-exams/one/result?attemptId=older']);
assert.ok(dialog.textContent.includes('25p 1s'));
await click(button('Đóng', dialog));
assert.equal(document.querySelector('[role="dialog"]'), null);

await click(button('Chưa thi1'));
assert.equal(cards().length, 1);
assert.equal(cards()[0].querySelector('h3').textContent, exams[1].title);
await click(button('Đã thi2'));
assert.equal(cards().length, 2);
await click(button('Tất cả3'));
const initialQueries = queries.length;
await input('GIUA HOC KI');
assert.equal(cards().length, 3, 'Unaccented search should match Vietnamese titles');
await input('SỐ 02');
assert.equal(cards().length, 1);
await input('khong-tim-thay');
assert.equal(cards().length, 0);
assert.ok(document.querySelector('[role="status"]').textContent.includes('Không có đề phù hợp'));
await click(button('Hiện tất cả đề trong danh mục'));
assert.equal(cards().length, 3);
assert.equal(queries.length, initialQueries, 'Searching/status filters must not refetch or write data');

window.sessionStorage.setItem('flydo-open-exam-fullscreen', 'true');
await click(button('Bắt đầu', cards()[1]));
assert.equal(routes.at(-1), '/mock-exams/two');
assert.equal(fullscreenCalls, 0, 'Mobile/tablet must not request fullscreen');
assert.equal(window.sessionStorage.getItem('flydo-open-exam-fullscreen'), null);
desktop = true;
await click(button('Thi lại', cards()[0]));
assert.equal(routes.at(-1), '/mock-exams/one');
assert.equal(fullscreenCalls, 1);
assert.equal(window.sessionStorage.getItem('flydo-open-exam-fullscreen'), 'true');
document.documentElement.requestFullscreen = () => Promise.reject(new Error('Not supported'));
await click(button('Thi lại', cards()[0]));
assert.equal(routes.at(-1), '/mock-exams/one', 'Unsupported fullscreen still opens the exam');

await input('retained-search');
await select('mock-exam-category', 'topic');
assert.equal(params.get('extra'), 'keep', 'Existing URL parameters are preserved');
assert.equal(params.get('category'), 'topic');
assert.equal(document.getElementById('mock-exam-search').value, '', 'Filters reset for a new category');
assert.equal(cards().length, 1);
await input('da thuc');
assert.equal(cards().length, 1, 'Search can use topic names as well as titles');
await click(document.querySelector('[aria-label="Xóa tìm kiếm"]'));
await select('mock-exam-topic', 'empty');
assert.equal(params.get('topic'), 'empty');
assert.ok(document.querySelector('[role="status"]').textContent.includes('Chưa có đề trong danh mục này'));
await click(button('Xem tất cả chuyên đề'));
await render();
assert.equal(params.has('topic'), false);
assert.equal(cards().length, 1);
await select('mock-exam-topic', 'poly');
assert.equal(params.get('topic'), 'poly');
assert.equal(document.querySelector('h2').textContent, 'ĐA THỨC');
await select('mock-exam-category', 'final_1');
assert.equal(params.has('topic'), false, 'Changing to an academic term clears topic routing');
assert.equal(cards().length, 0);
assert.ok(document.querySelector('[role="status"]'));
params = new URLSearchParams('grade=9');
await render();
assert.equal(document.querySelector('h1').textContent, 'Thi thử lớp 9');
assert.equal(cards().length, 0);
assert.equal(document.querySelector('[aria-current="page"]').getAttribute('href'), '/mock-exams?grade=9');
await React.act(async () => root.unmount());
dom.window.close();
console.log('PASS: catalog reads/account scope, category/topic URLs, accent-free title/topic search, status filters without extra requests, best/latest scores, direct result/history controls, history details, empty states and desktop-only fullscreen.');
