// Offline Chrome fixtures of the real room, results and ADMIN report page.
// Auth, navigation and RPC/table requests are the only substituted boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { createServer } from 'node:http';

const repo = resolve(process.cwd()), require = createRequire(join(repo, 'package.json')), ts = require('typescript');
const runtime = createRequire(resolve(process.env.FLYDO_BROWSER_MODULES || 'node_modules', '../package.json'));
const { chromium } = runtime('playwright');
const output = resolve('tmp/true-false-exam-layout'); mkdirSync(output, { recursive: true });
const statements = [true, false, true, false].map((correct_answer, i) => ({ content: `Khẳng định ${String.fromCharCode(97 + i)}: $\\frac{1}{2} + \\frac{1}{2} = 1$ và nội dung dài để kiểm tra xuống dòng trên điện thoại.`, correct_answer, solution: `Giải thích ý ${i + 1}: xét phép cộng phân số.` }));
const tf = { id: 'tf', content: 'Cho các dữ kiện sau. Xét tính đúng sai của bốn khẳng định.', question_type: 'true_false', options: [], diagram: null, statements, max_points: 4 };
const user = { id: 'student-a', name: 'Thí sinh có tên dài để kiểm tra hiển thị' };
const session = { session_id: '10000000-0000-4000-8000-000000000001', exam: { id: 'exam', title: 'Thi thử ba dạng câu hỏi', grade: 8, duration: 10 },
  questions: [{ ...tf, statements: statements.map(({ content }) => ({ content })) }, { id: 'mc', content: 'Chọn số', question_type: 'multiple_choice', options: ['1', '2'], diagram: null },
    { id: 'sa', content: 'Nhập phân số', question_type: 'short_answer', options: [], diagram: null },
    ...['mc2', 'mc3'].map(id => ({ id, content: 'Chọn số', question_type: 'multiple_choice', options: ['1', '2'], diagram: null }))], answers: { tf: [false, null, true, null] }, revision: 0, attempt_id: null };
const result = { exam: session.exam, questions: [{ ...tf, earned_points: 1, correct_statement_count: 2, is_correct: false }],
  attempt: { id: 'a1', user_id: user.id, exam_id: 'exam', score: '1.00', answers: { tf: [true, true, true, null] }, correct_count: 0, total_questions: 1, duration_used: 30 },
  partial_count: 1, section_scores: { multiple_choice: { max_points: 2, earned_points: 0, question_count: 0 }, true_false: { max_points: 4, earned_points: 1, question_count: 1 }, short_answer: { max_points: 4, earned_points: 0, question_count: 0 } } };
