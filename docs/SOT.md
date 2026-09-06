# Current State

Last updated: 2026-09-06

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
  actions + shared bottom sheet). Transaction rows' swipe actions
  (`src/screens/tx-row.js`) got an Apple-style visual pass in WI-004: 40px
  circular Edit/Delete matching the category icon avatar, whole-row drag
  surface, full-swipe-to-delete with an Apple-style pop-in/grow animation.
  Settings' Manage rows (`src/screens/manage-row-swipe.js`) match this
  exactly as of WI-005 — same circles, same full-swipe, same
  translate-the-content mechanism. The two surfaces are now deliberately
  identical; any visual difference between them is a bug, not a choice.

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
- **Bottom sheets**: all six render `.filter-sheet` as a *non-scrolling*
  shell containing a non-scrolling `.filter-sheet-header` plus an inner
  `.sheet-body` that is the only scrollport. `syncSheetToViewport()`'s
  inline `max-height` deliberately stays on the outer shell, so the box
  being resized and the box the browser scrolls are never the same element
  — that separation is the fix for WI-007 and is load-bearing, not
  incidental. `.sheet-body` also carries matched negative margins and
  padding so its clip box reaches the shell's edges; without that, child
  focus outlines and chip rows get sliced.

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

- WI-011 / WI-010 — the remaining Settings redesign tickets. **WI-008
  (sub-page navigation with real history entries) and WI-009 (centered
  profile, grouped cards in a deliberate hierarchy, flat chrome icons,
  Privacy policy row, red Log out row) have shipped** — see
  `docs/CHANGELOG.md`. Still open, in this order: WI-011 (sub-page
  chrome — hide the bottom tab bar while a sub-page is open and move the
  section's Add button into a bottom-right FAB), then WI-010
  (expand-in-place Appearance / Accent color / Language rows). Spec:
  `docs/specs/settings-chatgpt-style-navigation.md`, whose decisions 9
  and 10 cover WI-011. Worth knowing up front: this spec **reverses** the
  "drill-down sub-pages explicitly not chosen" decision recorded in
  `docs/specs/settings-redesign-concept-b.md`, reversed deliberately by
  the maintainer with a reference screenshot.

- WI-013 / WI-014 — two accessibility defects found by the `docs/UX.md`
  design-system audit and deliberately left unfixed by that
  documentation-only pass. **WI-013:** the mobile tab bar's five buttons
  have no accessible name at all — they went icon-only in the tab bar
  polish pass, and nothing replaced the `<span data-l>` labels
  `renderChrome()` localizes. **WI-014:** fourteen controls have no visible
  keyboard focus indicator, including both navs, all six segmented
  controls, and every Settings row button. Spec:
  `docs/specs/accessible-names-and-focus-indicators.md`. Both are `Ready`,
  independent of each other, and rank above any token/spacing
  normalization — `docs/UX.md` now documents the rules they violate, which
  makes each violation a defect by this repo's own review classification
  rather than a matter of taste.

- WI-012 — make `npm run test:e2e` fail honestly when its browser cannot
  be launched. Raised because an implementing agent reported the e2e
  suite as failed three times during WI-008/WI-009 when it in fact
  passed 27/27 from the same tree. The cause is the agent sandbox, not
  this repository, so the ticket is scoped to making "no tests ran"
  unmistakable rather than to fixing the sandbox. **Until it lands, treat
  an agent's self-reported e2e result as unverified and re-run the suite
  independently.**

## Recently completed

- WI-005 — Apple-style swipe actions on Settings' Manage rows:
  **shipped.** Budgets/Bills/Goals/Categories/Accounts rows now use the
  same language as transaction rows — 40px circular actions, whole-row
  drag, full-swipe-to-delete. **The two surfaces no longer differ**, which
  retires the "intentionally look different, not a bug" note that used to
  sit in Implemented capabilities above. Both now share one mechanism:
  an absolutely positioned actions layer beneath an opaque content layer
  that translates over it, with leftward drag linear (only over-closing is
  damped). **Standing lesson worth carrying forward:** this ticket was
  written before WI-004 shipped and encoded an early draft of it, so the
  first implementation run built a design that never existed and had to be
  thrown away — when a ticket's job is to carry over another ticket's
  work, re-derive its concrete values from that ticket's *shipped code*
  before dispatching. A second lesson from its review: for motion work,
  assert the target end-state value, not merely that the property moved —
  a damping bug left the Delete pill reaching 154px of a 298px target
  while every test passed, because the commit path used the undamped
  offset and only the visual was starved. See `docs/CHANGELOG.md`'s WI-005
  entry.

- WI-007 — Add sheet content ghosting above the header when the keyboard
  opens: **fixed and device-confirmed.** Every sheet's header now sits
  outside an inner `.sheet-body` scrollport (see Current technical state
  above). **Standing lesson worth carrying forward:** the bug came from
  one element playing three roles at once — the `overflow` scrollport, the
  box `syncSheetToViewport()` resizes inline, and the box Chrome runs
  native scroll-into-view on — which produced a stale composited frame,
  not a clipping failure. Two dead ends are recorded in
  `docs/specs/add-sheet-keyboard-open-ghosting.md` and worth not repeating:
  desktop resize simulation never reproduces this, and `contain: paint`
  does nothing (its no-op is what proved the artifact was a stale texture
  rather than content escaping a clip).

- WI-006 — Icon + color on the Add form's Type segmented control.
  `rowTone()` (`categories.js`) now branches on all three transaction
  types explicitly instead of income-vs-everything-else, so `transfer`
  has its own teal tone everywhere `rowTone()` is used — the Type
  control, transfer transaction rows, and the Add sheet's commit
  preview. **Standing lesson worth carrying forward:** any `*-tint`
  token here mixes toward white in *both* themes, so its foreground must
  be a fixed dark hex (`--color-income-tint-fg`,
  `--color-chart-5-tint-fg`), never a token `theme.js` brightens for dark
  mode — doing the latter shipped a 1.66:1 label that looked fine in a
  screenshot. See `docs/specs/type-selector-icon-color.md`.
- WI-004 — Apple-style swipe actions on transaction rows: 40px circular
  Edit/Delete matching the category icon avatar, whole-row drag surface,
  full-swipe-to-delete with a pop-in/grow animation. Went through eleven
  live-checked revisions; see `docs/CHANGELOG.md`'s WI-004 entry and
  `docs/specs/swipe-to-reveal-transaction-actions.md`'s Revisions 4-11 for
  the full history.
- WI-003 — Transactions "Clear all filters" action: a Clear-filters button
  in the active-filter chips row (`#txActiveChips`), reusing the existing
  `clearTxFilters()`.
- WI-002 — Move Add-sheet commit preview to the top.

(Keep this list to the last few tickets; full history is
`docs/tickets/completed/` and `docs/CHANGELOG.md`.)
