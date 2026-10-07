# Progress and exam presentation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans with test-driven-development and verification-before-completion. Track steps below.

**Goal:** Separate today's practice progress from longer-term results and make exam cards easier to scan.

**Architecture:** Presentation-only changes to existing components. Reuse the existing hooks, filters, routes, resume action, mistake-review action and history dialog. No new dependencies or database changes.

**Tech Stack:** Next.js, React, TypeScript, Tailwind, Radix, Lucide; existing JSDOM and Chromium QA runners.

**Spec:** User-approved design in this conversation: numeric daily metrics first; explicit rolling-period labels; charts after numbers; latest exam score primary, best secondary; visible result/history controls; phone readability; preserve all data and grading.

## Global Constraints

- Keep all queries, calculation methods, filters, auth and routes unchanged.
- Use existing Sol/Luna tokens. Do not restore hidden FlyTiee or hero animation.
- Preserve unrelated question sets, public/sw.js and tsconfig.tsbuildinfo.
- Work in the user's existing checkout, matching the approved direct-edit workflow. Do not create a worktree, commit or push; user requests CMD commands at handoff.

## Review Focus

- A valid zero exam score must not look like an unattempted exam.
- Long Vietnamese titles and filter labels must wrap on 320/375px phones.
- Today's and all-time figures must differ according to the original query scopes.
- Date labels must describe rolling seven/thirty days, not calendar week/month.
- Direct result/history actions must still target the exact attempt and exam.

## Task 1: Learning progress presentation

Files: goal-ring.tsx, stats-overview-card.tsx, time-filter-tabs.tsx; tests in scripts/test-home-learning-ui.mjs.
Interfaces: consume existing useDailyGoal/useStats; no hook changes. Existing resume/review owners remain unique.

- [x] Extend real-component tests for semantic metric order, period switching with distinct fixtures, chart placement, empty statistics and goal editing; run and verify expected failures.
- [x] Make daily values primary, goal indicators secondary; label practice scope. Put longer-period numbers before accuracy chart and show selected period.
- [x] Run component tests; retain current date/user filters and navigation checks.

## Task 2: Exam cards

Files: exam-catalog-card.tsx; tests in scripts/test-mock-exam-catalog-ui.mjs.
Interfaces: consume existing ordered MockExamAttempt[], no scoring/query changes; retain onStart/onHistory and attempt-result href.

- [x] Extend tests for latest vs best score, explicit status, visible result/history labels, zero vs no attempt; verify expected failures.
- [x] Title first, duration/status metadata, latest score primary and best/date secondary; readable responsive controls.
- [x] Run catalog tests including existing grade/category/status/search/history/fullscreen coverage.

## Task 3: Verification and handoff

- [x] Export real rendered progress/exam DOM and check desktop/mobile, both themes, touch targets, long titles, overflow and reduced motion with local compiled CSS.
- [x] Run full regression suite, TypeScript and targeted ESLint. Preserve generated files when building.
- [x] Review diff independently of implementation pass for scope and regressions; document evidence.
- [x] Supply concise CMD commands, staged only to src/scripts/docs.

## Execution ledger

- Setup: user approved the design and requested immediate implementation; no second design approval needed. Existing checkout is main; direct local edits follow established user workflow. No commit/push by agent.
- Pre-flight: tasks share no new interfaces; both reuse existing read-only data and callbacks.
- Baseline: default highly concurrent invocation failed due memory pressure and a smoke script with no server. The documented bounded invocation with concurrency=2 and the smoke script excluded passed 181/181 before implementation.
- Task 1 complete: missing semantic ordering/scope/period presentation tests failed RED; real home component tests passed 18/18 GREEN. Task 2 complete: explicit attempt status failed RED; catalog checks passed GREEN.
- Final review: independent read-only reviewer Turing reviewed six implementation/test files. No critical issues; one Important wording issue fixed by scope tests RED (3 failures) then GREEN (18/18). Online time remains global; questions/accuracy remain practice-only. No data/query changes.
- Final: minor (deferred): fixtures do not distinguish today/month separately from week; all-time vs daily isolation is covered. Existing period algorithms remain unchanged. Documented in homepage-ui-verification.md.
- Ruling: retain direct user checkout and do not commit/push; user explicitly requested CMD handoff. Cost if wrong: user must run the provided commands, no remote state changed automatically.
- Ruling: clarify cards as learning results with practice-only question/accuracy and global online-time scope, rather than describing all metrics as practice-only. Cost if wrong: explanatory copy only; actual formulas untouched.
- Ruling: narrow tablet hero vertical padding 28px to 20px in both themes after the existing layout test caught a morning greeting/long-title combination at 423.6px. Cost if wrong: 16px less decorative vertical space at 768–1023px; desktop/phone content and routes unchanged.
- Verification: final production build exit 0; TypeScript exit 0; scoped ESLint exit 0 with the pre-existing mounted-effect warning. Source hooks, database code and exam page filters are not changed. Worker/cache byte hashes match pre-build backups.
- Responsive verification: 30/30 progress/catalog scenarios plus 50/50 homepage scenarios pass after the tablet fix. Both themes, 320/375px phones, 768px tablet, 1280px desktop and 844px landscape; enlarged text reflow included. Actual iOS/Safari and screen-reader operation are not claimed.
- Review declined-to-judge rulings: visual behavior independently checked as above, but no new contrast palette or accessibility primitive was introduced; grading/backend/date algorithms remain outside this presentation change and unchanged. Generated/content files are excluded and preserved. New QA scripts were self-reviewed against actual generated DOM and executed.
- Test execution note: parallel browser QA plus database tests caused out-of-memory exits in test-mock-exam-server, test-mock-exam-short-answer and test-security-hardening. Stop overlapping these jobs and rerun the full suite sequentially; do not change production logic or hide the failures.
- Task 3 complete: final sequential full suite (all src *.test.mjs and scripts/test-*.mjs except the server-dependent smoke script) with --max-old-space-size=512 --max-semi-space-size=8 --test-concurrency=1 passed 185/185, zero failures, 81.4s. Final build, layout checks and scoped lint all exit 0. No tests remain failing. No commits, push or live database writes performed.
