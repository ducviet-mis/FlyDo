// Real React/page/panel/API; only auth and remote Supabase are replaced. No live DB.
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { test, after } from 'node:test';

const repo = resolve(process.cwd()), require = createRequire(join(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/admin/mock-exams', pretendToBeVisual: true });
for (const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLFormElement','HTMLSelectElement','Element','Node','NodeFilter','MutationObserver','Event','CustomEvent','MouseEvent','KeyboardEvent','DocumentFragment']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
HTMLElement.prototype.scrollIntoView = () => {};
const React = require('react'), { createRoot } = require('react-dom/client'), ts = require('typescript');
let auth = { user: { id: 'admin', email: 'vietdang293.vn@gmail.com' }, initialized: true, isLoading: false };
let details, rpcHook, confirmation = true, changed = [];
const calls = [], writes = [], confirmations = [];
globalThis.confirm = message => { confirmations.push(message); return confirmation; };
globalThis.alert = () => {};
const question = (id, order_index, question_type = 'multiple_choice', points_override = null, max_points = null) => ({
  id, exam_id: 'exam', content: `Nội dung ${id}`, diagram: null, question_type, order_index, points_override, max_points,
  options: question_type === 'multiple_choice' ? ['a','b','c','d'] : [], correct_answer: question_type === 'multiple_choice' ? 0 : null,
  accepted_answers: question_type === 'short_answer' ? ['1'] : [], solution: 'Lời giải',
  statements: question_type === 'true_false' ? Array.from({length:4}, (_, i) => ({content:`Ý ${i+1}`,correct_answer:true})) : [],
});
const fixture = (legacy = false) => ({
  exam: { id: 'exam', title: 'Đề kiểm thử', grade: 8, category: 'midterm_1', topic_id: null, duration: 45, code: 'FLY-TEST', created_at: '2026-10-06T00:00:00Z', scoring_mode: legacy ? 'legacy_equal' : 'sectioned', section_points: {multiple_choice:2,true_false:4,short_answer:4}, scoring_ready:false, scoring_revision:7 },
  // Deliberately unsorted: grouping must preserve original numbers and tie-break by id.
  questions: legacy ? [question('mc1',0),question('sa',1,'short_answer')] : [question('mc3',2,'multiple_choice',null,0.6666),question('tf',3,'true_false',null,4),question('mc1',0,'multiple_choice',null,0.6667),question('sa',4,'short_answer',null,4),question('mc2',1,'multiple_choice',null,0.6667)],
  revision:7, errors:[],
});
const db = {
  async rpc(name, payload) {
    calls.push({name,payload});
    if (rpcHook) { const result = await rpcHook(name,payload); if (result) return result; }
    return {data:structuredClone(details),error:null};
  },
  from(table) {
    const query = {select(){return this;},order(){return this;},eq(){return this;},limit(){return this;},single(){return this;},
      insert(payload){writes.push({table,payload});return this;},
      then(done){return Promise.resolve({data:table==='mock_exams'?[details.exam]:[],error:null}).then(done);}};
    return query;
  },
};
const cache = new Map();
function load(file) {
  assert.ok(existsSync(file), `Missing requested scoring implementation: ${file}`);
  if(cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file); cache.set(file,mod); mod.filename=file; mod.paths=Module._nodeModulePaths(dirname(file));
  mod.require = name => {
    if(name==='@/lib/supabase/client') return {getSupabaseClient:()=>db};
    if(name==='@/features/auth/stores/auth-store') return {useAuthStore:Object.assign(selector=>selector?selector(auth):auth,{getState:()=>auth})};
    if(name.startsWith('@/')||name.startsWith('.')) {
      const base = name.startsWith('@/')?resolve(repo,'src',name.slice(2)):resolve(dirname(file),name);
      const found=['.tsx','.ts'].map(ext=>base+ext).find(existsSync); if(found) return load(found);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
  return mod.exports;
}
let root = createRoot(document.getElementById('root'));
async function reset(legacy=false) {
  await React.act(async()=>root.unmount()); root=createRoot(document.getElementById('root'));
  details=fixture(legacy); rpcHook=null; confirmation=true; calls.length=0; writes.length=0; confirmations.length=0; changed=[];
  auth={user:{id:'admin',email:'vietdang293.vn@gmail.com'},initialized:true,isLoading:false};
}
const panel = () => load(join(repo,'src/components/admin/MockExamScoringPanel.tsx')).MockExamScoringPanel;
const renderPanel = async (examId='exam') => { const Panel=panel(); await React.act(async()=>root.render(React.createElement(Panel,{examId,onChanged:exam=>changed.push(exam)}))); };
const mount = async (legacy=false) => {await reset(legacy);await renderPanel();};
const button = text => [...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const click = async node => {assert.ok(node,'Expected scoring control');await React.act(async()=>node.click());};
const input = async (node,value) => {assert.ok(node,'Expected scoring input');await React.act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});};
const section = type => document.getElementById(`scoring-section-${type}`);
const override = id => document.getElementById(`scoring-override-${id}`);
const score = id => document.querySelector(`[data-scoring-question="${id}"] [data-max-points]`)?.textContent;
const saveCalls = () => calls.filter(c=>c.name==='admin_save_mock_exam_scoring');
const snapshotDir = process.argv.includes('--snapshots') ? resolve(process.argv[process.argv.indexOf('--snapshots')+1]) : null;
function snapshot(name) {
  if(!snapshotDir) return;
  mkdirSync(snapshotDir,{recursive:true});
  const original=document.getElementById('root'), copy=original.cloneNode(true);
  [...original.querySelectorAll('input')].forEach((node,index)=>{
    const cloned=copy.querySelectorAll('input')[index];
    cloned.setAttribute('value',node.value);
    if(['checkbox','radio'].includes(node.type)) cloned.toggleAttribute('checked',node.checked);
  });
  [...original.querySelectorAll('textarea')].forEach((node,index)=>{copy.querySelectorAll('textarea')[index].textContent=node.value;});
  [...original.querySelectorAll('select')].forEach((node,index)=>{
    const cloned=copy.querySelectorAll('select')[index];
    [...cloned.options].forEach((option,optionIndex)=>option.toggleAttribute('selected',node.options[optionIndex].selected));
  });
  writeFileSync(join(snapshotDir,`${name}.html`),`<!doctype html><html lang="vi" class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>FlyDo ADMIN — điểm và cấu trúc</title><link rel="stylesheet" href="admin.css"></head><body><main id="main-content" data-star-page="admin">${copy.innerHTML}</main></body></html>`);
}

await test('API maps all five authenticated RPC contracts and preserves draft validation details',async()=>{
  await reset(); const api=load(join(repo,'src/features/mock-exams/scoring-api.ts'));
  assert.deepEqual(await api.getMockExamScoring('exam'),details);
  const incoming=[{content:'Incoming',question_type:'short_answer',accepted_answers:['1']}];
  await api.previewMockExamImport('exam',incoming,7);
  await api.saveMockExamScoring('exam',{multiple_choice:2,true_false:4,short_answer:4},{mc1:0.5,mc2:null},7);
  await api.deleteMockExamQuestion('exam','mc1',7);await api.importMockExamQuestions('exam',incoming,7);
  assert.deepEqual(calls,[
    {name:'admin_get_mock_exam_scoring',payload:{p_exam_id:'exam'}},
    {name:'admin_preview_mock_exam_import',payload:{p_exam_id:'exam',p_questions:incoming,p_expected_revision:7}},
    {name:'admin_save_mock_exam_scoring',payload:{p_exam_id:'exam',p_section_points:{multiple_choice:2,true_false:4,short_answer:4},p_overrides:{mc1:0.5,mc2:null},p_expected_revision:7,p_publish:false}},
    {name:'admin_delete_mock_exam_question',payload:{p_exam_id:'exam',p_question_id:'mc1',p_expected_revision:7}},
    {name:'admin_import_and_publish_mock_exam_questions',payload:{p_exam_id:'exam',p_questions:incoming,p_expected_revision:7}},
  ]);
  details.errors=['Thiếu câu đúng/sai'];assert.deepEqual((await api.getMockExamScoring('exam')).errors,details.errors);
  rpcHook=()=>({data:null,error:{message:'SCORING_REVISION_CONFLICT',code:'40001'}});
  await assert.rejects(api.saveMockExamScoring('exam',details.exam.section_points,{},7,true),/SCORING_REVISION_CONFLICT/);
});

await test('real panel shows exact remainder distribution grouped without renumbering',async()=>{
  await mount();
  assert.deepEqual([...document.querySelectorAll('[data-scoring-question]')].map(node=>node.dataset.scoringQuestion),['mc1','mc2','mc3','tf','sa']);
  assert.deepEqual(['mc1','mc2','mc3'].map(score),['0,6667 điểm','0,6667 điểm','0,6666 điểm']);
  assert.match(document.querySelector('[data-scoring-question="tf"]').textContent,/Câu 4/);
  assert.match(document.body.textContent,/0,0001/);
  assert.equal(button('Lưu cấu trúc điểm').disabled,false);
  assert.equal(saveCalls().length,0);
});

await test('comma override locks a question, recalculates other points and unlock returns to automatic',async()=>{
  await mount(); await input(override('mc1'),'0,5');
  assert.deepEqual(['mc1','mc2','mc3'].map(score),['0,5 điểm','0,75 điểm','0,75 điểm']);
  assert.match(document.querySelector('[data-scoring-question="mc1"]').textContent,/Đã chỉnh/);
  snapshot('mock-exam-scoring');
  await click(button('Lưu cấu trúc điểm'));
  assert.equal(saveCalls().at(-1).payload.p_overrides.mc1,0.5);
  assert.equal(saveCalls().at(-1).payload.p_publish,true);
  await input(override('mc1'),'0,5');await click(document.querySelector('[aria-label="Về tự chia câu 1"]'));
  assert.equal(override('mc1').value,'');assert.equal(score('mc1'),'0,6667 điểm');
  await click(button('Lưu cấu trúc điểm'));assert.equal(saveCalls().at(-1).payload.p_overrides.mc1,null);
});

await test('one save retains incomplete configuration but applies a valid configuration immediately',async()=>{
  await mount();await input(section('short_answer'),'3,5');
  assert.equal(button('Lưu cấu trúc điểm').disabled,false);await click(button('Lưu cấu trúc điểm'));
  assert.equal(saveCalls().at(-1).payload.p_section_points.short_answer,3.5);
  assert.equal(saveCalls().at(-1).payload.p_publish,false);
  assert.match(document.body.textContent,/chưa/i);
  await input(section('short_answer'),'4');
  rpcHook=(name,payload)=>name==='admin_save_mock_exam_scoring'?{data:{...fixture(),exam:{...details.exam,scoring_ready:true,scoring_revision:8},revision:8},error:null}:null;
  await click(button('Lưu cấu trúc điểm'));assert.equal(saveCalls().at(-1).payload.p_publish,true);
  assert.equal(changed.at(-1).scoring_ready,true);assert.match(document.body.textContent,/Đang sử dụng/);
});

await test('syntax and impossible allocations retain values, focus errors and never mutate',async()=>{
  await mount();await input(section('multiple_choice'),'2,00001');await click(button('Lưu cấu trúc điểm'));
  assert.equal(saveCalls().length,0);assert.equal(section('multiple_choice').value,'2,00001');
  assert.equal(section('multiple_choice').getAttribute('aria-invalid'),'true');
  assert.equal(document.activeElement.getAttribute('role'),'alert');
  assert.ok(document.querySelector('[role="alert"] a[href="#scoring-section-multiple_choice"]'));
  snapshot('mock-exam-scoring-errors');
  await input(section('multiple_choice'),'2');await input(override('mc1'),'2,1');await click(button('Lưu cấu trúc điểm'));
  assert.equal(saveCalls().length,0);assert.equal(override('mc1').value,'2,1');
  assert.equal(button('Lưu cấu trúc điểm').disabled,false);
});

await test('legacy remains unchanged until explicit conversion confirmation',async()=>{
  await mount(true);assert.match(document.body.textContent,/10.*số câu đúng/i);
  assert.equal(saveCalls().length,0);assert.equal(document.querySelector('[data-max-points]'),null);
  await input(section('multiple_choice'),'2');await input(section('true_false'),'0');await input(section('short_answer'),'8');
  snapshot('mock-exam-legacy-conversion');
  confirmation=false;await click(button('Chuyển sang phân điểm theo phần'));assert.equal(saveCalls().length,0);
  confirmation=true;await click(button('Chuyển sang phân điểm theo phần'));
  assert.match(confirmations.at(-1),/phiên.*mới/i);
  assert.equal(saveCalls().at(-1).payload.p_publish,true);assert.equal(saveCalls().at(-1).payload.p_expected_revision,7);
  assert.deepEqual(saveCalls().at(-1).payload.p_section_points,{multiple_choice:2,true_false:0,short_answer:8});
});

await test('legacy mixed MCQ and short answer applies valid configured totals during conversion',async()=>{
  await mount(true);await input(section('multiple_choice'),'2');await input(section('true_false'),'0');await input(section('short_answer'),'8');
  assert.equal(document.querySelector('[data-max-points]'),null);assert.equal(saveCalls().length,0);
  rpcHook=name=>name==='admin_save_mock_exam_scoring'?{data:{exam:{...details.exam,scoring_mode:'sectioned',section_points:{multiple_choice:2,true_false:0,short_answer:8},scoring_ready:true,scoring_revision:8},questions:[question('mc1',0,'multiple_choice',null,2),question('sa',1,'short_answer',null,8)],revision:8,errors:[]},error:null}:null;
  await click(button('Chuyển sang phân điểm theo phần'));
  assert.deepEqual(saveCalls().at(-1).payload,{p_exam_id:'exam',p_section_points:{multiple_choice:2,true_false:0,short_answer:8},p_overrides:{},p_expected_revision:7,p_publish:true});
  assert.equal(changed.at(-1).scoring_ready,true);assert.equal(changed.at(-1).scoring_mode,'sectioned');
  assert.equal(score('mc1'),'2 điểm');assert.equal(score('sa'),'8 điểm');assert.equal(writes.length,0);
});

await test('question deletion requires rebalance confirmation and current revision RPC',async()=>{
  await mount();confirmation=false;await click(document.querySelector('[aria-label="Xóa câu 2"]'));
  assert.equal(calls.filter(c=>c.name==='admin_delete_mock_exam_question').length,0);
  confirmation=true;rpcHook=name=>name==='admin_delete_mock_exam_question'?{data:{...fixture(),questions:details.questions.filter(q=>q.id!=='mc2'),revision:8,exam:{...details.exam,scoring_revision:8}},error:null}:null;
  await click(document.querySelector('[aria-label="Xóa câu 2"]'));
  assert.match(confirmations.at(-1),/phân lại điểm/i);
  assert.deepEqual(calls.at(-1),{name:'admin_delete_mock_exam_question',payload:{p_exam_id:'exam',p_question_id:'mc2',p_expected_revision:7}});
  assert.equal(document.querySelector('[data-scoring-question="mc2"]'),null);assert.equal(writes.length,0);
});

await test('revision conflict keeps local edits until explicit reload and does not retry writes',async()=>{
  await mount();await input(override('mc1'),'0,5');
  rpcHook=name=>name==='admin_save_mock_exam_scoring'?{data:null,error:{code:'40001',message:'SCORING_REVISION_CONFLICT'}}:null;
  await click(button('Lưu cấu trúc điểm'));assert.equal(saveCalls().length,1);assert.equal(override('mc1').value,'0,5');
  assert.equal(button('Lưu cấu trúc điểm').disabled,true);assert.match(document.body.textContent,/đã.*thay đổi/i);
  details.revision=9;details.exam.scoring_revision=9;rpcHook=null;await click(button('Tải lại cấu hình'));
  assert.equal(override('mc1').value,'');assert.equal(button('Lưu cấu trúc điểm').disabled,false);
  await click(button('Lưu cấu trúc điểm'));assert.equal(saveCalls().at(-1).payload.p_expected_revision,9);
});

await test('bulk automatic reset is confirmed and preserves other sections overrides',async()=>{
  await mount();await input(override('mc1'),'0,5');await input(override('tf'),'4');
  confirmation=false;await click(document.querySelector('[aria-label="Chia đều lại phần Trắc nghiệm ABCD"]'));assert.equal(override('mc1').value,'0,5');
  confirmation=true;await click(document.querySelector('[aria-label="Chia đều lại phần Trắc nghiệm ABCD"]'));
  assert.equal(override('mc1').value,'');assert.equal(override('tf').value,'4');
});

await test('busy save blocks edits and duplicate publication',async()=>{
  await mount();let finish;rpcHook=name=>name==='admin_save_mock_exam_scoring'?new Promise(resolve=>{finish=resolve;}):null;
  const saveButton=button('Lưu cấu trúc điểm');await click(saveButton);assert.equal(saveButton.disabled,true);assert.equal(section('multiple_choice').disabled,true);
  await click(saveButton);assert.equal(saveCalls().length,1);
  await React.act(async()=>finish({data:fixture(),error:null}));assert.equal(section('multiple_choice').disabled,false);
});

await test('pending requests from another exam or account cannot expose stale admin data',async()=>{
  await reset();let finish;rpcHook=()=>new Promise(resolve=>{finish=resolve;});await renderPanel('old-exam');
  rpcHook=null;details.exam.id='new-exam';await renderPanel('new-exam');
  await React.act(async()=>finish({data:fixture(true),error:null}));assert.ok(section('multiple_choice'));
  auth={...auth,user:{id:'student',email:'student@example.test'}};await renderPanel('new-exam');
  assert.equal(document.querySelector('[data-scoring-question]'),null);
});

await test('management creates sectioned drafts and opens scoring separately from name editing',async()=>{
  await reset();const Page=load(join(repo,'src/app/admin/mock-exams/page.tsx')).default;
  await React.act(async()=>root.render(React.createElement(Page)));
  await click(document.querySelector('[data-admin-create-toggle]'));await input(document.getElementById('exam-create-title'),'Đề mới');await click(button('Tạo đề thi'));
  assert.equal(writes.at(-1).payload.scoring_mode,'sectioned');assert.equal(writes.at(-1).payload.scoring_ready,false);
  assert.deepEqual(writes.at(-1).payload.section_points,{multiple_choice:10,true_false:0,short_answer:0});
  await click(button('Điểm & cấu trúc'));assert.ok(section('multiple_choice'));assert.equal(document.getElementById('edit-exam-title'),null);
});

await test('discarded StrictMode load cannot overwrite a newer revision',async()=>{
  await reset();const pending=[];rpcHook=()=>new Promise(resolve=>pending.push(resolve));
  const Panel=panel();await React.act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Panel,{examId:'exam'}))));
  assert.equal(pending.length,2);
  const latest={...fixture(),revision:9,exam:{...details.exam,scoring_revision:9}};
  await React.act(async()=>pending[1]({data:latest,error:null}));
  await React.act(async()=>pending[0]({data:fixture(),error:null}));
  rpcHook=null;await click(button('Lưu cấu trúc điểm'));assert.equal(saveCalls().at(-1).payload.p_expected_revision,9);
});

