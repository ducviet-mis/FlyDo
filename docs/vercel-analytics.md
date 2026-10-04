# Vercel Web Analytics

FlyDo mounts the official `@vercel/analytics` SDK once from the root layout through a small client component. It uses the supported React entrypoint with Next.js pathname/params hooks: SDK 2.0.1's Next adapter can otherwise turn query parameter names into separately collected route labels. Query parameters are never used to build labels; dynamic pages still use filesystem-defined parameter names. Vercel's Next deployment endpoint configuration is forwarded unchanged. Existing UI, theme, authentication, database and learning logic are unchanged; no SQL or new secret is required.

## Data minimization

`src/lib/analytics/privacy.ts` is registered as the SDK's `beforeSend` filter:

- Only page views are allowed. No custom events, email, user IDs or answer payloads are added.
- All query parameters, URL fragments and embedded URL credentials are removed.
- The SDK's separate `route`/dynamic-path metadata is built only from the pathname and Next router params, never query keys or values.
- `/auth` and `/auth/*` events are dropped, including OAuth callbacks.
- Invalid/non-HTTP URLs are dropped without throwing.
- The original browser URL is not changed. The filter changes only the analytics event.

Normal page paths remain visible in Analytics. The SDK additionally records standard traffic metadata such as browser, device, country and referrer, under Vercel's privacy policy. This integration is traffic analytics, not a student activity or session-replay system.

## Deployment

1. In the Vercel project dashboard, open **Analytics** and enable **Web Analytics** if it is not already enabled.
2. Deploy the changes through the existing GitHub/Vercel workflow.
3. Visit the deployed website and navigate between pages. The SDK uses Vercel's provided same-origin analytics endpoints; do not add a FlyDo API endpoint or broaden CSP for this integration.
4. Return to **Analytics** to check page views. A local build cannot confirm dashboard ingestion; browser blockers can prevent analytics requests.

This change does not include Speed Insights, custom events, a paid Vercel upgrade or a deployment.

Official references: [Quickstart](https://vercel.com/docs/analytics/quickstart), [beforeSend configuration](https://vercel.com/docs/analytics/package), [Privacy](https://vercel.com/docs/analytics/privacy-policy).

## Local verification

```powershell
node --test src/lib/analytics/privacy.test.mjs
node scripts/test-analytics-ui.mjs
npx tsc --noEmit --incremental false
node --max-old-space-size=512 --max-semi-space-size=8 node_modules/next/dist/bin/next build --webpack
```

The UI test uses the actual SDK in JSDOM and never loads external scripts or sends events. Its existing test-only runtime setup is documented in `docs/admin-ui-verification.md`. It checks one script under Strict Mode, no visible UI, the registered privacy filter, safe static/dynamic route metadata and one pageview per client navigation. A regression fixture verifies that `/home?student%40example.test=home` cannot produce a route label containing the email.
