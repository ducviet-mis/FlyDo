# Homepage UI verification

These checks render real homepage components with synthetic student data. They do not require a real account, access production data, or change the database. Run from the repository root with Node 22.13+ and the existing project dependencies installed (`npm ci`).

## Component regression tests

JSDOM is an isolated test-only dependency, intentionally outside the application dependency tree. On a clean checkout, bootstrap it explicitly:

```powershell
npm install --prefix tmp/question-report-db-test --no-save --package-lock=false jsdom@26.1.0
node --test scripts/test-home-learning-ui.mjs
```

The temporary dependency folder is ignored by Git and is not part of the deployed application. The test exits with actionable instructions when this prerequisite is missing.

## Responsive visual checks

The layout runner needs an existing production build, Playwright, and a Chromium browser. Its defaults use the bundled Codex runtime and the installed Windows Chrome. For another machine, create an isolated runtime and specify absolute paths:

```powershell
npm install --prefix tmp/homepage-browser-runtime --package-lock=false playwright@1.58.2
npx --prefix tmp/homepage-browser-runtime playwright install chromium
$env:FLYDO_QA_RUNTIME_PACKAGE = (Resolve-Path tmp/homepage-browser-runtime/package.json).Path
$env:FLYDO_QA_BROWSER = 'ABSOLUTE_PATH_TO_CHROMIUM_EXECUTABLE'
```

Use the executable path from that Chromium installation, or an existing Chrome executable. Then:

```powershell
npm run build
node scripts/test-home-learning-ui.mjs --snapshots tmp/home-learning-visual
node scripts/verify-home-learning-layout.mjs
```

The runner requires all eight exported scenarios; empty or incomplete snapshot folders fail instead of reporting success. It checks five viewport sizes, both themes, long titles, completion and empty-history states, touch targets, overlap, horizontal overflow, static hero artwork without obsolete effects controls or connecting dashed lines, and reduced motion. Screenshots are written beside the HTML snapshots. These are Chromium viewport checks, not a claim of testing on physical iOS/Safari devices.

Builds regenerate `public/sw.js` and may update `tsconfig.tsbuildinfo`. Preserve unrelated local changes before building. Do not stage temporary snapshots or installations.

## Learning progress and exam catalog (2026-10-08)

Export the real components with controlled daily/all-time results, a submitted zero score,
an unattempted exam and a long exam title; then verify both themes at 320, 375, 768,
1280 and landscape 844px. No live accounts or data writes are used:

```powershell
node scripts/test-home-learning-ui.mjs --snapshots tmp/progress-exam-visual
node scripts/test-mock-exam-catalog-ui.mjs --snapshots tmp/progress-exam-visual
node scripts/verify-progress-exam-layout.mjs
node scripts/verify-home-learning-layout.mjs tmp/progress-exam-visual
```

The progress/catalog checker verifies numeric values precede charts, readable period
labels, 44px actions, no clipped titles or overlapping buttons, and no horizontal
overflow including 125% root text size. The homepage checker also retains existing
resume/hero checks; it ignores the two catalog snapshots.

Question counts and accuracy cover self-practice; online minutes cover visible time
across FlyDo. Today, rolling seven/thirty days and all-time calculations remain in the
existing hooks. Component tests distinguish week/all-time values and preserve daily
values when the statistics period changes; separate today/month fixtures are a remaining
test-coverage improvement, not a changed calculation.

Full regression suite (the smoke script requires a separately running local server):

```powershell
$flydoTests = @((rg --files src -g '*.test.mjs'), (Get-ChildItem scripts/test-*.mjs | Where-Object Name -ne 'test-production-smoke.mjs' | Select-Object -ExpandProperty FullName)) | ForEach-Object { $_ }
node --test --test-concurrency=2 @flydoTests
```

Do not overlap database tests with browser QA on memory-constrained machines. If
needed, use `node --max-old-space-size=512 --max-semi-space-size=8 --test --test-concurrency=1 @flydoTests`.
Final verification for this change: 185/185 regression checks, 30/30 progress/catalog
layouts and 50/50 homepage layouts passed; production build and TypeScript passed.
Scoped ESLint has zero errors and retains the existing mounted-effect warning.
