// Real exam hook, room, results and ADMIN reports. Only auth/RPC boundaries are fixtures.
// Uses the repository's existing isolated jsdom runtime; no live account or database.
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';

const repo = process.cwd(), require = createRequire(resolve(repo, 'package.json'));
const snapshotArgument = process.argv.indexOf('--snapshots');
if (snapshotArgument >= 0) assert.ok(process.argv[snapshotArgument + 1], '--snapshots requires an output directory');
const snapshotDirectory = snapshotArgument >= 0 ? resolve(process.argv[snapshotArgument + 1]) : null;
const exportedSnapshots = new Set();
const dom = new jsdom.JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/mock-exams/exam', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'DocumentFragment']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const React = require('react'), { createRoot } = require('react-dom/client'), ts = require('typescript');
let user = { id: 'student-a', name: 'A' }, hook, rpcHandler, queryHandler, calls = [];
const auth = Object.assign((selector) => selector ? selector({ user, initialized: true }) : ({ user, initialized: true }), { getState: () => ({ user }) });
class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select() { return this; } eq(key, value) { this.filters.push([key, value]); return this; }
  order() { return this; } range() { return this; } single() { this.one = true; return this; }
  then(done, fail) { return Promise.resolve().then(() => queryHandler(this)).then(done, fail); }
}
const db = { rpc(name, args) {
  calls.push({ name, args });
  const request = Promise.resolve().then(() => rpcHandler(name, args));
  request.abortSignal = () => request; return request;
}, from(table) { assert.ok(['question_reports', 'question_report_responses'].includes(table), 'No direct answer/score query'); return new Query(table); } };
const cache = new Map(), router = { replace() {}, push() {}, back() {} };
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename); cache.set(filename, mod);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = (name) => {
    if (name.endsWith('.css')) return {};
    if (name === '@/features/auth/stores/auth-store') return { useAuthStore: auth };
    if (name === '@/lib/supabase/client') return { getSupabaseClient: () => db };
    if (name === 'next/navigation') return { useRouter: () => router, useParams: () => ({ examId: 'exam' }), useSearchParams: () => new URLSearchParams(window.location.search) };
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
const root = createRoot(document.getElementById('root'));
const { useServerExam } = load(resolve(repo, 'src/features/mock-exams/use-server-exam.ts'));
const Room = load(resolve(repo, 'src/app/mock-exams/[examId]/page.tsx')).default;
const Result = load(resolve(repo, 'src/app/mock-exams/[examId]/result/page.tsx')).default;
function Harness() { hook = useServerExam('exam', user.id); return null; }
const sessionId = '10000000-0000-4000-8000-000000000001', key = 'flydo:mock-exam-draft:v2:student-a:exam';
const statements = [true, false, true, false].map((correct_answer, i) => ({ content: `Khẳng định ${i + 1}`, correct_answer, solution: `Giải thích ý ${i + 1}` }));
const publicTF = { id: 'tf', content: 'Xét bốn khẳng định', question_type: 'true_false', options: [], diagram: null, statements: statements.map(({ content }) => ({ content })), max_points: 4 };
const fixture = () => ({ session_id: sessionId, exam: { id: 'exam', title: 'Đề hỗn hợp', grade: 8, duration: 10 }, questions: [publicTF,
  { id: 'mc', content: 'Chọn số', question_type: 'multiple_choice', options: ['1', '2'], diagram: null, max_points: 2 },
  { id: 'sa', content: 'Nhập số', question_type: 'short_answer', options: [], diagram: null, max_points: 4 }],
  answers: {}, revision: 0, deadline_at: new Date(Date.now() + 600_000).toISOString(), server_now: new Date().toISOString(), attempt_id: null });
const deferred = () => { let done; const promise = new Promise(resolve => done = resolve); return { promise, done }; };
async function render(Component) { await React.act(async () => root.render(React.createElement(Component))); }
async function click(element) { assert.ok(element, 'Expected an operable control'); await React.act(async () => element.click()); }
function exportMountedSnapshot(filename) {
  if (!snapshotDirectory) return;
  const clone = document.documentElement.cloneNode(true);
  // HTML serialization omits live form properties unless copied into attributes.
  const inputs = clone.querySelectorAll('input');
  document.querySelectorAll('input').forEach((input, index) => {
    inputs[index].setAttribute('value', input.value);
    inputs[index].toggleAttribute('checked', input.checked);
  });
  const textareas = clone.querySelectorAll('textarea');
  document.querySelectorAll('textarea').forEach((input, index) => { textareas[index].textContent = input.value; });
  const options = clone.querySelectorAll('option');
  document.querySelectorAll('option').forEach((option, index) => options[index].toggleAttribute('selected', option.selected));
  const head = clone.querySelector('head');
  for (const attributes of [{ charset: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }]) {
    const meta = document.createElement('meta');
    Object.entries(attributes).forEach(([name, value]) => meta.setAttribute(name, value));
    head.append(meta);
  }
  mkdirSync(snapshotDirectory, { recursive: true });
  writeFileSync(resolve(snapshotDirectory, filename), `<!doctype html>\n${clone.outerHTML}\n`, 'utf8');
  exportedSnapshots.add(filename);
}
async function reset() { await React.act(async () => root.render(null)); window.localStorage.clear(); calls = []; window.history.replaceState({}, '', '/mock-exams/exam'); }
let failures = 0, passed = 0;
async function test(name, run) { try { await run(); passed++; console.log(`PASS: ${name}`); } catch (error) { failures++; console.error(`FAIL: ${name}\n${error.stack}`); } finally { await reset(); } }
function useFixture(overrides = {}) {
  let revision = overrides.revision ?? 0;
  rpcHandler = (name, args) => Promise.resolve({ data: name === 'start_mock_exam_session' ? { ...fixture(), ...overrides }
    : { accepted: true, revision: ++revision, answers: args.p_answers }, error: null });
}

await test('hook preserves false and partial tuples; queues immutable snapshots and rejects malformed choices', async () => {
  useFixture(); await render(Harness); assert.equal(hook.ready, true, 'Mixed TF session must load');
  const pending = deferred(); let revision = 0;
  rpcHandler = (name, args) => ++revision === 1 ? pending.promise : Promise.resolve({ data: { accepted: true, revision, answers: args.p_answers }, error: null });
  const tuple = [false, null, null, null];
  await React.act(async () => hook.chooseAnswer('tf', tuple));
  tuple[0] = true;
  assert.deepEqual(hook.answers.tf, [false, null, null, null], 'Caller mutation cannot change pending answers');
  await React.act(async () => hook.chooseAnswer('tf', [false, true, null, null]));
  assert.equal(calls.filter(c => c.name === 'save_mock_exam_answers').length, 1);
  await React.act(async () => pending.done({ data: { accepted: true, revision: 1 }, error: null }));
  assert.deepEqual(calls.at(-1).args.p_answers, { tf: [false, true, null, null] });
  assert.equal(calls.at(-1).args.p_expected_revision, 1);
  const count = calls.length;
  await React.act(async () => { for (const value of [[false], [false, null, null, 'false'], [null, null, null, null, null], false, 0]) hook.chooseAnswer('tf', value); hook.chooseAnswer('unknown', [true, true, true, true]); });
  assert.equal(calls.length, count);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(key)).answers.tf, [false, true, null, null]);
});

