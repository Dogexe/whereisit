# Current State

Last updated: 2026-09-09

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

- **Five tickets are specified; three of them are built.** `WI-024`,
  `WI-025`, and `WI-026` have shipped; the other two in
  `docs/tickets/active/` have not been started. Two workstreams from
  `docs/ROADMAP.md`:
  - **WS-2, reversible actions:** `WI-024` (`Implemented`) added a
    persistent `role="status"` `.sr-only` live region (`#toastLive` in
    `index.html`, populated by `src/toast.js`) so toasts announce to screen
    readers; `WI-025` (`Completed`) gives Home's "Mark paid" an undo toast
    that reverses both the created expense *and* the bill's `lastPaidCycle`.
    Spec: `docs/specs/reversible-mark-paid-and-announced-toasts.md`. **One open
    maintainer decision** is recorded there and in the roadmap: `lastPaidCycle`
    still has no clearing path once the toast expires, and closing that needs
    either a `billId` on transactions (schema + mappers) or an "un-mark paid"
    control in Settings → Bills.
  - **WS-3, Back dismisses overlays:** `WI-026` (`Completed`) built
    `src/overlay-history.js` — a module-level stack with exactly one
    `popstate` listener, exposing `pushOverlayHistory(key, onPop)` and
    `releaseOverlayHistory(key)` — and adopted it for the Add sheet only;
    `WI-027` and `WI-028` (both `Draft`) adopt the four other sheets, then
    migrate Settings' sub-page and the Manage sheet. Spec:
    `docs/specs/back-button-dismisses-overlays.md`. The two Draft tickets were
    Draft on ordering only — the module they call now exists, so both can move
    to `Ready` against its real API. `WI-028` is the one carrying real risk: it
    deletes `settings.js`'s `popstate` listener and inverts
    `closeSettingsSubPage`'s contract, so `docs/ARCHITECTURE.md:71-73` changes
    with it.
- **WI-023** (`Completed`) — shipped an empty first run: `state.js`'s
  `budgets` and `bills` now initialise to `[]` like `goals`, so a
  never-touched install shows nothing it invented, and the two surfaces that
  go empty as a result (Home's budget card, Insights' Budgets tab) render a
  plain `.empty-note` reading `l.noBudgets`. Existing installs are
  unaffected — `restore.js`'s saved-array-wins rule is untouched, and only
  an absent settings key falls through to the module default. Insights'
  note renders as a sibling of `.insight-cards`, not a child: that container
  is a multi-column grid from 880px up, so a child would sit in the first
  column only. Spec: `docs/specs/first-run-empty-defaults.md`. This was
  workstream WS-1 of `docs/ROADMAP.md`.
- **`docs/ROADMAP.md`** and **`docs/AUDIT-2026-09.md`** are new: the
  September 2026 product audit (19 findings with evidence) and the sequenced
  remediation plan built from it, including five open product decisions that
  block further work. Read the roadmap before picking up anything not already
  ticketed. The audit is point-in-time against build `413bf37` — re-verify a
  finding against current code before acting on it.

## Recently completed

- **Hero gradient system** (post-WI-018, requested directly by the
  maintainer with a fresh reference screenshot, not its own ticket):
  `theme.js`'s `ACCENT` map's `heroStart`/`heroEnd` — which feed both the
  Home hero balance card *and*, as of this pass, the mobile tab bar's
  raised Add button (`styles.css`'s `.tabbar button[data-tab="add"]
  .icon`, previously flat `--color-accent`/`-700` despite an existing
  comment claiming it already matched the hero card) — were reworked.
  Indigo's pair was pixel-sampled from the reference (`#6149ea` ->
  `#409ce9`, replacing the old `#7b68ee`/`#4f7df3`); coral got a new
  dedicated pair (`#D97757` -> `#D6A44C`, replacing the old
  base/`c700`-reuse) chosen by rendering candidate hues in a real browser
  since there was no second reference image for coral. Implemented
  directly by Claude (explicit maintainer instruction to bypass Codex this
  pass, same as WI-016/017/019/018). Full derivation, HSL math, and
  contrast readings are in `theme.js`'s `ACCENT` comment. Verified: 173/173
  unit, 31/31 e2e, real-browser computed-style checks (not just visual)
  confirming `.hero-card` and the Add button render byte-identical
  gradients in both accents and both themes.
