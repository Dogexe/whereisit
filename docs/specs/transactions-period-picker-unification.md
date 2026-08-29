# Spec: Transactions period-picker unification

Status: **built and verified live in the browser**
(`src/screens/period-picker.js`, `src/screens/transactions.js`,
`src/screens/insights.js`, `src/state.js`, `styles.css`,
`icons/sprite.svg`). A narrower follow-up to
`docs/specs/insights-period-picker-redesign.md`, prompted by the user
asking directly whether Insights' custom-date filter was still necessary
and whether the two screens' filter systems could be unified. Reached an
interactive HTML preview first ("try preview first" → "looks good"),
then built directly into the real app.

## Problem

Transactions (`src/screens/transactions.js`) already collapses Type,
Date, Category, and Amount behind one Filters bottom sheet (only Search
stays permanently visible — `docs/specs/transactions-filters-rework.md`).
Its Date field still renders the *original* select-based period picker
(`periodPickerHtml`/`wirePeriodPicker`, modes
`["all","today","month","year","custom"]` in one `<select>`), with
"custom" swapping in two bare `<input type="date">` fields inline —
exactly the same ambiguous-when-half-filled shape Insights' Breakdown tab
had before its own six-round redesign landed on a calendar pill (month
grid + year grid, tap the year heading for whole-year) with custom
filtering split into an explicit single-day/range toggle in its Filters
sheet. Left alone, the app now has two different eras of filter design
sitting one tab apart.

## Answering "is custom date still necessary?"

Yes. Insights' pill (month/year/today) can't reach an arbitrary single
past day (only "today" specifically) or a range crossing month
boundaries (e.g. a two-week span, a pay period) — both real, if
infrequent, use cases the calendar-grid pill has no way to express on its
own. The fix isn't dropping custom date; it's making sure both screens
handle it the same, clearer way.

## Key decisions (confirmed with the user)

1. **Both drivers are real**: this isn't pure cosmetics — Transactions'
   bare from/to custom fields have the identical ambiguity problem
   (unclear what a half-filled pair means) that motivated Insights'
   single-day/range split in the first place. Fixing it here is a real
   usability improvement, not just visual parity for its own sake.
2. **The pill replaces the `<select>` inside the Filters sheet's existing
   "Date" field** — it does not become a new, always-visible control on
   the main Transactions screen. Everything the sheet already collapses
   (Type, Date, Category, Amount) keeps being sheet-only; only Search
   stays outside, unchanged.
3. **The popover gains two shortcuts, "All time" and "Today"**, sitting
   above the year-row + month-grid exactly the way Insights' single
   "Today" shortcut does. This requires generalizing `pillPickerHtml`'s
   current `opts.todayShortcut` boolean into a list of shortcuts
   (`opts.shortcuts: [{ key, label }]`), since Insights only ever needed
   one and Transactions needs two. Budgets' and Insights' existing call
   sites keep working unchanged by passing zero or one shortcut.
