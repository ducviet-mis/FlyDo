// Actual builder/room/result in jsdom. Controlled local bank; no real accounts.
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';

const repo = process.cwd();
const require = createRequire(resolve(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/personal-exams', pretendToBeVisual: true });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DocumentFragment']) Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
let user = { id: 'student-a', accountTier: 'flyinfinity' };
let initialized = true;
let params = new URLSearchParams('grade=8&source=practice');
const routes = [], reads = [], writes = [];
const router = { push(path) { routes.push(path); }, replace(path) { routes.push(path); } };
const lessons = [{ id: 'a1', title: 'BÀI 1 - ĐƠN THỨC', chapter: 'ĐA THỨC', grade: 8 }, { id: 'a2', title: 'BÀI 2 - ĐA THỨC', chapter: 'ĐA THỨC', grade: 8 }, { id: 'b1', title: 'TỨ GIÁC', chapter: 'TỨ GIÁC', grade: 8 }];
const bank = lessons.flatMap(lesson => [1, 2, 3, 4].flatMap(level => Array.from({ length: 30 }, (_, index) => ({ id: `${lesson.id}-${level}-${index}`, lesson_id: lesson.id, difficulty_level: level,
  content: `Câu ${index}: 1+1 bằng bao nhiêu?`, options: ['1', '2', '3', '4'], correct_answer: 1, solution: 'Lời giải ngân hàng: 1+1=2', has_math: false }))));
let templateRows = [{ id: 'old', name: 'Mẫu cũ', grade: 8, mode: 'practice', question_count: 10, duration_minutes: 15,
  chapter_weights: [{ chapter: 'ĐA THỨC', weight: 100 }], level_weights: { 1: 50, 2: 50, 3: 0, 4: 0 } }];
let heldBank = null;
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const db = { from(table) {
  assert.ok(['practice_lessons', 'practice_questions', 'personal_exam_templates'].includes(table), 'No official progress/grade writes');
  const filters = [];
  let start = 0, end = 499, write = null;
  return { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, in(key, value) { filters.push([key, value]); return this; }, order() { return this; }, range(from, to) { start = from; end = to; return this; },
    upsert(row, options) { write = { table, row, options }; return this; },
    async then(done) {
      if (write) { writes.push(write); templateRows = [{ ...write.row, id: 'saved', chapter_weights: write.row.chapter_weights, level_weights: write.row.level_weights }]; return done({ data: null, error: null }); }
      reads.push({ table, filters, start, end });
      if (heldBank && table === 'practice_lessons') return heldBank.promise.then(done);
      const data = table === 'practice_lessons' ? lessons : table === 'practice_questions' ? bank : templateRows;
      return done({ data: data.filter(row => filters.every(([key, value]) => key === 'user_id' || (Array.isArray(value) ? value.includes(row[key]) : row[key] === value))).slice(start, end + 1), error: null });
    } };
} };
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename); cache.set(filename, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = name => {
    if (name === '@/features/auth/stores/auth-store') return { useAuthStore: () => ({ user, initialized }) };
    if (name === '@/lib/supabase/client') return { getSupabaseClient: () => db };
    if (name === 'next/navigation') return { useSearchParams: () => params, useRouter: () => router };
    if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (name === '@/features/practice/components/math-renderer') return { MathRenderer: ({ content }) => React.createElement('span', null, content), formatOptionMath: value => value };
    if (name === '@/features/geometry/components/geometry-diagram') return { GeometryDiagram: () => null };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.ts', '.tsx'].map(ext => base + ext).find(existsSync); if (path) return load(path);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const Builder = load(resolve(repo, 'src/app/personal-exams/page.tsx')).default;
const Room = load(resolve(repo, 'src/app/personal-exams/take/page.tsx')).default;
const Result = load(resolve(repo, 'src/app/personal-exams/result/page.tsx')).default;
const utils = load(resolve(repo, 'src/features/personal-exams/utils.ts'));
let root = createRoot(document.getElementById('root'));
const render = async Page => { await React.act(async () => { root.render(React.createElement(Page)); await Promise.resolve(); }); };
const clear = async () => { await React.act(async () => root.unmount()); root = createRoot(document.getElementById('root')); };
const button = (text, scope = document) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const click = async node => { assert.ok(node, 'Control exists'); await React.act(async () => { node.click(); await Promise.resolve(); }); };
const input = async (id, value) => { await React.act(async () => { const node = document.getElementById(id); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, String(value)); node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }); };
const select = async (id, value) => { await React.act(async () => { const node = document.getElementById(id); node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); }); };

