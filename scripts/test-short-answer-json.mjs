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
const m = load(resolve('src/features/question-import/json-import.ts'));
const mcq = { content: '?', options: ['a','b','c','d'], correct_answer: 0, solution: 'ok' };
const short = { question_type: 'short_answer', content: '?', accepted_answers: ['0,5', '0.5', '1/2'], solution: 'ok' };
const parse = (questions, target='mock_exam') => m.parseQuestionJson(JSON.stringify({ questions }), target);
assert.equal(parse([mcq, short]).errors.length, 0);
assert.equal(parse([mcq, short]).questions.length, 2);
assert.match(parse([short], 'practice').errors.join(), /Câu 1.*Thi thử/);
for (const edit of [ { accepted_answers: [] }, { accepted_answers: [5] }, { accepted_answers: [' '] },
  { accepted_answers: Array(21).fill('a') }, { accepted_answers: ['😀'.repeat(201)] },
  { accepted_answers: ['😀'.repeat(101)] }, { options: ['a'] }, { answers: ['b'] },
  { correct_answer: 0 }, { correctAnswer: 1 }, { answer: 'A' }, { question_type: 'essay' }, { question_type: null } ]) {
  assert.match(parse([{ ...short, ...edit }]).errors.join(), /Câu 1/, JSON.stringify(edit));
}
assert.equal(parse([{ ...mcq, accepted_answers: ['a'] }]).errors.length > 0, true);
assert.deepEqual(parse([{ ...short, accepted_answers: ['  Hình\u00a0chữ nhật ', 'Hình chữ nhật'] }]).questions[0].accepted_answers, ['  Hình\u00a0chữ nhật ']);
assert.equal(m.parseQuestionJson(m.buildQuestionJsonSample('mock_exam', 'short_answer'), 'mock_exam').errors.length, 0);
assert.equal(m.parseQuestionJson(m.buildQuestionJsonSample('practice', 'short_answer')).errors.length, 0);
assert.match(m.buildAiPrompt('mock_exam', 'demo', undefined, 'short_answer'), /accepted_answers/);
assert.equal(m.parseQuestionJson(JSON.stringify({ data: { questions: [ { question:'?', answers:['a','b','c','d'], answer:'B' } ] } })).questions[0].correct_answer, 1);
assert.equal(parse([{ ...short, diagram: { type:'geometry', points:'bad' } }]).errors.length > 0, true);
console.log('PASS: mixed exam JSON, practice gating, aliases, limits, variants, geometry and copyable templates.');
