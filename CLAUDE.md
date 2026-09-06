# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working
with code in this repository. It is an always-loaded entrypoint, kept short
on purpose — detail lives in the targeted docs it points to. Don't add
pass-by-pass writeups or module-level detail here; new detailed knowledge
belongs in one of the docs below, with at most a one-line pointer added
here if that changes what a session needs to know up front.

For the full narrative history of past feature passes, redesigns, and
bug-fix rounds (what was tried, what got reverted, why a design shape was
picked over another), see `docs/CHANGELOG.md`.

This file is self-contained for a standalone clone of this repository — no
path here assumes anything outside `whereisit/`.

## About this repository

This is รายรับ-รายจ่าย / "whereisit", a personal income/expense tracker,
pushed to `github.com/Dogexe/whereisit` and deployed via GitHub Pages at
https://dogexe.github.io/whereisit/.

Feature specs (written before building, updated with what actually shipped)
live in `docs/specs/`. Full project history lives in `docs/CHANGELOG.md`.

## Read in this order for planning/investigation

1. This file.
2. `docs/SOT.md` — a compact summary of what's actually true about the
   product and its technical state right now, so you don't have to
   reconstruct it from `docs/CHANGELOG.md`'s full history.
3. `docs/WORKFLOW.md` — only when workflow/process guidance is actually
   needed (the full lifecycle, handoff prompts, the minimum `/spec`
   prompt); not required reading for every session.
4. Only then, load what the task actually touches: `docs/ARCHITECTURE.md`
   for module structure/screens/UI plumbing, `docs/UX.md` for the reusable
   UX/visual/interaction rules any change that renders a screen must
   follow, `docs/SYNC.md` for persistence/sync/auth/Supabase schema,
   `docs/TESTING.md` for what each test layer covers, relevant specs under
   `docs/specs/`, and relevant code. Don't read every spec, every ticket,
   or the full changelog by default.

## Claude Code's role

Claude Code's primary responsibilities in this repository are requirements
clarification, investigation, specification, ticket decomposition, and
independent code review — not implementation. For non-trivial features and
significant bugs, follow `docs/WORKFLOW.md`, which is the source of truth
for the lifecycle, the minimum `/spec` prompt, and the proportional
verification matrix — don't restate them here. Codex is the default
implementation agent for one `Ready` ticket at a time.

Two rules worth calling out because they're easy to slip on:

- After writing the spec and creating `Ready` tickets, Claude stops — it
  does not start a Codex implementation task unless the maintainer
  explicitly asks for that delegation.
- Independent review starts read-only: findings are reported as confirmed
  defects, kept separate from optional suggestions, before Claude edits
  anything. Codex verifies each finding against the code before fixing it
  — a Claude finding is not automatically correct.

`workflows/` holds repeatable dev-process SOPs (`ship-feature.md`,
`release-check.md`) — read the relevant one before a multi-step change.
`tools/` holds small standalone scripts for a specific recurring check;
currently just `check-sprite-svg.mjs` (also run automatically inside `npm
run build`). These aren't a general framework — add a new workflow/tool
only for a process or check that's actually recurred, not speculatively.

## Running locally

Source lives in `src/`; `index.html` is a thin HTML shell — no inline
`<style>` or `<script>`, just `<link rel="stylesheet" href="./styles.css">`
and `<script type="module" src="./main.js"></script>`. There's a real build
step (esbuild).

```
npm install       # first time only
npm run build     # bundles src/main.js -> dist/main.js, copies index.html/styles.css/manifest.json/sw.js/icons/ into dist/
```
Then serve `dist/` over HTTP from the repository root (not `file://` — the
service worker and manifest need a real origin):
```
python -m http.server 8792 --directory dist --bind 127.0.0.1
```
You must run `npm run build` first, since `dist/` is gitignored and
generated, not checked in.

There are two automated test layers, `npm test` (unit) and `npm run
test:e2e` (Playwright) — see `docs/TESTING.md` for what each covers and
`docs/WORKFLOW.md` for which one a given change requires.

## Deployment

`git push` to `main` is the deploy trigger. A GitHub Actions workflow
(`.github/workflows/deploy.yml`) builds `dist/` (`npm ci && npm run build`
with `NODE_ENV=production`) and publishes it via `actions/deploy-pages`.
GitHub Pages is configured with `build_type: workflow` — a real repository
setting (`gh api repos/Dogexe/whereisit/pages`), not something inferable
from files in this repo.

**"Live-verified" in this repo's past-pass writeups (`docs/CHANGELOG.md`)
means verified against a local `dist/` build, not that the change was
committed or deployed**, unless stated otherwise. If a user reports a
documented fix isn't visible on the real site, check `git status`/`git
log` for an uncommitted backlog before assuming the fix itself is wrong.

## Architecture (`src/`)

The app is a hand-rolled SPA with no framework, fully split into modules
(`categories.js`, `i18n.js`, `utils.js`, `state.js`, `storage.js`,
`theme.js`, `derived.js`, `sync.js`, `merge.js`, `pending.js`,
`watermark.js`, `paginate.js`, `account.js`, `accounts.js`, `import.js`,
`toast.js`, `pwa-install.js`, `error-report.js`, `push.js`,
`sheets-export.js`, and `screens/`), with `main.js` boot-only.

- **Module map, state ownership, screens, bottom sheets, i18n,
  categorization, accounts, CSV import, derived data, error reporting,
  bill reminders, PWA shell, Google Sheets export, and the standing
  CSS/layout gotchas** (flex `min-width`, `<details>` rendering, bare `fr`
  grid tracks, hidden-`required` form validation, etc.) all live in
  `docs/ARCHITECTURE.md`.
- **Persistence, sync (`sync.js`/`merge.js`/`pending.js`/`watermark.js`/
  `paginate.js`/`account.js`), auth, `hasLiveInputRisk()`, and the
  Supabase schema (tables, RLS, indexes, FKs)** all live in `docs/SYNC.md`.
