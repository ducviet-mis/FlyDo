import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { normalizeLatexInput, normalizeSlashFractions } from './normalize-latex.ts';
import { prepareMathContent, wrapBareMathEnvironments } from './math-content.ts';

test('turns the exam answer examples into stacked fractions', () => {
  assert.equal(normalizeLatexInput('1/x + 2'), '\\frac{1}{x} + 2');
  assert.equal(normalizeLatexInput('x/(y+1)'), '\\frac{x}{y+1}');
});

test('keeps numerator, denominator, powers, and nested fractions grouped', () => {
  assert.equal(normalizeSlashFractions('(x+1)/(y-1)'), '\\frac{x+1}{y-1}');
  assert.equal(normalizeSlashFractions('x^2/y^3'), '\\frac{x^2}{y^3}');
  assert.equal(normalizeSlashFractions('(x+y)^2/z'), '\\frac{(x+y)^2}{z}');
  assert.equal(normalizeSlashFractions('1/(x/y)'), '\\frac{1}{\\frac{x}{y}}');
  assert.equal(normalizeSlashFractions('a/b/c'), '\\frac{\\frac{a}{b}}{c}');
  assert.equal(normalizeLatexInput('\\left(x+1\\right)/y'), '\\frac{x+1}{y}');
});

test('preserves existing LaTeX and prose inside text commands', () => {
  assert.equal(normalizeSlashFractions('\\frac{1}{2}'), '\\frac{1}{2}');
  assert.equal(normalizeSlashFractions('\\sqrt{x}/2'), '\\frac{\\sqrt{x}}{2}');
  assert.equal(normalizeSlashFractions('\\text{and/or} + x/y'), '\\text{and/or} + \\frac{x}{y}');
});

test('accepts alternative fraction slashes and common Unicode operators', () => {
  assert.equal(normalizeLatexInput('1⁄2 ≤ 3∕4'), '\\frac{1}{2}  \\le  \\frac{3}{4}');
  assert.equal(normalizeLatexInput('π/2'), ' \\frac{\\pi}{2}');
});

test('generated fractions are valid KaTeX', () => {
  for (const expression of ['1/x + 2', 'x/(y+1)', '(x+1)/(y-1)', '1/(x/y)', 'x^2/y^3']) {
    assert.doesNotThrow(() => katex.renderToString(normalizeLatexInput(expression), { throwOnError: true }));
  }
});

test('repairs solution imports without exposing citation markers or aligned commands', () => {
  const imported = 'Theo định lí tổng các góc trong một tứ giác[cite: 4]:\n\\begin{aligned}\\widehat D &= 360^\\circ-(65^\\circ+115^\\circ+80^\\circ) \\\\ &= 100^\\circ\\end{aligned}';
  const prepared = prepareMathContent(imported);
  assert.equal(prepared.includes('[cite:'), false);
  const wrapped = wrapBareMathEnvironments(prepared);
  assert.match(wrapped, /\$\$\\begin\{aligned\}/);
  const formula = wrapped.slice(wrapped.indexOf('$$') + 2, -2);
  const normalized = normalizeLatexInput(formula);
  assert.match(normalized, /\\\\ &= 100/);
  assert.doesNotThrow(() => katex.renderToString(normalized, { displayMode: true, throwOnError: true }));
});

test('recognizes alternate delimiters and common geometry and Unicode notation', () => {
  assert.equal(prepareMathContent('Góc \\(A+B\\) và \\[x²=4\\]'), 'Góc $A+B$ và $$x²=4$$');
  for (const expression of ['∠ABC = 90°', '△ABC ⟂ DE', 'x² + √(x+1)', 'A ∈ {1;2}', '½ + ¼ = ¾']) {
    assert.doesNotThrow(() => katex.renderToString(normalizeLatexInput(expression), { throwOnError: true }), expression);
  }
});

test('repairs fully double-escaped math environments without losing row breaks', () => {
  const escaped = '\\\\begin{aligned}x&=1\\\\\\\\y&=2\\\\end{aligned}';
  const repaired = prepareMathContent(escaped);
  assert.equal(repaired, '\\begin{aligned}x&=1\\\\y&=2\\end{aligned}');
  assert.doesNotThrow(() => katex.renderToString(normalizeLatexInput(repaired), { displayMode: true, throwOnError: true }));
});

test('typesets three-point angle names with a hat spanning the complete name', () => {
  const cases = [
    ['∠BAC', '\\widehat{BAC}'],
    ['\\angle BAC', '\\widehat{BAC}'],
    ['\\angle{ABC}', '\\widehat{ABC}'],
    ['\\angle { B A C }', '\\widehat{BAC}'],
    ['\\\\angle BAC', '\\widehat{BAC}'],
    ['\\angle BAC = \\angle CAD', '\\widehat{BAC} = \\widehat{CAD}'],
  ];
  for (const [source, expected] of cases) {
    const normalized = normalizeLatexInput(source).trim();
    assert.equal(normalized, expected, source);
    assert.equal(normalizeLatexInput(normalized), normalized, 'normalization must be idempotent');
    const mathml = katex.renderToString(normalized, { output: 'mathml', throwOnError: true });
    assert.match(mathml, /<mover\b[^>]*>/, source);
    assert.doesNotMatch(mathml, /∠/, source);
  }
});

test('does not rewrite existing hats, other angle commands, or non-three-point arguments', () => {
  for (const source of [
    '\\widehat{BAC}', '\\hat{A}', '\\angle A', '\\angle ABCD',
    '\\angle{ABCD}', '\\angle \\alpha', '\\langle BAC \\rangle',
    '\\measuredangle BAC', '\\text{\\angle BAC}',
    '\\textbf{literal {\\angle BAC}}',
  ]) {
    assert.equal(normalizeLatexInput(source), source, source);
  }
});
