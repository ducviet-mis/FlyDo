// Exercise real homepage/components/stores; isolate only authentication refresh and HTTP I/O.
// Optional --snapshots <dir> exports the mounted DOM and source CSS modules for browser QA.
// Reproducible setup and commands: docs/homepage-ui-verification.md.
import { test, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname, basename, join } from 'node:path';

const repo = resolve(process.cwd());
const require = createRequire(resolve(repo, 'package.json'));
let jsdom;
try { jsdom = require('./tmp/question-report-db-test/node_modules/jsdom'); }
catch { throw new Error('Install the isolated test dependency first: npm install --prefix tmp/question-report-db-test --no-save --package-lock=false jsdom@26.1.0 (see docs/homepage-ui-verification.md)'); }
const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/home', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DocumentFragment']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.localStorage = window.localStorage;
globalThis.self = window;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = query => ({ matches: false, media: query, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://home-ui-test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-only-anonymous-key';
const React = require('react');
const { createRoot } = require('react-dom/client');
const { ThemeProvider } = require('next-themes');
const ts = require('typescript');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const uid = '10000000-0000-4000-8000-000000000001';
const lessonId = '20000000-0000-4000-8000-000000000001';
const user = { id: uid, name: 'Học sinh thử nghiệm', email: 'student@example.invalid', accountTier: 'flygo', referralRewardDays: 0, referralDiscountPercent: 0, createdAt: '2026-01-01T00:00:00Z' };
let root, fixture, requests;
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  assert.equal(url.hostname, 'home-ui-test.supabase.co', 'Tests must never access live data');
  requests.push({ url, method: init.method || 'GET' });
  const table = url.pathname.split('/').at(-1), select = url.searchParams.get('select');
  if (table === 'check_in_learning_streak') return response({ ok: true, current_streak: 3, best_streak: 5, last_checkin_date: '2026-10-07', claimed_milestones: [], discount_expires_at: null });
  if (table === 'practice_progress') {
    if (select === 'lesson_id,difficulty_level') return fixture.recentError ? response({ message: 'Test offline' }, 503) : response(fixture.recent ? [{ lesson_id: lessonId, difficulty_level: fixture.level }] : []);
    if ((init.method || '').toUpperCase() === 'HEAD') return new Response(null, { headers: { 'Content-Range': `0-${fixture.answered - 1}/${fixture.answered}` } });
    // Retain actual SDK retry/error behavior without long synthetic backoff delays.
    if (url.searchParams.get('is_correct') === 'eq.false') return fixture.wrongError ? response({ message: 'Test offline' }, 503, { 'Retry-After': '0' }) : response(fixture.wrong ? [{ id: 'wrong-1', user_id: uid, question_id: 'question-1', lesson_id: lessonId, difficulty_level: 2, selected_answer: 1, is_correct: false, answered_at: '2026-10-07T02:00:00Z' }] : []);
    if (fixture.emptyStats) return response([]);
    const count = fixture.historyStats && !url.searchParams.has('answered_at') ? 8 : 2;
    return response(Array.from({ length: count }, (_, i) => ({ question_id: `question-${i + 1}`, is_correct: count === 8 ? i < 6 : i === 1 })));
  }
  if (table === 'practice_lessons') return response({ title: fixture.title, grade: 8 });
  if (table === 'practice_questions') {
    if ((init.method || '').toUpperCase() === 'HEAD') return new Response(null, { headers: { 'Content-Range': '0-29/30' } });
    return response([{ id: 'question-1', lesson_id: lessonId, content: 'Câu hỏi thử nghiệm', options: ['A', 'B', 'C', 'D'], correct_answer: 0, difficulty_level: 2 }]);
  }
  if (table === 'user_daily_online_time') {
    if (!fixture.historyStats) return response([]);
    const rows = [
      { study_date: localStudyDate(new Date(Date.now() - 86400000)), seconds: 1800 },
      { study_date: localStudyDate(new Date(Date.now() - 35 * 86400000)), seconds: 7200 },
    ];
    const start = url.searchParams.getAll('study_date').find(value => value.startsWith('gte.'))?.slice(4);
    return response(rows.filter(row => !start || row.study_date >= start));
  }
  throw Error(`Unexpected HTTP request: ${url}`);
};
const cache = new Map(), moduleCss = new Map();
function cssModule(filename) {
  if (moduleCss.has(filename)) return moduleCss.get(filename).tokens;
  const tokens = {}, prefix = basename(filename).replace(/\W/g, '_');
  const tree = postcss.parse(readFileSync(filename, 'utf8'));
  tree.walkRules(rule => {
    rule.selector = selectorParser(selectors => {
      selectors.walkClasses(node => {
        let parent = node.parent;
        while (parent && !(parent.type === 'pseudo' && parent.value === ':global')) parent = parent.parent;
        if (!parent) { tokens[node.value] ||= `qa_${prefix}_${node.value}`; node.value = tokens[node.value]; }
      });
      selectors.walkPseudos(node => { if (node.value === ':global') node.replaceWith(...node.nodes[0].nodes); });
    }).processSync(rule.selector);
  });
  moduleCss.set(filename, { tokens, css: tree.toString() });
  return tokens;
}
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename); cache.set(filename, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = name => {
    if (name.endsWith('.module.css')) return cssModule(resolve(dirname(filename), name));
    if (name.endsWith('.css')) return {};
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.tsx', '.ts'].map(s => base + s).find(existsSync);
      if (path) return load(path);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const HomePage = load(resolve(repo, 'src/app/home/page.tsx')).default;
const { ContinueLearning } = load(resolve(repo, 'src/features/dashboard/components/continue-learning.tsx'));
const { useAuthStore } = load(resolve(repo, 'src/features/auth/stores/auth-store.ts'));
const { useGoalStore } = load(resolve(repo, 'src/features/daily-goal/stores/goal-store.ts'));
const { localStudyDate } = load(resolve(repo, 'src/features/daily-goal/stores/online-study-store.ts'));
const { getSupabaseClient } = load(resolve(repo, 'src/lib/supabase/client.ts'));
const text = (el = document.body) => el.textContent.replace(/\s+/g, ' ').trim();
const findButton = label => [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || text(b) === label);
const findLink = (label, scope = document) => [...scope.querySelectorAll('a')].find(a => text(a) === label);
const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const getHero = () => document.querySelector('section[aria-labelledby="sol-heading"], section[aria-labelledby="luna-heading"]');
async function mount({ theme = 'light', anonymous = false, component = HomePage, ...overrides } = {}) {
  window.localStorage.clear(); requests = [];
  window.localStorage.setItem('theme', theme);
  fixture = { recent: true, level: 2, answered: 12, title: 'Bài 2 — Đa thức', wrong: true, recentError: false, wrongError: false, ...overrides };
  // Auth refresh is an external boundary; learning data/stores/hooks remain real.
  useAuthStore.setState({ user: anonymous ? null : user, refreshUser: async () => {} });
  useGoalStore.setState({ goals: { studyMinutes: 60, questionsCount: 30, accuracy: 80 } });
  root = createRoot(document.getElementById('root'));
  await React.act(async () => { root.render(React.createElement(ThemeProvider, { defaultTheme: theme, forcedTheme: theme, attribute: 'class', enableSystem: false }, React.createElement(component))); });
  await React.act(async () => { await new Promise(r => setTimeout(r, 40)); });
}
const snapshotFlag = process.argv.indexOf('--snapshots');
const snapshotDir = snapshotFlag >= 0 ? resolve(process.argv[snapshotFlag + 1]) : null;
function snapshot(name) {
  if (!snapshotDir) return;
  mkdirSync(snapshotDir, { recursive: true });
  const body = document.body.cloneNode(true);
  body.querySelectorAll('script').forEach(el => el.remove());
  writeFileSync(join(snapshotDir, `${name}.html`), `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FlyDo UI QA — dữ liệu giả</title><style>${[...moduleCss.values()].map(m => m.css).join('\n')}</style></head>${body.outerHTML}</html>`);
}
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; getSupabaseClient().auth.stopAutoRefresh(); });
after(() => { getSupabaseClient().auth.broadcastChannel?.close(); dom.window.close(); });