4. **Custom (single day / range) is not a third popover shortcut** — it
   lives in its own section further down the same Filters sheet, using
   the identical `kind-toggle`/hint-text pattern and i18n strings
   Insights already introduced (`singleDayLabel`, `dateRangeLabel`,
   `singleDayHint`, `dateRangeHint`, `customDateLabel`, `clearBtn`).
   Setting a custom date hides the pill entirely (renders nothing, same
   as Insights' `hasCustomRange` check) rather than showing a
   now-meaningless month/year alongside it — the reasoning is identical
   to Insights' "Why the picker disappears" note: two controls can't both
   claim to represent the active period without one of them lying.
5. **One unified "period" active-filter chip, not two.** Insights needed
   a separate "range" chip from its mode-tabs because the pill there is
   an always-present, independent display that the custom date has to
   *override*. Transactions' custom mode was already just one of five
   mutually-exclusive period states before this change (`txPeriodMode`
   already covers `all`/`today`/`month`/`year`/`custom` as one value, not
   an independent display plus an override) — so the existing
   `periodChipLabel()`/single "period" chip/`removeFilterChip("period")`
   plumbing already fits custom-as-a-mode without needing Insights'
   two-chip split. `periodChipLabel()` grows a branch for the two custom
   sub-kinds (single vs range), matching `customRangeLabel()`'s
   short-date formatting in `insights.js`.
6. **Month/year grids, the "tap year for whole year" gesture, and every
   sprite icon/CSS class are reused as-is** — this is one more call site
   for the pill component that already exists, not a new visual language.
   No new icons, no new CSS beyond what a shortcuts-list needs (see
   Technical notes).

## State changes (`src/state.js`)

- `state.txPeriodMode` stays as the single source of truth for which of
  `all`/`today`/`month`/`year`/`custom` is active — unchanged in shape,
  just no longer driven by a `<select>`.
- `state.txFilterMonthNum`/`txFilterYear` stay as the month/year values
  the pill's grids read/write — unchanged.
- `state.txFilterDateFrom`/`txFilterDateTo` stay as the applied custom
  values (already exist) — reused as both the single-day value (from ===
  to) and the range's two bounds, exactly like
  `insightsFilterDateFrom`/`insightsFilterDateTo`.
- New: `state.txCustomKind` (`"single"` | `"range"`), mirroring
  `insightsCustomKind` — which half of the custom-date section is shown.
- New: `state.txPillPopoverOpen` (boolean, UI-only, not persisted) —
  Transactions never had a popover to open before; Insights' equivalent
  fields (`insightsBudgetsPopoverOpen`/`insightsBreakdownPopoverOpen`) are
  the precedent.
- Removed: nothing from `state.js` — `txPeriodMode`/`txFilterMonthNum`/
  `txFilterYear`/`txFilterDateFrom`/`txFilterDateTo` are all reused as-is,
  just read/written by the new pill's handlers instead of
  `wirePeriodPicker`'s.

## Technical notes (what actually shipped)

- `pillPickerHtml`/`wirePillPicker` (`src/screens/period-picker.js`) had
  their `opts.todayShortcut` boolean generalized to
  `opts.shortcuts: [{ key, label }]`, rendered as a `.shortcut-row` of
  `.shortcut-btn`s (renamed from the old singular
  `.today-shortcut-row`/`.today-shortcut-btn` — one class family, not a
  parallel one for the multi-button case). `.shortcut-btn` is `flex: 1`,
  so one entry fills the row exactly like the old single button did, and
  two sit side by side at equal width. Icon-per-key is a small internal
  `SHORTCUT_ICON` map (`{ today: "sun", all: "globe" }`, two new sprite
  symbols) rather than threading an icon name through every call site,
  since only these two shortcuts exist or are anticipated. A `key` param
  (`activeShortcut`, replacing the old boolean `isToday`) tells the
  component which shortcut (if any) is active; the pill's own label uses
  a `shortcutPillLabel(key, label)` helper that appends the live date
  only for `"today"` — any other key (just `"all"` today) shows its label
  verbatim. Insights' Budgets call site passes `null`/no `opts.shortcuts`
  and is pixel-identical to before; Breakdown passes a one-item
  `shortcuts` array and is also pixel-identical (verified live, both
  themes).
- `wirePillPicker`'s handlers object gained `onPickShortcut(key)`,
  replacing `onPickToday()` — Insights' Breakdown ignores `key` (it only
  ever has one shortcut), Transactions branches on it.
- Transactions' `txPeriodMode === "all"` was already the default/no-filter
  state (no chip, `activeFacetCount()` already excluded it) — the "All"
  shortcut's handler reproduces that exactly: `txPeriodMode = "all"`,
  `txFilterMonthNum`/`txFilterYear` reset to `"all"`, no other state
  touched.
- The old `periodPickerHtml`/`wirePeriodPicker` component stays in
  `period-picker.js`, now genuinely unused (confirmed via `git grep` —
  Transactions was its only caller) — left in place rather than deleted,
  matching this repo's general "don't fold unrelated cleanup into a
  feature pass" discipline.
- A real bug found live during verification, not anticipated in this
  spec: the pill's `.picker-anchor` is content-sized by default (fine for
  Insights, whose `.toolbar-row .picker-anchor { flex: 1 }` rule
  explicitly stretches it) but Transactions' Date field wraps it in a
  plain `.filter-row` with no such rule, so the pill hugged the field's
  left edge and its centered popover overflowed past the sheet's own left
  edge. Fixed with the equivalent stretch rules scoped to `.filter-row`
  (`.filter-row .picker-anchor { flex: 1; min-width: 0; }`,
  `.filter-row .period-pill.wide { width: 100%; }`) — safe to scope
  broadly since `.filter-row` has exactly one caller left
  (`#txPeriodPickerRow`) after this change.
