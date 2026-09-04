# Spec: Transactions search bar restyle

Status: Draft (not yet built).

Small visual-only pass over the Transactions screen's search + Filters row
(`.tx-toolbar-row` in `src/screens/transactions.js` / `styles.css`), based on
a reference screenshot: a wider pill-shaped search field with a decorative
magnifying-glass icon on the left, a clear ("x") button on the right that
only appears once text is entered, and the Filters button collapsed from
icon+text+badge to icon+badge only, freeing width for the search field.

## Scope

Transactions screen only (`src/screens/transactions.js`, its slice of
`styles.css`). Insights' Breakdown tab has its own Filters button
(`.toolbar-row` in `src/screens/insights.js`) but no adjacent search field —
explicitly out of scope, not touched.

## Key decisions (confirmed with the user before building)

1. **Icon-only Filters button applies at every screen width**, including
   desktop (≥1024px) where the toolbar row currently renders identically to
   mobile — no new breakpoint-specific behavior.
2. **The clear ("x") button is conditional**: hidden when `state.txSearch`
   is empty, shown once there's any text, matching the reference image.
   Clicking it clears `state.txSearch`, re-renders the filtered list, and
   returns focus to the search input.
3. **The magnifying-glass icon is decorative only** — a visual left-side
   prefix inside the input, not a clickable/submit control. Reuse the
   existing `search` symbol already in `icons/sprite.svg` (`icon("search")`
   from `src/utils.js`); do not add a new icon asset.
4. **The Filters button keeps its active-filter count badge**
   (`#txFiltersBadge`, `updateFiltersBtnBadge()` in transactions.js), just
   without the "Filters" text label. It becomes a round icon-only button
   (visually matching the circular filter icon in the reference image)
   rather than keeping today's rectangular `btn-secondary` pill shape.
5. No behavior change to search filtering itself — `state.txSearch` still
   updates live on every `input` event via the existing listener
   (`renderTxListOnly()`), and the Filters sheet/active-filter-chips/badge
   logic is otherwise unchanged.

## Current implementation (for reference)

`renderTransactions()` in `src/screens/transactions.js` (~line 348-367)
renders:

```html
<div class="tx-toolbar-row">
  <input class="input" id="txSearchInput" placeholder="..." value="...">
  <button type="button" class="btn btn-secondary filters-btn" id="openTxFiltersBtn">
    ${icon("filter")}<span>Filters</span><span class="filter-badge" id="txFiltersBadge" hidden></span>
  </button>
</div>
```

CSS (`styles.css` ~line 469-489): `.tx-toolbar-row` is a flex row with the
input at `flex: 1` and the button `flex-shrink: 0`; `.filter-badge` is an
absolutely-positioned dot pinned to the button's top-right corner.

## New behavior

- The input gets a decorative `search` icon positioned inside its left edge
  (`position: relative` wrapper + absolutely-positioned icon + left padding
  on the input, the standard pattern for an icon-prefixed text field — no
  existing example of this exact pattern in this codebase, so this
  introduces one small new CSS block, not a new component).
- A clear button (`&times;`, matching this app's existing close-glyph
  convention used on all 5 sheet-close buttons, not a new SVG icon) is
  absolutely-positioned inside the input's right edge. It is present in the
  DOM but hidden (`hidden` attribute, mirroring `#txFiltersBadge`'s existing
  hidden-attribute pattern) whenever `state.txSearch === ""`, shown
  otherwise. Needs a new `aria-label` (new i18n string, e.g.
  `clearSearchAria: ["ล้างการค้นหา", "Clear search"]`) since it has no
  visible text.
- The input itself gains left/right padding sized to clear both icons
  without overlapping typed text, and the row's available width grows
  because the Filters button shrinks.
- `#openTxFiltersBtn` drops its `<span>Filters</span>` text node, keeping
  `icon("filter")` + `#txFiltersBadge`. It becomes a round icon button (new
  CSS: fixed width/height, `border-radius: 50%`, centered icon) instead of
  today's `btn btn-secondary` rectangular pill. Needs its own `aria-label`
  (new i18n string, e.g. `filtersBtnAria: ["ตัวกรอง", "Filters"]`) since its
  visible text is gone — reuse `filtersBtn`'s existing Thai/English strings
  as the label values, just under a new `*Aria` key so the existing
  `filtersBtn` string (still used elsewhere, if anywhere) isn't repurposed
  silently.
- No change to `updateFiltersBtnBadge()`'s logic, `wireFilterSheet()`, the
  active-filter-chips row, or `filteredTxList()` — this ticket is styling +
  one new clear-button interaction, not a filtering-logic change.

## Out of scope

- Insights' Breakdown tab Filters button (decision, scope section above).
- Any change to what counts as an active filter, the Filters sheet's
  contents, or `filteredTxList()`'s matching logic.
- A clickable/submit behavior on the magnifying-glass icon.
- Desktop-specific layout branching (decision 1) — same markup/CSS at every
  width, per the existing pattern for this row.

## Verification plan

After implementing, `npm run build`, `npm test`, then in a real browser
(light and dark mode) on the Transactions screen:

1. Confirm the search field is visibly wider than before and the Filters
   button is now icon-only (no "Filters" text), at both a mobile-width and
   a desktop-width (≥1024px) viewport.
2. Confirm the magnifying-glass icon renders inside the field's left edge
   and does not overlap typed text; confirm it does nothing when clicked.
3. Type text into the search field: confirm the x button appears, the list
   still live-filters exactly as before, and typed text doesn't visually
   collide with either icon.
4. Click the x button: confirm it clears the field, the list resets to
   unfiltered (subject to any other active filters), and keyboard focus
   returns to the search input.
5. Clear the field manually (e.g. select-all + delete): confirm the x
   button disappears again.
6. Set an active filter (e.g. a category) via the Filters sheet: confirm
   the existing badge dot still renders correctly on the now-round,
   icon-only Filters button, and the sheet still opens/closes normally.
7. Confirm Insights' Breakdown tab Filters button is visually unchanged.
8. `npm run test:e2e` — confirm `filters.spec.js` and
   `transactions-crud.spec.js` still pass; update either if they assert on
   the removed "Filters" text label or the button's old CSS class.
