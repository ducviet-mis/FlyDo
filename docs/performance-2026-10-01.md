# Learning performance pass

Preserves Sol/Luna, routes, authentication, rewards and learning data.

## Measured production build

Same local environment, webpack production build. Unique initial JavaScript URLs
from `.next/server/app/home.html`; file bytes and per-file gzip bytes summed.
Includes shared layout/runtime and the legacy polyfill, not just home-page code.

| Home initial JS | Before | After |
| --- | ---: | ---: |
| Chunks | 27 | 25 |
| Uncompressed bytes | 2,003,248 | 1,578,176 |
| Gzip bytes | 592,725 | 474,993 |

About 20% less compressed initial JavaScript. This is a bundle measurement,
not a claim about real-user load time, Lighthouse, FPS, LCP or network latency.

## Changes

- Native SVG accuracy ring replaces the chart-library runtime. Same footprint,
  accuracy/counts/legend, existing semantic theme colors and hover titles.
- Load FlyTiee events/adventure only when their tabs mount. Preserve the existing
  controller, reward logic and animations; reserve space for the loading state.
- ExamClock owns its one-second state changes; math and geometry are memoized.
  The exam only updates on user actions, submission, or actual expiration.
- Countdown warning respects reduced-motion preferences.

## Verification

- `node scripts/test-learning-performance.mjs`: 60 synthetic clock ticks cause
  zero additional parent/math/geometry renders; changed question still updates;
  timeout once; cleanup and accessible SVG counts.
- 15 existing math/pagination/keyboard tests and audit regression tests passed.
- Production build and typecheck passed. Lint: zero errors, existing warnings.
- Anonymous desktop Sol/Luna browser check and production HTTP smoke tests.

Server grading is a separate rollout. This optimization release does not claim
to secure the old browser-based scoring; see the separate SQL/install guide.
