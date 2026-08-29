# Spec: Insights period-picker redesign

Status: **built and verified live in the browser** (`src/screens/period-picker.js`,
`src/screens/insights.js`, `src/state.js`, `src/utils.js`, `src/i18n.js`,
`styles.css`, `icons/sprite.svg`). Replaces the plain two-`<select>` period
picker on Insights' Budgets and Categories (Breakdown) tabs with a
purpose-built month-grid/year-grid popover, and moves Breakdown's custom
date filter out of the top-level period modes and into its existing
Filters sheet. Scoped to Insights only — Transactions keeps its original
`periodPickerHtml`/`wirePeriodPicker` select-based picker untouched.

Reached through an interactive back-and-forth (six rounds of a live,
clickable HTML preview) rather than a single upfront design, since the
right shape only became clear once real trade-offs (a pill vs. tabs
carrying their own value; where a custom date lives; whether Filters
needs its own row; how to reach "Today" with no tab row at all) were seen
working, sometimes in both directions before settling.

## Key decisions (confirmed with the user across the preview rounds)

1. **Budgets and Breakdown ("Categories") tabs share one identical pill
   component**, not the old two-select box: `‹ 📅 August 2026 ›` — the
   arrows step month-by-month without opening anything; tapping the
   center opens a popover with a year stepper and a 4×3 month grid;
   tapping the year heading inside the popover switches to a whole-year
   view instead of exposing a separate "year" mode. Implemented as one
   function, `pillPickerHtml`/`wirePillPicker` in `period-picker.js`,
   parameterized by an `id` (for its data-attributes) and an
   `opts.todayShortcut` flag — not two near-identical implementations,
   since letting them diverge would mean every future tweak has to
   remember to apply itself twice.
2. **Breakdown gets exactly this same pill, no separate mode-tab row at
   all** — reached only after two intermediate shapes were tried and
   rejected live, both kept here for the lesson rather than as current
   behavior:
   - First, the resolved value was folded into whichever of a
     Today/Month/Year tab row was active, specifically to avoid two rows
     describing the same "which period" fact. The user tried it and asked
     for a real pill back — the merged version, while non-repetitive,
     read as *missing* something (no icon, no separate Filters affordance
     sharing its row) rather than as cleaner.
   - Second, the pill came back but *alongside* the Today/Month/Year tab
     row above it (with the pill handling Month/Year and a dedicated
     paginated 12-year grid for a real "Year" tab). The user's reaction —
     "why that today month year pills still there" — made clear the ask
     had always been parity with Budgets' single-control shape, not
     tabs-plus-pill. The 12-year grid was dropped along with the tab row:
     once Year is reached the same way as Budgets (tap the heading, then
     step ±1 with the arrows), a fast multi-year jump had no remaining
     justification.
   - The one genuine difference from Budgets is a **"Today" shortcut**: a
     dashed-border button inside the popover (`opts.todayShortcut`,
     `.today-shortcut-row`/`.today-shortcut-btn`), since Budgets has no
     "today" concept at all. A second option (reaching Today via a hidden
     double-click/long-press gesture on the pill itself, no visible
     button) was prototyped side by side in the same preview and
     discarded after it **failed to work even in the mockup** — a single
     tap already opens the popover, so the two clicks of a double-click
     fire that handler first and the second click lands on a
     since-replaced DOM element. Making a real double-click reliable
     would mean delaying every ordinary single tap to wait and see if a
     second one is coming, a real latency cost on the common case, not
     just a style trade-off. The visible button has no such cost.
   - `state.insightsBreakdownMode` is `"month"` | `"year"` only now (no
     `"today"` value); a separate `insightsBreakdownIsToday` boolean
     layers "today" on top instead of being a third mode, since stepping
     the pill or picking a month/year should fall back to normal browsing
     rather than needing a third mode's worth of transitions out of it.