const report = { id: 'report-1', source: 'mock_exam', question_id: 'tf', source_title: session.exam.title, reporter_name: 'A', reporter_email: 'a@example.test', grade: 8,
  reason: 'wrong_answer', details: 'Kiểm tra từng ý', status: 'new', question_snapshot: { ...tf, correct_answer: null }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
const virtual = {
  auth: `const state=${JSON.stringify({ user, initialized: true })};const store=selector=>selector?selector(state):state;store.getState=()=>state;exports.useAuthStore=store;`,
  client: `const session=${JSON.stringify(session)},result=${JSON.stringify(result)},report=${JSON.stringify(report)};let revision=0;const calls=[];window.fixtureCalls=calls;
    const db={rpc(name,args){const request=Promise.resolve().then(()=>{calls.push({name,args});if(name==='start_mock_exam_session')return {data:{...session,server_now:new Date().toISOString(),deadline_at:new Date(Date.now()+600000).toISOString()},error:null};
      if(name==='save_mock_exam_answers')return {data:{accepted:true,revision:++revision,answers:args.p_answers},error:null};
      if(name==='get_my_mock_exam_result')return {data:result,error:null};throw Error('Unexpected RPC '+name);});request.abortSignal=()=>request;return request;},from(table){if(!['question_reports','question_report_responses'].includes(table))throw Error('Unexpected table '+table);
      let one=false;const query={select(){return this;},eq(){return this;},order(){return this;},range(){return this;},single(){one=true;return this;},then(done,fail){return Promise.resolve({data:table==='question_report_responses'?[]:one?report:[report],count:1,error:null}).then(done,fail);}};return query;}};exports.getSupabaseClient=()=>db;`,
  navigation: `exports.useParams=()=>({examId:'exam'});exports.useRouter=()=>({replace(){},push(){},back(){}});exports.useSearchParams=()=>new URLSearchParams('?attemptId=a1');`,
  link: `const React=require('react');exports.__esModule=true;exports.default=({children,...props})=>React.createElement('a',props,children);`,
  css: `module.exports={};`,
  entry: `const React=require('react');const {createRoot}=require('react-dom/client');const Room=require('@/app/mock-exams/[examId]/page').default;const Result=require('@/app/mock-exams/[examId]/result/page').default;const Admin=require('@/app/admin/question-reports/page').default;
    const view=new URLSearchParams(location.search).get('view');createRoot(document.getElementById('root')).render(React.createElement(view==='result'?Result:view==='admin'?Admin:Room));`,
};
const ids = new Map(), factories = [];
function visit(filename) {
  if (ids.has(filename)) return ids.get(filename);
  const id = ids.size; ids.set(filename, id);
  let source = virtual[filename] ?? readFileSync(filename, 'utf8');
  if (/\.tsx?$/.test(filename)) source = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const dependencies = {}, owner = createRequire(virtual[filename] ? join(repo, 'package.json') : filename);
  for (const match of source.matchAll(/\brequire\(['"]([^'"]+)['"]\)/g)) {
    const name = match[1]; let path;
    if (name.endsWith('.css')) path = 'css';
    else if (name === '@/features/auth/stores/auth-store') path = 'auth';
    else if (name === '@/lib/supabase/client') path = 'client';
    else if (name === 'next/navigation') path = 'navigation';
    else if (name === 'next/link') path = 'link';
    else if (name.startsWith('@/')) { const base = resolve(repo, 'src', name.slice(2)); path = ['.tsx', '.ts'].map(s => base + s).find(existsSync); }
    else if (name.startsWith('.') && !virtual[filename]) { const base = resolve(dirname(filename), name); path = ['.tsx', '.ts', '.js', '/index.js'].map(s => base + s).find(existsSync); }
    if (!path) path = owner.resolve(name);
    assert.ok(!['fs', 'node:fs'].includes(path)); dependencies[name] = visit(path);
  }
  factories[id] = `${id}:[function(require,module,exports){\n${source}\n},${JSON.stringify(dependencies)}]`; return id;
}
const entry = visit('entry');
const bundle = `(()=>{const process={env:{NODE_ENV:'development'}};const modules={${factories.join(',')}};const cache={};function load(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;const [factory,deps]=modules[id];factory(name=>load(deps[name]),module,module.exports);return module.exports;}load(${entry});})();`;
const styles = readFileSync(resolve(output, 'styles.css'), 'utf8'), mathCSS = readFileSync(require.resolve('katex/dist/katex.min.css'), 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
let server, browser, base;
test.before(async () => {
  server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/fixture.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html');
    res.end(req.url === '/fixture.js' ? bundle : req.url === '/style.css' ? styles + mathCSS : html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});
test.after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
for (const theme of ['light', 'dark']) for (const viewport of [{ name: 'phone', width: 375, height: 812 }, { name: 'desktop', width: 1024, height: 900 }]) {
  test(`${theme}/${viewport.name}: room targets, radio keyboard, incomplete dialog and graded/admin detail`, async () => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce', colorScheme: theme });
    try {
      await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await context.addInitScript(theme => document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add(theme)), theme);
      const page = await context.newPage(); page.setDefaultTimeout(8000); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(base); assert.deepEqual(errors, [], 'Fixture startup');
      await page.getByRole('radio', { name: 'Sai, ý a', exact: true }).waitFor();
      const inspect = async () => {
        const overflow = await page.evaluate(() => [...document.querySelectorAll('aside, aside .grid, main, [role="dialog"], [role="alertdialog"], [data-statement-review]')]
          .filter(n => n.getBoundingClientRect().width > 0).map(n => ({ tag: n.tagName, width: n.clientWidth, scroll: n.scrollWidth })));
        for (const row of overflow) assert.ok(row.scroll <= row.width + 1, `Horizontal overflow in ${row.tag}: ${row.scroll}/${row.width}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page horizontal overflow');
      };
      await inspect();
      const targets = await page.locator('fieldset label, fieldset button, aside button').evaluateAll(nodes => nodes.map(n => ({ label: n.textContent, width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })));
      for (const target of targets.filter(t => t.width > 0)) assert.ok(target.height >= 43.5 && target.width >= 43.5, `Small target ${target.label}: ${target.width}x${target.height}`);
      await page.getByRole('radio', { name: 'Sai, ý a', exact: true }).focus(); await page.keyboard.press('ArrowRight');
      await assert.equal(await page.getByRole('radio', { name: 'Đúng, ý a', exact: true }).isChecked(), true);
      assert.equal(await page.locator('fieldset').count(), 4, 'Radio arrow must not switch questions');
      await page.getByRole('button', { name: 'Bỏ chọn ý a', exact: true }).click();
      await page.waitForFunction(() => window.fixtureCalls.at(-1)?.args.p_answers.tf?.[0] === null);
      await page.getByRole('button', { name: /^(Nộp bài|Nộp)$/ }).click();
      const confirm = page.getByRole('alertdialog'); await confirm.waitFor(); await inspect();
      await confirm.getByText('Còn 4 câu chưa làm.', { exact: true }).waitFor();
      await confirm.getByText('1 câu đúng/sai còn 3 ý chưa chọn.', { exact: true }).waitFor();
      assert.ok(await confirm.evaluate(n => n.contains(document.activeElement)), 'Dialog focus');
      await page.screenshot({ path: resolve(output, `${theme}-${viewport.name}-submit.png`) });
      await confirm.getByRole('button', { name: 'Tiếp tục làm bài' }).click();
      await confirm.waitFor({ state: 'hidden' });
      await page.goto(`${base}/?view=result`); await page.getByRole('heading', { name: 'Điểm từng phần' }).waitFor(); await inspect();
      assert.equal(await page.locator('[data-statement-review]').count(), 4);
      await page.screenshot({ path: resolve(output, `${theme}-${viewport.name}-result.png`) });
      await page.goto(`${base}/?view=admin`); await page.getByRole('button', { name: /Xem câu hỏi/ }).click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor(); await inspect();
      assert.equal(await dialog.locator('[data-statement-review]').count(), 4);
      await page.screenshot({ path: resolve(output, `${theme}-${viewport.name}-admin.png`) });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
