# Ship a feature

The repeatable process for taking a change from idea to deployed in this repo. Skip steps that don't apply — a one-line bug fix doesn't need `/spec`, a non-visual change doesn't need a manual browser check.

1. **Scope it.** If this isn't already described in `docs/specs/`, run `/spec` first rather than building ad hoc. Write or update the spec doc with what's decided before touching code.
2. **Plan verification** for anything multi-step: run `/verify` and decide up front what "done" looks like — which tests must pass, what to check in a real browser.
3. **Build**, following the module boundaries and standing conventions in `../CLAUDE.md`'s Architecture section (state ownership via setters, the registration pattern for cross-module callbacks, `STRINGS` for user-facing text, the three-way income/expense/transfer handling rule, etc.). For anything that renders a screen, also follow `../docs/UX.md` — reuse the existing pattern rather than inventing a new visual or interaction primitive, and don't copy anything it lists as known UI debt.
4. **Test, proportional to risk** — see `../docs/WORKFLOW.md`'s risk-based verification table. Low risk: none, or one narrow relevant check. Medium risk: focused `npm test`; add `npm run build` only if build/runtime behavior is involved; add `npm run test:e2e` only if the behavior can't be reasonably covered more cheaply. High risk: the full matrix may still be required.
   - `npm run check:sprite` if `icons/sprite.svg` was touched (also runs automatically inside `npm run build`).
   - Anything server-side (a Supabase Edge Function, an RLS/schema change) needs verification against a real deployed request — a local pass proves the code parses, not that it works once deployed. This is High-risk by definition.
5. **Manual check** only when acceptance genuinely depends on real browser interaction, layout, focus, keyboard behavior, viewport behavior, or signed-in state — not routine coverage for every change. Automated coverage has a documented gap around signed-in UI (see `../CLAUDE.md`'s e2e section). Don't duplicate the same behavior across e2e and a manual check without a specific reason.
6. **Update docs in the same pass**: append an entry to `docs/CHANGELOG.md`, and update the relevant `docs/specs/*.md` with what actually shipped versus what was planned.
7. **Commit** — ask before pushing to `main`; that's the deploy trigger (`../CLAUDE.md`'s Deployment section). Run `release-check.md` before and after the push.
