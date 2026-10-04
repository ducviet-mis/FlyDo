# ADMIN layout verification

This update changes presentation only: the seven ADMIN routes, authentication,
database tables, mutation handlers and RPC payloads remain unchanged. No SQL
migration is needed.

## Local test prerequisite

The component regression runner uses the same isolated JSDOM runtime as the
existing UI tests. From the repository root, after installing normal project
dependencies, prepare it once:

```powershell
npm install --prefix tmp/question-report-db-test --no-save --package-lock=false jsdom@26.1.0
```

The runtime stays in the ignored `tmp` directory. No dependency is added to the
application bundle. The tests replace only external auth, Next navigation and
remote database boundaries; they never access or change live Supabase data.

## Checks

```powershell
node scripts/test-admin-layout-ui.mjs
node node_modules/eslint/bin/eslint.js src/app/admin src/components/admin
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
```

The runner covers navigation and access guards, mounted draft retention, theory
editing, empty exam topics, notification confirmation, geometry/math preview,
cancelled imports, unchanged FlyMax payloads, and feedback outside folded forms.

CSS must also be checked in a browser at phone and desktop sizes in both themes:

- No horizontal overflow or overlap; touch controls remain at least 44px.
- JSON textareas retain their explicit editing heights (288px import, 360px
  theory questions, 320px theory lesson JSON); shared control rules must not
  override these heights.
- Long lesson/chapter names wrap without displacing actions.
- Create forms fold without clearing drafts; selecting a theory lesson to edit
  reopens its editor. Reordering and destructive confirmations stay accessible.

Optional `--snapshots <directory>` emits fixture-rendered component HTML for
visual QA. These are test artifacts, not deployable authenticated ADMIN pages.
Serve them locally with the real global, Sol/Luna and ADMIN styles. Browser QA
does not replace persistence or RLS testing in the real project.

Existing Tiptap duplicate-link and JSDOM styled-JSX warnings are separate from
this layout update. Existing ADMIN effect warnings should not be mistaken for
new lint failures.
