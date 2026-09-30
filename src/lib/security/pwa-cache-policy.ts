// A deliberately small allowlist: Supabase, OAuth, RSC and private documents
// must always use the network. Do not add a cross-origin/default cache here.
export function isPublicStaticRequest(request: Request, url: URL, origin: string): boolean {
  if (request.method !== 'GET' || url.origin !== origin) return false;
  if (request.headers.has('authorization') || request.headers.has('rsc')
    || request.headers.has('next-router-prefetch') || url.searchParams.has('_rsc')) return false;
  if (url.pathname.startsWith('/_next/static/')) {
    return ['script', 'style', 'font'].includes(request.destination);
  }
  return request.destination === 'image'
    && /^\/(?:icon-\d+|apple-touch-icon)\.png$/.test(url.pathname);
}

const legacyCaches = new Set([
  'start-url', 'google-fonts-webfonts', 'google-fonts-stylesheets',
  'static-font-assets', 'static-image-assets', 'next-static-js-assets',
  'next-image', 'static-audio-assets', 'static-video-assets', 'static-js-assets',
  'static-style-assets', 'next-data', 'static-data-assets', 'apis',
  'pages-rsc-prefetch', 'pages-rsc', 'pages', 'cross-origin',
]);

export function isLegacyFlydoCache(name: string): boolean {
  return legacyCaches.has(name) || name.startsWith('workbox-precache-v2-');
}
