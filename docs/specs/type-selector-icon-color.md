# Spec: Icon + color on the Add form's Type segmented control

Status: **built** (WI-006). Two things changed during implementation and
are folded into the sections below rather than left as the original
proposal: the transfer foreground is a new fixed
`--color-chart-5-tint-fg` token, not `--color-chart-5` itself (decision 4),
and the Type row's segments were given equal widths after review found
them spread too far apart on desktop ("New behavior"). Requested
directly: "why type selector doesnt
use chips ui like categories and account" — investigated and answered
before writing this spec (see `docs/CHANGELOG.md`'s workflow note for this
pass, or the session that produced it). Decision: keep Type as a segmented
control (it's a fixed, mutually-exclusive 3-value enum — the class of
control most comparable apps use for Income/Expense/[Transfer]), not a
scrollable chip row like Category/Account (open-ended, icon-heavy, grow
over time). The actual reported mismatch — Type has no icon/color while
Category/Account do — is fixed by adding both to the existing control.

## Key decisions (confirmed with the user before building)

1. **Stays a `.tabs.block`/`.tab-opt` segmented control** (`add.js`'s
   `addFormFieldsHtml()`), not converted to `.category-chip-row`-style
   chips. Rejected converting to chips: Type is a closed 2-3 value set
   that always fits one line, so a scrollable icon-chip row (built for an
   open-ended, growing list) would gain nothing and would be inconsistent
   with every other fixed-choice control in this app (Insights period
   tabs, Settings' Language/Theme rows), which all use this same widget.
2. **Applies to both the mobile Add sheet and the desktop full-page
   form** — both render Type through the same shared `addFormFieldsHtml()`
   call, so there is exactly one call site to change and no reason for the
   two surfaces to diverge.
3. **Icons reuse this app's own existing income/expense/transfer icon
   convention**, not new ones: Home's stat cards already use
   `arrow-down-left` for income and `arrow-up-right` for expense
   (`screens/home.js:137,142`); transaction rows already render a transfer
   icon as `arrow-right-left` (`screens/tx-row.js:53`). Reusing the same
   three icons here keeps the app internally consistent instead of
   introducing a second, competing set of income/expense/transfer
   glyphs.
4. **Colors reuse `rowTone()` (`categories.js`)**, extended to return an
   explicit three-way tone instead of its current two-way
   income/everything-else split. Today `rowTone("transfer")` silently
   falls into the same branch as `rowTone("expense")` (both get the
   accent tint) — a real, pre-existing instance of the exact bug class
   `CLAUDE.md` already calls out ("any code branching on transaction type
   must handle all three types explicitly"), just never triggered visibly
   because nothing rendered income/expense/transfer side by side until
   now. Fixing `rowTone()` itself (rather than duplicating a separate
   color map inside `add.js`) fixes this at the one shared source instead
   of adding a second, parallel place that could drift from it.
   - `income` → `--color-income-tint` / `--color-income-700` (unchanged).
   - `expense` → `--color-accent-tint` / `--color-accent` (unchanged —
     matches the existing default/active look of category chips, which
     are accent-colored regardless of type today).
   - `transfer` → a new, genuinely distinct tone: a new
     `--color-chart-5-tint` token following the same
     `color-mix(in srgb, var(--color-chart-5) 12%, white)` pattern as
     the income/expense tints, plus a new fixed `--color-chart-5-tint-fg`
     (`#17665c`) as its foreground. **Not `--color-chart-5` itself** —
     this spec originally proposed that, and review measured the result
     at 1.66:1 in dark mode. `theme.js:67` brightens `--color-chart-5`
     to `#4fd6c4` for dark mode while the tint keeps mixing toward white
     in both themes, so a foreground that follows the chart color lands
     bright-on-near-white. This is exactly the trap `styles.css`'s
     `--color-income-tint-fg` comment documents, and the fix is the same
     pattern: a fixed, theme-invariant dark hex. `#17665c` measures
     5.78:1 light / 6.32:1 dark. These two are the net-new CSS tokens
     this spec introduces.
   - Every existing caller of `rowTone()` keeps rendering exactly as
     before for income/expense; only `transfer` callers change
     appearance — call out as a visible side effect, not a separate
     feature, when reviewing the diff. Two surfaces change: transfer
     transaction rows' icon avatar (`tx-row.js`) goes from accent-tinted
     to teal-tinted, and so does the mobile Add sheet's commit-preview
     avatar (`add.js`'s `renderCommitPreview()`, which already called
     `rowTone(state.formType)` before this pass — found during review,
     not by the pre-spec grep below).

## New behavior

- Each `.tab-opt` label in the Type field gets a small leading icon (reuse
  `iconAvatar`'s icon markup or a plain inline `icon()` sized for a
  14-16px glyph next to the label text, matching this control's compact
  13px font — not a full circular avatar, which would be oversized for a
  segmented control this dense).
- The active segment's background/text color comes from `rowTone(value)`
  for that segment's own type, replacing today's flat
  `background: var(--color-card); color: var(--color-text)` active state
  (`.tab-opt:has(input:checked)`, `styles.css:265`) with a per-segment
  tint. Inactive segments keep today's muted look (no color change while
  unselected, so the row doesn't look like three permanently-colored
  buttons — only the active one is tinted, consistent with how
  `.category-chip.active`/`.account-chip.active` only tint on selection).
- The Type row's segments get equal widths
  (`.tabs.block:has(.type-tab-opt)` drops `justify-content:
  space-between`; `.type-tab-opt` gets `flex: 1 1 0`). Added during
  review, which found the three content-sized pills spread to opposite
  ends of the wide desktop form with large empty gaps between them. The
  `styles.css` comment arguing for content-sized cells is about tab rows
  with uneven labels (a short "All" next to a long "Transfer"); it
  doesn't apply here, where all three labels are similar length. Scoped
  by `:has(.type-tab-opt)` so every other `.tabs.block` row keeps
  today's behavior.
- No change to `state.formType`, form submission, validation, or any
  other Add-form behavior — this is a rendering-only change to one field.

## Out of scope

- No change to the Type field's underlying `<input type="radio">`
  structure, `name="form-type"` values, or `updateFormTypeVisibility()`
  logic.
- No change to Category or Account chip styling.
- Not fixing any other caller that might assume `rowTone()`'s old
  two-way shape — the pre-spec grep found only `tx-row.js` and `add.js`'s
  new usage. Review turned up a third, `add.js`'s `renderCommitPreview()`;
  it's covered above as a side-effect surface, and needed no code change
  of its own. `manage-row.js` and `settings-accounts.js` pass a literal
  `"expense"` and are unaffected.
- Not addressing the drag-handle text-ghosting bug (separate
  investigation, tracked independently — see `docs/CHANGELOG.md`).

## Verification plan

After implementing, `npm run build`, `npm test`, `npm run test:e2e`, then
in a real browser (both light and dark mode, mobile-width sheet and
desktop-width full page):

1. Confirm all three segments (Expense/Income/Transfer) show their icon
   at rest.
2. Tap through each segment; confirm only the active one shows its tint
   (income green, expense accent/orange, transfer teal) and the other two
   stay muted/uncolored.
3. Confirm the Transfer segment's icon/tint is visibly distinct from
   Expense's (this is the concrete regression check for the `rowTone()`
   fix above — screenshot both side by side).
4. Open the Transactions list and confirm existing transfer rows now
   render with the new teal tint (expected, documented side effect) and
   income/expense rows are pixel-identical to before.
5. Re-check the narrow-phone width lesson from
   `docs/CHANGELOG.md`'s "Type-toggle spacing" entry (~310-320px) — the
   added icon must not cause "Transfer" to clip without the existing
   ellipsis engaging.
6. Confirm desktop's full-page Add/Edit form renders identically to the
   mobile sheet's Type field (same icons, same tint behavor).
7. Confirm the active segment's rendered text/background contrast clears
   4.5:1 in **both** themes, measured rather than eyeballed — the
   dark-mode transfer failure this pass fixed was invisible to steps 2-3.

Steps 5 and 7 are now automated in `e2e/type-selector-icon-color.spec.js`,
which measures rendered transfer contrast in both themes at a 320px
viewport and asserts equal segment widths with no gaps at desktop width.
They were added because manual window resizing proved unreliable during
review, and because the layout of this row is no longer the shared
`.tabs.block` default.
