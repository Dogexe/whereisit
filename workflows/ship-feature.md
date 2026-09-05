# Ship a feature

The repeatable process for taking a change from idea to deployed in this repo. Skip steps that don't apply — a one-line bug fix doesn't need `/spec`, a non-visual change doesn't need a manual browser check.

1. **Scope it.** If this isn't already described in `docs/specs/`, run `/spec` first rather than building ad hoc. Write or update the spec doc with what's decided before touching code.
2. **Plan verification** for anything multi-step: run `/verify` and decide up front what "done" looks like — which tests must pass, what to check in a real browser.
3. **Build**, following the module boundaries and standing conventions in `../CLAUDE.md`'s Architecture section (state ownership via setters, the registration pattern for cross-module callbacks, `STRINGS` for user-facing text, the three-way income/expense/transfer handling rule, etc.).
4. **Test.**
   - `npm test` — unit tests (`tests/`).
   - `npm run test:e2e` — Playwright (`e2e/`), required for any change touching a screen.
   - `npm run check:sprite` if `icons/sprite.svg` was touched (also runs automatically inside `npm run build`).
   - Anything server-side (a Supabase Edge Function, an RLS/schema change) needs verification against a real deployed request — a local pass proves the code parses, not that it works once deployed.
5. **Manual check** in a real browser for anything a keypress, animation, or signed-in state depends on — automated coverage has a documented gap around signed-in UI (see `../CLAUDE.md`'s e2e section).
6. **Update docs in the same pass**: if the change affects how a reader finds this repo from the outer workspace (see `sync-agent-entry-docs.md`), update that too. Append an entry to `docs/CHANGELOG.md`, and update the relevant `docs/specs/*.md` with what actually shipped versus what was planned.
7. **Commit** — ask before pushing to `main`; that's the deploy trigger (`../CLAUDE.md`'s Deployment section). Run `release-check.md` before and after the push.
