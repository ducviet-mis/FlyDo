// Real React components, synthetic clock ticks; no production account required.
import jsdom from '../tmp/question-report-db-test/node_modules/jsdom/lib/api.js';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
const repo = process.cwd();
const require = createRequire(resolve(repo, 'package.json'));
const dom = new jsdom.JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true, url: 'http://localhost' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'), { createRoot } = require('react-dom/client'), ts = require('typescript');
const renders = {}, cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename); cache.set(filename, mod);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(dirname(filename));
  mod.require = (name) => {
    if (name.endsWith('.css')) return {};
    if (name === 'react') return { ...React, memo: (component) => React.memo(function Counted(props) {
      renders[component.name] = (renders[component.name] || 0) + 1;
      return component(props);
    }) };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve(repo, 'src', name.slice(2)) : resolve(dirname(filename), name);
      const path = ['.tsx', '.ts'].map((suffix) => base + suffix).find(existsSync);
      if (path) return load(path);
    }
    return require(name);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  return mod.exports;
}
const { ExamClock } = load(resolve(repo, 'src/features/mock-exams/exam-clock.tsx'));
const { MathRenderer } = load(resolve(repo, 'src/features/practice/components/math-renderer.tsx'));
const { GeometryDiagram } = load(resolve(repo, 'src/features/geometry/components/geometry-diagram.tsx'));
const { AccuracyPieChart } = load(resolve(repo, 'src/features/stats/components/accuracy-pie-chart.tsx'));
let now = Date.now(), expired = 0, parentRenders = 0, changeQuestion;
const originalNow = Date.now; Date.now = () => now;
const timers = new Map(); let timerId = 0;
window.setInterval = (fn) => { timers.set(++timerId, fn); return timerId; };
window.clearInterval = (id) => timers.delete(id);
const deadlineAt = now + 90_000;
function Harness() {
  parentRenders++;
  const [content, setContent] = React.useState('$x^2+1$'); changeQuestion = setContent;
  return React.createElement(React.Fragment, {},
    React.createElement(MathRenderer, { content }), React.createElement(GeometryDiagram, { data: null }),
    React.createElement(ExamClock, { deadlineAt, onExpire: () => expired++ }),
    React.createElement(AccuracyPieChart, { correct: 3, wrong: 1, accuracy: 75 }));
}
const root = createRoot(document.getElementById('root'));
await React.act(async () => root.render(React.createElement(Harness)));
for (let i = 0; i < 60; i++) {
  now += 1000;
  await React.act(async () => { for (const tick of timers.values()) tick(); });
}
assert.equal(parentRenders, 1);
assert.equal(renders.MathRenderer, 1);
assert.equal(renders.GeometryDiagram, 1);
assert.match(document.body.textContent, /00:30/);
await React.act(async () => changeQuestion('$x^3+2$'));
assert.equal(renders.MathRenderer, 2); // New questions still update.
assert.equal(renders.GeometryDiagram, 1);
assert.match(document.querySelector('[role="img"]').getAttribute('aria-label'), /75.*3.*1/);
assert.equal(document.querySelectorAll('circle[stroke-dasharray]').length, 2);
now += 40_000;
await React.act(async () => { for (const tick of timers.values()) tick(); });
await React.act(async () => { for (const tick of timers.values()) tick(); });
assert.equal(expired, 1);
assert.match(document.body.textContent, /00:00/);
await React.act(async () => root.unmount());
assert.equal(timers.size, 0);
Date.now = originalNow; dom.window.close();
console.log('PASS: 60 clock ticks = 0 extra question/geometry/parent renders; new question renders normally; timeout fires once; SVG chart accessibility and theme tokens preserved; timer cleanup.');
