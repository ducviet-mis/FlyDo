// Run against a local production build; anonymous GETs only, no live data writes.
// npm run build; npm run start -- --port 3502
// node scripts/test-production-smoke.mjs [http://localhost:3502]
import assert from 'node:assert/strict';

const base = new URL(process.argv[2] || 'http://localhost:3502');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a local test server only');
const pages = ['/home', '/login', '/register', '/theory?grade=8', '/practice?grade=8',
  '/mock-exams?grade=8', '/handbook', '/notifications', '/profile', '/pricing',
  '/practice/wrong', '/personal-exams', '/terms', '/privacy', '/payment-policy', '/support'];
for (const path of pages) {
  const response = await fetch(new URL(path, base), { redirect: 'manual' });
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path);
  assert.equal(response.headers.get('x-frame-options'), 'DENY', path);
  assert.equal(response.headers.get('x-powered-by'), null, path);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/, path);
  assert.match(response.headers.get('cache-control'), /no-store/, path);
  assert.doesNotMatch(await response.text(), /Application error: a client-side exception|Internal Server Error/, path);
}
for (const path of ['/admin', '/admin/mock-exams', '/admin/question-reports', '/admin/notifications',
  '/handbook/new', '/handbook/example/edit']) {
  const response = await fetch(new URL(path, base), { redirect: 'manual' });
  assert.equal(response.status, 307, path);
  assert.equal(new URL(response.headers.get('location'), base).pathname, '/home', path);
  assert.match(response.headers.get('cache-control'), /no-store/, path);
}
const callback = await fetch(new URL('/auth/callback?next=//evil.test', base), { redirect: 'manual' });
assert.equal(callback.status, 307);
const destination = new URL(callback.headers.get('location'), base);
assert.equal(destination.origin, base.origin);
assert.equal(destination.pathname, '/login');
assert.match(callback.headers.get('cache-control'), /no-store/);
const offline = await fetch(new URL('/offline', base));
assert.equal(offline.status, 200);
assert.match(await offline.text(), /Kết nối đang gián đoạn/);
const worker = await fetch(new URL('/sw.js', base));
assert.equal(worker.status, 200);
assert.match(worker.headers.get('cache-control'), /no-store/);
assert.equal(worker.headers.get('service-worker-allowed'), '/');
const source = await worker.text();
assert.match(source, /flydo-public-static-v1/);
// All concrete manifest entries must be public static assets or offline shell.
const precached = Array.from(source.matchAll(/['"]url['"]\s*:\s*['"]([^'"]+)['"]/g), (match) => match[1]);
assert.ok(precached.length > 10, 'Generated worker contains a precache manifest');
assert.ok(precached.includes('/offline'));
for (const url of precached) assert.ok(url.startsWith('/_next/static/') || url === '/offline'
  || /^\/(?:icon-\d+|apple-touch-icon)\.png$/.test(url), 'Unsafe precached URL: ' + url);
console.log('PASS: production routes, anonymous admin boundary, safe OAuth, security/no-store headers, offline shell and static-only generated worker.');
