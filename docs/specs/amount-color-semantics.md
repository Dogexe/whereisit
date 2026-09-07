# Spec: Expense amounts render red

Status: proposed (WI-016).

Requested directly, alongside a broader color-scheme reference image showing
a standard fintech convention (red negative amounts, green positive
amounts): "i want to fix both color scheme, here's the idea, follow the repo
workflow." Split out of that request into its own spec because it's a
`docs/UX.md` rule change with its own small, self-contained diff, independent
of the accent/surface palette work in `docs/specs/color-palette-refresh.md`.

## Key decisions (confirmed with the user before building)

1. **Supersedes `docs/UX.md`'s existing rule**: "A normal expense is never
   red — red means *error*, not *outgoing*." The user explicitly chose to
   adopt the reference image's convention instead: expense amounts render in
   the existing `--color-expense-700` red, income amounts keep rendering in
   the existing `--color-income-700` green (unchanged).
2. **Transfer rows are out of scope and stay exactly as they render today.**
   `tx-row.js`'s transfer branch already treats a transfer as neutral,
   direction-labeled text with no income/expense semantics (see its own
   header comment) — that is a separate, already-documented decision this
   spec does not touch.
3. **No new tokens.** `--color-expense-700` and `--color-income-700` already
   exist and are already used elsewhere for expense/income (e.g. Home's
   stat-card deltas, `home.js:139,144`) — this is purely applying an
   existing, already AA-verified token pair to a rendering spot that
   currently hardcodes a neutral color instead.

## Current behavior (confirmed by reading the code)

Both call sites use the identical binary pattern — `type === "income" ?
income-700 : text` — and both only ever see `income`/`expense` at that line
(transfer is handled by an earlier branch/return in each file), so the fix
is a direct swap of the `: text` fallback to `: expense-700`, not a
three-way rewrite:

- `src/screens/tx-row.js:72` — the shared non-transfer transaction row
  (`txRowHtml()`), used by both Home's recent list and the Transactions
  screen.
- `src/screens/add.js:229` — the Add sheet's commit preview
  (`renderCommitPreview()`), used by both the mobile bottom sheet and the
  desktop full-page form.

Confirmed **not** in scope (checked, no change needed):

- `home.js:139,144` — stat-card deltas already use `--color-income-700` /
  `--color-expense-700`.
- `settings-goals.js:46` — a savings-goal progress-bar fill color, not a
  transaction amount; unrelated.
- `tx-row.js`'s transfer branch (lines ~35-47) — stays neutral, see decision
  2.

## New behavior

- An expense transaction's amount text (with its leading `−` sign) renders
  in `--color-expense-700` instead of `--color-text`, in both themes,
  everywhere `txRowHtml()` and `renderCommitPreview()` render one — Home's
  recent list, the Transactions screen, and the Add sheet's live preview
  (mobile sheet and desktop form).
- Income keeps rendering in `--color-income-700` (no visible change).
- Transfer rows keep rendering exactly as today (no visible change).
- `docs/UX.md`'s "Amount coloring" bullet is rewritten to state the new
  rule and drop the old "expense is never red" statement.

## Out of scope

- Transfer row coloring/behavior.
- Any change to `--color-expense`/`--color-expense-700`'s actual hex values
  — that's `docs/specs/color-palette-refresh.md`'s concern, not this one.
- Any other UI surface not listed above under "Current behavior."

## Verification plan

`npm test` (unit coverage for any existing amount-color assertions) +
`npm run test:e2e` (screen change) + `npm run build`, then in a real browser,
both light and dark mode:

1. Home's recent-transactions list: an expense row's amount is red, an
   income row's amount is green, a transfer row is unchanged (neutral).
2. Transactions screen: same three checks.
3. Add sheet (mobile) and desktop Add/Edit form: switch the Type control
   between Expense/Income/Transfer and confirm the commit-preview amount
   recolors live to match.
4. Confirm `--color-expense-700` (already AA-verified against
   `--color-card` per its `theme.js` derivation) reads correctly in both
   themes — no new contrast measurement needed since this reuses an
   existing token, but confirm visually it isn't accidentally applied
   somewhere the token doesn't clear contrast (e.g. directly on a tinted
   background rather than `--color-card`/`--color-bg`).