3. **Filters button shares a row with the pill**, not its own full-width
   row — reuses `.btn.btn-secondary.filters-btn` (dropping the
   `btn-block` width modifier a brief intermediate version added) plus
   the pre-existing `.filter-badge`, with a `.toolbar-row` flex wrapper
   (`.picker-anchor` `flex:1`, the button `flex-shrink:0`) so the two sit
   side by side. The pill renders nothing at all (not even collapsed)
   while a custom date from the Filters sheet is active — Filters then
   sits alone in the row, and the sheet's own removable chip is the only
   place the active custom date shows.
4. **Custom date filtering moved from a top-level period mode into the
   Filters sheet**, with an explicit **single day / date range** toggle
   rather than one from–to pair that's ambiguous when only half-filled.
   Picking "single day" writes the same value to both bounds internally
   (`state.insightsFilterDateFrom === state.insightsFilterDateTo`), so
   every downstream consumer (`computeBreakdownForRange`) needed no new
   code path. This was raised directly by the user (while the picker was
   still merged into a tab row, described as the pill "collapsing") and
   is a known, accepted trade-off, unaffected by every later reversal —
   see the "Why the picker disappears" note below.
5. **Free month/year browsing, not restricted to `availableYears()`/
   `availableMonthKeys()`.** The old dropdowns only ever listed years/
   months with at least one transaction; the new grids let you page to
   any year, including ones with no data — the point of a calendar-style
   picker is fluid navigation, and restricting it to existing data would
   undercut that. `availableYears`/`availableMonthKeys` are unaffected and
   still used elsewhere (Transactions' own picker, Settings' bill-cycle
   logic).
6. **No data restrictions were placed on the new grids' locale text.**
   Month/year labels go through new `monthNameShort`/`monthNameFull`
   helpers in `utils.js` (locale-formatted via `toLocaleDateString`, same
   approach as the existing `monthLabel`) rather than a hardcoded name
   array, so they stay correct in whichever language is active without a
   parallel translation table to maintain.

## Why the picker disappears when a custom date is active

