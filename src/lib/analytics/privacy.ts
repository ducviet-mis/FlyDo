import type { BeforeSendEvent } from '@vercel/analytics';

export function prepareAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  // Only count page views; never forward custom payloads or student data.
  if (event.type !== 'pageview') return null;

  try {
    const url = new URL(event.url);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) return null;

    url.search = '';
    url.hash = '';
    url.username = '';
    url.password = '';
    return { type: 'pageview', url: url.href };
  } catch {
    // A malformed analytics event must never interrupt a lesson or exam.
    return null;
  }
}
