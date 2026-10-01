// Local, deterministic bank/planner checks. No Supabase or student data writes.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';

const repo = process.cwd();
const require = createRequire(resolve(repo, 'package.json'));
const ts = require('typescript');
const requests = [];
let failureAt = -1;
const lessons = Array.from({ length: 61 }, (_, index) => ({ id: 'lesson-' + index, title: 'Bài ' + index, grade: 8, chapter: index < 30 ? 'A' : 'B' }));
const rows = Array.from({ length: 1605 }, (_, index) => ({ id: 'q' + String(index).padStart(5, '0'), lesson_id: lessons[index % lessons.length].id,
  content: 'Tính $1+1$', options: ['1', '2', '3', '4'], correct_answer: 1, solution: '$1+1=2$', difficulty_level: index % 4 + 1 }));
const db = {
  from(table) {
    const filters = [];
    let start = 0, end = 499;
    return { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, in(key, value) { assert.ok(value.length <= 50, 'IN filters are chunked'); filters.push([key, value]); return this; },
      order() { return this; }, range(from, to) { start = from; end = to; return this; },
      then(done) {
        requests.push({ table, start, end, filters });
        const data = (table === 'practice_lessons' ? lessons : rows).filter(row => filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : value === row[key])).sort((a, b) => a.id.localeCompare(b.id));
        return Promise.resolve(requests.length === failureAt ? { data: null, error: { message: 'offline' } } : { data: data.slice(start, end + 1), error: null }).then(done);
      } };
  },
};
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename); cache.set(filename, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = name => {
    if (name === '@/lib/supabase/client') return { getSupabaseClient: () => db };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.ts', '.tsx'].map(ext => base + ext).find(existsSync); if (path) return load(path);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const utils = load(resolve(repo, 'src/features/personal-exams/utils.ts'));
const bank = load(resolve(repo, 'src/features/personal-exams/bank.ts'));
const { parsePersonalExamSession } = load(resolve(repo, 'src/features/personal-exams/validate-session.ts'));
const config = (overrides = {}) => ({ title: 'Đề ôn tập', grade: 8, mode: 'exam', questionCount: 10, durationMinutes: 30,
  chapterWeights: [{ chapter: 'A', weight: 50 }, { chapter: 'B', weight: 50 }], levelWeights: { 1: 50, 2: 50, 3: 0, 4: 0 }, ...overrides });
function questionsFromMatrix(matrix) {
  return matrix.flatMap((levels, index) => levels.flatMap((count, level) => Array.from({ length: count }, (_, i) => ({ id: `${index}-${level}-${i}`, chapter: String.fromCharCode(65 + index), lessonId: 'l' + index,
    content: 'Tính 1+1', options: ['1', '2'], correctAnswer: 1, solution: '2', hasMath: false, difficultyLevel: level + 1 }))));
}

for (let count = 5; count <= 100; count++) {
  const allocated = utils.allocateByWeights(count, [{ id: 'A', weight: 33 }, { id: 'B', weight: 33 }, { id: 'C', weight: 34 }]);
  assert.equal([...allocated.values()].reduce((a, b) => a + b), count);
}
assert.deepEqual(utils.equalChapterWeights(['A', 'B', 'C']).map(item => item.weight), [34, 33, 33]);
const full = questionsFromMatrix([[30, 30, 30, 30], [30, 30, 30, 30]]);
for (let count = 5; count <= 100; count++) {
  const cfg = config({ questionCount: count, chapterWeights: [{ chapter: 'A', weight: 33 }, { chapter: 'B', weight: 67 }], levelWeights: { 1: 31, 2: 33, 3: 29, 4: 7 } });
  const plan = utils.getPersonalExamPlan(cfg, full);
  assert.equal(plan.valid, true, plan.issues.join(' '));
  const built = utils.buildPersonalExam(cfg, full);
  assert.equal(built.questions.length, count); assert.equal(new Set(built.questions.map(question => question.id)).size, count); assert.deepEqual(built.warnings, []);
  for (const [chapter, expected] of plan.chapterNeeds) assert.equal(built.questions.filter(question => question.chapter === chapter).length, expected);
  for (const [level, expected] of plan.levelNeeds) assert.equal(built.questions.filter(question => question.difficultyLevel === level).length, expected);
}
// Greedy selection would strand chapter B, but residual flow finds the valid mix.
assert.equal(utils.getPersonalExamPlan(config(), questionsFromMatrix([[5, 5, 0, 0], [5, 0, 0, 0]])).valid, true);
// Each independent count looks sufficient, but no joint chapter/level combination exists.
const impossible = config({ chapterWeights: [{ chapter: 'A', weight: 80 }, { chapter: 'B', weight: 20 }] });
const wrongMix = questionsFromMatrix([[0, 10, 0, 0], [10, 0, 0, 0]]);
assert.equal(utils.getPersonalExamPlan(impossible, wrongMix).valid, false);
assert.throws(() => utils.buildPersonalExam(impossible, wrongMix), /đồng thời/);

// Exhaustive small 2x2 banks compared against the direct feasibility equation.
for (let a = 0; a <= 6; a++) for (let b = 0; b <= 6; b++) for (let c = 0; c <= 6; c++) for (let d = 0; d <= 6; d++) {
  const feasible = Array.from({ length: 6 }, (_, x) => x).some(x => x <= a && 5 - x <= b && 5 - x <= c && x <= d);
  const plan = utils.getPersonalExamPlan(config(), questionsFromMatrix([[a, b, 0, 0], [c, d, 0, 0]]));
  assert.equal(plan.valid, feasible, JSON.stringify([a, b, c, d]));
}
const scope = config({ chapterWeights: [{ chapter: 'A', weight: 100, lessonIds: ['l0'] }] });
assert.ok(utils.buildPersonalExam(scope, full).questions.every(question => question.lessonId === 'l0'));
assert.equal(utils.getPersonalExamPlan(config({ chapterWeights: [{ chapter: 'A', weight: 100, lessonIds: [] }] }), full).valid, false);
assert.equal(utils.getPersonalExamPlan(config(), [...full, ...full]).candidates.length, full.length);
for (const overrides of [{ grade: 12 }, { questionCount: 4 }, { questionCount: 101 }, { questionCount: 10.5 }, { durationMinutes: 0 }, { durationMinutes: 181 }, { levelWeights: { 1: -20, 2: 120, 3: 0, 4: 0 } }, { levelWeights: { 1: 20, 2: 20, 3: 20, 4: 20 } }, { chapterWeights: [{ chapter: 'A', weight: 100 }, { chapter: 'A', weight: 0 }] }]) {
  assert.equal(utils.getPersonalExamPlan(config(overrides), full).valid, false);
}
const invalid = full.map(question => ({ ...question, correctAnswer: 100 }));
assert.throws(() => utils.buildPersonalExam(config(), invalid), /chỉ có/);

const templateRow = { id: 't', name: 'Đề cũ', grade: 8, mode: 'exam', question_count: 10, duration_minutes: 45, chapter_weights: config().chapterWeights, level_weights: config().levelWeights };
assert.ok(utils.parsePersonalExamTemplate(templateRow));
assert.deepEqual(utils.parsePersonalExamTemplate({ ...templateRow, chapter_weights: scope.chapterWeights }).chapterWeights[0].lessonIds, ['l0']);
assert.equal(utils.parsePersonalExamTemplate({ ...templateRow, level_weights: { 1: 101, 2: -1, 3: 0, 4: 0 } }), null);
assert.equal(utils.parsePersonalExamTemplate({ ...templateRow, mode: 'bad' }), null);

const overview = await bank.loadPersonalExamBank(8);
assert.equal(overview.lessons.length, 61); assert.equal(overview.candidates.length, 1605); assert.equal(overview.excludedCount, 0);
assert.ok(requests.filter(request => request.table === 'practice_questions').some(request => request.start > 0), 'Bank is not truncated at the server row cap');
const retrieved = await bank.loadPersonalExamQuestions(overview.candidates.map(item => item.id), overview.lessons);
assert.equal(retrieved.length, 1605); assert.equal(retrieved[0].solution, '$1+1=2$');
const raw = rows[0];
const normalized = bank.readBankCandidates([{ ...raw, difficulty_level: null }, { ...raw, id: 'blank', content: ' ' }, { ...raw, id: 'options', options: ['ok', ''] }, { ...raw, id: 'level', difficulty_level: 10 }, { ...raw, id: 'answer', correct_answer: -1 }, { ...raw, id: 'removed', lesson_id: 'missing' }], lessons);
assert.equal(normalized.candidates.length, 1); assert.equal(normalized.candidates[0].difficultyLevel, 1); assert.equal(normalized.excludedCount, 5);
failureAt = requests.length + 2;
await assert.rejects(bank.loadPersonalExamBank(8), /offline/); // Must never treat a partial bank as complete.

const owned = utils.createPersonalExamSession(config(), utils.buildPersonalExam(config(), full).questions, 'student-a');
assert.ok(parsePersonalExamSession(JSON.stringify(owned), owned.id, 'student-a'));
assert.equal(parsePersonalExamSession(JSON.stringify(owned), owned.id, 'student-b'), null);
assert.equal(parsePersonalExamSession(JSON.stringify({ ...owned, ownerId: undefined }), owned.id, 'student-a'), null);
assert.equal(parsePersonalExamSession(JSON.stringify({ ...owned, config: { ...owned.config, questionCount: 50 } }), owned.id, 'student-a'), null);
assert.equal(parsePersonalExamSession(JSON.stringify({ ...owned, submittedAt: 'invalid' }), owned.id, 'student-a'), null);
const cleaned = parsePersonalExamSession(JSON.stringify({ ...owned, answers: { [owned.questions[0].id]: 1, unknown: 1, [owned.questions[1].id]: 9 } }), owned.id, 'student-a');
assert.deepEqual(cleaned.answers, { [owned.questions[0].id]: 1 });
console.log('PASS: exact joint chapter/level quotas, exhaustive constrained banks, rounding, lesson scope, duplicates/invalid rows, legacy templates, 1605-row pagination/chunking, partial failure and account-bound sessions.');
