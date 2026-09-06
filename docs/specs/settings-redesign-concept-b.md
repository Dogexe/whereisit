# Spec: Settings screen redesign (Concept B — refined single page)

> **Partially superseded by
> `docs/specs/settings-chatgpt-style-navigation.md`.** That spec
> reverses this one's "Concept A (grouped navigation / drill-down
> sub-pages) was previewed earlier and explicitly not chosen" decision
> — the maintainer chose drill-down sub-pages deliberately, from a
> reference screenshot — and retires the `<details>` collapsible Manage
> groups and `state.settingsGroupOpen` described below. Everything else
> here (the `.toggle-row` / `.list-card` row primitives, the
> `syncHelp` removal, the two-separate-export-rows decision) still
> holds. Read this file for history, that one for intent.

Status: **built and verified live in the browser** (`src/screens/settings.js`,
`src/styles.css`, `src/i18n.js`, `src/state.js`). Concept A (grouped
navigation / drill-down sub-pages) was previewed earlier and explicitly
not chosen.

**Follow-up fix**: the Cross-device Sync row originally showed two
overlapping sentences when signed out — the short status line
(`syncSignedOut`, "Sign in with Google to sync across devices") *and* a
separate, longer help sentence (`syncHelp`, "Sign in with Google above
to sync your data across devices automatically — no code needed.")
directly under it, wrapping to 3 lines and making the row feel
cluttered compared to every other row in the redesign. Removed
`syncHelp` entirely (it wasn't used anywhere else) and collapsed the
row back to a single status line, matching the tight one-line rhythm
of the rest of the card.

**The three open decisions were resolved with sensible defaults, as
directed, rather than re-asked:**
1. **Collapsed-group persistence**: implemented. `state.settingsGroupOpen
   = { budgets, bills, goals }` (added in `state.js`) tracks each group's
   open/closed state; a `toggle` event listener on each `<details
   class="settings-group">` mirrors its native open state into that
   object, so a re-render triggered by saving/deleting a budget/bill/goal
   keeps the group open instead of snapping shut. Verified live: opened
   Budgets, clicked Edit on a row (which re-renders the whole screen),
   and the group stayed expanded.
2. **CSV/JSON export presentation**: kept as two separate rows (not
   merged into one entry with a sub-choice) — simplest option, no new
   interaction pattern, both still call their original unchanged export
   functions.
3. **Desktop layout**: went single-column at all breakpoints
   (`.settings-block { max-width: 480px }`, no `margin: auto`), matching
   the existing `.add-form`'s established convention of staying
   left-aligned and narrow within the wider desktop `.screen` rather than
   centering. The old `.settings-columns` 2-column desktop grid rule was
   removed as dead code.

New i18n string added: `manageSection` ("จัดการ" / "Manage"). New shared
row primitive: `.toggle-row` (existing class) extended with a divider
(`border-bottom` + `:last-child` reset, matching `.manage-row`'s pattern)
and a `button.toggle-row` variant (`all: unset` then reapply the row
layout) so the CSV/JSON export rows are real `<button>`s for
keyboard/screen-reader access while looking like the other rows.

## Goal

Reorganize the existing Settings screen into clearer icon-led sections,
with Budgets/Bills/Goals collapsed by default so the page doesn't open as
one long wall of management rows. This is a visual/structural
reorganization only — no functional or data changes.

## Current structure (for reference)

`renderSettings()` in `src/screens/settings.js` renders a two-column
layout on desktop (`.settings-columns`, stacked on mobile) containing:

- Profile row + sign-in/sign-out button
- Language section (radio tabs)
- Display section (dark-mode toggle row)
- Sync section (status box + "sync now" button)
- Install-app button (conditional on `deferredInstallPrompt`)
- Data section (CSV export button, JSON export button)
- Three always-expanded sections: Budgets, Bills, Goals — each with its
  own add button, inline add/edit form, and list of rows
- Footer note + privacy policy link

## New structure (Concept B)

- **Profile row**: unchanged — avatar/name/sign-in-out button.
- **"Appearance" card**: language switch + dark-mode toggle, regrouped
  as icon-led rows in one card (reuses the existing radio/switch
  behavior — this is a wrapping/visual change only, not new logic).
- **"Sync & Data" card**: sync status row, install-app prompt (folded in
  here instead of its own separate block), and the export button(s) —
  see Open Decision 2 below for exactly how CSV/JSON export is presented.
- **"Manage" card**: Budgets / Bills / Goals each become a collapsible
  group (native `<details>`/`<summary>`), showing a count badge (e.g.
  "3") when collapsed. Expanding reveals the existing add-button +
  inline forms + list rows completely unchanged — only the
  wrapping/collapse behavior is new.
- **Footer note + privacy link**: unchanged, stays at the bottom.

## Files to change

- **`src/screens/settings.js`** — restructure the `renderSettings()`
  template string into the grouped-card layout above. Wrap the Budgets,
  Bills, and Goals sections in `<details>` elements with a summary row
  (icon + label + count badge + chevron). `budgetFormHtml()` /
  `billFormHtml()` / `goalFormHtml()` and the list rendering functions
  (`budgetRowHtml`, `billRowHtml`, `goalCardHtml`) stay exactly as they
  are today, just rendered inside the group body. **No changes** to
  `wireInlineCrud`, `saveBudgetForm`, `saveBillForm`, `saveGoalForm`,
  `deleteBudget`/`deleteBill`/`deleteGoal`, or `saveContribution`.
- **`src/styles.css`** — add grouped-card / collapsible-summary styles
  (icon-led list row, `details.a-group`-style collapsible, count badge),
  translated from the verified preview's CSS into this file's existing
  conventions (`--color-*` tokens, `.list-card`, `.settings-section-label`
  already in use). Retire or update the desktop 2-column grid rule at
  `@media (min-width: 880px) { .settings-columns { ... } }` per Open
  Decision 3 below.

## Out of scope

- No schema/data changes.
- No changes to `wireInlineCrud` or any save/delete function.
- No changes to sync/auth logic (`sync.js` untouched).
- No changes to the CSV/JSON export functions' actual file-generation
  logic — only how their entry point is presented.

## Open decisions to confirm before implementation

1. **Collapsed-group state persistence.** Today the whole screen fully
   re-renders on any state change via `renderSettings()`. Should which
   group (Budgets/Bills/Goals) is expanded persist across re-renders
   during a single Settings visit (e.g. add a budget while the Budgets
   group is open — does it stay open after the re-render?), or is it
   fine for state to always reset to fully collapsed on every render?
   Persisting requires tracking open/closed per group in `state`, the
   same pattern already used for `state.budgetEditId` etc.
2. **CSV vs JSON export presentation.** The preview showed a single
   "Export data (CSV / JSON)" row as a placeholder, but the real app has
   two distinct buttons today with two distinct behaviors. Options:
   (a) keep both buttons visible under "Sync & Data" un-collapsed
   (simplest, zero new interaction pattern), or (b) collapse them into
   one entry point that then offers a choice (a small new UI pattern —
   e.g. an inline two-option row or a tiny action sheet). No preview was
   built for option (b), so it needs its own quick mockup if chosen.
3. **Desktop 2-column layout.** Does the existing `@media (min-width:
   880px)` 2-column grid for `.settings-columns` still make sense once
   the page is reorganized into stacked cards, or does Concept B read
   better as single-column at every breakpoint (just centered/max-width
   on desktop like the Home screen's `.home-columns` does for narrower
   content)?

## Verification plan

After implementing, `npm run build`, serve `dist/`, then in a real
browser:

1. Confirm every existing Settings action still works completely
   unchanged: sign in/out, language switch, dark mode toggle, sync now,
   export CSV, export JSON, add/edit/delete budget, add/edit/delete
   bill, add/edit/delete goal, contribute to a goal. Concept B must not
   regress any of these — it only changes layout, not behavior.
2. Confirm each of Budgets/Bills/Goals starts collapsed and expands/
   collapses correctly, and that the count badge matches the actual
   number of items.
3. Confirm dark mode renders correctly across all the new grouped cards.
4. Confirm the desktop layout (≥880px) still looks intentional, not
   just an unstyled stack of the mobile layout — resolve Open Decision 3
   before or during this check.
