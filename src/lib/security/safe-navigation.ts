/** URL parsing normalizes backslashes: /\evil.test is not an internal route. */
export function safeInternalPath(value: unknown, fallback = '/home'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
    || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const origin = 'https://flydo.internal';
    const destination = new URL(value, origin);
    return destination.origin === origin ? `${destination.pathname}${destination.search}${destination.hash}` : fallback;
  } catch { return fallback; }
}
