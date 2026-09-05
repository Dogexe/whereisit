# Current State

Last updated: 2026-09-05

This file answers one question: **what is actually true about whereisit
right now?** It is not architecture (`CLAUDE.md`), not history
(`docs/CHANGELOG.md`), not intended behavior (`docs/specs/`), and not a
backlog (`docs/tickets/`) — it's a compact pointer into current reality, kept
short enough to read in full every session. When this file and the code
disagree, the code is right; fix this file, not your assumptions.

## Product state

รายรับ-รายจ่าย / "whereisit" is a personal income/expense tracker, deployed
as an installable PWA at https://dogexe.github.io/whereisit/. Vanilla
JS/HTML/CSS (no framework), Supabase (Postgres + Google OAuth) for
cross-device sync, GitHub Pages + GitHub Actions for deploy.

## Implemented capabilities

- **Transactions**: add/edit/delete income, expense, and transfer types;
  auto-guessed category from note text; CSV import (multi-step: file →
  column mapping → review → commit) alongside existing CSV/JSON/Google
  Sheets export.
- **Accounts**: multi-account support with opening balances and
  account-to-account transfers.
- **Categories**: full user CRUD (rename/icon/delete, including built-ins),
  synced across devices.
- **Budgets, recurring bills, savings goals**: per-category monthly budgets,
  bill due-date tracking with one-tap "mark paid" and Web Push reminders,
  savings goal progress tracking.
- **Insights**: budget progress, category breakdown (donut chart), 6-month
  income/expense trend, unified period picker.
- **Auth & sync**: Google sign-in via Supabase, incremental/paginated
  last-write-wins sync, offline-first via `localStorage`, account isolation
  on shared devices.
- **App lock**: local 4-digit PIN gate (convenience lock, not real security),
  immediate re-lock on backgrounding; see `docs/specs/app-lock.md`.
- **Category nesting**: one level of subcategories (a category may have one
  parent), Add-screen picker groups them, Insights breakdown rolls a
  subcategory's spend into its parent's slice; see
  `docs/specs/category-nesting.md`.
- **Filtering & search**: transactions list filters and search bar.
- **Amount privacy**: hide-amounts toggle.
- **Localization**: Thai / English.
- **Theming**: light/dark mode.
- **PWA/offline**: installable, self-hosted icons/fonts, offline app shell.
- **Screens**: Home, Transactions, Add/Edit (bottom sheet on mobile, full
  page on desktop), Insights, Settings (Manage sections use swipe-to-reveal
  actions + shared bottom sheet, same pattern as transaction rows).

See `README.md` for the user-facing version of this list, and
`CLAUDE.md`'s Architecture section for how each of these is actually built.

## Current technical state

- **Persistence**: `localStorage` is the source of truth for offline use;
  Supabase is a sync layer on top, not the primary store.
- **Sync**: last-write-wins per row via `updated_at`, soft deletes only,
  incremental keyset-paginated pulls, chunked pending-only pushes.
- **Schema**: no migrations checked in before the Bill reminders pass;
  `supabase/migrations/` exists from that pass onward. RLS confirmed
  correct on every table except `error_logs` (insert-only by design).
- **Module split**: complete — `src/main.js` is boot-only; every screen and
  concern lives in its own module (see `CLAUDE.md`'s Architecture section
  for the full module map).
- **Runtime assumption**: real HTTP origin required (not `file://`) for the
  service worker and manifest to work.

Full detail for all of the above lives in `CLAUDE.md` — this section only
flags what a future agent needs to know exists, not how it works.

## Known limitations / intentionally unresolved items

- No e2e coverage of real Google sign-in or any signed-in UI state (the
  Playwright suite runs fully offline/signed-out by design).
- Custom domain for GitHub Pages was deliberately skipped (needs the repo
  owner to own/control a domain).
- The marketing landing page (`docs/specs/landing-page.md`) was built, then
  **removed** at the user's request — the app root is the only surface now.

## Active work

None — `docs/tickets/active/` is currently empty.

## Recently completed

- WI-003 — Transactions "Clear all filters" action: a Clear-filters button
  in the active-filter chips row (`#txActiveChips`), reusing the existing
  `clearTxFilters()`.
- WI-002 — Move Add-sheet commit preview to the top.
- WI-001 — Transactions search bar restyle.

(Keep this list to the last few tickets; full history is
`docs/tickets/completed/` and `docs/CHANGELOG.md`.)
