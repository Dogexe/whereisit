# Spec: Transactions "Clear all filters" action

Status: Implemented in `src/screens/transactions.js`
(`renderActiveFilterChips()`), not yet re-verified against this revision.
First independent review (see `docs/tickets/active/WI-003.md`) found that
this spec's original decision 4 described a user interaction the app cannot
actually produce; decision 4 and the verification plan below were revised
accordingly — see "Filter sheet reachability" under Key decisions. Pending:
`e2e/filters.spec.js` still needs its synthetic-click coverage for the
dropped scenario removed, then a narrow re-review.

## Context

`src/screens/transactions.js` already has a `clearTxFilters()` function that
resets every filter facet (type, period, category, account, amount range) plus
the search text, then does a full re-render. Today it has exactly one call
site: a "Clear filters" button (`l.clearFiltersBtn`) that only appears inside
the empty-results state in `renderTxListOnly()`, i.e. only when the active
filters happen to produce zero matching transactions. There is no way to
clear every filter at once while results are still showing — the only other
way to reduce filters is removing one active-filter chip at a time via the
"×" buttons in `renderActiveFilterChips()` (`#txActiveChips`).

## Key decisions (confirmed with the user before building)

1. **Placement**: the new action renders inside `#txActiveChips`, alongside
   the existing per-filter chips (not inside the filter sheet, and not a
   second copy in both places). It reuses the same container `renderActiveFilterChips()`
   already fills, so it appears/disappears using the same condition as the
   chips themselves.
2. **Visibility**: shown only when at least one filter is active, i.e. when
   `chips.length > 0` inside `renderActiveFilterChips()` (equivalent to
   `activeFacetCount() > 0`, since chips and the badge count are already kept
   in sync in the existing code). No disabled state — it simply isn't
   rendered when there's nothing to clear.
3. **Scope of "clear"**: reuse `clearTxFilters()` unchanged. Clearing also
   resets the search text, matching the existing empty-state "Clear filters"
   button's behavior exactly — one shared reset function, no second
   search-preserving variant.
4. **Filter sheet reachability** (revised after first review — see
   `docs/tickets/active/WI-003.md`'s Review notes): the chips-row Clear
   button is reachable only while the filter sheet is *closed*, by design,
   and that's fine — there is no requirement to support or test "clear
   clicked while the sheet is open."
   `#txFilterSheetBackdrop` is `position: fixed; inset: 0; z-index: 50`
   (`styles.css`) and renders after `#txActiveChips` in the DOM, so whenever
   the sheet is open it fully covers the chips row, both visually and for
   pointer hit-testing — confirmed empirically: a real (non-synthetic)
   Playwright `.click()` on the chips-row button while the sheet is open
   fails with "`#txFilterSheetBackdrop` intercepts pointer events," and
   `document.elementFromPoint()` at the button's on-screen position resolves
   to the backdrop, not the button. The sheet's focus trap (`createFocusTrap`
   in `utils.js`) likewise excludes anything outside the sheet from Tab
   order. No mouse, touch, or keyboard user can activate the chips-row Clear
   button while the sheet is open — the original decision 4 in this spec
   assumed a reachable interaction that isn't. This is not a bug to fix:
   product decision is that the chips-row Clear button is simply not meant
   to be used while the sheet is open (a user closes the sheet first, then
   sees and uses the chips-row button, or ignores it if the sheet stays
   open). `clearTxFilters()`'s own reset logic is unaffected either way —
   this decision only concerns whether "click it while the sheet is open" is
   a scenario worth building a requirement or test around, and it isn't.
5. **Copy**: reuse the existing `clearFiltersBtn` i18n string ("Clear
   filters" / "ล้างตัวกรอง") rather than adding a new one — this action and
   the empty-state one are the same action in two places, so they should read
   identically.

## New behavior

- `renderActiveFilterChips()` appends one more button after the chips (only
  when `chips.length > 0`), labeled with `l.clearFiltersBtn`, wired to
  `clearTxFilters()`.
- No changes to `clearTxFilters()`, `state.js`, `filteredTxList()`, or any
  derived computation — this is purely a new entry point to existing,
  already-tested reset logic.

## Out of scope

- Any change to the empty-results "Clear filters" button — it keeps working
  exactly as it does today, unchanged.
- A "clear" affordance inside the filter sheet itself (decision 1).
- Any per-facet-group partial clear (e.g. "clear only categories") — out of
  scope for this ticket, chips already cover single-facet removal.
- Making the chips-row Clear button reachable while the filter sheet is
  open (e.g. raising its stacking order above the backdrop, or excluding it
  from the focus trap) — see decision 4 ("Filter sheet reachability"). The
  sheet is deliberately full-viewport and modal; the chips-row button not
  being usable while it's open is accepted behavior, not a gap to close.

## Verification plan

`npm test` (no unit-level logic changed, existing suite must still pass),
`npm run test:e2e` with a new case in `e2e/filters.spec.js`:

1. Apply 2+ filters (e.g. a type filter and a category filter) so that
   results remain non-empty; confirm a "Clear filters" control now appears
   next to the chips.
2. Click it; confirm every chip disappears, the Filters button's badge
   disappears, the full transaction list returns, and the search input (if
   text was typed) is cleared too.
3. Confirm the same control is absent when no filter is active (fresh
   Transactions screen load).

(A step covering "click the chips-row control while the filter sheet is
open" was removed — see decision 4, "Filter sheet reachability": that
control is not reachable by a real user while the sheet is open, so there is
nothing to verify for that state, and no test should simulate it via a
synthetic/programmatic event.)

Then `npm run build`. No real-browser/deployed check needed beyond the
e2e suite — this is pure client-side UI state, no persistence/sync/schema
involved.