await test('partial draft restores and clearing last statement deletes the entire answer without resurrection', async () => {
  window.localStorage.setItem(key, JSON.stringify({ version: 2, sessionId, revision: 0, complete: true, answers: { tf: [null, false, null, null] }, currentIndex: 0 }));
  useFixture(); await render(Harness);
  assert.deepEqual(hook.answers.tf, [null, false, null, null]);
  rpcHandler = () => Promise.resolve({ data: null, error: { message: 'offline' } });
  await React.act(async () => hook.chooseAnswer('tf', [null, null, null, null]));
  assert.equal(hook.answers.tf, undefined);
  assert.deepEqual(calls.at(-1).args.p_answers, {});
  const draft = JSON.parse(window.localStorage.getItem(key));
  assert.equal(draft.complete, true); assert.deepEqual(draft.answers, {});
  await React.act(async () => root.render(null));
  useFixture({ revision: draft.revision, answers: { tf: [null, false, null, null] } }); await render(Harness);
  assert.equal(hook.answers.tf, undefined); assert.deepEqual(calls.at(-1).args.p_answers, {});
  await React.act(async () => hook.chooseAnswer('tf', [true, false, null, null]));
  await React.act(async () => hook.clearAnswer('tf'));
  assert.equal(hook.answers.tf, undefined);
});

