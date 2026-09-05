# Spec: swipe actions + bottom-sheet forms for Settings' Manage section

Status: **All 5 sections done and live-verified — this feature is complete.** Requested directly: "in settings make edit delete tool in swipe action like in transaction and all items in manage shall extends from bottom like add." Stages 1-4 (shared infra, Budgets, Bills+Categories, Accounts) shipped as planned; Goals (originally its own stage) needed its own implementation since `goalCardHtml` never shared `manageRowHtml`'s code path — documented under its own heading below. **A new "Revision: Apple-style actions" section (below) is specced but not yet implemented** — tracked as `docs/tickets/active/WI-005.md`.

## Goal

Settings' Manage section (Budgets, Bills, Goals, Categories, Accounts) is the one remaining place in the app that still shows Edit/Delete as always-visible icon buttons on every row, and still opens add/edit forms as an inline block that pushes the rest of the page down — both patterns this app already replaced everywhere else (Transactions' swipe-to-reveal rows from `docs/specs/swipe-to-reveal-transaction-actions.md`; the Add screen's mobile bottom sheet from `docs/specs/add-transaction-bottom-sheet.md`). The goal is consistency: Manage rows should look and behave like every other list in the app, and Manage forms should open the same way the Add form already does.

## Decisions (confirmed via interview)

1. **Mobile-only, matching both existing precedents exactly.** Below 1024px: rows swipe to reveal their actions, and add/edit forms open as a bottom sheet. At 1024px+ (the sidebar shown, Settings' own list-left/detail-right layout): completely untouched — today's always-visible icons and inline-expanding forms stay exactly as they are. This isn't a compromise; it's consistent with two things this app already does — the Add form itself only becomes a sheet below 1024px, and Transactions' own desktop dense-table view deliberately keeps actions as an always-visible column rather than hiding them behind swipe/hover, specifically because a hidden affordance reads as odd in a data-dense desktop layout. Settings' desktop panel is the same kind of dense, mouse-driven surface.
2. **Goals are in scope, but only Edit/Delete move behind swipe** — Contribute stays as an always-visible button on the goal card face, since it's the primary action on a savings goal, not housekeeping. Edit/Delete use the same generalized swipe component every other section uses.
3. **The Contribute form also moves into the shared bottom sheet** on mobile, for the same reason Edit does — it's still an expanding form, and "all items in manage extend from bottom" doesn't carve out an exception for it.
4. **The swipe component is generalized to N action buttons**, not hardcoded to 2 like `tx-row.js`'s current `REVEAL = 88`. Reveal width is computed as `20 + n × 34` (the same per-button math `tx-row.js`'s fixed 88px already implies for n=2 — `12 + 30 + 4 + 30 + 12`), so Accounts' 3 actions (Edit, Archive/Unarchive, Delete) fit without changing what Accounts can do.
5. **The whole row is the drag/tap-to-reveal surface**, not just a trailing handle the way `tx-row.js`'s amount column is. This is a deliberate difference, not an oversight: Categories rows have no trailing amount at all to serve as a handle, and no Manage row responds to a tap anywhere else today, so widening the surface to the whole row costs nothing and solves the no-amount case uniformly instead of needing a special-case grab affordance just for Categories.
6. **A new, sibling implementation** — `src/screens/manage-row-swipe.js` — rather than literally importing `tx-row.js`'s functions. The reveal is still done the same proven way (growing a real flex box's width, never an overlaying positioned layer), specifically to avoid re-hitting the exact stacking/hit-testing bugs `tx-row.js`'s own architecture notes already document from its first two revisions. But the mechanics differ enough (whole-row drag surface, variable button count) that forcing one shared function to cover both would mean threading extra parameters through transaction rows that they'd never use.
7. **One new shared sheet container**, `#manageSheetContainer`, declared once in `index.html` as a sibling of `#addSheetContainer` (outside `#screen` entirely) — not part of `renderSettings()`'s own template output. This matters: `renderSettings()` fully replaces `$("screen").innerHTML` on every re-render (an accordion toggle, a language switch, a sync pull), and if the sheet lived inside that output, opening it would get wiped by the next unrelated re-render. Keeping it as a stable external sibling is exactly why the Add sheet already works this way.
8. **One new state field**, `state.manageSheetOpen`, layered on top of the five *already-existing* per-section edit-id fields (`budgetEditId`, `billEditId`, `goalEditId`, `goalContributeId`, `categoryEditId`, `accountEditId` — six fields, since Goals has two). Those fields already say *what* is being edited; this new one says *whether* that's currently being shown as a sheet (mobile) rather than inline (desktop). No new per-section sheet-open flags are needed.
9. **Save/Cancel behavior matches every other sheet in this app exactly**: Cancel, the backdrop, the × button, and Escape all discard silently with no "unsaved changes" confirmation; Save closes the sheet and calls `renderSettings()`, mirroring the Add sheet's `onSaved` → `closeAddSheet()` → `renderScreen()` sequence.

