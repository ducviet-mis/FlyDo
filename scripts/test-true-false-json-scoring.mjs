import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';
const require = createRequire(import.meta.url), ts = require('typescript'), cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const mod = new Module(path); cache.set(path, mod);
  mod.require = name => {
    const base = name.startsWith('@/') ? resolve('src', name.slice(2)) : resolve(dirname(path), name);
    if (name.startsWith('@/') || name.startsWith('.')) {
      const file = ['.ts', '.tsx'].map(ext => base + ext).find(existsSync);
      if (file) return load(file);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, path);
  return mod.exports;
}
const parser = load(resolve('src/features/question-import/json-import.ts'));
const model = load(resolve('src/features/mock-exams/question-model.ts'));
const tf = { question_type: 'true_false', content: 'Cho hình chữ nhật ABCD.', statements: [
  { content: '$AB = CD$', correct_answer: true, solution: 'Hai cạnh đối bằng nhau.' },
  { content: '$AC = BD$', correct_answer: true },
  { content: '$AB = BC$ luôn đúng.', correct_answer: false },
  { content: 'Có bốn góc vuông.', correct_answer: true },
], solution: 'Dùng tính chất hình chữ nhật.' };
const parse = q => parser.parseQuestionJson(JSON.stringify({ questions: q }), 'mock_exam');
assert.deepEqual(parse([tf]).errors, [], 'true/false must be accepted in exams');
assert.equal(parse([tf]).questions[0].question_type, 'true_false');
assert.deepEqual(parse([tf]).questions[0].options, []);
assert.equal(parse([tf]).questions[0].correct_answer, null);
assert.deepEqual(parse([tf]).questions[0].statements, tf.statements);
assert.match(parser.parseQuestionJson(JSON.stringify([tf]), 'practice').errors.join(), /Thi thử/);
for (const statements of [tf.statements.slice(0, 3), [...tf.statements, tf.statements[0]],
  tf.statements.map((s,i) => i === 0 ? { ...s, correct_answer: 'true' } : s),
  tf.statements.map((s,i) => i === 0 ? { ...s, correct_answer: 0 } : s),
  tf.statements.map((s,i) => i === 0 ? { ...s, content: ' ' } : s)]) {
  assert.ok(parse([{ ...tf, statements }]).errors.length);
}
for (const edit of [{ options: ['a'] }, { answers: ['a'] }, { correct_answer: 0 }, { answer: 'A' }, { accepted_answers: ['a'] }]) {
  assert.ok(parse([{ ...tf, ...edit }]).errors.length, JSON.stringify(edit));
}
const mc = { content: '2 + 3?', options: ['3','4','5','6'], correct_answer: 2 };
assert.ok(parse([{ ...mc, statements: tf.statements }]).errors.length);
for (const points of [0, -1, '0.25', 0.00001, 0.000000000001, 0.000100000001, 11]) assert.ok(parse([{ ...tf, points }]).errors.length, String(points));
assert.equal(parse([{ ...tf, points: 0.25 }]).questions[0].points, 0.25);
assert.ok(parse([{ ...tf, max_points: 10 }]).errors.length, 'derived max_points must not enter import');
assert.equal(parse([tf, mc]).questions.length, 2);
const sample = parse(JSON.parse(readFileSync('question-sets/examples/mock-exam-three-sections.json','utf8')).questions);
assert.deepEqual(sample.errors, []);
assert.equal(sample.questions.filter(q => q.question_type === 'true_false').length, 2);
assert.equal(sample.questions.filter(q => q.question_type !== 'true_false' && q.question_type !== 'short_answer').length, 8);
assert.equal(parser.parseQuestionJson(parser.buildQuestionJsonSample('mock_exam', 'true_false'), 'mock_exam').errors.length, 0);
assert.match(parser.buildAiPrompt('mock_exam', 'Đề hình học', undefined, 'true_false'), /true_false/);
const publicTf = { ...tf, id: 'tf', options: [], max_points: 2, correct_answer: null };
const questions = model.parseExamQuestions([publicTf]);
assert.ok(questions);
assert.deepEqual(questions[0].statements, tf.statements.map(s => ({ content: s.content })), 'public DTO strips keys and solutions');
assert.equal(questions[0].max_points, 2);
assert.equal(model.isExamAnswerPresent(questions[0], [false, null, null, null]), true);
assert.equal(model.isExamAnswerComplete(questions[0], [false, null, null, null]), false);
assert.equal(model.getAnsweredStatementCount([false, null, true, null]), 2);
assert.equal(model.isExamAnswerComplete(questions[0], [true, true, false, true]), true);
for (const answer of [[null,null,null,null], [true,false], [true,false,0,null], 0, 'false']) {
  assert.equal(model.isExamAnswerPresent(questions[0], answer), false);
}
assert.deepEqual(model.validExamAnswers(questions, { tf: [false,null,null,null], foreign: [true,true,true,true] }), { tf: [false,null,null,null] });
assert.equal(model.parseExamQuestions([{ ...publicTf, statements: tf.statements.slice(1) }]), null);
const scoring = load(resolve('src/features/mock-exams/scoring.ts'));
const section = { multiple_choice: 2, true_false: 4, short_answer: 4 };
const items = [0,1,2].map(i => ({ id: 'mc'+i, question_type: 'multiple_choice', order_index: i, points_override: null }));
const rest = [{ id: 'tf', question_type: 'true_false', order_index: 3, points_override: null }, { id: 'sa', question_type: 'short_answer', order_index: 4, points_override: null }];
let result = scoring.allocateSectionPoints(section, [...items, ...rest]);
assert.equal(result.valid, true);
assert.deepEqual(result.questions.slice(0,3).map(q => q.max_points), [0.6667,0.6667,0.6666]);
result = scoring.allocateSectionPoints(section, [{ ...items[0], points_override: 0.5 }, ...items.slice(1), ...rest]);
assert.deepEqual(result.questions.slice(0,3).map(q => q.max_points), [0.5,0.75,0.75]);
result = scoring.allocateSectionPoints(section, [...items].reverse().concat(rest));
assert.deepEqual(result.questions.slice(0,3).map(q => q.id), ['mc0','mc1','mc2']);
assert.equal(scoring.allocateSectionPoints(section, [{ ...items[0], points_override: 2 }, ...items.slice(1), ...rest]).valid, false);
assert.equal(scoring.allocateSectionPoints(section, [{ ...items[0], points_override: 2.1 }, ...items.slice(1), ...rest]).valid, false);
assert.equal(scoring.allocateSectionPoints(section, items).valid, false, 'empty nonzero section is incomplete');
assert.equal(scoring.allocateSectionPoints({ ...section, short_answer: 3 }, [...items,...rest]).valid, false);
assert.equal(scoring.parsePointInput('0,25'), 0.25);
assert.equal(scoring.parsePointInput('0.6667'), 0.6667);
for (const value of ['0.00001', '-1', '1e2', '', 'NaN', '11']) assert.equal(scoring.parsePointInput(value), null);
assert.equal(scoring.trueFalseScoreRate(0), 0);
assert.deepEqual([1,2,3,4].map(scoring.trueFalseScoreRate), [0.1,0.25,0.5,1]);
for (let count=1; count<=80; count++) {
  const rows=Array.from({length:count},(_,i)=>({id:`q${i}`,question_type:'multiple_choice',order_index:i,points_override:i===0 && count>1 ? 0.6 : null}));
  const allocated=scoring.allocateSectionPoints({multiple_choice:10,true_false:0,short_answer:0},rows);
  assert.equal(allocated.valid,true);
  assert.equal(allocated.questions.reduce((total,q)=>total+Math.round(q.max_points*10000),0),100000);
  const autos=allocated.questions.filter(q=>q.points_override==null).map(q=>Math.round(q.max_points*10000));
  assert.ok(Math.max(...autos)-Math.min(...autos)<=1);
}
console.log('PASS: strict four-statement JSON, public DTO privacy, partial answers and exact fixed-total allocation.');
