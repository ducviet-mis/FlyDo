// Real ADMIN components; only auth, Next navigation and the remote DB are replaced.
// No requests or writes to a live Supabase project. Reuses the existing UI-test runtime.
// Setup from a clean checkout: see docs/admin-ui-verification.md.
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { test } from 'node:test';

const repo = resolve(process.cwd());
const require = createRequire(join(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/admin/practice', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLFormElement', 'HTMLDetailsElement', 'Element', 'Node', 'NodeFilter', 'MutationObserver', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DocumentFragment', 'DOMParser', 'Range']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
HTMLElement.prototype.scrollIntoView = () => {};
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
const React = require('react');
const { createRoot } = require('react-dom/client');
const ts = require('typescript');
let path = '/admin/practice';
let authState = { user: { id: 'admin-test', email: 'vietdang293.vn@gmail.com' }, initialized: true, isLoading: false };
const routes = [];
const writes = [];
const timestamp = '2026-10-04T02:00:00.000Z';
const fixtures = {
  practice_lessons: [
    { id: 'mono', grade: 8, chapter: 'ĐA THỨC', title: 'Bài 1 - Đơn thức', sort_order: 1, chapter_sort_order: 1 },
    { id: 'poly', grade: 8, chapter: 'ĐA THỨC', title: 'Bài 2 - Đa thức', sort_order: 2, chapter_sort_order: 1 },
    { id: 'quad', grade: 8, chapter: 'TỨ GIÁC', title: 'Bài 10 - Tứ giác', sort_order: 1, chapter_sort_order: 2 },
  ],
  practice_questions: [{ id: 'q1', lesson_id: 'mono', difficulty_level: 1 }, { id: 'q2', lesson_id: 'mono', difficulty_level: 2 }],
  theory_lessons: [
    { id: 't1', grade: 8, chapter: 'ĐA THỨC', title: 'Đơn thức', summary: 'Hệ số và phần biến của đơn thức.', content: '<p>Đơn thức là biểu thức đại số.</p>', is_published: true, sort_order: 0, chapter_sort_order: 0, created_at: timestamp, updated_at: timestamp },
    { id: 't2', grade: 8, chapter: 'ĐA THỨC', title: 'Đa thức', summary: 'Thu gọn và xác định bậc của đa thức.', content: '<p>Đa thức là tổng của những đơn thức.</p>', is_published: false, sort_order: 1, chapter_sort_order: 0, created_at: timestamp, updated_at: timestamp },
  ],
  theory_questions: [],
  mock_exam_topics: [{ id: 'topic1', grade: 8, name: 'ĐA THỨC', sort_order: 0 }, { id: 'empty-topic', grade: 8, name: 'TỨ GIÁC', sort_order: 1 }],
  mock_exams: [
    { id: 'exam1', grade: 8, category: 'midterm_1', topic_id: null, title: 'ĐỀ GIỮA HỌC KÌ 1 - SỐ 01', duration: 90, created_at: timestamp },
    { id: 'exam2', grade: 8, category: 'topic', topic_id: 'topic1', title: 'ĐỀ LUYỆN TẬP ĐA THỨC', duration: 45, created_at: timestamp },
  ],
  flytiee_gift_codes: [{ id: 'gift1', code: 'BIRDIE-DEMO', title: 'Quà chăm học', reward_kind: 'coins', reward_value: { amount: 100 }, is_active: true, expires_at: null, max_redemptions: 10, redemption_count: 2, created_at: timestamp }],
  gift_codes: [{ code: 'MAX-DEMO', name: 'Ưu đãi FlyMax', flymax_days: 30, is_active: true, expires_at: null, max_redemptions: 10, usage_count: 1, created_at: timestamp }],
  app_notifications: [{ id: 'noti1', title: 'Đã có đề thi thử mới', body: 'Các em có thể luyện đề giữa học kì 1.', target_email: null, action_url: '/mock-exams?grade=8', is_active: true, created_at: timestamp }],
  question_reports: [{ id: 'report1', question_id: 'q1', source: 'practice', source_id: 'mono', source_title: 'Bài 1 - Đơn thức', grade: 8, chapter: 'ĐA THỨC', reason: 'wrong_answer', details: 'Cần kiểm tra lại đáp án của câu hỏi này.', status: 'new', reporter_id: 'student1', reporter_name: 'Học sinh mẫu', reporter_email: 'student@example.test', question_snapshot: { content: 'Hệ số của $3x^2$ là bao nhiêu?', options: ['1', '2', '3', '4'], correct_answer: 2, solution: 'Hệ số bằng 3.', difficulty_level: 1 }, created_at: timestamp, updated_at: timestamp }],
  question_report_responses: [],
};
const db = {
  from(table) {
    assert.ok(table in fixtures, `Unexpected table ${table}`);
    const filters = [];
    let slice;
    let singleton = false;
    let mutation;
    const query = {
      select() { return this; }, order() { return this; }, limit(count) { slice = [0, count]; return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      range(from, to) { slice = [from, to + 1]; return this; },
      single() { singleton = true; return this; }, maybeSingle() { singleton = true; return this; },
      insert(payload) { mutation = ['insert', payload]; return this; },
      update(payload) { mutation = ['update', payload]; return this; },
      delete() { mutation = ['delete']; return this; },
      then(done) {
        const rows = fixtures[table].filter(row => filters.every(([key, value]) => row[key] === value));
        if (mutation) writes.push({ table, mutation, filters });
        return Promise.resolve({ data: singleton ? rows[0] ?? null : slice ? rows.slice(...slice) : rows, count: rows.length, error: null }).then(done);
      },
    };
    return query;
  },
  rpc(name, payload) {
    if (['flydo_is_gift_code_admin', 'flydo_is_notification_admin'].includes(name)) return Promise.resolve({ data: true, error: null });
    writes.push({ rpc: name, payload });
    return Promise.resolve({ data: 1, error: null });
  },
};
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  cache.set(filename, mod);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = name => {
    if (name === '@/features/auth/stores/auth-store') return { useAuthStore: Object.assign(selector => selector ? selector(authState) : authState, { getState: () => authState }) };
    if (name === '@/lib/supabase/client') return { getSupabaseClient: () => db };
    if (name === 'next/navigation') return { usePathname: () => path, useRouter: () => ({ replace: destination => routes.push(destination), push: destination => routes.push(destination) }) };
    if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (name === 'next-themes') return { useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme() {} }) };
    if (name.endsWith('.css')) return {};
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const dependencyFile = ['.tsx', '.ts'].map(suffix => base + suffix).find(existsSync);
      if (dependencyFile) return load(dependencyFile);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const Layout = load(join(repo, 'src/app/admin/layout.tsx')).default;
let root = createRoot(document.getElementById('root'));
const mount = async section => {
  await React.act(async () => root.unmount());
  root = createRoot(document.getElementById('root'));
  path = `/admin/${section}`;
  const Page = load(join(repo, 'src/app/admin', section, 'page.tsx')).default;
  await React.act(async () => root.render(React.createElement(Layout, null, React.createElement(Page))));
};
const click = async node => { assert.ok(node, 'Expected control missing'); await React.act(async () => node.click()); };
const button = (text, scope = document) => [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const input = async (node, value) => {
  assert.ok(node, 'Expected input missing');
  await React.act(async () => {
    const prototype = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const select = async (id, text) => {
  await React.act(async () => document.getElementById(id).dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  await click([...document.querySelectorAll('[role="option"]')].find(node => node.textContent.trim() === text));
};
const snapshots = process.argv.includes('--snapshots') ? resolve(process.argv[process.argv.indexOf('--snapshots') + 1]) : null;
function snapshot(section) {
  if (!snapshots) return;
  mkdirSync(snapshots, { recursive: true });
  const original = document.getElementById('root');
  const copy = original.cloneNode(true);
  [...original.querySelectorAll('select')].forEach((select, index) => {
    const cloned = copy.querySelectorAll('select')[index];
    [...cloned.options].forEach((option, index) => option.toggleAttribute('selected', select.options[index].selected));
  });
  [...original.querySelectorAll('textarea')].forEach((textarea, index) => { copy.querySelectorAll('textarea')[index].textContent = textarea.value; });
  const html = `<!doctype html><html lang="vi" class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FlyDo ADMIN — kiểm tra bố cục</title><link rel="stylesheet" href="admin.css"></head><body><main id="main-content" data-star-page="admin">${copy.innerHTML}</main></body></html>`;
  writeFileSync(join(snapshots, `${section}.html`), html);
}

await test('admin navigation retains every destination, groups learning/operations and identifies the current route', async () => {
  await mount('practice');
  const nav = document.querySelector('nav[aria-label="Điều hướng quản trị"]');
  assert.ok(nav, 'ADMIN must have its own named navigation');
  assert.deepEqual([...nav.querySelectorAll('a')].map(node => node.getAttribute('href')), ['/admin/practice', '/admin/theory', '/admin/mock-exams', '/admin/import', '/admin/question-reports', '/admin/notifications', '/admin/payments', '/admin/gift-codes']);
  assert.equal(nav.querySelectorAll('[aria-current="page"]').length, 1);
  assert.equal(nav.querySelector('[aria-current="page"]').getAttribute('href'), '/admin/practice');
  assert.ok(nav.textContent.includes('Nội dung học tập') && nav.textContent.includes('Vận hành'));
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(document.querySelector('h1').textContent, 'Tự luyện');
  const mobile = document.querySelector('select[aria-label="Chọn mục quản trị"]');
  assert.ok(mobile, 'Mobile needs a visible selector, not an overflowing strip');
  assert.equal(mobile.options.length, 8);
  await React.act(async () => { mobile.value = '/admin/theory'; mobile.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(routes.at(-1), '/admin/theory');
});

await test('create panel starts collapsed and toggling preserves the real practice draft', async () => {
  await mount('practice');
  const toggle = document.querySelector('[data-admin-create-toggle]');
  assert.ok(toggle, 'Create action must be separate from the list');
  const panel = document.getElementById(toggle.getAttribute('aria-controls'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hidden, true);
  await click(toggle);
  const title = document.getElementById('practice-create-title');
  await input(title, 'Bản nháp cần được giữ');
  await click(toggle);
  assert.equal(panel.hidden, true);
  assert.equal(document.getElementById('practice-create-title'), title, 'Do not unmount the form on collapse');
  await click(toggle);
  assert.equal(title.value, 'Bản nháp cần được giữ');
  assert.ok(document.querySelector('[data-sort-kind="chapter"]'));
  assert.equal(writes.length, 0, 'Layout/navigation must not mutate learning data');
  await click(document.querySelector('[data-sort-kind="chapter"] button[aria-expanded]'));
  snapshot('practice-open');
  await click(toggle);
  snapshot('practice');
});

await test('exam management retains grouped categories and deletable empty topics with creation folded', async () => {
  await mount('mock-exams');
  const toggle = document.querySelector('[data-admin-create-toggle]');
  assert.ok(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.ok(document.querySelector('[aria-label="Xóa chuyên đề trống TỨ GIÁC"]'));
  assert.ok(document.querySelector('[aria-label="Sửa đề ĐỀ GIỮA HỌC KÌ 1 - SỐ 01"]'));
  await click(toggle);
  assert.ok(document.getElementById('exam-create-title'));
  snapshot('mock-exams-open');
  await click(toggle);
  snapshot('mock-exams');
});

await test('editing theory opens the mounted editor for the selected lesson without a write', async () => {
  await mount('theory');
  const toggle = document.querySelector('[data-admin-create-toggle]');
  assert.ok(toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  snapshot('theory');
  await click(document.querySelector('[aria-label="Sửa Đơn thức"]'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(document.getElementById('theory-title').value, 'Đơn thức');
  await click(toggle);
  await click(document.querySelector('[aria-label="Sửa Đa thức"]'));
  assert.equal(toggle.getAttribute('aria-expanded'), 'true', 'Selecting another lesson must reopen an intentionally folded editor');
  assert.equal(document.getElementById('theory-title').value, 'Đa thức');
  assert.ok(document.querySelector('[aria-label="Đưa Đa thức lên trước"]'));
  assert.equal(writes.length, 0);
  snapshot('theory-open');
});

await test('gift-code and notification creation preserve drafts, history, feedback and confirmation', async () => {
  for (const section of ['gift-codes', 'notifications']) {
    await mount(section);
    const toggle = document.querySelector('[data-admin-create-toggle]');
    assert.ok(toggle);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    const id = section === 'gift-codes' ? 'gift-name' : 'notification-title';
    await click(toggle);
    snapshot(`${section}-open`);
    await input(document.getElementById(id), 'Bản nháp quản trị');
    await click(toggle); await click(toggle);
    assert.equal(document.getElementById(id).value, 'Bản nháp quản trị');
    assert.ok(document.body.textContent.includes(section === 'gift-codes' ? 'BIRDIE-DEMO' : 'Đã có đề thi thử mới'));
    if (section === 'notifications') {
      await input(document.getElementById('notification-body'), 'Nội dung thông báo thử nghiệm');
      await React.act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      assert.ok(document.querySelector('[role="alertdialog"]'));
      assert.equal(writes.length, 0, 'Opening send confirmation must not send');
      await click(button('Quay lại', document.querySelector('[role="alertdialog"]')));
    }
    await click(toggle);
    snapshot(section);
  }
});

await test('JSON import retains destination gating and preview; reports retain filters and modal detail', async () => {
  await mount('import');
  assert.equal(button('Kiểm tra và xem trước').disabled, true);
  assert.ok(document.getElementById('question-json'));
  assert.equal(document.querySelectorAll('[data-admin-step]').length, 3);
  snapshot('import');
  await mount('question-reports');
  assert.equal(document.querySelectorAll('select').length, 4, 'Mobile navigation plus all three report filters');
  const report = document.querySelector('[data-admin-report]');
  assert.ok(report);
  snapshot('question-reports');
  await click(report);
  assert.ok(document.querySelector('[role="dialog"]').textContent.includes('Hệ số'));
  assert.ok(document.querySelector('textarea'));
  assert.equal(writes.length, 0);
});

await test('anonymous and ordinary accounts still cannot render ADMIN children', async () => {
  const original = authState;
  for (const user of [null, { id: 'student', email: 'student@example.test' }]) {
    authState = { user, initialized: true, isLoading: false };
    await React.act(async () => root.render(React.createElement(Layout, null, React.createElement('p', null, 'Protected child'))));
    assert.equal(document.getElementById('root').textContent, '');
    assert.equal(routes.at(-1), '/home');
  }
  authState = original;
});

await test('mixed exam JSON uses short templates, previews accepted answers and reparses the current destination', async () => {
  writes.length = 0; await mount('import');
  await select('content-target', 'Thi thử');
  await select('exam-grade', 'Lớp 8'); await select('exam-category', 'Giữa HK1');
  await select('exam-target', 'ĐỀ GIỮA HỌC KÌ 1 - SỐ 01');
  await select('sample-question-type', 'Trả lời ngắn');
  let copied=''; Object.defineProperty(navigator,'clipboard',{ configurable:true,value:{ writeText: async text => { copied=text; } } });
  await click(button('Sao chép mẫu câu hỏi')); assert.match(copied,/accepted_answers/);
  const mcq={content:'MCQ',options:['a','b','c','d'],correct_answer:0};
  const short={question_type:'short_answer',content:'SHORT',accepted_answers:['0,5','0.5','1/2'],solution:'SOLUTION'};
  const text=JSON.stringify({questions:[mcq,short]});
  await input(document.getElementById('question-json'),text); await click(button('Kiểm tra và xem trước'));
  await click(document.querySelector('[aria-label="Xem trước câu 2"]'));
  assert.match(document.body.textContent,/Trả lời ngắn/); assert.match(document.body.textContent,/Đáp án được chấp nhận/);
  assert.match(document.body.textContent,/1\/2/); assert.match(document.body.textContent,/SOLUTION/);
  const oldConfirm=window.confirm; window.confirm=()=>false;
  await click(button('Duyệt và nhập 2 câu')); assert.equal(writes.length,0);
  window.confirm=()=>true;
  const originalRpc=db.rpc; db.rpc=(name,payload)=>{ writes.push({rpc:name,payload}); return Promise.resolve({data:null,error:{message:'network test'}}); };
  await click(button('Duyệt và nhập 2 câu')); assert.equal(writes.at(-1).payload.p_questions[1].question_type,'short_answer');
  assert.equal(document.getElementById('question-json').value,text); assert.match(document.body.textContent,/network test/);
  db.rpc=originalRpc; writes.length=0;
  await select('content-target','Tự luyện');
  await select('import-practice-grade','Lớp 8'); await select('import-practice-chapter','ĐA THỨC'); await select('import-practice-lesson','Bài 1 - Đơn thức');
  await click(button('Kiểm tra và xem trước')); assert.match(document.body.textContent,/Câu 2.*Thi thử/);
  assert.equal(writes.length,0); window.confirm=oldConfirm;
});

await test('ADMIN reads short-answer report snapshots without interpreting answer text as HTML', async () => {
  const original=fixtures.question_reports[0];
  fixtures.question_reports[0]={...original,source:'mock_exam',question_snapshot:{question_type:'short_answer',content:'SHORT REPORT',options:[],correct_answer:null,accepted_answers:['1/2','<img src=x onerror=alert(1)>'],solution:'Giải thích'}};
  try {
    await mount('question-reports'); await click(document.querySelector('[data-admin-report]'));
    assert.match(document.body.textContent,/Đáp án được chấp nhận/); assert.match(document.body.textContent,/1\/2/);
    assert.ok(document.body.textContent.includes('<img src=x onerror=alert(1)>')); assert.equal(document.querySelector('img[src="x"]'),null);
    assert.match(document.body.textContent,/Phản hồi cho học sinh/);
  } finally { fixtures.question_reports[0]=original; }
});

await test('the real JSON workflow previews geometry and cancellation never writes', async () => {
  await mount('import');
  await select('import-practice-grade', 'Lớp 8');
  await select('import-practice-chapter', 'ĐA THỨC');
  await select('import-practice-lesson', 'Bài 1 - Đơn thức');
  assert.equal(button('Kiểm tra và xem trước').disabled, false);
  await click([...document.querySelectorAll('button')].find(node => node.textContent.includes('Mẫu JSON hình học')));
  await input(document.getElementById('question-json'), document.querySelector('#geometry-json-example pre code').textContent);
  await click(button('Kiểm tra và xem trước'));
  assert.ok(document.querySelector('svg[role="img"]'), 'Actual geometry renderer must remain in the import preview');
  assert.ok(document.querySelector('.katex'), 'Actual math renderer must remain in the import preview');
  const approve = [...document.querySelectorAll('button')].find(node => node.textContent.includes('Duyệt và nhập 1 câu'));
  assert.ok(approve);
  window.confirm = () => false;
  await click(approve);
  assert.equal(writes.length, 0, 'Cancel is not an import');
  snapshot('import-preview');
});

await test('FlyMax payload stays unchanged and validation feedback remains visible with the form folded', async () => {
  await mount('gift-codes');
  await click(button('FlyMax'));
  assert.ok(document.body.textContent.includes('MAX-DEMO'));
  const toggle = document.querySelector('[data-admin-create-toggle]');
  await click(toggle);
  await React.act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await click(toggle);
  assert.ok(document.querySelector('[role="alert"]'));
  assert.equal(document.querySelector('[role="alert"]').closest('[hidden]'), null, 'Do not hide permission/validation messages in collapsed forms');
  assert.equal(writes.length, 0);
  await click(toggle);
  await input(document.getElementById('gift-code'), 'MAX-TEST-30');
  await input(document.getElementById('gift-name'), 'Gói học thử');
  await input(document.getElementById('flymax-days'), '30');
  await React.act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.deepEqual(writes.at(-1), { table: 'gift_codes', mutation: ['insert', { code: 'MAX-TEST-30', name: 'Gói học thử', flymax_days: 30, max_redemptions: 1, expires_at: null }], filters: [] });
  await click(toggle);
  assert.ok(document.querySelector('[role="status"]').textContent.includes('MAX-TEST-30'));
  assert.equal(document.querySelector('[role="status"]').closest('[hidden]'), null);
});

await React.act(async () => root.unmount());
dom.window.close();