Raised directly by the user mid-design ("tell me why the pill has to
collapse"), while the picker was still merged into the tabs. The picker's
value and the Filters sheet's custom date chip are two representations of
the same one fact — "what time window is active" — and only one can be
true at a time. Keeping the picker's value visible while a contradicting
custom date was active would either show stale information or require
constantly re-syncing two displays of the same fact. The chosen fix is
structural, not cosmetic: there is exactly one place (the Filters sheet's
chip) that shows the active window's value once a custom date overrides
the picker, and the picker itself just renders nothing while that's
true — the same kind of state change as a tab losing focus, not a
special "collapse." This reasoning held across every later revision to
what the picker itself looked like (embedded-in-tabs, then a pill next to
a tab row, then the pill alone) — whatever form the picker takes, it
still yields to the Filters sheet's chip the same way.

## New/changed state (`src/state.js`)

Removed the old shared `insightsMonthNum`/`insightsYear`/`insightsPeriodMode`
(one triple used by every Insights tab). Replaced with two independent
sets, since Budgets and Breakdown don't share one period-picker instance
(though they do share its component/shape):

- `insightsBudgetsMode` (`"month"` | `"year"`), `insightsBudgetsMonthNum`,
  `insightsBudgetsYear`, `insightsBudgetsPopoverOpen`.
- `insightsBreakdownMode` (`"month"` | `"year"` — no `"today"` value),
  `insightsBreakdownMonthNum`, `insightsBreakdownYear`,
  `insightsBreakdownPopoverOpen`, `insightsBreakdownIsToday` (a boolean
  layered on top of month/year rather than a third mode — see decision 2).
- `insightsCustomKind` (`"single"` | `"range"`) — Breakdown-tab-only, UI
  state for which half of the Filters sheet's custom-date field is shown.
  `insightsFilterDateFrom`/`insightsFilterDateTo` (pre-existing fields)
  are reused as the actual applied values for both single-day and range.

## New components (`src/screens/period-picker.js`)

Added `pillPickerHtml`/`wirePillPicker` alongside (not replacing) the
original `periodPickerHtml`/`wirePeriodPicker`, which Transactions still
uses unmodified. One shared function for both Budgets and Breakdown (see
decision 1) — `insights.js` calls it twice with different `id`s
(`"budgets"`/`"breakdown"`) and state, and only Breakdown's call passes
`opts.todayShortcut`. Pure presentational function plus a DOM-wiring
function taking a handlers object, the same contract shape the original
component already used — `insights.js` owns all the actual state and
re-rendering; `period-picker.js` has no concept of Filters or its badge
count, so Breakdown's Filters button is assembled into the same
`.toolbar-row` by `insights.js` rather than by the picker component
itself.

## New icons (`icons/sprite.svg`)

Added `calendar`, `chevron-left`, and `filter` symbols (Lucide, matching
the existing pinned `lucide-static@1.35.0` this sprite already draws
from). `chevron-right` already existed. Verified with a real XML parser
after each edit — this file has broken silently once before from a `--`
inside a comment (see the Architecture section of the root `CLAUDE.md`),
so no comment was added near the new symbols, just plain markup.

## Out of scope / deferred

- **Desktop's old "tab-switch + period-picker become one compact row"
  treatment** (the 880px+ breakpoint's `.insights-toolbar` wrapper) does
  not carry over — both tabs now just stack at every width, same as
  mobile. This is less of a gap than it was mid-pass: now that both tabs
  share the identical pill component, revisiting a compact desktop row is
  more plausible than it was when Breakdown had a tab row plus Filters
  button too, but it's still not attempted here. Flagged in `styles.css`
  as a possible follow-up polish pass — verified live that the current
  stacked layout causes no overflow or breakage, just a less compact
  desktop arrangement than before.
- A 12-year-grid page-jump for Breakdown's Year mode was built, then
  removed once Breakdown converged on Budgets' plain pill shape (see
  decision 2) — Year is reached identically in both tabs now (tap the
  heading, then step ±1 with the arrows), so a faster multi-year jump had
  no tab of its own left to justify it.
- `computeBudgetsForRange`/`unbudgetedSpendForRange` in `derived.js`
  (added for Insights' old "today"/"custom" period modes) are no longer
  called from anywhere, since Budgets tab dropped those modes entirely.
  Left in place rather than deleted — they're still directly unit-tested
  in `tests/derived.test.js`, and removing tested pure functions on the
  chance they're never needed again is a separate cleanup decision, not
  something this pass should fold in incidentally.

## Verification

`npm run build && npm test` (80/80) after every file change, not just at
the end. Live-verified in a real browser (not just build/test):
- Budgets tab: pill opens/closes, arrows step months with year rollover,
  month-grid selection, year heading switches to whole-year view and back,
  correct data (`computeBudgets`/`computeBudgetsForYear`) renders in both.
- Breakdown tab: identical pill behavior to Budgets, plus the "Today"
  shortcut inside the popover — tapping it sets the pill to "Today · date"
  and switches `computeBreakdownForRange` to today's bounds; stepping the
  pill's arrows or picking a month/year afterward correctly clears it back
  to normal browsing; tapping the year heading while "Today" is active
  correctly overrides it to whole-year instead of combining the two.
- No console errors across the full flow (checked via
  `read_console_messages`, not just visual inspection).
- Both themes: light and dark mode checked on the real Settings toggle
  (not by writing to `state.dark` directly — see the root `CLAUDE.md`'s
  own note on why that specific shortcut previously produced a false
  pass), at both mobile (390px, sidebar hidden) and desktop (1536px,
  sidebar shown) widths. No overflow, correct contrast, correct
  `screen-wide` card grids at desktop.
- `icons/sprite.svg` re-parsed with a real XML parser (PowerShell's
  `[xml]` cast) after each symbol addition, not just visually.
