// Real exam hook/pages with controlled requests. No live accounts/database.
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';
const repo = process.cwd(), require = createRequire(resolve(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/mock-exams/exam', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'DocumentFragment']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const React = require('react'), { createRoot } = require('react-dom/client'), ts = require('typescript');
let user = { id: 'student-a', name: 'A' }, rpcHandler, hook, calls = [];
const auth = Object.assign(() => ({ user, initialized: true }), { getState: () => ({ user }) });
let onAbort = () => {};
const db = { rpc: (name, args) => {
  calls.push({ name, args });
  const request = Promise.resolve().then(() => rpcHandler(name, args));
  request.abortSignal = (signal) => { signal.addEventListener('abort', () => onAbort()); return request; };
  return request;
},
  from: () => { throw Error('Must not read answer key or write scores from the browser'); } };
let redirects = [];
const router = { replace: (path) => redirects.push(path), push: (path) => redirects.push(path), back() {} };
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename); cache.set(filename, mod);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = (name) => {
    if (name.endsWith('.css')) return {};
    if (name === '@/features/auth/stores/auth-store') return { useAuthStore: auth };
    if (name === '@/lib/supabase/client') return { getSupabaseClient: () => db };
    if (name === 'next/navigation') return { useRouter: () => router, useParams: () => ({ examId: 'exam' }),
      useSearchParams: () => new URLSearchParams(window.location.search) };
    if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.tsx', '.ts'].map((suffix) => base + suffix).find(existsSync);
      if (path) return load(path);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}
function deferred() { let done; const promise = new Promise((resolve) => done = resolve); return { promise, done }; }
const root = createRoot(document.getElementById('root'));
const { useServerExam } = load(resolve(repo, 'src/features/mock-exams/use-server-exam.ts'));
function Harness() { hook = useServerExam('exam', user?.id); return null; }
async function render() { await React.act(async () => root.render(React.createElement(Harness))); }
async function clear() { await React.act(async () => root.render(null)); calls = []; redirects = []; }
const sessionId = '10000000-0000-4000-8000-000000000001';
const fixture = () => ({ session_id: sessionId, exam: { id: 'exam', title: 'Đề thi', grade: 8, duration: 10 },
  questions: [{ id: 'q1', content: '1+1=?', options: ['1', '2', '3', '4'], diagram: null }],
  answers: {}, revision: 0, deadline_at: new Date(Date.now() + 600_000).toISOString(), server_now: new Date().toISOString(), attempt_id: null });
const key = 'flydo:mock-exam-draft:v2:student-a:exam';
rpcHandler = () => Promise.resolve({ data: fixture(), error: null });
await render();
assert.equal(hook.ready, true);
assert.equal(hook.questions[0].correct_answer, undefined);
assert.equal(calls.length, 1); // Initial no-op save must not stick in the request queue.
const firstSave = deferred(); let saveRevision = 0;
rpcHandler = (name, args) => {
  if (name === 'save_mock_exam_answers') {
    saveRevision++;
    if (saveRevision === 1) return firstSave.promise;
    return Promise.resolve({ data: { accepted: true, revision: saveRevision, answers: args.p_answers }, error: null });
  }
  throw Error('Unexpected call');
};
await React.act(async () => { hook.chooseAnswer('q1', 1); });
await React.act(async () => { hook.chooseAnswer('q1', 2); });
assert.equal(calls.filter((c) => c.name === 'save_mock_exam_answers').length, 1);
await React.act(async () => firstSave.done({ data: { accepted: true, revision: 1 }, error: null }));
assert.deepEqual(calls.at(-1).args.p_answers, { q1: 2 });
assert.equal(calls.at(-1).args.p_expected_revision, 1);
assert.equal(hook.saving, false);
assert.equal(JSON.parse(window.localStorage.getItem(key)).revision, 2);

rpcHandler = () => Promise.resolve({ data: null, error: { message: 'offline' } });
await React.act(async () => hook.chooseAnswer('q1', 3));
assert.match(hook.saveError, /Chưa lưu/);
assert.equal(hook.answers.q1, 3);
assert.equal(JSON.parse(window.localStorage.getItem(key)).answers.q1, 3);
rpcHandler = (name, args) => Promise.resolve({ data: { accepted: true, revision: 3, answers: args.p_answers }, error: null });
await React.act(async () => hook.retrySave());
assert.equal(hook.saveError, '');

// A hanging request gets aborted and exposes retry; the answer remains in the draft.
const originalSetTimeout = window.setTimeout;
let triggerTimeout;
window.setTimeout = (fn, ms, ...args) => ms === 20_000 ? (triggerTimeout = fn, -1) : originalSetTimeout(fn, ms, ...args);
const hungSave = deferred();
onAbort = () => hungSave.done({ data: null, error: { message: 'AbortError' } });
rpcHandler = () => hungSave.promise;
await React.act(async () => hook.chooseAnswer('q1', 0));
assert.equal(hook.saving, true);
await React.act(async () => triggerTimeout());
assert.equal(hook.saving, false);
assert.match(hook.saveError, /Chưa lưu/);
assert.equal(JSON.parse(window.localStorage.getItem(key)).answers.q1, 0);
window.setTimeout = originalSetTimeout; onAbort = () => {};
let timeoutRetryRevision = 3;
rpcHandler = (name, args) => Promise.resolve({ data: { accepted: true, revision: ++timeoutRetryRevision, answers: args.p_answers }, error: null });
await React.act(async () => hook.retrySave());
await React.act(async () => hook.chooseAnswer('q1', 3));

const pendingSubmit = deferred(); let submittedCount = 0;
rpcHandler = (name, args) => {
  assert.equal(name, 'submit_mock_exam_session'); submittedCount++;
  assert.deepEqual(Object.keys(args).sort(), ['p_answers', 'p_expected_revision', 'p_session_id']);
  return pendingSubmit.promise;
};
let submitted;
await React.act(async () => { submitted = hook.submit(); submitted.catch(() => {}); void hook.submit(); });
assert.equal(submittedCount, 1);
assert.equal(hook.isSubmitting, true);
await React.act(async () => pendingSubmit.done({ data: null, error: { message: 'offline' } }));
await assert.rejects(submitted, /Chưa nộp/);
assert.equal(hook.isSubmitting, false);
assert.equal(hook.answers.q1, 3);
assert.ok(window.localStorage.getItem(key));
rpcHandler = () => Promise.resolve({ data: { attempt_id: 'attempt-1' }, error: null });
await React.act(async () => assert.equal(await hook.submit(), 'attempt-1'));
assert.equal(window.localStorage.getItem(key), null);
await clear();

// Local deadlines are never trusted. Revision conflict protects another tab's work.
window.localStorage.setItem(key, JSON.stringify({ version: 2, sessionId, revision: 0, answers: { q1: 1 }, currentIndex: 999, deadlineAt: Date.now() + 86400_000 }));
rpcHandler = (name) => name === 'start_mock_exam_session' ? Promise.resolve({ data: fixture(), error: null })
  : Promise.resolve({ data: null, error: { message: 'FLYDO_CONFLICT: Bài làm đã cập nhật ở cửa sổ khác.' } });
await render();
assert.equal(hook.currentIndex, 0);
assert.ok(hook.deadlineAt < Date.now() + 610_000);
assert.equal(hook.blocked, true);
assert.match(hook.saveError, /cửa sổ khác/);
const callCount = calls.length;
await React.act(async () => hook.chooseAnswer('q1', 2));
assert.equal(calls.length, callCount);
await clear(); window.localStorage.clear();

// Changing the operating-system clock cannot extend the displayed exam budget.
rpcHandler = () => Promise.resolve({ data: fixture(), error: null });
await render();
const beforeClockChange = hook.remainingSeconds();
const originalNow = Date.now; Date.now = () => originalNow() - 86400_000;
assert.ok(hook.remainingSeconds() <= beforeClockChange);
Date.now = originalNow;
await clear(); window.localStorage.clear();

// Browser storage is optional; server sessions/saves still work when it is blocked.
const storagePrototype = Object.getPrototypeOf(window.localStorage);
const originalGet = storagePrototype.getItem, originalSet = storagePrototype.setItem;
storagePrototype.getItem = storagePrototype.setItem = () => { throw Error('storage blocked'); };
let noStorageRevision = 0;
rpcHandler = (name) => Promise.resolve({ data: name === 'start_mock_exam_session' ? fixture()
  : { accepted: true, revision: ++noStorageRevision }, error: null });
await render();
await React.act(async () => hook.chooseAnswer('q1', 1));
assert.equal(hook.ready, true);
assert.equal(hook.saveError, '');
storagePrototype.getItem = originalGet; storagePrototype.setItem = originalSet;
await clear(); window.localStorage.clear();

// Late responses cannot populate the next account's exam.
const oldLoad = deferred();
rpcHandler = () => oldLoad.promise;
await render();
user = { id: 'student-b' };
rpcHandler = () => Promise.resolve({ data: { ...fixture(), session_id: '10000000-0000-4000-8000-000000000002', answers: { q1: 2 } }, error: null });
await render();
await React.act(async () => oldLoad.done({ data: { ...fixture(), answers: { q1: 3 } }, error: null }));
assert.equal(hook.answers.q1, 2);
await clear(); user = { id: 'student-a', name: 'A' }; window.localStorage.clear();

// Server-expired session cannot restore unsent local answers.
window.localStorage.setItem(key, JSON.stringify({ version: 2, sessionId, revision: 0, answers: { q1: 3 }, currentIndex: 0 }));
rpcHandler = () => Promise.resolve({ data: { ...fixture(), deadline_at: new Date(Date.now() - 5000).toISOString(), answers: { q1: 1 } }, error: null });
await render();
assert.deepEqual(hook.answers, { q1: 1 });
await clear(); window.localStorage.clear();

// The real room auto-submits once on expiry and offers a visible retry after failure.
let autoCount = 0;
rpcHandler = (name) => name === 'start_mock_exam_session' ? Promise.resolve({ data: { ...fixture(), deadline_at: new Date(Date.now() - 5000).toISOString() }, error: null })
  : (autoCount++, Promise.resolve({ data: null, error: { message: 'offline' } }));
const Room = load(resolve(repo, 'src/app/mock-exams/[examId]/page.tsx')).default;
await React.act(async () => root.render(React.createElement(Room)));
assert.equal(autoCount, 1);
assert.ok([...document.querySelectorAll('button')].some((b) => b.textContent === 'Nộp lại'));
assert.equal([...document.querySelectorAll('button')].filter((b) => b.getAttribute('aria-pressed') !== null).every((b) => b.disabled), true);
rpcHandler = () => Promise.resolve({ data: { attempt_id: 'recovered-attempt' }, error: null });
await React.act(async () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Nộp lại').click());
assert.ok(redirects.includes('/mock-exams/exam/result?attemptId=recovered-attempt'));
await clear();

// Submitted sessions recovered after a lost response go straight to their result.
rpcHandler = () => Promise.resolve({ data: { ...fixture(), attempt_id: 'existing-attempt' }, error: null });
await React.act(async () => root.render(React.createElement(Room)));
assert.deepEqual(redirects, ['/mock-exams/exam/result?attemptId=existing-attempt']);
await clear();
const Result = load(resolve(repo, 'src/app/mock-exams/[examId]/result/page.tsx')).default;
window.history.replaceState({}, '', '/?attemptId=a1');
rpcHandler = () => Promise.resolve({ data: { exam: fixture().exam, questions: [{ ...fixture().questions[0], correct_answer: 1, solution: '1+1=2' }],
  attempt: { id: 'a1', exam_id: 'exam', user_id: user.id, score: '10.00', answers: { q1: 1 }, correct_count: 1, total_questions: 1, duration_used: 10 } }, error: null });
await React.act(async () => root.render(React.createElement(Result)));
assert.match(document.body.textContent, /10.00/);
assert.match(document.body.textContent, /Đáp án chi tiết/);
await React.act(async () => root.unmount()); dom.window.close();
console.log('PASS: real secure exam hook/pages, queued autosaves, offline drafts/retry, double-submit lock, conflict recovery, account isolation, authoritative deadlines, late draft rejection, autosubmit/manual retry, lost-response result recovery, server result rendering; no direct answer/score queries.');
