import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const compiled = ts.transpileModule(readFileSync(new URL('./use-question-nav.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture(isAnswered) {
  let handler;
  let modal = false;
  const calls = [];
  const moduleStub = { exports: {} };
  vm.runInNewContext(compiled, {
    module: moduleStub, exports: moduleStub.exports,
    require: () => ({ useEffect: (effect) => effect() }),
    window: { addEventListener: (_, callback) => { handler = callback; } },
    document: { querySelector: () => modal },
  });
  moduleStub.exports.useQuestionNav({ onNext: () => calls.push('next'), onPrev: () => calls.push('prev'), onSelect: (index) => calls.push(index), isAnswered });
  return { calls, key: (key, interactive = false, extra = {}) => handler({ key, target: { closest: () => interactive }, ...extra }), openDialog: () => { modal = true; } };
}
test('typing a report or activating its button never answers/navigates a question', () => {
  const f = fixture(false);
  f.key('1', true); f.key('ArrowLeft', true);
  f.openDialog(); f.key('2'); f.key('Enter'); f.key('ArrowLeft');
  assert.deepEqual(f.calls, []);
  const answered = fixture(true);
  answered.key('Enter', true); answered.openDialog(); answered.key('ArrowRight');
  assert.deepEqual(answered.calls, []);
});
test('normal question shortcuts remain available outside overlays', () => {
  const f = fixture(false);
  f.key('1'); f.key('4'); f.key('ArrowLeft'); f.key('2', false, { ctrlKey: true });
  assert.deepEqual(f.calls, [0, 3, 'prev']);
  const answered = fixture(true);
  answered.key('Enter'); answered.key('ArrowRight');
  assert.deepEqual(answered.calls, ['next', 'next']);
});