## A key simplification found while designing this, not assumed upfront

`wireInlineCrud`/`inlineForm` and every section's own `xFormHtml()` function (`budgetFormHtml`, `billFormHtml`, `goalFormHtml`, `goalContributeFormHtml`, `categoryFormHtml`, `accountFormHtml`) are already DOM-location-agnostic — they wire their Save/Cancel buttons and field inputs by plain `document.getElementById`/`$()`, not by anything that assumes a specific parent container. That means moving their *rendered output* into `#manageSheetContainer` instead of an inline slot inside `#screen` needs **no changes to any of those six functions** — only to *where* their HTML string gets inserted, and to ensuring it's never rendered in both places at once (which would create duplicate ids and break the `getElementById` wiring both copies rely on). `renderSettings()` conditionally includes each `xFormHtml()` call inline only when `isDesktopShell()`; a new `renderManageSheet()` calls the same six functions and inserts whichever one is non-empty (each already guards on its own edit-id being null, returning `""`) into `#manageSheetContainer` when not on desktop.

## Reveal mechanism: simpler than `tx-row.js`'s, and why

`tx-row.js`'s `.tx-trail-group` has to start at exactly the amount's own natural width (measured once via `getBoundingClientRect()`) because its sibling, `.tx-lead`, is `flex:1` and needs to reclaim all the space the actions aren't using. Manage rows don't need that measurement at all: `.manage-row-content` (icon + name + sub + amount, whatever a given section has) is itself `flex:1; min-width:0`, so it already absorbs any width change by truncating its own text — the same way it already does at narrow viewports today. `.manage-row-actions-group` simply toggles between `width: 0` (closed, `overflow:hidden` so the buttons inside are unreachable and untabbable) and `width: <reveal>px` (open), with the actual reveal pixel value read from a `data-reveal` attribute the row itself carries (computed once at render time from its own button count, not hardcoded). A live drag sets this width directly during `pointermove` (identical technique to `tx-row.js`), and a CSS transition handles the settle-to-open/closed animation on release — again identical in spirit, just without needing the width-measurement step `tx-row.js` needs for its handle-based approach.

## Staged build plan

