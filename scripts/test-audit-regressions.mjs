// Exercises the real hooks/pages in a browser-like environment, without live Supabase.
// Uses the same isolated jsdom runtime as test-question-report-ui.mjs.
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';

const repo = resolve(process.cwd());
const require = createRequire(resolve(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3500', pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'DocumentFragment', 'FileReader']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
let user = { id: 'student-a', name: 'A' };
let online = { userId: 'student-a', date: '2026-09-30', seconds: 1200 };
let profileLogout = async () => {};
const profileState = () => ({ user, initialized: true, refreshUser: async () => {}, logoutAllDevices: () => profileLogout() });
const auth = Object.assign((selector) => selector ? selector(profileState()) : profileState(), {
  getState: () => ({ user, initialized: true }),
});
let queryHandler = () => ({ data: [], error: null });
let rpcHandler = () => ({ data: null, error: null });
const requests = [];
const channelNames = [];
class Query {
  constructor(table) { this.table = table; this.filters = []; this.operation = 'read'; }
  select() { return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  is(key, value) { this.filters.push([key, value]); return this; }
  lte() { return this; }
  gte() { return this; }
  lt() { return this; }
  in() { return this; }
  order() { return this; }
  range(from, to) { this.from = from; this.to = to; return this; }
  single() { return this; }
  maybeSingle() { return this; }
  insert(value) { this.operation = 'insert'; this.value = value; return this; }
  upsert(value) { this.operation = 'upsert'; this.value = value; return this; }
  update(value) { this.operation = 'update'; this.value = value; return this; }
  delete() { this.operation = 'delete'; return this; }
  match(value) { Object.entries(value).forEach(([key, item]) => this.eq(key, item)); return this; }
  then(fulfilled, rejected) {
    requests.push(this);
    return Promise.resolve().then(() => queryHandler(this)).then(fulfilled, rejected);
  }
}
const db = {
  from: (table) => new Query(table),
  rpc: (...args) => { const request = Promise.resolve().then(() => rpcHandler(...args)); request.abortSignal = () => request; return request; },
  channel: (name) => {
    channelNames.push(name);
    let subscribed = false;
    return { on() { assert.equal(subscribed, false); return this; }, subscribe() { subscribed = true; return this; } };
  },
  removeChannel: async () => {},
};
const router = { push() {}, back() {}, replace() {} };
let routeParams = {};
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  cache.set(filename, mod);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = (name) => {
    if (name.endsWith('.css')) return {};
    if (name === '@/lib/auth/single-session') return { getSessionIdFromAccessToken: () => 'session-id' };
    if (name === '@/lib/auth/device-identity') return { getBrowserDeviceKey: () => 'device-key', getBrowserDeviceInfo: () => ({ type: 'computer', name: 'Test' }) };
    if (name === '../lib/remembered-accounts') return { rememberAccount() {} };
    if (name === '@/features/auth/stores/auth-store') return { useAuthStore: auth };
    if (name === '@/lib/supabase/client') return { getSupabaseClient: () => db };
    if (name === '@/features/daily-goal/stores/online-study-store') {
      const real = load(resolve(repo, 'src/features/daily-goal/stores/online-study-store.ts'));
      return { ...real, useOnlineStudyStore: Object.assign(() => online, { getState: real.useOnlineStudyStore.getState }) };
    }
    if (name === 'next/navigation') return {
      useRouter: () => router, useParams: () => routeParams,
      usePathname: () => window.location.pathname,
      useSearchParams: () => new URLSearchParams(window.location.search),
    };
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
const root = createRoot(document.getElementById('root'));
let value;
let activeHook;
function Harness() { value = activeHook(); return null; }
async function renderHook(hook) {
  activeHook = hook;
  await React.act(async () => root.render(React.createElement(Harness)));
}
async function clear() { await React.act(async () => root.render(null)); requests.length = 0; }
async function flush() { await React.act(async () => {}); }
function deferred() { let resolvePromise, reject; const promise = new Promise((done, fail) => { resolvePromise = done; reject = fail; }); return { promise, resolve: resolvePromise, reject }; }
function page(rows, query) { return { data: rows.slice(query.from ?? 0, query.to === undefined ? rows.length : query.to + 1), error: null }; }

const { safeInternalPath } = load(resolve(repo, 'src/lib/security/safe-navigation.ts'));
for (const unsafe of ['https://evil.test', '//evil.test', '/\\evil.test', '/\n/evil.test', 'javascript:alert(1)', null]) {
  assert.equal(safeInternalPath(unsafe), '/home');
}
assert.equal(safeInternalPath('/practice?grade=8#lesson'), '/practice?grade=8#lesson');
const { sanitizeRichHtml } = load(resolve(repo, 'src/lib/security/safe-content.ts'));
const sanitized = sanitizeRichHtml('<h2>Lý thuyết</h2><p><strong>Toán</strong></p><img src=x onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">bad</a><iframe src="https://evil.test"></iframe><svg onload="alert(1)"></svg>');
assert.match(sanitized, /<h2>Lý thuyết<\/h2>/);
assert.match(sanitized, /<strong>Toán<\/strong>/);
assert.doesNotMatch(sanitized, /onerror|onload|javascript:|<script|<iframe|<svg/);
const { parsePersonalExamSession } = load(resolve(repo, 'src/features/personal-exams/validate-session.ts'));
const session = { version: 1, id: 's1', config: { mode: 'exam', durationMinutes: 45 }, questions: [
  { id: 'q1', content: '1+1', options: ['1', '2'], correctAnswer: 1 },
], answers: { q1: 1, removed: 2 } };
assert.deepEqual(parsePersonalExamSession(JSON.stringify(session), 's1').answers, { q1: 1 });
for (const broken of [{ ...session, config: null }, { ...session, questions: [] },
  { ...session, startedAt: 'invalid' }, { ...session, questions: [{ ...session.questions[0], options: null }] }]) {
  assert.equal(parsePersonalExamSession(JSON.stringify(broken), 's1'), null);
}
assert.equal(parsePersonalExamSession('{', 's1'), null);
assert.equal(parsePersonalExamSession(JSON.stringify(session), 'another-id'), null);

const { useSavedQuestions } = load(resolve(repo, 'src/features/practice/hooks/use-saved-questions.ts'));
const saved = Array.from({ length: 1505 }, (_, index) => ({ question_id: 'q' + index }));
queryHandler = (query) => page(saved, query);
await renderHook(() => useSavedQuestions('lesson'));
assert.equal(value.savedIds.length, 1505);
assert.ok(requests.length > 1);
const write = deferred();
let writes = 0;
queryHandler = (query) => { if (query.operation !== 'read') { writes++; return write.promise; } return page(saved, query); };
let pending;
await React.act(async () => { pending = value.toggleSave('new-q', 'lesson'); void value.toggleSave('new-q', 'lesson'); });
assert.ok(value.savedIds.includes('new-q'));
assert.equal(writes, 1);
await React.act(async () => { write.reject(new Error('offline')); await pending; });
assert.equal(value.savedIds.includes('new-q'), false);
assert.match(value.error, /kết nối/);
await clear();
const old = deferred();
queryHandler = (query) => query.filters.some(([key, id]) => key === 'user_id' && id === 'student-a')
  ? old.promise : { data: [{ question_id: 'student-b-only' }], error: null };
await renderHook(() => useSavedQuestions('lesson'));
user = { id: 'student-b' };
await renderHook(() => useSavedQuestions('lesson'));
assert.deepEqual(value.savedIds, ['student-b-only']);
await React.act(async () => old.resolve({ data: [{ question_id: 'student-a-private' }], error: null }));
assert.deepEqual(value.savedIds, ['student-b-only']);
await clear();

const { usePractice } = load(resolve(repo, 'src/features/practice/hooks/use-practice.ts'));
const questions = [{ id: 'q1', content: '1+1', options: ['1', '2'], correctAnswer: 1 }];
const save = deferred();
let saves = 0;
queryHandler = () => { saves++; return save.promise; };
await renderHook(() => usePractice(questions, 'lesson', ['removed', 'q1']));
assert.equal(value.progress.answered, 1);
let answerRequest;
await React.act(async () => { answerRequest = value.selectAnswer(1); void value.selectAnswer(0); });
assert.equal(saves, 1);
assert.equal(value.selectedAnswer, 1);
await React.act(async () => { save.reject(new Error('offline')); await answerRequest; });
assert.match(value.saveError, /Chưa lưu/);
assert.equal(value.selectedAnswer, 1);
queryHandler = () => ({ data: null, error: null });
await React.act(async () => value.retrySaves());
assert.equal(value.saveError, '');
await clear();

const { useStats } = load(resolve(repo, 'src/features/stats/hooks/use-stats.ts'));
const { localStudyDate } = load(resolve(repo, 'src/features/daily-goal/stores/online-study-store.ts'));
const today = localStudyDate();
user = { id: 'student-a' };
online = { userId: user.id, date: today, seconds: 1260 };
queryHandler = (query) => query.table === 'practice_progress'
  ? page(Array.from({ length: 1505 }, (_, id) => ({ id: String(id), is_correct: id < 1000 })), query)
  : page([{ study_date: today, seconds: 1200 }], query);
await renderHook(() => useStats('today'));
assert.equal(value.totalQuestions, 1505);
assert.equal(value.correctCount, 1000);
assert.equal(value.totalMinutes, 21); // live online seconds, NEVER questions * two minutes.
online = { ...online, seconds: 1300 };
await renderHook(() => useStats('today'));
assert.equal(value.totalMinutes, 21);
user = null;
await renderHook(() => useStats('today'));
assert.equal(value.totalQuestions, 0);
assert.equal(value.totalMinutes, 0);
await clear();

// A rejected heartbeat must release its lock and recover on the next interval.
const { OnlineStudyTracker } = load(resolve(repo, 'src/features/daily-goal/components/online-study-tracker.tsx'));
const realOnline = load(resolve(repo, 'src/features/daily-goal/stores/online-study-store.ts')).useOnlineStudyStore;
user = { id: 'student-a' };
let tick;
let heartbeats = 0;
const originalInterval = window.setInterval;
window.setInterval = (callback) => { tick = callback; return 0; };
rpcHandler = () => { heartbeats++; if (heartbeats === 1) throw new Error('offline'); return { data: { date: today, seconds: 1200 }, error: null }; };
await React.act(async () => root.render(React.createElement(OnlineStudyTracker)));
assert.equal(heartbeats, 1);
await React.act(async () => tick());
assert.equal(heartbeats, 2);
assert.equal(realOnline.getState().seconds, 1200);
window.setInterval = originalInterval;
await clear();

const { useNotifications } = load(resolve(repo, 'src/features/notifications/use-notifications.ts'));
user = { id: 'student-a' };
rpcHandler = () => { throw new Error('offline'); };
await renderHook(() => useNotifications());
assert.equal(value.loading, false);
assert.match(value.error, /kết nối/);
rpcHandler = () => ({ data: { items: [{ id: 'n1' }], unread_count: 1 }, error: null });
await React.act(async () => value.refresh());
assert.equal(value.items.length, 1);
assert.equal(value.error, '');
rpcHandler = () => { throw new Error('offline'); };
user = { id: 'student-b' };
await renderHook(() => useNotifications());
assert.equal(value.items.length, 0);
assert.equal(value.unreadCount, 0);
assert.equal(value.loading, false);
let marked;
await React.act(async () => { marked = await value.markRead('n1'); });
assert.equal(marked, false);
await clear();
rpcHandler = () => ({ data: { items: [], unread_count: 0 }, error: null });
await renderHook(() => ({ first: useNotifications(), second: useNotifications() }));
assert.equal(new Set(channelNames).size, channelNames.length);
await clear();

const Room = load(resolve(repo, 'src/app/mock-exams/[examId]/page.tsx')).default;
rpcHandler = () => ({ data: null, error: { message: 'FLYDO: Không tìm thấy đề thi.' } });
queryHandler = () => ({ data: null, error: { message: 'not found' } });
routeParams = { examId: 'missing' };
await React.act(async () => root.render(React.createElement(Room)));
assert.match(document.querySelector('[role="alert"]').textContent, /Không tìm thấy/);
assert.ok([...document.querySelectorAll('button')].some((button) => button.textContent === 'Thử lại'));
await clear();
queryHandler = (query) => query.table === 'mock_exams'
  ? { data: { id: 'empty', duration: 45 }, error: null } : { data: [], error: null };
routeParams = { examId: 'empty' };
rpcHandler = () => ({ data: null, error: { message: 'FLYDO: Đề thi chưa có câu hỏi.' } });
await React.act(async () => root.render(React.createElement(Room)));
assert.match(document.querySelector('[role="alert"]').textContent, /chưa có câu hỏi/);
await clear();
const Result = load(resolve(repo, 'src/app/mock-exams/[examId]/result/page.tsx')).default;
routeParams = { examId: 'exam' };
await React.act(async () => root.render(React.createElement(Result)));
assert.match(document.querySelector('[role="alert"]').textContent, /thiếu mã/);
await clear();
window.history.replaceState({}, '', '/?attemptId=foreign');
queryHandler = () => ({ data: null, error: null });
const resultCalls = [];
rpcHandler = (name, args) => { resultCalls.push({ name, args }); return { data: null, error: { message: 'FLYDO: Không tìm thấy bài làm của bạn trong đề thi này.' } }; };
await React.act(async () => root.render(React.createElement(Result)));
assert.equal(resultCalls[0].name, 'get_my_mock_exam_result');
assert.deepEqual(resultCalls[0].args, { p_exam_id: 'exam', p_attempt_id: 'foreign' });
assert.equal(requests.some((query) => query.table === 'mock_exam_questions'), false);
assert.match(document.querySelector('[role="alert"]').textContent, /Không tìm thấy/);
await clear();

// Real Zustand auth store: concurrent startup, missing profile, offline refresh,
// and a delayed profile arriving after SIGNED_OUT.
Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage, configurable: true });
let authCallback;
let sessionReads = 0;
let listeners = 0;
const authSession = deferred();
db.auth = {
  getSession: () => { sessionReads++; return authSession.promise; },
  onAuthStateChange: (callback) => { listeners++; authCallback = callback; },
  getUser: async () => ({ data: { user: null }, error: new Error('offline') }),
};
rpcHandler = () => ({ data: { active: true }, error: null });
queryHandler = () => ({ data: null, error: null });
const realAuth = load(resolve(repo, 'src/features/auth/stores/auth-store.ts')).useAuthStore;
realAuth.setState({ user: { id: 'persisted-stale' }, initialized: false });
const firstInit = realAuth.getState().initAuth();
const secondInit = realAuth.getState().initAuth();
assert.equal(firstInit, secondInit);
authSession.resolve({ data: { session: { user: { id: 'student-a' }, access_token: 'token' } }, error: null });
await Promise.all([firstInit, secondInit]);
assert.equal(listeners, 1);
assert.equal(sessionReads, 1);
assert.equal(realAuth.getState().user, null);

// Global logout must surface RPC/auth failures, not report false success.
realAuth.setState({ user: { id: 'student-a' } });
let signOutCalls = 0;
db.auth.signOut = async () => { signOutCalls++; return { error: null }; };
rpcHandler = () => ({ data: null, error: { code: 'NETWORK' } });
await assert.rejects(realAuth.getState().logoutAllDevices(), /Chưa thể/);
assert.equal(signOutCalls, 0);
assert.equal(realAuth.getState().user.id, 'student-a');
rpcHandler = (name) => name === 'clear_my_device_sessions'
  ? { error: { code: 'PGRST202' } } : { error: { code: 'NETWORK' } };
await assert.rejects(realAuth.getState().logoutAllDevices(), /Chưa thể/);
rpcHandler = () => ({ error: null });
db.auth.signOut = async () => ({ error: new Error('offline') });
await assert.rejects(realAuth.getState().logoutAllDevices(), /Chưa thể/);
db.auth.signOut = async () => ({ error: null });
await realAuth.getState().logoutAllDevices();
assert.equal(realAuth.getState().user, null);

// Real profile UI keeps edits after failure and releases loading state.
const Profile = load(resolve(repo, 'src/app/profile/page.tsx')).default;
user = { id: 'student-a', name: 'Student A', email: 'student@example.test', avatarUrl: 'original.png' };
queryHandler = () => { throw new Error('offline'); };
await React.act(async () => root.render(React.createElement(Profile)));
const profileSave = () => Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('Lưu thay đổi'));
await React.act(async () => profileSave().click());
assert.match(document.querySelector('[role="alert"]').textContent, /Chưa thể lưu thông tin/);
assert.equal(profileSave().disabled, false);
queryHandler = () => ({ data: null, error: null });
await React.act(async () => profileSave().click());
assert.match(document.querySelector('[role="status"]').textContent, /Đã lưu/);
const imageInput = document.querySelector('input[type=file]');
Object.defineProperty(imageInput, 'files', { configurable: true, value: [new window.File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' })] });
await React.act(async () => imageInput.dispatchEvent(new window.Event('change', { bubbles: true })));
assert.match(document.querySelector('[role="alert"]').textContent, /PNG/);
queryHandler = () => ({ data: null, error: { code: 'NETWORK' } });
class TestFileReader {
  result = 'data:image/png;base64,TEST';
  readAsDataURL() { queueMicrotask(() => this.onload()); }
}
Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
Object.defineProperty(imageInput, 'files', { configurable: true, value: [new window.File(['png'], 'image.png', { type: 'image/png' })] });
await React.act(async () => imageInput.dispatchEvent(new window.Event('change', { bubbles: true })));
assert.match(document.querySelector('[role="alert"]').textContent, /Chưa thể lưu ảnh/);
assert.equal(imageInput.disabled, false);
// Switching accounts remounts the form: no stale private fields.
user = { id: 'student-b', name: 'Student B', email: 'b@example.test' };
await React.act(async () => root.render(React.createElement(Profile)));
assert.equal(document.querySelector('#profile-name').value, 'Student B');
db.auth.getSession = async () => ({ data: { session: null }, error: null });
await React.act(async () => Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Bảo mật').click());
assert.match(document.body.textContent, /Không thể tải danh sách thiết bị/);
queryHandler = () => { throw new Error('offline'); };
await React.act(async () => Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('Làm mới')).click());
assert.match(document.body.textContent, /Chưa thể tải thiết bị/);
assert.doesNotMatch(document.body.textContent, /Đang tải thiết bị/);
profileLogout = async () => { throw new Error('offline'); };
await React.act(async () => Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Đăng xuất tất cả thiết bị').click());
assert.match(document.querySelector('[role="alert"]').textContent, /Chưa thể đăng xuất/);
assert.equal(Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Đăng xuất tất cả thiết bị').disabled, false);
await clear();
user = null;
window.history.replaceState({}, '', '/offline');
const AuthGuard = load(resolve(repo, 'src/components/layout/auth-guard.tsx')).AuthGuard;
let redirects = 0;
router.replace = () => { redirects++; };
await React.act(async () => root.render(React.createElement(AuthGuard, {}, React.createElement('h1', {}, 'Offline recovery'))));
assert.match(document.body.textContent, /Offline recovery/);
assert.equal(redirects, 0);
realAuth.setState({ user: { id: 'student-a' } });
await realAuth.getState().refreshUser();
assert.equal(realAuth.getState().user.id, 'student-a'); // network error isn't a logout
db.auth.getUser = async () => ({ data: { user: { id: 'student-a', email: 'student@example.test' } }, error: null });
queryHandler = () => ({ data: { id: 'student-a', name: 'A', email: 'vietdang293.vn@gmail.com', account_tier: 'flygo' }, error: null });
await realAuth.getState().refreshUser();
assert.equal(realAuth.getState().user.email, 'student@example.test'); // editable profile cannot impersonate admin
const oldProfile = deferred();
db.auth.getUser = async () => ({ data: { user: { id: 'student-a' } }, error: null });
queryHandler = () => oldProfile.promise;
const refreshing = realAuth.getState().refreshUser();
await flush();
authCallback('SIGNED_OUT', null);
oldProfile.resolve({ data: { id: 'student-a', name: 'A', account_tier: 'flygo' }, error: null });
await refreshing;
assert.equal(realAuth.getState().user, null);
await React.act(async () => root.unmount());
dom.window.close();
console.log('PASS: safe navigation/HTML, corrupt drafts, >1000 rows, saved-question rollback/locking, account isolation, double-answer lock, real online-time stats, notification network recovery/channel isolation, missing/empty exams and result ownership.');
