# Spec: Move the Add-sheet commit preview to the top

Status: **built and merged** (see `docs/tickets/completed/WI-002.md` and
`docs/CHANGELOG.md`'s "WI-002" entry)

Touches: `src/screens/add.js` only (mobile bottom sheet path,
`renderAddSheet`/`addFormFieldsHtml`/`renderCommitPreview`). Desktop's
full-page Add/Edit form never renders this element and is unaffected.

## Problem

The commit preview (icon + category/route + account + signed amount,
`#addCommitPreview`) currently renders as the *last* field in the mobile
Add/Edit sheet, immediately above the sticky header's always-visible Save
button. It was placed there in an earlier pass specifically because Amount
(the first field) scrolls out of view quickly, so the preview restored
"what am I about to record" right before the user commits.

That placement means the preview is only visible after the user has already
scrolled through the whole form — it doesn't help confirm choices (category,
account) *as they're made*, only as a final check before Save. The user
wants it visible earlier, while filling out the form, not just at the end.

## Key decisions (confirmed with the user)

1. **Placement**: the preview becomes the first field in the sheet, above
   Amount — a straight reorder of `addFormFieldsHtml`'s `isSheet` branch of
   `fieldsInOrder`, not a sticky/pinned position. It scrolls with the rest
   of the form like every other field.
2. **Empty-state guard**: since it's now the first thing visible on open,
   it must not show a meaningless default (e.g. "Food · Cash · ฿0.00")
   before the user has entered a real amount. `renderCommitPreview()` hides
   the element (`el.hidden = true`) whenever `amount <= 0`, for both the
   transfer and non-transfer branches, and un-hides it once there's a real
   amount. On an edit-sheet open, the amount is already prefilled and > 0,
   so the preview shows immediately — no special-casing needed for edit
   mode.
3. **Style**: reuse the existing `.commit-preview` CSS class unchanged — no
   new styling, no divider, no visual treatment beyond normal form-field
   spacing (the sheet's `.add-form` already applies consistent gaps between
   `.field`-level children).
4. **Comments**: `addFormFieldsHtml`'s field-order comment
   (`src/screens/add.js`, near the `commitPreviewField` definition) and
   `renderCommitPreview`'s own leading comment both currently describe the
   *old* rationale ("pinned as the sheet's last field... restores what am I
   about to record without scrolling back up"). Both get rewritten to
   describe the new placement and the empty-state guard, in the same pass —
   leaving them as-is would misdescribe the code to the next person who
   touches this file.
5. **Docs**: `docs/specs/add-transaction-bottom-sheet.md` never documented
   the commit-preview addition in the first place (no "phase 2" section
   exists there despite code comments referencing it), so this spec is not
   amending that doc — it stands alone. `docs/CHANGELOG.md` gets a short
   entry once implemented, per repo convention.

## Behavior detail

- `renderCommitPreview()` (`src/screens/add.js`) is called from the same
  set of call sites as today (initial sheet render, every `change`/`input`
  listener that already calls it) — no new call sites needed, since hiding
  is just an added branch inside the existing function, not a new trigger.
- The hide/show check happens before building either branch's `innerHTML`:
  read `amount = parseFloat($("txAmount").value) || 0`, set
  `el.hidden = amount <= 0`, and `return` early when hidden (skip building
  markup for content that isn't shown) — matching the function's existing
  early-return-on-missing-element pattern (`if (!el) return;`).
- No change to what the preview displays once visible (icon, category/
  route text, account name, signed amount) — only when it's shown and
  where it sits in the DOM order.

## Out of scope

- Any change to what the preview displays (icon/text/amount content,
  transfer vs. non-transfer branch logic).
- Any sticky/pinned positioning — this is a plain reorder within the
  normal scrolling form.
- Desktop's full-page Add/Edit form (`renderAdd`, `!isSheet` branch) —
  it never renders `#addCommitPreview` and stays untouched.
- Any change to `addFormFieldsHtml`'s non-sheet (desktop) field order.
- Restyling `.commit-preview` itself.

## Verification

`npm run build && npm test` after the change. Live-verified in a real
browser (mobile-width, built `dist/`):

1. Opening the Add sheet fresh (not editing): preview is absent/hidden at
   first (amount empty/0), appears once a nonzero amount is typed, and sits
   above Amount, not below Note.
2. Opening the Edit sheet on an existing transaction: preview is visible
   immediately (amount already > 0) at the top of the sheet, showing that
   transaction's current category/account/amount.
3. Changing category, account, or type (including switching to Transfer)
   live-updates the preview exactly as it does today, just relocated.
4. Typing an amount down to 0 or clearing it hides the preview again;
   typing a positive amount shows it again.
5. Desktop (≥1024px) Add/Edit form is visually and behaviorally unchanged —
   no preview element present, same field order as before.
6. Both languages, both themes, no console errors.