await render(Builder);
assert.match(document.querySelector('h1').textContent, /Tạo đề cá nhân/);
assert.ok(button('Tạo đề & bắt đầu') && !button('Tạo đề & bắt đầu').disabled);
assert.ok(reads.find(read => read.table === 'personal_exam_templates').filters.some(([key, value]) => key === 'user_id' && value === user.id));
assert.equal(document.getElementById('personal-level-4').value, '0', 'No mandatory Level 4 quota');
await click(document.querySelector('[aria-label="Chọn bài trong ĐA THỨC"]'));
assert.ok(document.body.textContent.includes('BÀI 1 - ĐƠN THỨC'));
await click([...document.querySelectorAll('label')].find(label => label.textContent.includes('BÀI 2 - ĐA THỨC')).querySelector('input'));
await input('personal-title', 'Đề chọn bài');
await click(button('Lưu mẫu để dùng lại'));
assert.equal(writes.length, 1); assert.equal(writes[0].row.user_id, user.id);
assert.deepEqual(writes[0].row.chapter_weights.find(item => item.chapter === 'ĐA THỨC').lessonIds, ['a1']);
await click(button('Lưu mẫu để dùng lại'));
assert.equal(writes.length, 1, 'Same name requires explicit overwrite');
assert.ok(document.querySelector('[role="alertdialog"]'));
await click(button('Giữ mẫu cũ'));
await input('personal-count', 3); assert.equal(button('Tạo đề & bắt đầu').disabled, true);
await input('personal-count', 10);
await input('personal-level-1', 55); assert.equal(button('Tạo đề & bắt đầu').disabled, true);
await input('personal-level-1', 40); assert.equal(button('Tạo đề & bắt đầu').disabled, false);
// Loading/grade cancellation must not make an old bank available to create a new grade.
heldBank = deferred();
await select('personal-grade', '9');
assert.equal(button('Tạo đề & bắt đầu').disabled, true);
await select('personal-grade', '8');
await React.act(async () => { heldBank.resolve({ data: lessons, error: null }); });
assert.ok(document.body.textContent.includes('Lớp 8'));
heldBank = null;
await click([...document.querySelectorAll('label')].find(label => label.textContent.includes('BÀI 2 - ĐA THỨC')).querySelector('input'));
await React.act(async () => { button('Tạo đề & bắt đầu').click(); button('Đang kiểm tra & tạo đề...')?.click(); });
const createdRoute = routes.at(-1); assert.match(createdRoute, /^\/personal-exams\/take\?session=/);
const id = new URL(createdRoute, 'http://localhost').searchParams.get('session');
const created = JSON.parse(window.sessionStorage.getItem(utils.personalExamStorageKey(id)));
assert.equal(created.ownerId, user.id); assert.equal(created.questions.length, 10);
assert.ok(created.questions.every(question => question.lessonId !== 'a2'));
assert.equal(new Set(created.questions.map(question => question.id)).size, 10);

await clear();

// Practice answer locks, manual submission confirmation, and completed-draft immutability.
params = new URLSearchParams('session=' + id);
await render(Room);
const options = [...document.querySelectorAll('button[aria-label^="A:"],button[aria-label^="B:"]')];
await click(options[1]);
assert.ok(document.body.textContent.includes('Chính xác!')); assert.ok(document.body.textContent.includes('Lời giải ngân hàng'));
assert.ok(options[0].disabled); assert.ok(options[1].disabled);
await click(button('Kiểm tra & nộp bài'));
assert.ok(document.querySelector('[role="alertdialog"]').textContent.includes('Còn 9 câu bỏ trống'));
await click(button('Tiếp tục làm bài'));
assert.equal(document.querySelector('[role="alertdialog"]'), null);
await click(button('Kiểm tra & nộp bài'));
await click(button('Nộp bài', document.querySelector('[role="alertdialog"]')));
const completed = JSON.parse(window.sessionStorage.getItem(utils.personalExamStorageKey(id)));
assert.ok(completed.submittedAt); assert.deepEqual(completed.answers, { [completed.questions[0].id]: 1 });
assert.equal(window.sessionStorage.getItem(utils.activePersonalExamKey(user.id)), null);
await clear(); await render(Room);
assert.match(routes.at(-1), /\/personal-exams\/result/); // Never restores a submitted room as editable.
await clear(); await render(Result);
assert.ok(document.body.textContent.includes('1.00')); assert.ok(document.body.textContent.includes('9 trống'));
await click(button('Câu sai0')); assert.equal(document.querySelectorAll('article').length, 0);
await click(button('Chưa làm9')); assert.equal(document.querySelectorAll('article').length, 9);
await click(button('Làm lại cùng bộ câu'));
const restartId = new URL(routes.at(-1), 'http://localhost').searchParams.get('session');
const restarted = JSON.parse(window.sessionStorage.getItem(utils.personalExamStorageKey(restartId)));
assert.equal(restarted.ownerId, user.id); assert.equal(restarted.submittedAt, undefined); assert.equal(restarted.answers, undefined);
assert.deepEqual(restarted.questions, completed.questions);
await clear();

