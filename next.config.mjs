import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import withSerwistInit from '@serwist/next';

const offlineRevision = createHash('sha256')
  .update(readFileSync(new URL('./src/app/offline/page.tsx', import.meta.url)))
  // The offline HTML references build-specific layout/CSS/chunk URLs too.
  // Refresh it on every build, even when this page's source is unchanged.
  .update(randomUUID())
  .digest('hex');

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  reloadOnOnline: false, // Never interrupt an in-progress exam when Wi-Fi returns.
  additionalPrecacheEntries: [{ url: '/offline', revision: offlineRevision }],
  // Precache only public build assets, never HTML, RSC, APIs or user data.
  manifestTransforms: [async (entries) => ({
    manifest: entries.filter(({ url }) => url.startsWith('/_next/static/')
      || /^\/(?:icon-\d+|apple-touch-icon)\.png$/.test(url) || url === '/offline'),
    warnings: [],
  })],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
      ] },
      { source: '/sw.js', headers: [
        { key: 'Cache-Control', value: 'no-store, max-age=0' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ] },
    ];
  },
  async redirects() {
    return [
      { source: '/classroom/:path*', destination: '/home', permanent: true },
      { source: '/teacher/:path*', destination: '/home', permanent: true },
    ];
  },
};

export default withSerwist(nextConfig);
