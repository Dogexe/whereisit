# Spec: Icon-led Budget/Bill rows in Settings' Manage section

Status: **built and verified live in the browser** (`src/screens/settings.js`,
`styles.css`). Found via a live audit (not a pre-supplied bug report)
after the user asked to "spec the other UI/UX improvement item" — the
fourth, originally-open-ended item from this session's initial UI/UX
request. Confirmed live: every Budget and Bill row now shows the same
category icon (matching glyph and color) that the same category shows
in the Transactions list, in both light and dark mode, with add/edit/
delete all unaffected.

## How this was found

The user didn't have anything specific in mind, so this was tracked
down by interview + a live visual audit rather than guessed at:
"something cutting across screens" → "visual style" → "inconsistency."
Auditing every screen against `styles.css`'s row conventions turned up
one clear, confirmed case: **every icon-led row pattern this session's
redesigns established — transaction rows, Settings' toggle rows, and
Settings' collapsible group headers — has a colored icon-avatar leading
it, except the individual Budget and Bill rows inside Settings'
"Manage" section**, which are bare text. Since those rows sit directly
under an icon-fronted group header (e.g. "Budgets" with a wallet icon)
among otherwise-consistent siblings, the gap is immediately visible —
confirmed live by expanding the Budgets group and comparing.

A secondary, smaller inconsistency compounds it: `.manage-row` (the
budget/bill row style) uses a 14px name and 10px gap, while every other
redesigned row (`.toggle-row`, `.tx-lead`, `.settings-group summary`)
uses 15px/12px. Confirmed with the user this should be fixed in the
same pass rather than left for later.

## Decision: scope is Settings' Manage section only, not every place a budget/bill appears

Budgets and bills also render in two other places — Home's budget
preview (`.budget-item`, a bare category name + progress bar, no icon
slot in the markup at all) and Insights' Budget tab (the same bare
bar-only card). Deliberately **not** touching either of those here:
they're a *different*, legitimate pattern — a compact glanceable
progress summary, the same shape as Insights' category-breakdown
legend-dot rows, which also don't use icons and aren't expected to.
Adding icons there would mean restructuring their layout (there's
nowhere for an icon to go in the current markup), not just filling in a
gap in an existing icon slot. The Settings Manage rows are different:
they already sit in a row shape (icon-avatar + text + trailing content)
identical to every sibling row that *does* have an icon — the fix there
is filling in a missing piece of an existing pattern, not inventing a
new one.

## New behavior

- `budgetRowHtml(b)` and `billRowHtml(b)` (in `src/screens/settings.js`)
  pass an icon avatar into `manageRowHtml`, reusing the exact same
  mapping already used for transaction rows — `iconFor(b.category)` for
  the glyph (from `categories.js`, keyed purely by category string, not
  income/expense) and `rowTone("expense")` for the color (both budgets
  and bills are always expense-side, and `rowTone("expense")` resolves
  to `var(--color-accent-tint)`/`var(--color-accent)` — the same purple
  already used for every other icon in this Settings card, so budget/
  bill icons will read as "the same family," just with a category-
  specific glyph, exactly like transaction rows do). No new icon or
  color data — 100% reuse of what already exists for transactions.
- `manageRowHtml()` gains a leading icon-avatar parameter, rendered
  with `iconAvatar()` (already imported in `settings.js`) the same way
  `.tx-lead`/`.toggle-row`/`.settings-group summary` all do.
- `.manage-row`'s CSS: `gap` goes from 10px to 12px, `.manage-row .name`
  font-size goes from 14px to 15px — matching `.toggle-row`,
  `.settings-group summary .label`, and `.tx-lead .cat` exactly.

## Out of scope

- Home's budget preview list and Insights' Budget tab — see the scope
  decision above.
- `.manage-row .amt`'s font-weight (600, vs transaction rows' amount at
  700) — noticed during the audit but not part of what was confirmed;
  flagging here in case it's worth a follow-up, not folding it in
  unasked.
- No changes to `saveBudgetForm`/`saveBillForm`/`deleteBudget`/
  `deleteBill` or any other logic — purely a rendering change.

## Verification plan

After implementing, `npm run build`, serve `dist/`, then in a real
browser:

1. Expand Settings' Budgets group and confirm each row now shows the
   same category icon (matching color/glyph) that the same category
   shows in the Transactions list.
2. Same for Bills.
3. Confirm the row's font-size/gap now visually matches the group
   header row directly above it (no more subtle size mismatch).
4. Confirm dark mode renders correctly (no new colors introduced —
   `rowTone("expense")` already resolves through the existing
   dark-mode-aware `--color-accent*` tokens).
5. Confirm edit/delete buttons, the add-budget/add-bill flow, and
   in-place editing are all completely unaffected — this only touches
   the row's leading content.