- `wirePillPicker` also gained a scroll-into-view fix (unconditional,
  benefits every caller): after wiring, if the popover for this `id` is
  open, `popoverEl.scrollIntoView({ block: "nearest" })` — a no-op if
  already fully visible, so it only acts when the popover would otherwise
  render below the fold of a scrolling container. This addresses the
  "clipping risk" scenario found during the preview round (Transactions'
  pill lives inside the scrolling Filters sheet, unlike Budgets/
  Breakdown's, which sit directly on the main screen).
- Transactions' custom-date section (`renderTxCustomDateField`, a new
  independently-rerendered `#txCustomDateField` container, mirroring the
  existing `#txPeriodPickerRow` pattern) reuses every i18n string and the
  `kind-toggle`/`field-hint` CSS Insights already introduced — no new
  strings, no new CSS beyond the shortcut-row rename/generalization above
  and the `.filter-row` stretch fix. Committing a single-day or range
  date explicitly sets `txPeriodMode = "custom"` (unlike Insights, which
  has no "custom" mode at all — see decision 5), and `periodChipLabel()`
  grew a single-vs-range branch matching `customRangeLabel()`'s
  short-date formatting.

## Out of scope

- Any change to Type/Category/Amount sections of the Filters sheet.
- Any change to Search (stays outside the sheet, unchanged).
- Replacing Insights' pill/pattern with anything new — this pass only
  brings Transactions up to match what already shipped there.
- A shared, generic "N shortcuts" abstraction beyond what Transactions'
  two (All/Today) actually need — building for a hypothetical third
  shortcut before one exists would be speculative.

## Verification

`npm run build && npm test` (80/80) after every file change, not just at
the end. Live-verified in a real browser (mobile-width iframe against the
built `dist/`, not just read-the-code):

1. Opened Transactions' Filters sheet — confirmed the Date field shows
   the pill, not the old `<select>`.
2. Tapped the pill: month grid + year-row + two shortcut buttons (All,
   Today) render above them, both icons (globe/sun) showing correctly.
3. Tapped "All": pill and mode reset to no-filter; confirmed no "period"
   chip and an empty filter badge.
4. Tapped "Today": pill showed "วันนี้ · 29/08/2569", a "วันที่: วันนี้"
   chip appeared, filter badge showed 1, and the list correctly narrowed
   to 1 row (today's seeded transaction). Stepping the pill's arrow
   afterward correctly cleared "Today" and moved to the next month
   ("กันยายน 2569" / a "ก.ย. 69" chip).
5. Tapped the year heading: switched to whole-year view ("ปี 2569" / a
   "2569" chip), identical to Budgets/Breakdown.
6. Custom date section: switched to "single day," set a date — pill
   correctly disappeared entirely, a short-date chip appeared
   ("29/08/2569"), and a "Clear" link appeared next to the section label.
   Clicking Clear correctly reset back to "All" (pill reappeared, chip
   and badge cleared). Switched to "date range," set both bounds — chip
   showed the correct "from – to" short-date format, pill stayed hidden.
7. Removed the "period" chip from the (still-open) sheet — confirmed a
   full reset back to "All," sheet stayed open with the pill visible
   again and the custom-date inputs cleared.
8. Confirmed Insights' Budgets tab pill (no shortcuts) and Breakdown tab
   pill (one shortcut, "Today") are both pixel-identical to before this
   change — checked via the DOM directly (shortcut count, pill label)
   and visually (screenshot), in both English and Thai.
9. Checked both languages and both themes: English correctly showed "All"
   / "Today · 29/08/2026" (Gregorian) with the same icons; dark mode
   (toggled via the real Settings switch, not by writing `state.dark`
   directly) rendered the popover, shortcut buttons, and active-state
   tinting with correct contrast. No console errors at any point.
10. Found and fixed one real bug during this verification (not
    anticipated in the original spec): the popover overflowed past the
    sheet's left edge because `.picker-anchor` wasn't stretched to the
    field's full width inside `.filter-row` the way Insights'
    `.toolbar-row` already stretched it — see the Technical notes section
    for the fix. Re-verified after the fix: the popover now centers
    correctly under the full-width pill.
