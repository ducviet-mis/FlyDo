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

The runner requires all eight exported scenarios; empty or incomplete snapshot folders fail instead of reporting success. It checks five viewport sizes, both themes, long titles, completion and empty-history states, touch targets, overlap, horizontal overflow, pause controls, and reduced motion. Screenshots are written beside the HTML snapshots. These are Chromium viewport checks, not a claim of testing on physical iOS/Safari devices.

Builds regenerate `public/sw.js` and may update `tsconfig.tsbuildinfo`. Preserve unrelated local changes before building. Do not stage temporary snapshots or installations.