- WI-018 — base surface retune (light+dark `bg`/`card`/`surface`/
  `divider`/`border`). Implemented directly by Claude (explicit maintainer
  instruction to bypass Codex this pass, quota/workflow reasons as with
  WI-016/017/019 below) rather than delegated per the ticket's original
  `sol-high` Codex profile. No reference image was available for this
  pass (only ever shared transiently in the WI-017 chat, never persisted
  in the repo) — see the ticket's Review notes for the resulting
  measured-not-sampled approach and every re-verified contrast ratio.
  Pushed to `main` and deployed. Spec: `docs/specs/
  color-palette-refresh.md`. The last piece of the color scheme refresh
  (WI-016/017/019, see below). Independent review flagged the
  hero-gradient-system pass above as bundled into the same commit despite
  being out of WI-018's own scope, and a stale `--hero-gradient-end`
  pre-JS fallback for Coral (see `docs/UX.md`'s Known UI debt) — both
  accepted as-is per maintainer decision, not fixed.
- WI-016, WI-017, WI-019 — color scheme refresh (from a maintainer
  reference image), all implemented directly by Claude (not Codex —
  quota exhausted this pass) and pushed to `main` and deployed.
  **WI-016:** expense amounts render in `--color-expense-700` red instead
  of neutral text (`tx-row.js`, `add.js`); income stays green, transfers
  stay neutral; `docs/UX.md`'s amount-coloring rule updated to match. One
  real defect found and fixed during independent review: a new e2e test
  left Settings on the wrong sub-page before asserting on a different
  one. **WI-019** (a follow-up spec addendum, not originally its own
  ticket): retuned `--color-expense-700`/`--color-income-700`'s actual hex
  to a more vivid red/green after the maintainer found WI-016's shipped
  colors too muted; found and left a pre-existing (unrelated) dark-mode
  `.badge-expense` contrast bug for a future ticket. **WI-017** (accent
  palette) took three review rounds: round 1 (flat Tailwind blue + amber)
  was rejected on sight; round 2 pixel-sampled the maintainer's own
  reference images via canvas and found "indigo" was literally the app's
  original `#6247ea` all along — only the Settings label changed, Purple
  → Indigo; round 3's Coral was rejected as "too dark" and landed on an
  un-darkened Claude-brand terracotta (`#D97757`) with its white-text
  contrast shortfall *deliberately* deferred to a later shadow-based fix
  per the maintainer's explicit instruction — tracked in `docs/UX.md`'s
  Known UI debt, not silently accepted. Full round-by-round history is in
  `docs/tickets/completed/WI-017.md`'s Review notes (moved from `active/`
  to `completed/` — WI-016/017/018/019 are all merged, pushed to `main`,
  and deployed).
  Hero gradient values were deliberately left untouched throughout — the
  maintainer asked for that to wait for WI-018.

