import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { isLegacyFlydoCache, isPublicStaticRequest } from '../lib/security/pwa-cache-policy';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('activate', (event) => {
  // One-time migration of application caches only; never touch IndexedDB,
  // localStorage, exam drafts, device identifiers or remembered accounts.
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter(isLegacyFlydoCache).map((name) => caches.delete(name)),
  )));
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [{
    matcher: ({ request }) => request.mode === 'navigate',
    handler: new NetworkOnly({ plugins: [{
      handlerDidError: async ({ request }) => {
        // Hydrating /offline HTML at a protected URL causes an auth redirect
        // and a React mismatch. Navigate to its actual, precached route.
        if (new URL(request.url).pathname !== '/offline') {
          return Response.redirect(new URL('/offline', self.location.origin).href, 302);
        }
        // The precache handler serves /offline before runtime routing. If its
        // cache is unexpectedly missing, fail clearly instead of redirecting.
        return new Response('Kết nối đang gián đoạn. Kiểm tra mạng rồi tải lại trang.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      },
    }] }),
  }, {
    matcher: ({ request, url }) => isPublicStaticRequest(request, url, self.location.origin),
    handler: new CacheFirst({
      cacheName: 'flydo-public-static-v1',
      plugins: [new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * 24 * 60 * 60 })],
    }),
  }],
});
serwist.addEventListeners();
