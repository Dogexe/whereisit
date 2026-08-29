# Spec: Add transaction as a mobile bottom sheet

Status: **built and verified live in the browser**
(`index.html`, `src/state.js`, `src/utils.js`, `src/screens/add.js`,
`src/main.js`, `src/sync.js`). Prompted directly by the user: "add button
on mobile should pop from the bottom like filter does." Scoped via
`/spec` first, since this changes real navigation/state architecture
(Add stops being a tab on mobile), not a pure visual tweak.

## Problem

Below 1024px, tapping the tab bar's "Add" button (and tapping "Edit" on
a transaction row) navigates to a full-page "Add/Edit transaction"
screen — `state.tab = "add"`, dispatched through the normal
`renderScreen()` flow like every other tab. This means leaving whatever
you were looking at (Home, Transactions) to add or edit one transaction,
then having to navigate back. The app already has a working bottom-sheet
pattern for this exact kind of "quick action without leaving the current
screen" need — the Filters sheet used by Transactions and Insights
(`.filter-sheet-backdrop`/`.filter-sheet` in `styles.css`,
`filterSheetHtml()`/`wireFilterSheet()` in `transactions.js`) — but Add
never adopted it.

## Key decisions (confirmed with the user)

1. **Add stops being a tab, on mobile only.** Tapping the tab bar's "Add"
   button opens a bottom-sheet overlay on top of whatever screen is
   currently showing; `state.tab` does not change, so the tab bar's
   active highlight stays on whichever tab you were already on.
2. **On successful save**: the sheet closes and the underlying screen
   re-renders (via `renderScreen()`, which re-dispatches to whatever
   `state.tab` already is) so a newly added/edited transaction shows up
   immediately if that screen displays transactions — Home's recent list,
   Transactions' list. No navigation to Transactions the way the old
   full-page flow did.
3. **Editing also uses the sheet, mobile only.** Tapping "Edit" on a
   swiped-open transaction row (Home or Transactions) opens the same
   sheet pre-filled in edit mode, instead of navigating to the old
   full-page screen.
4. **Desktop (≥1024px, sidebar shown) is completely untouched.** Add/Edit
   stays exactly as it is today: a full-page, centered-dialog-style form
   reached via the sidebar's normal tab navigation, `state.tab = "add"`
   as before. The same "Add" button (sidebar vs. tab bar, sharing
   `.nav-btn`) and the same `editTx()` call site both need to branch
   behavior depending on which shell is active.
5. **Close affordances match the Filters sheet exactly**: backdrop tap,
   an explicit close (×) button, Escape key. No drag-to-dismiss gesture,
   no "unsaved changes" confirmation — matches today's behavior (leaving
   the old full-page Add screen already silently discards unsaved input).
6. **The Add tab bar button's raised accent breakout-circle visual is
   unchanged** — only its click behavior changes below 1024px.
7. **All existing form logic is reused verbatim** — amount validation,
   category guessing from the note field, date typing/parsing, the
   category chip row. This is a presentation/trigger change, not a
   rewrite of the form.

## Architecture