for (const theme of ['light', 'dark']) {
  test(`${theme}: greeting is followed by the real lesson/action, then goals/review before supporting information`, async () => {
    await mount({ theme });
    const hero = getHero(), greeting = hero.querySelector('h1'), resume = document.querySelector('#continue-learning');
    assert.ok(hero.contains(resume), 'Resume must live inside the compact hero, not after the illustration');
    assert.match(text(greeting), /Học sinh thử nghiệm/);
    assert.ok(before(greeting, resume));
    const action = findLink('Tiếp tục học');
    assert.equal(action?.getAttribute('href'), `/practice/${lessonId}?level=2`);
    assert.equal(document.querySelectorAll('#resume-heading').length, 1, 'Only one recent lesson/query owner');
    const headings = [...document.querySelectorAll('h2')];
    const goals = headings.find(h => /Hôm nay của bạn/.test(text(h))), review = headings.find(h => /Việc nên làm tiếp/.test(text(h)));
    const stats = headings.find(h => /Kết quả học tập/.test(text(h))), exam = headings.find(h => /Kỳ thi sắp tới/.test(text(h))), quote = headings.find(h => /Góc cảm hứng/.test(text(h)));
    assert.ok(goals && review && stats && exam && quote);
    assert.ok(before(resume, goals) && before(goals, review));
    for (const support of [stats, exam, quote]) assert.ok(before(review, support));
    assert.equal(findLink('Luyện lại ngay')?.getAttribute('href'), '/practice/wrong');
    assert.equal(requests.filter(r => r.url.searchParams.get('select') === 'lesson_id,difficulty_level').length, 1);
    snapshot(`${theme}-recent`);
  });
  test(`${theme}: static hero has no effects toggle or connecting dashed paths and retains every destination`, async () => {
    await mount({ theme });
    const hero = getHero();
    assert.equal(Boolean(hero.querySelector('button')), false, 'A static illustration must not offer a nonfunctional effects control');
    assert.equal(Boolean(hero.querySelector('svg path[stroke-dasharray]')), false, 'Learning destinations should not be connected by dashed lines');
    for (const href of ['/theory', '/practice', '/mock-exams', '/handbook']) {
      const link = hero.querySelector(`a[href="${href}"]`);
      assert.ok(link?.getAttribute('aria-label'));
    }
  });
}
test('completed lesson retains the next-lesson route and accurate capped progress', async () => {
  await mount({ answered: 35 });
  assert.equal(findLink('Chọn bài tiếp theo')?.getAttribute('href'), '/practice?grade=8');
  const bar = document.querySelector('[role="progressbar"]');
  assert.equal(bar.getAttribute('aria-valuenow'), '30'); assert.equal(bar.getAttribute('aria-valuemax'), '30');
  snapshot('light-complete');
});
for (const anonymous of [true, false]) test(`${anonymous ? 'anonymous' : 'new student'} retains class selection when no recent lesson exists`, async () => {
  await mount({ anonymous, recent: false, wrong: false });
  assert.equal(findLink('Chọn lớp để bắt đầu')?.getAttribute('href'), '#practice-heading');
  for (const grade of [6, 7, 8, 9]) assert.ok(document.querySelector(`a[href="/practice?grade=${grade}"]`));
  assert.equal(Boolean(findLink('Tiếp tục học', getHero())), false, 'No recent lesson means no direct resume link in the hero');
  snapshot(anonymous ? 'light-anonymous' : 'light-new');
});
test('recent lesson network failure leaves a usable class picker', async () => {
  await mount({ recentError: true });
  assert.equal(findLink('Chọn lớp để bắt đầu')?.getAttribute('href'), '#practice-heading');
});
test('zero wrong answers offers a next learning action, not a dead disabled review button', async () => {
  await mount({ wrong: false });
  const region = [...document.querySelectorAll('h2')].find(h => /Việc nên làm tiếp/.test(text(h)))?.closest('[data-vivux-card]');
  assert.ok(region?.querySelector('a[href="#practice-heading"]'));
  assert.equal(region?.querySelector('a[href="/practice/wrong"]'), null);
  snapshot('light-no-wrong');
});
test('wrong-notebook network failure shows feedback without a misleading review link', async () => {
  await mount({ wrongError: true });
  const region = [...document.querySelectorAll('h2')].find(h => /Việc nên làm tiếp/.test(text(h)))?.closest('[data-vivux-card]');
  assert.ok(region?.querySelector('[role="alert"]'));
  assert.equal(region?.querySelector('a[href="/practice/wrong"]'), null);
  assert.ok(region?.querySelector('button:disabled'));
});
test('compact goals retain all live metrics and the editable goal dialog', async () => {
  await mount();
  for (const label of ['Thời gian học', 'Câu hoàn thành', 'Chính xác']) assert.ok(document.querySelector(`[role="img"][aria-label^="${label}:"]`));
  await React.act(async () => findButton('Cài đặt mục tiêu hằng ngày').click());
  assert.ok(document.querySelector('[role="dialog"]'));
  const input = document.getElementById('goal-questions');
  await React.act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '40'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await React.act(async () => findButton('Lưu mục tiêu').click());
  assert.equal(useGoalStore.getState().goals.questionsCount, 40);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.match(document.querySelector('[aria-label^="Câu hoàn thành:"]').getAttribute('aria-label'), /2\/40/);
});
test('daily values precede secondary indicators in question/time/accuracy order', async () => {
  await mount();
  const region = [...document.querySelectorAll('h2')].find(h => /Hôm nay của bạn/.test(text(h))).closest('[data-vivux-card]');
  assert.deepEqual([...region.querySelectorAll('dt')].map(text), ['Câu hoàn thành', 'Thời gian học', 'Chính xác']);
  assert.deepEqual([...region.querySelectorAll('dd')].map(node => text(node).replace(/\s/g, '')), ['2/30câu', '0/60phút', '50%']);
  assert.ok(region.textContent.includes('Câu hỏi từ tự luyện'));
  assert.ok(region.textContent.includes('Thời gian online trên FlyDo'), 'Global online time must not be presented as practice-only time');
  for (const metric of region.querySelectorAll('dl > div')) assert.ok(before(metric.querySelector('dd'), metric.querySelector('[role="img"]')), 'Values must precede decorative goal indicators');
});
for (const theme of ['light', 'dark']) test(`${theme}: longer-term statistics distinguish all-time from daily data and expose useful actions`, async () => {
  await mount({ theme, historyStats: true });
  const region = [...document.querySelectorAll('h2')].find(h => /Kết quả học tập/.test(text(h)))?.closest('[data-vivux-card]');
  assert.ok(region, 'A separately labeled statistics region is required');
  assert.ok(region.textContent.includes('thời gian online trên toàn FlyDo'), 'Cumulative time also includes other learning pages');
  const tabs = [...region.querySelectorAll('[role="tab"]')];
  assert.deepEqual(tabs.map(text), ['Hôm nay', '7 ngày gần nhất', '30 ngày gần nhất', 'Toàn bộ']);
  const metrics = () => [...region.querySelectorAll('dl > div')].map(node => [text(node.querySelector('dt')), text(node.querySelector('dd')).replace(/\s/g, '')]);
  assert.deepEqual(metrics(), [['Câu đã làm', '2câu'], ['Thời gian học', '30phút'], ['Chính xác', '50%']]);
  assert.ok(before(region.querySelector('dl'), region.querySelector('[role="img"]')), 'Chart must follow the key values');
  await React.act(async () => tabs[3].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  await React.act(async () => { await new Promise(r => setTimeout(r, 40)); });
  assert.equal(tabs[3].getAttribute('aria-selected'), 'true');
  assert.deepEqual(metrics(), [['Câu đã làm', '8câu'], ['Thời gian học', '150phút'], ['Chính xác', '75%']]);
  assert.ok(region.querySelector('[role="img"][aria-label*="6 câu đúng, 2 câu sai"]'));
  assert.ok(region.textContent.includes('Tích lũy toàn bộ'));
  assert.equal(region.querySelector('a[href="/practice/wrong"]').textContent.trim(), 'Ôn câu sai');
  assert.equal(region.querySelector('a[href="#continue-learning"]').textContent.trim(), 'Tiếp tục học');
  assert.match(document.querySelector('[aria-label^="Câu hoàn thành:"]').getAttribute('aria-label'), /2\/30/);
  const allQuery = requests.find(r => r.url.pathname.endsWith('/practice_progress') && r.url.searchParams.get('select') === 'question_id,is_correct' && !r.url.searchParams.has('answered_at'));
  assert.ok(allQuery && allQuery.url.searchParams.get('user_id') === `eq.${uid}`, 'All-time reads remain account-scoped');
  assert.ok(requests.filter(r => r.url.pathname.includes('/rest/v1/') && !r.url.pathname.includes('/rpc/')).every(r => ['GET', 'HEAD'].includes(r.method)), 'Presentation must not write learning data');
  snapshot(`${theme}-progress-all`);
});
test('empty statistics explain missing practice results instead of offering nonexistent mistakes', async () => {
  await mount({ emptyStats: true, wrong: false, recent: false });
  const region = [...document.querySelectorAll('h2')].find(h => /Kết quả học tập/.test(text(h)))?.closest('[data-vivux-card]');
  assert.ok(region?.textContent.includes('Chưa có kết quả tự luyện trong khoảng này'));
  assert.equal(Boolean(region.querySelector('a[href="/practice/wrong"]')), false);
  assert.ok(region.querySelector('a[href="#practice-heading"]'));
});
test('legacy/null difficulty still resumes level 1 through the same data filters', async () => {
  await mount({ component: ContinueLearning, level: null });
  assert.equal(findLink('Tiếp tục học')?.getAttribute('href'), `/practice/${lessonId}?level=1`);
  const counts = requests.filter(r => r.method === 'HEAD');
  assert.equal(counts.length, 2);
  assert.ok(counts.every(r => r.url.searchParams.get('or') === '(difficulty_level.eq.1,difficulty_level.eq.0,difficulty_level.is.null)'));
});
for (const theme of ['light', 'dark']) test(`${theme}: long lesson names remain available with the exact resume route`, async () => {
  const title = 'BÀI 12 — HÌNH BÌNH HÀNH, HÌNH CHỮ NHẬT VÀ DẤU HIỆU NHẬN BIẾT';
  await mount({ theme, title });
  assert.equal(text(document.getElementById('resume-heading')), title);
  assert.equal(findLink('Tiếp tục học')?.getAttribute('href'), `/practice/${lessonId}?level=2`);
  snapshot(`${theme}-long-title`);
});
