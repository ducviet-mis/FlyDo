import test from 'node:test';
import assert from 'node:assert/strict';

test('page views keep their destination but never send URL queries, fragments or credentials', async () => {
  const { prepareAnalyticsEvent } = await import('./privacy.ts');
  const original = Object.freeze({
    type: 'pageview',
    url: 'https://student:secret@flydovn.vercel.app/practice/lesson-8?grade=8&email=student%40example.test&code=oauth-secret#access_token=secret',
  });
  assert.deepEqual(prepareAnalyticsEvent(original), {
    type: 'pageview', url: 'https://flydovn.vercel.app/practice/lesson-8',
  });
  assert.equal(original.url, 'https://student:secret@flydovn.vercel.app/practice/lesson-8?grade=8&email=student%40example.test&code=oauth-secret#access_token=secret');
});

test('ordinary learning page views still count on production and preview domains', async () => {
  const { prepareAnalyticsEvent } = await import('./privacy.ts');
  for (const url of [
    'https://flydovn.vercel.app/home',
    'https://preview.example.test/theory/lesson-10',
    'http://localhost:3502/mock-exams',
  ]) assert.deepEqual(prepareAnalyticsEvent({ type: 'pageview', url }), { type: 'pageview', url });
});

test('OAuth callbacks and other authentication endpoints never generate page views', async () => {
  const { prepareAnalyticsEvent } = await import('./privacy.ts');
  for (const url of [
    'https://flydovn.vercel.app/auth',
    'https://flydovn.vercel.app/auth/callback?code=secret&next=/home',
  ]) assert.equal(prepareAnalyticsEvent({ type: 'pageview', url }), null);
});

test('custom events are not enabled and unexpected personal fields cannot pass through', async () => {
  const { prepareAnalyticsEvent } = await import('./privacy.ts');
  assert.equal(prepareAnalyticsEvent({ type: 'event', url: 'https://flydovn.vercel.app/home' }), null);
  assert.deepEqual(prepareAnalyticsEvent({
    type: 'pageview', url: 'https://flydovn.vercel.app/home', email: 'student@example.test', answers: ['A'],
  }), { type: 'pageview', url: 'https://flydovn.vercel.app/home' });
});

test('invalid or non-web URLs are dropped instead of interrupting the application', async () => {
  const { prepareAnalyticsEvent } = await import('./privacy.ts');
  for (const url of ['', 'not a URL', 'javascript:alert(1)', 'file:///private/student.json']) {
    assert.equal(prepareAnalyticsEvent({ type: 'pageview', url }), null);
  }
});
