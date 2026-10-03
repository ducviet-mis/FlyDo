import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const modules = new Map();
function load(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const stub = { exports: {} };
  modules.set(filename, stub);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => {
    if (name.endsWith('.css')) return {};
    if (name.startsWith('.') || name.startsWith('@/')) {
      let target = name.startsWith('@/') ? resolve(root, 'src', name.slice(2)) : resolve(dirname(filename), name);
      if (!extname(target)) target += existsSync(target + '.ts') ? '.ts' : '.tsx';
      return load(target);
    }
    return require(name);
  };
  vm.runInNewContext(compiled, { module: stub, exports: stub.exports, require: localRequire, console }, { filename });
  return stub.exports;
}

const { parseTheoryDocument, isTheoryJson, theoryBlockHtml } = load(resolve(root, 'src/features/theory/theory-document.ts'));
const { parseTheoryQuestionJson } = load(resolve(root, 'src/features/theory/theory-import.ts'));
const raw = readFileSync(resolve(root, 'theory-sets/bai-10-tu-giac/bai-10-tu-giac-day-du.json'), 'utf8');

test('one lesson file supplies all seven embedded figures and ten review questions', () => {
  const lesson = parseTheoryDocument(raw);
  assert.equal(lesson.errors.length, 0);
  assert.equal(lesson.document.sections.length, 5);
  assert.equal(lesson.document.sections.flatMap((s) => s.blocks).filter((b) => b.diagram).length, 7);
  assert.ok(lesson.document.sections.every((s) => s.blocks.some((b) => b.example)));
  const quiz = parseTheoryQuestionJson(raw);
  assert.equal(quiz.errors.length, 0);
  assert.equal(quiz.questions.length, 10);
  assert.equal(quiz.questions.filter((q) => q.data.diagram).length, 8);
});

test('question diagrams survive the existing JSONB storage round trip for both question types', () => {
  const imported = parseTheoryQuestionJson(raw).questions;
  const stored = JSON.parse(JSON.stringify(imported));
  const restored = parseTheoryQuestionJson(JSON.stringify({ questions: stored }));
  assert.equal(restored.errors.length, 0);
  assert.ok(restored.questions.some((q) => q.question_type === 'true_false' && q.data.diagram));
  assert.ok(restored.questions.some((q) => q.question_type === 'drag_fill' && q.data.diagram));
  assert.equal(JSON.stringify(restored.questions), JSON.stringify(imported));
});

test('rejects invalid diagrams instead of silently dropping them', () => {
  const lesson = JSON.parse(raw);
  lesson.sections[0].blocks[0].diagram.segments[0].to = 'missing';
  assert.ok(parseTheoryDocument(JSON.stringify(lesson)).errors.length);
  const quiz = JSON.parse(raw);
  quiz.questions[0].diagram.points.push(quiz.questions[0].diagram.points[0]);
  assert.ok(parseTheoryQuestionJson(JSON.stringify(quiz)).errors.length);
});

test('legacy HTML remains separate, and JSON prose cannot inject HTML', () => {
  assert.equal(isTheoryJson('<h2>Bài học</h2><p>$x$</p>'), false);
  assert.equal(parseTheoryDocument('{broken').document, undefined);
  const html = theoryBlockHtml({ content: '<img src=x onerror=alert(1)> và $AB$', items: ['A < B'], example: '<script>bad</script>' });
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /\$AB\$/);
  assert.match(html, /A &lt; B/);
});

test('the lesson renderer outputs seven actual SVGs and the reader heading structure', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { TheoryContent } = load(resolve(root, 'src/features/theory/components/theory-content.tsx'));
  const html = renderToStaticMarkup(React.createElement(TheoryContent, { html: raw }));
  assert.equal((html.match(/<svg\b/g) || []).length, 7);
  assert.equal((html.match(/<h2>/g) || []).length, 5);
  assert.match(html, /Hình 7/);
  assert.doesNotMatch(html, /\[Chèn Hình/);
});

test('recovers legacy rich-editor JSON and fenced JSON without changing geometry', () => {
  const escaped = raw.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const wrapped = escaped.split('\n').map(line => `<p><span>${line || '<br>'}</span></p>`).join('');
  for (const source of [wrapped, `<pre><code>${escaped}</code></pre>`, '```json\n' + raw + '\n```']) {
    assert.equal(isTheoryJson(source), true);
    const parsed = parseTheoryDocument(source);
    assert.equal(parsed.errors.length, 0);
    assert.equal(JSON.stringify(parsed.document), JSON.stringify(parseTheoryDocument(raw).document));
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const { TheoryContent } = load(resolve(root, 'src/features/theory/components/theory-content.tsx'));
    assert.equal((renderToStaticMarkup(React.createElement(TheoryContent, { html: source })).match(/<svg\b/g) || []).length, 7);
  }
});

test('does not reinterpret ordinary HTML or discard executable/mixed content', () => {
  assert.equal(isTheoryJson('<p>{x} là tập hợp</p>'), false);
  assert.equal(isTheoryJson('<p>Bài học</p><p>' + raw + '</p>'), false);
  assert.equal(isTheoryJson('<script>alert(1)</script><p>' + raw + '</p>'), false);
  assert.equal(parseTheoryDocument('<p>{&quot;sections&quot;:broken}</p>').document, undefined);
});