- WI-013 + WI-014 — the two accessibility defects found by the
  `docs/UX.md` design-system audit and deliberately left unfixed by that
  documentation-only pass, both implemented by Codex (`terra-medium`) and
  shipped in commits `1c6e64a` (WI-013) and `f2bec1d` (WI-014).
  **WI-013:** the mobile tab bar's five buttons now carry their existing
  `tabHome`/`tabTx`/`tabAdd`/`tabInsights`/`tabSettings` `STRINGS` keys via
  a new `data-l-aria` attribute, applied as `aria-label` by
  `renderChrome()`'s existing localization re-run — no visible text, no new
  listener. **WI-014:** the canonical accent `:focus-visible` outline was
  added to the fourteen controls that lacked one (`.nav-btn`, `.tab-opt`,
  `.switch`, `button.toggle-row`, `.home-profile-btn`, `.toast-undo-btn`,
  `.shortcut-btn`, `.period-pill button`, `.picker-year-row .step`,
  `.picker-year-heading`, `.picker-month-cell`, `.filter-field-label
  button`, `.kind-toggle button`), matched exactly to the eleven existing
  rules. Spec: `docs/specs/accessible-names-and-focus-indicators.md`
  (now marked built and shipped). **One process gap found and fixed
  during independent review:** Codex's WI-014 implementation verified
  Decisions 2.3 (`button.toggle-row`'s ring survives its `all: unset`) and
  2.4 (`.filter-checkbox-row`'s native ring is already adequate) in a real
  browser but never recorded either finding, despite the spec explicitly
  requiring it — sent back to the same Codex thread to record both in the
  spec and the ticket's Review notes. Confirmed live on the deployed site
  (`https://dogexe.github.io/whereisit/`): `data-l-aria` attributes present
  in the deployed `index.html`, `button.toggle-row:focus-visible` present
  in the deployed `styles.css`.

- WI-011 + WI-015 — the last two Settings redesign tickets, both
  implemented by Claude directly (not Codex — quota was exhausted) and
  shipped together in one commit. **WI-011:** below 1024px, opening a
  Settings sub-page hides the bottom tab bar (`body.settings-subpage-open`,
  driven off the existing `state.settingsSubPage`) and moves each
  section's Add button into a bottom-right FAB — spec:
  `docs/specs/settings-chatgpt-style-navigation.md` decisions 9/10; this
  was the last ticket from that spec, so **the whole Settings redesign
  (WI-008 through WI-011) is now shipped.** **WI-015:** Budgets/Bills/
  Categories/Accounts sub-page rows now render inside the same rounded
  `.list-card` (`.manage-rows-card`) the root list and Security already
  use; Goals keeps its individually-carded look when populated (reverted
  after live review) but joins the card when empty — spec:
  `docs/specs/settings-manage-rows-card-styling.md`. **Two real defects
  found and fixed along the way, worth carrying forward:** (1) a
  phantom-`pointerenter` bug where a DOM-mutating click could leave a
  Manage or Transaction row permanently stuck open with no user gesture
  — traced to a speculative "desktop mouse hover" fallback in both
  `tx-row.js` and `manage-row-swipe.js` that was never actually reachable
  on a real desktop (both surfaces already show actions statically at
  1024px+), removed from both to keep them contractually identical per
  `docs/UX.md`; (2) Manage row icon avatars were rendering at 30px against
  the app's normal 40px everywhere else — a stale, undocumented-until-now
  choice from `docs/specs/settings-manage-row-icons.md`, now unified.
  Confirmed live on the deployed site (`https://dogexe.github.io/whereisit/`)
  on both a real mobile browser and via the served bundle, not just a
  local `dist/` build.

- WI-012 — make `npm run test:e2e` fail honestly when its browser cannot
  be launched: **shipped.** `scripts/check-playwright-browser.mjs` now
  launches Chromium through Playwright's own resolution before the suite
  starts, exiting non-zero with "no tests were run," the expected
  browser path, and the install command instead of letting a missing
  browser masquerade as failing tests. `AGENTS.md`/`docs/TESTING.md`
  record the underlying sandbox limitation so a future agent reports it
  as **not run**, not failed — this was raised because an implementing
  agent reported the e2e suite as failed three times during WI-008/WI-009
  when it in fact passed 27/27 from the same tree. **Standing lesson
  worth carrying forward:** the review caught the script importing
  `chromium` from `"playwright"`, an undeclared package that only
  resolved because npm hoists it as `@playwright/test`'s own transitive
  dependency — a phantom-dependency risk. Fixed to import from
  `@playwright/test` instead, the package this repo actually declares.

- WI-010 — expand-in-place Appearance / Accent color / Language rows:
  **shipped.** The Display group's three rows now show a collapsed value
  line and a rotating chevron (reusing `chevron-right`, rotated via CSS,
  rather than adding a new sprite symbol), expanding in place to reveal
  the existing `.tabs`/`.tab-opt` controls — matching
  `docs/specs/settings-chatgpt-style-navigation.md`'s mockup order
  (Appearance, Accent color, Language, Hide amounts). Appearance is
  Light/Dark radio options over the existing `state.dark` boolean, no new
  persisted field. **Standing lesson worth carrying forward:** review
  caught two token/pattern violations a build+test pass alone would not
  — an inverted `:has()` selector that silently dropped the divider
  between Language and Hide amounts (the wrong row lost it), and an
  accent-dot color hardcoded as hex duplicating `theme.js`'s
  `--color-accent` token instead of just reading the token. Both were
  confirmed by checking real computed styles in a live browser, not by
  reading the CSS. See `docs/CHANGELOG.md`'s WI-010 entry.

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
