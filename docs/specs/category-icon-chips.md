# Spec: Icon-chip category picker on the Add screen

Status: **built and verified live in the browser** (`src/screens/add.js`,
`src/derived.js`, `styles.css`, `src/i18n.js`). Part of a larger UI/UX
fix list; this is item 7. Replaces the plain native `<select id="txCategory">`
with a horizontal row of icon chips for each type's most-used categories,
so the app's existing auto-guess-from-note-text (`guessCategory()`) is
visible and correctable in one tap instead of hidden behind a closed
dropdown.

## Key decisions (confirmed with the user before building)

1. **"Most-used" is computed from the user's own transaction history**,
   not a hardcoded list and not a user-reorderable Settings list. Ranked
   by usage count per category, per type (income/expense), among that
   type's non-deleted categories. A brand-new account (or a type with
   fewer than 5 distinct used categories) fills any remaining chip slots
   from the category list's own `sortOrder` — for the 16 built-ins this
   reproduces today's original display order, so a fresh install's chip
   row still looks sensibly curated rather than empty or random.
2. **5 chips per type**, plus a trailing "more" chip — fits one row on a
   375px-wide phone screen without wrapping or needing horizontal scroll.
3. **The "more" overflow reuses the existing native `<select>`**, rather
   than a new custom searchable list/sheet. It already got a real
   dark-mode fix (item 1 of this same pass — `document.documentElement.
   style.colorScheme`), and is already fully keyboard- and
   scroll-accessible for free. Building a second, custom dropdown
   component (with its own dark-mode styling and touch/wheel-scroll
   testing from scratch, as the original task's fallback option would
   have required) was explicitly rejected as unnecessary added risk for
   no real UX gain over the native control here.

## New behavior

- `derived.js` gains `mostUsedCategoryIds(type, n)`: counts each
  category's occurrences across `transactions` (matched via the existing
  `resolveCategoryId`, so it works whether a row has a `categoryId` yet
  or is still pre-backfill name+type), ranks descending, filters out
  deleted categories, then pads any remaining slots up to `n` from
  `categories` sorted by `sortOrder` (skipping ids already ranked). Pure
  with respect to the module's own imported `transactions`/`categories`
  bindings, matching every other function in this file — not a
  dependency-injected pure function like `categories.js`'s helpers.
- `add.js`'s category field becomes a `.category-chip-row` (5 chips +
  a "more" chip) sitting above the existing `<select id="txCategory">`,
  which is now visually hidden by default (`.category-select-collapsed`)
  rather than removed. It becomes visible again whenever the form's
  actual selection isn't one of the 5 visible chips — editing a
  transaction in a less-common category, or the note-guess landing on
  one — so the true selection is never hidden from the user. In that
  state, the "more" chip itself shows as active/selected and displays
  the selected category's own name instead of a generic "more" label.
- Clicking a chip sets `state.formCategoryId`, marks `state.categoryManual
  = true` (unchanged existing behavior — stops further note-based
  re-guessing), syncs the hidden `<select>`'s value, and re-renders just
  the chip row (not the whole Add screen, so the amount/note field
  values and focus are undisturbed).
- Clicking "more" reveals the `<select>` and calls its `showPicker()`
  (feature-detected; falls back to a plain `.focus()` on browsers
  without it) so the native list opens immediately in the same click,
  rather than requiring a second tap.
- Switching the income/expense radio, or a note-driven auto-guess,
  both re-run the same chip-row render (recomputing the top-5 for the
  new type / re-highlighting the guessed id) exactly as they already
  recomputed the old `<select>`'s options.
- Chips are icon + label (`iconAvatar`-style content, not a full avatar
  circle — sized for a compact horizontal row) using each category's own
  `.icon`, so a custom category's chosen icon (Settings, stage 3 of
  `custom-categories.md`) shows up here too, for free.

## Out of scope

- No changes to `guessCategory`/`CATEGORY_KEYWORDS` matching logic itself
  — only how the result is displayed.
- No changes to the Settings screen's own category management UI or its
  icon picker.
- Not building a searchable/custom "more" dialog — see decision 3 above.

## Verification plan

After implementing, `npm run build`, `npm test` (existing 68 plus new
`mostUsedCategoryIds` unit tests must all pass), then in a real browser:

1. Seed a handful of transactions concentrated in 2-3 expense categories;
   confirm those rank first in the expense chip row, with the remaining
   slots filled from the built-in order.
2. Confirm a brand-new/empty account still shows 5 sensible default
   chips per type (no history to rank from).
3. Type a note matching a keyword for a category *not* among the visible
   chips; confirm the "more" chip highlights and shows that category's
   name, and the (now-visible) native select reflects the same guess.
4. Click a visible chip; confirm it becomes the active chip, the hidden
   select's value updates to match, and typing further note text no
   longer overrides the pick (`categoryManual` behavior unchanged).
5. Edit an existing transaction whose category isn't in the top 5;
   confirm the form opens with the "more" chip active and correct name
   shown, not silently defaulting to the first chip.
6. Confirm dark mode renders the chip row correctly (new CSS, not
   inherited from any existing component).
7. Click "more" and confirm the native select's popup opens in the same
   click (via `showPicker()`) rather than needing a second tap.