### Stage 1 — shared infrastructure, no visible change yet
- `index.html`: add `<div id="manageSheetContainer"></div>` as a sibling of `#addSheetContainer`, same doc-comment style explaining why it lives outside `#screen`.
- `src/state.js`: `manageSheetOpen: false` (UI-only, not persisted — same treatment as `addSheetOpen`).
- New `src/screens/manage-row-swipe.js`: `manageSwipeWrapHtml(id, contentHtml, actionsHtml, actionCount)` (wraps content/actions per the mechanism above, computing `data-reveal` from `actionCount`) and `wireManageRowSwipe(containerSelector)` (drag physics on the whole `.manage-row-wrap`, mirroring `tx-row.js`'s pointerdown/move/up handling and its desktop mouse-hover fallback, but without the width-measurement step).
- `src/screens/settings.js`: a new generic `openManageSheet()`/`closeManageSheet()` pair — `closeManageSheet()` resets whichever of the six edit-id-like fields is currently non-null back to null (so a later desktop-width render doesn't show a stale inline form), hides `#manageSheetContainer`'s backdrop, deactivates its focus trap, and calls `renderSettings()`. A `renderManageSheet()` that concatenates all six `xFormHtml()`/`goalContributeFormHtml()` outputs (exactly one will be non-empty at a time in practice) into the shared sheet chrome (header + × button, reusing `.filter-sheet-backdrop`/`.filter-sheet`, `createFocusTrap`, Escape-close — the identical pattern every other sheet in this app already uses).

### Stage 1 — shared infrastructure, deployed as reactive rather than imperative — done
Built mostly as planned, with one real design refinement made during implementation: rather than exporting separate `openManageSheet()`/`closeManageSheet()` functions for click handlers to call, the sheet's visibility is entirely **reactive** to state. A new `renderManageSheet()`, called once at the very end of `renderSettings()`, scans the six edit-id-like fields (`budgetEditId`, `billEditId`, `goalEditId`, `goalContributeId`, `categoryEditId`, `accountEditId`), and — below 1024px only — populates `#manageSheetContainer` with whichever one is currently set (each `xFormHtml()` already returns `""` when its own field is null, so this needed no changes to those six functions). This meant `wireInlineCrud`'s existing add/edit/cancel click handlers needed **zero changes** — they already just set state and call `renderSettings()`, exactly as they did before this spec; `renderManageSheet()` is what decides afterward whether that state change should now render as a sheet. This is a cleaner fit than the originally-planned imperative open/close pair and avoided ever needing `wireInlineCrud` to know about desktop vs. mobile at all. A second necessary correction: every section's inline form slot (`#budgetFormSlot` etc., 6 total including the per-card Contribute slot) had to be gated on `isDesktopShell()` *in this same stage*, not deferred section-by-section as originally planned — since the reactive sheet logic is shared across all 6 fields at once, leaving even one inline slot ungated would have rendered that section's form in both places simultaneously the moment its state field was set, producing duplicate ids exactly like the double-listener bug from the account-delete pass earlier this session.

**Verify (done)**: `npm run build && npm test` (136/136, unaffected). Live-verified: Settings renders identically at both widths with no section's state yet driving any visible swipe change (row markup itself wasn't touched until Stage 2).

### Stage 2 — Budgets (the pilot section) — done
`manageRowHtml()` itself (not a per-section copy) branches on `isDesktopShell()`: desktop keeps its exact original output; mobile wraps the same icon/name/sub/amount content in `manageSwipeWrapHtml()` with a 2-button (Edit, Delete) actions group. Touching the shared function once, rather than duplicating it per section and migrating callers one at a time, was a deliberate simplification over the original stage-by-stage code plan — there was no correctness reason to keep Budgets/Bills/Categories/Accounts's row-rendering code separate the way there was for the sheet-triggering logic in Stage 1.

**A real CSS bug found and fixed during live verification**: `.manage-row-wrap` was missing `display: flex` entirely — its two children (`.manage-row-content`, `.manage-row-actions-group`) stacked as separate block-level lines instead of sitting side by side, so a revealed action row rendered *below* the content on its own line rather than beside it. Caught only by swiping a row live and seeing Edit/Delete land on a second line, not by reading the CSS (`overflow: hidden` alone reads as sufficient at a glance but doesn't govern flex vs. block layout). Fixed by adding `display: flex; align-items: stretch;`. A second, related fix: `.manage-row-wrap` needed `touch-action: pan-y; user-select: none;` (the exact same properties `tx-row.js`'s own `.tx-row-inner` already carries) — without it, a mouse-drag gesture on the newly-widened whole-row drag surface (decision 5) selected text instead of committing to the swipe, confirmed by literally seeing highlighted category-name text mid-drag during testing.

**Verify (done)**: `npm run build && npm test` (136/136). Live-verified at mobile width (390px, iframe test harness): swiping a budget row (tested via both a real drag gesture and, once, a dispatched pointer-event sequence to rule out a tool-targeting artifact) correctly reveals Edit/Delete beside the content with no clipping; Edit opens the shared sheet pre-filled with the row's real category name and limit; Save updates the row and closes the sheet; Delete removes the row with the existing undo-toast flow intact. Desktop re-confirmed pixel-identical (inline form, always-visible icons, unchanged).

### Stage 3 — Bills and Categories — done
Free consequence of Stage 2's choice to modify the shared `manageRowHtml()` directly — both sections needed no code changes of their own. Categories in particular is the no-trailing-amount case (`amt` is `null`) that decision 5 (whole-row draggable) exists for.

**Verify (done)**: Live-verified at mobile width: Categories rows (no amount) swipe correctly from anywhere on the row, confirming the whole-row drag surface works without a dedicated handle; Bills rows correctly preserve their `manage-row-overdue` red-text styling through the new swipe wrapper (threaded via `manageSwipeWrapHtml`'s `contentClass` param). Both sections' desktop view re-confirmed unchanged.

### Stage 4 — Accounts — done
`accountRowHtml()` passes `actionCount: 3` (Edit, Archive/Unarchive, Delete) to `manageRowHtml()`, exercising the `20 + n×34` reveal-width formula for `n=3` (122px) for the first time.

**Verify (done)**: Live-verified at mobile width: swiping an account row reveals all 3 buttons cleanly with no clipping or overlap (confirmed via a zoomed screenshot, not just eyeballing); tapping Archive from behind the swipe correctly archives the account (toast fired, row updated) and Unarchive correctly reverses it; tapping Edit opens the shared sheet pre-filled with the account's name, opening balance, and correctly-selected icon from the icon picker. Desktop unchanged.

### Stage 5 — Goals — done
The one section that couldn't reuse `manageRowHtml()`/`manageSwipeWrapHtml()`'s default content-class wrapping as-is, since a goal card is visually its own self-contained box, not a list row with a divider. `manageSwipeWrapHtml()` gained two more optional params, `contentClass` and `wrapClass` (Goals passes `"goal-card-top-content"` and `"goal-card-swipe-wrap"`), so the swipe mechanism itself stayed the single shared implementation rather than forking a Goals-specific copy. `goalCardHtml()` wraps only the icon+name+badge in the swipe component (2-button: Edit, Delete); Contribute renders as a sibling button entirely outside the wrapper, never part of the drag surface, per decision 2. Both `goalFormHtml()` and `goalContributeFormHtml()` needed no new wiring at all — they were already two of the six fields Stage 1's `renderManageSheet()` already scans (`goalEditId`, `goalContributeId`), and the existing `data-contribute-goal` click handler already just sets `goalContributeId` and calls `renderSettings()`, exactly the same pattern every other trigger already followed.

**Verify (done)**: `npm run build && npm test` (136/136) after every change. Live-verified at mobile width: a real goal ("New Phone," ฿20,000 target) created via the sheet; Contribute (always-visible, no swipe) opened the "Add funds" sheet, added ฿500, and the card's progress bar/percentage/saved-amount all updated correctly; Edit (behind swipe) opened the same goal pre-filled; Delete (behind swipe) removed it with the undo toast. Desktop re-confirmed via a fresh goal created there: identical always-visible Contribute/Edit/Delete row, no swipe wrapper, pixel-consistent with the pre-spec layout. Both light and dark mode confirmed via the real Settings toggle (not by writing `state.dark` directly, per this project's own documented lesson about that shortcut silently no-oping against the built `dist/` bundle).

**A recurring tooling note worth recording**: the browser automation's `left_click_drag` action intermittently failed to register as a swipe specifically on the Goals card (three consecutive attempts at recomputed, verified-correct coordinates all left the row closed), while the identical technique worked reliably on Budgets/Categories/Accounts rows earlier in the same session. Isolated by dispatching a synthetic `PointerEvent` sequence directly via JS instead, which immediately succeeded and proved the drag *code* was correct — the failure was specific to that one tool call in that one nested-iframe context, not a real bug. Recorded here rather than chased further, since the live drag gesture was already independently confirmed working on four of the five sections via the exact same tool.

Full regression pass at the end of all 5 stages: `npm test` (136/136) and `npm run test:e2e` (9/9) both green.

## Revision: Apple-style circular actions + full-swipe-to-delete

Same request and interview as `docs/specs/swipe-to-reveal-transaction-actions.md`'s
own "Revision 4", **as corrected by that same file's "Revision 5"** (circular
40px actions matching the category icon, instead of Revision 4's full-height
rectangles — Revision 4's rectangle shape never shipped) — read both
sections first; this one only states what carries over unchanged and what's
different for Manage rows' N-button, whole-row-drag shape. Manage rows have
no equivalent of a "category icon avatar" of their own, so "match the
category icon" means the same fixed 40px circle Revision 5 defines for
transaction rows, for visual consistency between the two surfaces.

**Carries over unchanged from Revision 5**: 40×40px circles (`border-radius:
20px`), Delete = solid `var(--color-expense)` background + white icon, Edit
(and Accounts' Archive/Unarchive, see below) = solid `var(--color-border)`
background + `var(--color-text)` icon, icon-only (no visible label),
full-swipe fires the section's existing delete flow immediately relying on
the existing Undo toast (no new confirm step), no new collapse/exit
animation, circle-grows-into-pill-then-fills-the-row full-swipe visual as
the drag approaches the commit threshold. The whole row is already the drag
surface here (decision 5 above, predates this correction) — no change
needed for that part, unlike transaction rows which needed Revision 5 to
add it.

**Different for Manage rows**:

- **Reveal width formula updates to match the 40px circle**:
  `manageSwipeWrapHtml`'s `reveal = 20 + actionCount * 34` (the old
  30px-circle math) becomes `reveal = 20 + actionCount * 44` (`40` per
  circle + `4` gap, mirroring transaction rows' `12 + 40 + 4 + 40 + 12`
  formula's own per-circle-plus-gap shape). For the 3-action Accounts case
  (Edit, Archive/Unarchive, Delete), that's `152px`.
- **Archive/Unarchive (Accounts' third action) gets the same neutral
  treatment as Edit** — `var(--color-border)` background, `var(--color-text)`
  icon — differentiated from Edit only by its own icon, since it's not a
  destructive action and this app isn't introducing a third color for it.
- **Full-swipe commit threshold** uses the same 65%-of-row-width rule as
  transaction rows, measured against `.manage-row-wrap`'s own width (the
  whole row is already the drag surface here per decision 5 above, so no
  extra measurement step is needed beyond what `wireManageRowSwipe` already
  reads). Committing always deletes regardless of button count — Delete is
  always the last/rightmost action in every section's `actionsHtml`, so
  "the rightmost action grows to fill the swipe" and "full swipe always
  means delete" both hold the same way they do for transaction rows.
- **Goals**: only Edit/Delete sit inside the swipe wrapper (Contribute
  stays outside it, per decision 2 above, unchanged) — so Goals gets the
  2-circle case, same as transaction rows, not the 3-button case.

### Out of scope (this revision)

- Everything `docs/specs/swipe-to-reveal-transaction-actions.md`'s own
  Revision 4 and Revision 5 "Out of scope" sections already list.
- Any change to `manageSwipeWrapHtml`'s function signature beyond the
  reveal-width formula, or to `wireManageRowSwipe`'s drag-threshold logic
  beyond adding the full-swipe commit check.
- Any change to the desktop (1024px+) Settings layout — unaffected, exactly
  as every prior stage in this spec.

### Verification plan (this revision)

Same real-browser checks as the transaction-row Revision 5 verification
plan, repeated per section (Budgets, Bills, Categories, Goals at 2 buttons;
Accounts at 3 buttons), at mobile width (<1024px):

1. 40px circles render correctly for every section's actual button count,
   no clipping, correct in light and dark mode.
2. Full swipe past the 65%-of-row-width threshold deletes immediately with
   the existing Undo toast, for at least one section with 2 buttons and
   Accounts (3 buttons).
3. Releasing between the reveal point and the commit threshold snaps back
   to fully open, not closed, not deleted.
4. Desktop (1024px+) confirmed pixel-unchanged for every section.

## Explicitly out of scope

- Reordering rows via drag (this is a left-swipe-to-reveal-actions gesture only, not drag-to-reorder).
- Any change to the desktop (1024px+) Settings layout, forms, or row appearance — every decision above is scoped to below 1024px only.
- Any change to Transactions' or Home's own swipe rows (`tx-row.js` itself is untouched — this spec adds a sibling module, not a shared refactor of it).
- A first-time swipe-discovery "peek" animation for Manage rows (Transactions has one, gated on a one-time `localStorage` flag) — not requested, and Manage rows are a much lower-traffic surface than Transactions where a first-time hint matters more.