// Opening result before submission must route back, with NO solutions rendered.
params = new URLSearchParams('session=' + restartId);
await render(Result);
assert.match(routes.at(-1), /\/personal-exams\/take/); assert.equal(document.querySelectorAll('article').length, 0);
await clear();

// Exam mode: restore the original clock, permit revisions, never show feedback.
const runningExam = { ...restarted, id: 'running-exam', config: { ...restarted.config, mode: 'exam', durationMinutes: 5 }, startedAt: new Date(Date.now() - 120000).toISOString() };
window.sessionStorage.setItem(utils.personalExamStorageKey(runningExam.id), JSON.stringify(runningExam));
params = new URLSearchParams('session=running-exam');
await render(Room);
const expectedDeadline = Date.parse(runningExam.startedAt) + 300000;
assert.equal(JSON.parse(window.sessionStorage.getItem(utils.personalExamStorageKey(runningExam.id))).deadlineAt, expectedDeadline);
await clear(); await render(Room);
assert.equal(JSON.parse(window.sessionStorage.getItem(utils.personalExamStorageKey(runningExam.id))).deadlineAt, expectedDeadline, 'Reload does not reset the timer');
const examOptions = [...document.querySelectorAll('button[aria-label^="A:"],button[aria-label^="B:"]')];
await click(examOptions[1]); await click(examOptions[0]);
assert.equal(examOptions[0].disabled, false); assert.equal(examOptions[0].getAttribute('aria-pressed'), 'true');
assert.ok(!document.body.textContent.includes('Lời giải ngân hàng'));
const realNow = Date.now;
try { Date.now = () => expectedDeadline + 100; await click(examOptions[1]); } finally { Date.now = realNow; }
assert.equal(examOptions[0].getAttribute('aria-pressed'), 'true', 'Answer after deadline is rejected before the next timer tick');

// Failed storage must not claim submission succeeded; retry preserves answers.
const nativeSet = window.Storage.prototype.setItem;
try {
  window.Storage.prototype.setItem = () => { throw new Error('storage blocked'); };
  await click(button('Kiểm tra & nộp bài'));
  await click(button('Nộp bài', document.querySelector('[role="alertdialog"]')));
  assert.ok(document.body.textContent.includes('Chưa lưu được kết quả'));
  assert.equal(JSON.parse(window.sessionStorage.getItem(utils.personalExamStorageKey(runningExam.id))).submittedAt, undefined);
} finally { window.Storage.prototype.setItem = nativeSet; }
await click(button('Kiểm tra & nộp bài'));
await click(button('Nộp bài', document.querySelector('[role="alertdialog"]')));
assert.ok(JSON.parse(window.sessionStorage.getItem(utils.personalExamStorageKey(runningExam.id))).submittedAt);
await clear();

// Same-tab account switch cannot reveal another student's local answers/questions.
user = { id: 'student-b', accountTier: 'flyinfinity' };
await render(Room); assert.ok(document.body.textContent.includes('Không tìm thấy lượt làm hợp lệ'));
assert.ok(!document.body.textContent.includes('Lời giải ngân hàng'));
await clear(); await render(Result); assert.ok(document.body.textContent.includes('Không tìm thấy kết quả hợp lệ'));
await clear();

// Countdown continues from original start and expiry auto-submits without the manual dialog.
user = { id: 'student-a', accountTier: 'flyinfinity' };
const expired = { ...restarted, id: 'expired', config: { ...restarted.config, mode: 'exam', durationMinutes: 5 }, startedAt: new Date(Date.now() - 600000).toISOString() };
window.sessionStorage.setItem(utils.personalExamStorageKey(expired.id), JSON.stringify(expired));
params = new URLSearchParams('session=expired');
await render(Room);
assert.match(routes.at(-1), /auto=1$/);
const timed = JSON.parse(window.sessionStorage.getItem(utils.personalExamStorageKey(expired.id)));
assert.equal(timed.durationUsedSeconds, 300); assert.ok(timed.submittedAt);
assert.equal(document.querySelector('[role="alertdialog"]'), null);
await clear();

// Logged-out / free users never fetch the bank or saved templates.
const oldReads = reads.length; user = null;
await render(Builder); assert.ok(document.body.textContent.includes('Đăng nhập để tạo đề cá nhân')); assert.equal(reads.length, oldReads);
await clear(); user = { id: 'student-a', accountTier: 'flygo' };
await render(Builder); assert.ok(document.body.textContent.includes('FlyMax và FlyInfinity')); assert.equal(reads.length, oldReads);
await React.act(async () => root.unmount()); dom.window.close();
console.log('PASS: actual builder lesson scope/templates, overwrite confirmation, validated inputs, double-click lock, stale banks, practice/exam feedback rules, deadline restore/late answers, storage failure/retry, manual/auto submit, immutable completed papers, result-route guard, score/review counts, retakes and account/access isolation.');
