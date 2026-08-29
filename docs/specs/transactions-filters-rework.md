# Spec: Transactions/Insights filter rework

Status: **built and verified live in the browser** (`src/screens/transactions.js`,
`src/screens/insights.js`, `src/screens/period-picker.js`, `src/derived.js`,
`src/state.js`, `styles.css`, `src/i18n.js`). Item 8 (largest scope) of a
larger UI/UX fix list. Collapses Transactions' always-visible category
`<select>` + search box into a single "Filters" bottom sheet, upgrades
category filtering from single-select to multi-select, adds an amount-range
facet, adds removable active-filter chips, adds a custom date-range period
mode, and applies the same category-filter treatment to Insights' Breakdown
tab specifically.

## Key decisions (confirmed with the user before building)

1. **Filters popover is a bottom sheet** (slides up, backdrop), matching
   this app's existing mobile-native interaction patterns (swipe-to-reveal,
   tab bar) rather than an inline-expanding panel or a centered desktop-style
   modal.
2. **Insights gets the category-filter treatment on the Breakdown tab only.**
   Budgets tab is already a short, curated, only-budgeted-categories list
   (a category filter would be redundant); Trend tab has no per-category
   axis at all (a category filter has no meaning there). Neither is touched.
3. **No amount-range facet on Insights.** Insights only ever shows
   pre-summed per-category/per-month totals, never individual transaction
   amounts — there's nothing for a min/max filter to apply to without
   changing what the aggregate itself means. Transactions-only.
4. **Custom date-range period-picker mode is built for Transactions only**
   this pass. Insights' period-picker is shared across all 3 tabs
   (Budgets/Breakdown/Trend), each backed by its own month/year aggregation
   function in `derived.js` — supporting "custom" there correctly would mean
   adding range-based variants of `computeBudgets`, `computeBreakdown`, *and*
   `computeTrend`, not just the one function Breakdown's own filter touches.
   That's flagged as a follow-up needing its own scoping pass, not silently
   dropped. Transactions' side is self-contained (a date-range check inside
   `filteredTxList`), so it ships now.
5. Every popover control (checkboxes, amount inputs, search input) applies
   **live**, matching how every other filter in this app already behaves
   (type tabs, period-picker, the old category select) — no separate
   "Apply" button.

## New behavior — Transactions

- `state.js`: `txFilterCategory` changes from a single id string (`"all"`
  sentinel) to a `Set` of ids (empty = no filter). New fields:
  `txFilterAmountMin`/`txFilterAmountMax` (number or `null`),
  `txFilterDateFrom`/`txFilterDateTo` (ISO date strings, used only when
  `txPeriodMode === "custom"`), `txFilterSheetOpen` (boolean UI state,
  mirroring `settingsGroupOpen`'s "not persisted" pattern).
- `filteredTxList()`: category check becomes `state.txFilterCategory.has(id)`
  guarded by `.size > 0`; new amount-range and (when in custom mode)
  date-range checks are added alongside the existing type/month/year/search
  checks.
- The screen keeps type tabs and the period-picker permanently visible (both
  cheap, per the task). Category checkboxes, the amount-range inputs, and
  the search input all move into a new bottom sheet, triggered by a
  "ตัวกรอง" (Filters) button that shows a small count badge when any of
  those three facets are active.
- Active filters render as individually-removable chips above the list: one
  chip per selected category, one combined chip for the amount range
  (clears both bounds together — a single min/max pair isn't meaningfully divisible
  into two independent filters), one for a non-empty search query. The
  existing single "clear filters" link is unchanged and still clears
  everything, including the new fields.
- `period-picker.js` gains a 4th mode, `"custom"`, rendering two
  `<input type="date">` fields instead of a `<select>` when active, and a
  new `onRange(from, to)` handler callback. Transactions wires this;
  Insights does not opt into the `"custom"` mode (still just
  `["month","year"]`), per decision 4.

## New behavior — Insights (Breakdown tab only)

- `derived.js`'s `computeBreakdown`/`computeBreakdownForYear` gain an
  optional `categoryIds` (Set) parameter, applied to the transaction list
  *before* aggregation — not as a post-filter on the returned rows. This
  matters because `breakdownEntries` already caps its result at the top 6
  categories by spend; filtering after that cap would silently hide a
  selected category that isn't in the overall top 6. Filtering before
  aggregation means any selected category shows correctly regardless of its
  unfiltered rank.
- Insights' Breakdown tab gets its own "Filters" button + bottom sheet
  (same `.filter-sheet`/`.filter-chip` CSS as Transactions, for the visual
  consistency the task asked for) listing only expense categories — no
  search or amount facets, per decisions 2-3. Selecting categories filters
  both the pie chart and the list beneath it. `state.insightsFilterCategory`
  (a `Set`) is a new, Breakdown-tab-only field; switching to Budgets or
  Trend doesn't touch or read it.

## Out of scope

- Amount-range and custom date-range for Insights (decisions 3-4).
- Any Insights tab besides Breakdown getting a category filter.
- Account/Payee/Group facets — this app has no multi-account/payee model.
- A full modal focus-trap for the bottom sheet — it closes via backdrop
  click, an explicit close button, or Escape, and its controls are native
  form elements in normal tab order, but there's no forced focus containment
  while open. Flagged as a possible follow-up, not built here.

## Verification plan

After implementing, `npm run build`, `npm test` (existing suite plus new
`filteredTxList`/`computeBreakdown` range and multi-select unit tests must
all pass), then in a real browser:

1. Confirm Transactions' initial render shows only type tabs + period-picker
   + one Filters button — no permanently-visible category select or search
   box.
2. Open the Filters sheet, select 2+ categories; confirm the list shows the
   union of both and two independent category chips appear above the list,
   each removable without affecting the other.
3. Set an amount min/max; confirm the list respects both bounds inclusively
   at the exact boundary values, and a single combined chip appears.
4. Type a search query inside the sheet; confirm it live-filters and shows
   a search chip.
5. Click "clear filters"; confirm every facet resets, including the new
   ones, and the Filters button's badge disappears.
6. Switch the period-picker to "custom", pick a date range; confirm the
   list respects it and that switching back to month/year/all works
   unchanged.
7. On Insights' Breakdown tab, select a category that is *not* among the
   period's top-6-by-spend; confirm it now appears (proving the filter runs
   before the top-6 cap, not after).
8. Confirm dark mode renders the bottom sheet, chips, and Filters button
   badge correctly on both screens.
9. Confirm Budgets and Trend tabs are completely unaffected — no Filters
   button, no reference to `insightsFilterCategory`.