- **The sheet is not owned by any single screen.** Unlike the Filters
  sheet (embedded inside `transactions.js`'s/`insights.js`'s own screen
  template, since Filters only ever applies to the screen it's on), Add
  must be triggerable from Home, Transactions, Insights, and Settings
  alike without coupling to whichever one happens to be rendered. Its
  markup lives in a new empty container declared once in `index.html`
  (`<div id="addSheetContainer"></div>`, a sibling of `#toast` inside
  `.app`), independent of `#screen`'s per-tab full-replace renders.
- **`src/screens/add.js` is refactored, not rewritten**, to avoid
  duplicating ~100 lines of form markup/validation across two render
  paths: the form's HTML template is extracted into
  `addFormFieldsHtml(l, isEditing)` and its event wiring into
  `wireAddForm({ onSaved, onCancelled })` (submit success calls
  `onSaved()`, the existing cancel-edit button calls `onCancelled()`).
  `renderAdd()` (the desktop full-page screen, unchanged behavior) and
  the new `renderAddSheet()` (mobile sheet) both call these two shared
  functions with different callbacks and a different surrounding
  container, rather than being two independent implementations.
  - `renderAdd()`'s callbacks: `onSaved`/`onCancelled` both do
    `resetForm(); setTab("transactions");` — byte-for-byte what the code
    did before this change.
  - `renderAddSheet()`'s callbacks: `onSaved` does
    `resetForm(); closeAddSheet(); renderScreen();`; `onCancelled` is the
    same "dismiss" function backdrop-tap/close-button/Escape all call:
    `resetForm(); closeAddSheet();`.
- **New exports from `add.js`**: `openAddSheet()` (sets
  `state.addSheetOpen = true`, calls `renderAddSheet()`) and
  `closeAddSheet()` (sets `state.addSheetOpen = false`, hides the
  backdrop element directly — mirrors `transactions.js`'s
  `closeTxFilterSheet()` exactly, no full re-render needed to close).
  `editTx(id)` gains one branch: on the desktop shell it still does
  exactly what it always did (`setTab("add")`); otherwise it calls
  `openAddSheet()` instead.
- **New state**: `state.addSheetOpen` (boolean, UI-only, not persisted —
  same treatment as `txFilterSheetOpen`/`insightsFilterSheetOpen`).
- **New helper**: `isDesktopShell()` in `utils.js` —
  `window.matchMedia("(min-width: 1024px)").matches`, the same 1024px
  breakpoint `styles.css` already uses for the sidebar/tab-bar swap. Used
  by both `main.js`'s nav-button click handler and `add.js`'s `editTx()`
  so "which shell is active" is decided one consistent way, not two.
- **`main.js`'s shared `.nav-btn` click handler** (wires both `#tabbar`'s
  and `#sidebar`'s buttons identically today) gains one branch: when the
  clicked button's `data-tab` is `"add"` and `isDesktopShell()` is false,
  call `resetForm(); openAddSheet();` instead of `setTab("add")`.
- **`hasLiveInputRisk()` (`src/sync.js`)** gains `state.addSheetOpen` as
  an additional trip condition alongside the existing
  `state.tab === "add"` check — both still matter, since desktop can
  still have a genuine `state.tab === "add"` full-page session open.
- **Sheet markup reuses `.filter-sheet-backdrop`/`.filter-sheet`/
  `.filter-sheet-header`/`.filter-sheet-close-btn` CSS as-is** — no new
  CSS needed for the sheet chrome itself. No new i18n strings needed
  either (`addTitle`, `editTitle`, `closeAria` all already exist).

## Out of scope

- Any change to the form's own fields, validation, or category-guessing
  logic.
- Any change to desktop's Add/Edit behavior.
- A drag-down-to-dismiss gesture, or an "unsaved changes" warning.
- The second part of the original request ("more microinteraction across
  all pages") — tracked separately as its own later audit pass, not
  spec'd here.

## Verification

`npm run build && npm test` after each file change. Live-verified in a
real browser (mobile-width iframe against the built `dist/`):

1. Tapping "Add" in the tab bar opens a bottom sheet on top of Home
   (or whichever screen was active); the tab bar's active highlight
   stays on that screen's tab, not "Add."
2. Saving a new transaction from the sheet: sheet closes, a success
   toast fires, and the underlying screen (e.g. Home) immediately shows
   the new transaction with no navigation away.
3. Tapping "Edit" on a row (Home and Transactions) opens the sheet
   pre-filled in edit mode; saving an edit closes the sheet and refreshes
   the current screen; canceling the edit closes the sheet with no
   changes applied.
4. Backdrop tap, the close (×) button, and Escape key all dismiss the
   sheet and discard any unsaved input, matching the Filters sheet.
5. Category chip selection, the type toggle, date typing/parsing, and
   amount validation (including the existing has-error state) all work
   identically inside the sheet.
6. At ≥1024px (sidebar shown): tapping "Add" in the sidebar still
   navigates to the full-page Add screen exactly as before; editing a
   row still navigates there too. The bottom sheet is never involved at
   this width.
7. Both languages, both themes (light/dark via the real Settings toggle,
   not by writing `state.dark` directly), no console errors.