await test('room has four accessible radio groups, per-statement clear and partial progress; keyboard preserves question', async () => {
  useFixture(); await render(Room);
  assert.equal(document.querySelectorAll('fieldset').length, 4);
  const radios = [...document.querySelectorAll('input[type="radio"]')]; assert.equal(radios.length, 8);
  assert.equal(new Set(radios.map(r => r.name)).size, 4);
  assert.ok(radios.every(r => document.querySelector(`label[for="${r.id}"]`)));
  await click(radios[1]); await click(radios[2]);
  assert.deepEqual(calls.at(-1).args.p_answers.tf, [false, true, null, null]);
  assert.match(document.body.textContent, /2\/4 ý/);
  assert.equal(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '0', 'Complete question count differs from any chosen');
  assert.match(document.querySelector('[aria-label^="Đi tới câu 1"]').getAttribute('aria-label'), /2\/4 ý/);
  exportMountedSnapshot('room-partial-2-of-4.html');
  await React.act(async () => radios[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  assert.equal(document.querySelectorAll('input[type="radio"]').length, 8);
  await click(document.querySelector('[aria-label="Bỏ chọn ý a"]'));
  assert.deepEqual(calls.at(-1).args.p_answers.tf, [null, true, null, null]);
  await click(radios[0]); await click(radios[4]); await click(radios[7]);
  assert.equal(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '1', 'All four choices complete one question');
  assert.match(document.querySelector('[aria-label^="Đi tới câu 1"]').getAttribute('aria-label'), /đã trả lời/);
  for (const letter of ['a', 'b', 'c', 'd']) await click(document.querySelector(`[aria-label="Bỏ chọn ý ${letter}"]`));
  assert.deepEqual(calls.at(-1).args.p_answers, {}, 'Room clearing the final choice deletes the question at the RPC boundary');
  assert.equal(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '0');
  assert.ok(!/Giải thích ý|Đáp án chuẩn/.test(document.body.textContent), 'No key/solution before grading');
});

await test('submit dialog separates blank questions from missing statements; busy submission disables radios', async () => {
  useFixture({ answers: { tf: [false, null, true, null] } }); await render(Room);
  await click([...document.querySelectorAll('button')].find(b => b.textContent === 'Nộp bàiNộp'));
  const dialog = document.querySelector('[role="alertdialog"]'); assert.ok(dialog);
  assert.match(dialog.textContent, /2 câu chưa làm/); assert.match(dialog.textContent, /1 câu đúng\/sai còn 2 ý chưa chọn/);
  const pending = deferred(); rpcHandler = name => { assert.equal(name, 'submit_mock_exam_session'); return pending.promise; };
  await click([...dialog.querySelectorAll('button')].find(b => b.textContent === 'Nộp bài ngay'));
  assert.ok([...document.querySelectorAll('input[type="radio"]')].every(r => r.disabled));
  await React.act(async () => pending.done({ data: null, error: { message: 'offline' } }));
  assert.match(document.body.textContent, /Chưa nộp/);
});

const resultFixture = () => ({ exam: fixture().exam, questions: [{ ...publicTF, statements, max_points: 4, earned_points: 1, correct_statement_count: 2, is_correct: false },
  { ...fixture().questions[1], correct_answer: 1, is_correct: true, max_points: 2, earned_points: 2 }],
  attempt: { id: 'a1', user_id: user.id, exam_id: 'exam', score: '3.00', answers: { tf: [true, true, true, null], mc: 1 }, correct_count: 1, total_questions: 2, duration_used: 30 },
  section_scores: { multiple_choice: { max_points: 2, earned_points: 2, question_count: 1 }, true_false: { max_points: 4, earned_points: 1, question_count: 1 }, short_answer: { max_points: 4, earned_points: 0, question_count: 0 } }, partial_count: 1 });
await test('result uses server section/per-question points and partial count, shows all statement choices/keys/solutions', async () => {
  window.history.replaceState({}, '', '/?attemptId=a1'); rpcHandler = () => Promise.resolve({ data: resultFixture(), error: null });
  await render(Result);
  assert.match(document.body.textContent, /Điểm từng phần/); assert.match(document.body.textContent, /1 câu đúng một phần/);
  assert.match(document.body.textContent, /1 \/ 4 điểm/); assert.match(document.body.textContent, /2\/4 ý đúng/);
  assert.match(document.body.textContent, /Đúng một phần/);
  const rows = [...document.querySelectorAll('[data-statement-review]')]; assert.equal(rows.length, 4);
  assert.match(rows[0].textContent, /Bạn chọn: Đúng/); assert.match(rows[1].textContent, /Bạn chọn: Đúng/);
  assert.match(rows[1].textContent, /Đáp án chuẩn: Sai/); assert.match(rows[3].textContent, /Chưa chọn/);
  assert.ok(rows.every((row, i) => row.textContent.includes(`Giải thích ý ${i + 1}`)));
  assert.match(document.body.textContent, /3.00/);
  exportMountedSnapshot('result-weighted-statements.html');
});

await test('graded blank, fully incorrect and fully correct TF questions remain distinct from partial credit', async () => {
  const data = resultFixture();
  data.questions = [
    { ...publicTF, id: 'blank', statements, earned_points: 0, correct_statement_count: 0, is_correct: false },
    { ...publicTF, id: 'wrong', statements, earned_points: 0, correct_statement_count: 0, is_correct: false },
    { ...publicTF, id: 'full', statements, earned_points: 4, correct_statement_count: 4, is_correct: true },
  ];
  data.attempt.answers = { blank: [null, null, null, null], wrong: [false, true, false, true], full: [true, false, true, false] };
  data.partial_count = 0;
  window.history.replaceState({}, '', '/?attemptId=a1'); rpcHandler = () => Promise.resolve({ data, error: null }); await render(Result);
  const cards = [...document.querySelectorAll('.sol-result-question')]; assert.equal(cards.length, 3);
  assert.match(cards[0].textContent, /Chưa làm/); assert.match(cards[1].textContent, /Sai/); assert.match(cards[2].textContent, /Đúng hoàn toàn/);
  assert.ok(cards.every(card => !card.textContent.includes('Đúng một phần')));
  assert.match(cards[2].textContent, /4 \/ 4 điểm/);
});

await test('legacy results never fabricate section or question weights', async () => {
  const old = resultFixture(); delete old.section_scores; delete old.partial_count;
  old.questions = [{ ...fixture().questions[1], correct_answer: 1, is_correct: true }];
  old.exam.scoring_mode = 'sectioned'; // Current exam setting must never retrofit historical attempts.
  window.history.replaceState({}, '', '/?attemptId=a1'); rpcHandler = () => Promise.resolve({ data: old, error: null }); await render(Result);
  assert.ok(!/Điểm từng phần|điểm tối đa|\/ 2 điểm|câu đúng một phần/.test(document.body.textContent));
});

await test('report parser retains canonical TF keys/solutions, strips invalid points, preserves old snapshots', async () => {
  const { parseQuestionSnapshot } = load(resolve(repo, 'src/features/question-reports/report-model.ts'));
  assert.equal(typeof parseQuestionSnapshot, 'function', 'ADMIN needs a canonical snapshot parser');
  const parsed = parseQuestionSnapshot({ ...publicTF, statements, correct_answer: null, accepted_answers: [] });
  assert.deepEqual(parsed.statements, statements); assert.equal(parsed.max_points, 4);
  for (const max_points of [-1, '4', Infinity, NaN, 0, 0.12345]) assert.equal(parseQuestionSnapshot({ ...publicTF, statements, max_points }).max_points, undefined);
  assert.equal(parseQuestionSnapshot({ ...publicTF, statements: statements.slice(1) }), null);
  assert.equal(parseQuestionSnapshot({ ...publicTF, statements: statements.map(s => ({ ...s, correct_answer: 'false' })) }), null);
  const oldMC = { content: 'old', options: ['a', 'b'], correct_answer: 1, solution: 'solution' };
  const oldSA = { content: 'short', question_type: 'short_answer', options: [], correct_answer: null, accepted_answers: ['1/2'] };
  assert.deepEqual(parseQuestionSnapshot(oldMC), oldMC); assert.deepEqual(parseQuestionSnapshot(oldSA), oldSA);
});

await test('canonical ADMIN report viewer shows all four keys and solutions from snapshot', async () => {
  const report = { id: 'report-1', reporter_id: user.id, reporter_name: 'A', reporter_email: 'a@example.test', source: 'mock_exam', question_id: 'tf', source_id: 'exam', source_title: 'Đề hỗn hợp', grade: 8, chapter: null,
    question_snapshot: { ...publicTF, statements, correct_answer: null }, reason: 'wrong_answer', details: 'Kiểm tra', status: 'new', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  queryHandler = q => ({ data: q.table === 'question_report_responses' ? [] : q.one ? report : [report], count: 1, error: null });
  const Admin = load(resolve(repo, 'src/app/admin/question-reports/page.tsx')).default;
  await render(Admin); await click([...document.querySelectorAll('button')].find(b => /Xem câu hỏi/.test(b.textContent)));
  const rows = [...document.querySelectorAll('[data-statement-review]')]; assert.equal(rows.length, 4);
  assert.match(rows[0].textContent, /Đáp án chuẩn: Đúng/); assert.match(rows[1].textContent, /Đáp án chuẩn: Sai/);
  assert.ok(rows.every((row, i) => row.textContent.includes(`Giải thích ý ${i + 1}`)));
  assert.ok(!/Bạn chọn/.test(document.querySelector('[role="dialog"]').textContent), 'ADMIN snapshot is not a student answer');
});
if (snapshotDirectory) {
  assert.equal(exportedSnapshots.size, 2, 'Both snapshots must come from successful states in this run');
  const roomFile = resolve(snapshotDirectory, 'room-partial-2-of-4.html');
  const resultFile = resolve(snapshotDirectory, 'result-weighted-statements.html');
  assert.ok(existsSync(roomFile) && existsSync(resultFile), 'Successful mounted states must export both DOM snapshots');
  const roomSnapshot = new jsdom.JSDOM(readFileSync(roomFile, 'utf8'));
  const resultSnapshot = new jsdom.JSDOM(readFileSync(resultFile, 'utf8'));
  assert.equal(roomSnapshot.window.document.querySelectorAll('input[type="radio"]:checked').length, 2, 'Snapshot retains checked properties');
  const checked = [...roomSnapshot.window.document.querySelectorAll('input[type="radio"]:checked')];
  assert.deepEqual(checked.map(input => input.value), ['false', 'true']);
  assert.equal(resultSnapshot.window.document.querySelectorAll('[data-statement-review]').length, 4);
  assert.match(resultSnapshot.window.document.body.textContent, /1 \/ 4 điểm/);
  roomSnapshot.window.close(); resultSnapshot.window.close();
  console.log(`DOM snapshots: ${roomFile}; ${resultFile}`);
}
await React.act(async () => root.unmount()); dom.window.close();
console.log(`True/false exam UI: ${passed} passed, ${failures} failed`);
if (failures) process.exitCode = 1;
