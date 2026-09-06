# Testing

Read this for what each test layer actually covers. For which layers a
given change requires, see `docs/WORKFLOW.md`'s proportional verification
matrix (that file owns the requirement, this file only describes the
layers). For the build/serve commands themselves, see `CLAUDE.md`'s
"Running locally" section.

There's no linter or typecheck command, but there are two automated test
layers — **don't trust a stale doc's silence on this over grepping
`package.json`/the repo directly.**

1. **Unit tests** (Node's built-in runner, no added dependency): `npm test`
   runs everything under `tests/`, and CI runs it before `npm run build` on
   every push to `main` (see `.github/workflows/deploy.yml`) so a failing
   test blocks deploy. Covers pure logic extracted into its own module
   (`src/merge.js`, `src/pending.js`, `src/watermark.js`, `src/import.js`,
   `derived.js`, `utils.js`) — not screens/DOM/Supabase network calls,
   which the e2e layer covers instead.
2. **E2E tests** (Playwright, `@playwright/test` devDependency, `e2e/`):
   `npm run test:e2e` builds `dist/` then runs the suite against it via
   `scripts/serve.mjs` (a tiny Node static server, so CI doesn't need a
   second language runtime just to serve files) — see `playwright.config.js`.
   Its browser preflight exits before the suite if Chromium cannot launch; see
   [AGENTS.md's E2E sandbox limitation](../AGENTS.md#e2e-sandbox-limitation)
   and report that result as **not run**, not failed.
   Separate CI workflow, `.github/workflows/e2e.yml`, runs on every PR (not
   just push to `main`) so a screen regression is caught before merge.
   First run needs browsers installed once: `npx playwright install
   --with-deps chromium`. The whole suite runs fully offline and
   signed-out — `e2e/fixtures.js` disables the service worker and serves a
   local, SRI-matching copy of the pinned supabase-js CDN file rather than
   hitting the real CDN or a real Supabase project — so **no spec exercises
   real Google sign-in or any signed-in UI state**; that gap is only
   closable by a live manual browser check or a throwaway Supabase test
   account (see `docs/CHANGELOG.md`'s "Categories upsert onConflict
   investigation" entry for the technique). Current coverage: `home.spec.js`,
   `nav.spec.js` (mobile tab bar + desktop sidebar), `dark-mode.spec.js`,
   `filters.spec.js`, `transactions-crud.spec.js`, `pin-lock.spec.js`,
   `transfers.spec.js`, `csv-import.spec.js`, `accounts.spec.js`,
   `category-nesting.spec.js`.

Run both (`npm test` and `npm run test:e2e`) after any change that touches
a screen — the two layers cover disjoint ground.