await test('creation accepts three decimal section totals even when draft sum is incomplete',async()=>{
  await reset();const Page=load(join(repo,'src/app/admin/mock-exams/page.tsx')).default;
  await React.act(async()=>root.render(React.createElement(Page)));
  await click(document.querySelector('[data-admin-create-toggle]'));await input(document.getElementById('exam-create-title'),'Đề ba phần');
  const fields=['multiple_choice','true_false','short_answer'].map(type=>document.getElementById(`exam-create-points-${type}`));
  assert.deepEqual(fields.map(node=>node?.value),['10','0','0']);
  for(const node of fields) assert.ok(document.querySelector(`label[for="${node.id}"]`));
  if(snapshotDir) {
    await input(fields[0],'2');await input(fields[1],'4');await input(fields[2],'4');
    snapshot('mock-exam-create');
  }
  await input(fields[0],'2,0001');await input(fields[1],'4');await input(fields[2],'3,5');await click(button('Tạo đề thi'));
  assert.deepEqual(writes.at(-1).payload.section_points,{multiple_choice:2.0001,true_false:4,short_answer:3.5});
  assert.equal(writes.at(-1).payload.scoring_ready,false);assert.equal(writes.at(-1).payload.scoring_mode,'sectioned');
});

await test('creation rejects malformed totals before creating either topic or exam and keeps draft',async()=>{
  await reset();const Page=load(join(repo,'src/app/admin/mock-exams/page.tsx')).default;
  await React.act(async()=>root.render(React.createElement(Page)));
  await click(document.querySelector('[data-admin-create-toggle]'));await input(document.getElementById('exam-create-title'),'Đề chưa hợp lệ');
  const field=document.getElementById('exam-create-points-multiple_choice');
  for(const value of ['2,00001','-1','11','NaN','1e1','']) {
    await input(field,value);await click(button('Tạo đề thi'));assert.equal(writes.length,0);
    assert.equal(field.value,value);assert.equal(field.getAttribute('aria-invalid'),'true');
    assert.equal(document.activeElement.getAttribute('role'),'alert');
  }
});

await test('single scoring save applies valid points without a separate publication action',async()=>{
  await mount();
  assert.equal(Boolean(button('Đưa vào sử dụng')),false,'Scoring must not require a second approval');
  await input(override('mc1'),'0,5');
  rpcHook=name=>name==='admin_save_mock_exam_scoring'?{data:{...fixture(),exam:{...details.exam,scoring_ready:true,scoring_revision:8},revision:8},error:null}:null;
  await click(button('Lưu cấu trúc điểm'));
  assert.equal(saveCalls().at(-1).payload.p_publish,true);
  assert.equal(saveCalls().at(-1).payload.p_overrides.mc1,0.5);
  assert.equal(changed.at(-1).scoring_ready,true);
});

after(async()=>{await React.act(async()=>root.unmount());dom.window.close();});
