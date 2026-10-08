import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { normalizeLatexInput } from '../../../lib/math/normalize-latex.ts';
import { prepareMathContent, wrapBareMathEnvironments } from '../../../lib/math/math-content.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const katex = require('katex');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const filename = fileURLToPath(new URL('./math-renderer.tsx', import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const moduleStub = { exports: {} };
const localRequire = (name) => {
  if (name === 'katex/dist/katex.min.css') return {};
  if (name === '@/lib/math/normalize-latex') return { normalizeLatexInput };
  if (name === '@/lib/math/math-content') return { prepareMathContent, wrapBareMathEnvironments };
  return require(name);
};
vm.runInNewContext(compiled, { module: moduleStub, exports: moduleStub.exports, require: localRequire, console }, { filename });
const { formatOptionMath, MathRenderer } = moduleStub.exports;

test('keeps a geometry solution environment whole and removes source citations', () => {
  const source = 'Theo định lí[cite: 4]:\n\\begin{aligned}\\widehat D &= 360^\\circ-(65^\\circ+115^\\circ+80^\\circ) \\\\ &= 100^\\circ\\end{aligned}';
  const formatted = formatOptionMath(source);
  assert.equal(formatted.includes('[cite:'), false);
  assert.match(formatted, /\$\$\\begin\{aligned\}[\s\S]*\\end\{aligned\}\$\$/);
  const formula = formatted.match(/\$\$([\s\S]*?)\$\$/)?.[1];
  assert.ok(formula);
  assert.doesNotThrow(() => katex.renderToString(normalizeLatexInput(formula), { displayMode: true, throwOnError: true }));
  const html = renderToStaticMarkup(React.createElement(MathRenderer, { content: source, variant: 'solution' }));
  assert.doesNotMatch(html, /katex-error|\[cite:/);
  assert.match(html, /katex-display/);
});

test('renders both single-letter angles in the admin short-answer preview example', () => {
  const content = 'Hình bình hành $ABCD$ có $\\angle A=(2x+18)^\\circ$ và $\\angle B=(3x-8)^\\circ$. Tìm $x$. Chỉ nhập một số, không kèm đơn vị hay ký hiệu.';
  for (const variant of ['inline', 'solution']) {
    const html = renderToStaticMarkup(React.createElement(MathRenderer, { content, variant }));
    assert.match(html, /\\widehat\{A\}=\(2x\+18\)\^\\circ/);
    assert.match(html, /\\widehat\{B\}=\(3x-8\)\^\\circ/);
    assert.doesNotMatch(html, /katex-error|∠|\\angle/);
    assert.match(html, /Chỉ nhập một số, không kèm đơn vị hay ký hiệu/);
  }
});

test('keeps a single angle label attached in raw LaTeX and Unicode prose', () => {
  for (const content of ['Góc \\angle A và góc \\angle B bù nhau.', 'Góc ∠A và góc ∠B bù nhau.']) {
    const html = renderToStaticMarkup(React.createElement(MathRenderer, { content }));
    assert.match(html, /\\widehat\{A\}/, content);
    assert.match(html, /\\widehat\{B\}/, content);
    assert.doesNotMatch(html, /katex-error|∠|\\angle/, content);
    assert.match(html, /bù nhau\./, content);
  }
});

test('recognizes Unicode math in prose, alternate delimiters, and leaves URLs alone', () => {
  const formatted = formatOptionMath('Góc ∠ABC = 90° và AB ⟂ CD. Xem https://flydo.vn/a/b');
  assert.match(formatted, /\$∠ABC = 90°\$/);
  assert.match(formatted, /\$AB ⟂ CD\$/);
  assert.match(formatted, /https:\/\/flydo\.vn\/a\/b/);
  assert.equal(formatOptionMath('\\(x+1\\) và \\[x²=4\\]'), '$x+1$ và $$x²=4$$');
});

test('preserves an explicit multiline math block and recognizes plain typed options', () => {
  const formula = '$\\begin{aligned}x&=1\\\\y&=2\\end{aligned}$';
  assert.equal(formatOptionMath(formula), formula);
  assert.equal(formatOptionMath('90°'), '$90°$');
  assert.equal(formatOptionMath('x² + ½'), '$x² + ½$');
});

test('renders textbook angle hats in questions, options, and detailed solutions', () => {
  for (const variant of ['inline', 'solution']) {
    for (const content of [
      'AD là tia phân giác của $\\angle BAC$ với $D \\in BC$.',
      'AD là tia phân giác của ∠BAC với D thuộc BC.',
      '$\\angle{BAC}=\\angle CAD$',
      'Góc \\angle BAC là góc ở đỉnh A.',
    ]) {
      const html = renderToStaticMarkup(React.createElement(MathRenderer, { content, variant }));
      assert.match(html, /<mover\b[^>]*>/, content);
      assert.doesNotMatch(html, /katex-error|∠|\\angle/, content);
      assert.match(html, /\\widehat\{BAC\}/, content);
      if (content.includes('CAD')) assert.match(html, /\\widehat\{CAD\}/, content);
      if (content.includes('là tia phân giác')) assert.match(html, /AD là tia phân giác của /);
    }
  }
});
