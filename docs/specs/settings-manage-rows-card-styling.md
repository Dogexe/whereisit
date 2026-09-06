# Spec: Grouped-card styling for Settings' Manage sub-page rows

Status: **Implemented and shipped** as `WI-015`, including two rounds of
live-review corrections — see that ticket's Review notes for the full
story (a padding-placement bug, a swipe-hover parity fix touching
`tx-row.js` too, an icon-size fix, and the Goals-treatment reversal).

## How this was found

Found during independent review of `WI-011` (sub-page chrome: hidden tab
bar + FAB), when the maintainer flagged that a Manage sub-page (e.g.
Budgets) still looks visually different from the rest of Settings, and
supplied a reference screenshot of ChatGPT's mobile Plugins screen
(grouped rounded card, section label, centered title, circular back
button).

Tracing it: `docs/specs/settings-chatgpt-style-navigation.md` and its
`WI-009` ticket (completed) restyled the Settings **root list** into
gray-labeled, rounded `.list-card` groups, but explicitly left the
Manage *data* rows inside each sub-page (Budgets/Bills/Goals/
Categories/Accounts) on their pre-existing flat divider-list styling —
deliberately, because those rows carry `WI-005`'s swipe-to-delete
gesture and `docs/specs/settings-manage-row-icons.md`'s icon-avatar
decision, and restyling them risked regressing the drag layer. That gap
was never closed. The Security sub-page is not part of this gap — it
already renders its row inside `.settings-section-label` +
`.list-card`, identically to the root list, which is why it doesn't
look out of place today.

## Goal

Close the one remaining visual gap: wrap each Manage sub-page's row
list in the same `.list-card` + `.settings-section-label` treatment the
root list and the Security sub-page already use, so every Settings
screen reads as one consistent design system. This is a **visual
consistency pass**, not an attempt to reproduce the reference
screenshot's specific look — see Decision 1.

## Decisions

0. **Goals keeps its individually-carded look when populated; only its
   empty state joins the unified card.** This decision went through two
   reversals, both confirmed live with the maintainer rather than
   guessed:
   - *v1:* Goals excluded entirely from `.manage-rows-card` — each goal
     already renders as its own individually-carded `.goal-card`, and
     wrapping the set in a second outer card looked like nesting a card
     inside a card.
   - *v2:* v1 shipped and the maintainer checked Goals live against the
     other four (now-unified) sections and confirmed it visibly "behaved
     different" — loose floating cards with gaps, unlike everything
     else's one divided list. Flattened `.goal-card` into a plain
     divider row *only inside* `.manage-rows-card` (safe because
     `.goal-card` is used nowhere else — confirmed by grep) to match.
   - *v3 (final):* v2 shipped and the maintainer's direct reaction was
     "the old one look better" — v1's separate floating cards, not v2's
     flattened unified list. Reverted v2's flattening for the *populated*
     case back to v1's bare `.insight-cards` of individually-carded
     `.goal-card`s. The one piece of v2 kept: an *empty* Goals list still
     renders inside `.manage-rows-card` (confirmed explicitly with the
     maintainer this distinction was intended), so "no goals yet" isn't
     left floating bare on the page background the way it would with a
     literal v1 revert.
   The progress bar, badge, Contribute button, and swipe-to-edit/delete
   are untouched throughout all three versions.

1. **Reuse `.list-card` / `.settings-section-label` as-is; do not adopt
   the reference screenshot's icon-in-rounded-square style.** The
   maintainer confirmed the goal is closing the gap between this app's
   own screens, not matching the reference pixel-for-pixel. This keeps
   `docs/specs/settings-manage-row-icons.md`'s circular category-color
   icon avatars untouched — no revisit of that decision.
2. **No change to row content, sizing, or swipe mechanics — except
   `.goal-card`'s own box styling, per Decision 0.** `.manage-row` /
   `.manage-row-wrap`, `manage-row-swipe.js` (`WI-015` later modified
   this file's dead hover fallback — see the swipe-and-sheet spec's own
   Correction section, unrelated to this decision), `tx-row.js`,
   `wireInlineCrud`, `renderManageSheet`, and the six `xFormHtml()`
   modules are untouched. `goalCardHtml()` itself is also untouched — the
   flattening is a pure CSS override scoped to `.manage-rows-card
   .goal-card`. `.manage-row`'s own padding (`12px 4px`) already matches
   `.toggle-row`'s — the visible gap for the other four sections is
   entirely the *missing outer card* (background/radius/shadow + the
   card's own `4px 14px` padding that `.list-card` gives every other
   grouped list in Settings), not row-level spacing.
3. **No section label is added above each Manage sub-page's row list.**
   The original version of this decision proposed repeating the section's
   own title as a `.settings-section-label` above the card, reasoning
   that the Security sub-page already ships that exact repetition. That
   reasoning was wrong: Security's `.settings-section-label` is only
   ever visible on **desktop**, where it's the pane's sole heading (no
   separate `<h2>` exists there) — a CSS rule
   (`styles.css`'s `.settings-layout[data-mobile-subpage="security"]
   [data-settings-panel="security"] > .settings-section-label { display:
   none; }`) already hides it on mobile specifically because the
   sub-page header's own title makes it redundant there. The maintainer
   flagged the redundant label live (screenshot showing "Budgets" title
   directly above a "BUDGETS" label) once this shipped for the five
   Manage sections, which don't have that suppression. Fix: don't render
   the label at all on mobile for these five sections, matching
   Security's actual (not merely apparent) behavior — the card sits
   directly below the sub-page header with no label between them.
4. **Swipe-revealed actions must clip to the card's rounded corners.**
   `.list-card` has no `overflow: hidden` today (shared by cards
   elsewhere in the app that never need it). Rather than changing the
   shared `.list-card` base rule — which would affect every card in the
   app and risks clipping something unrelated (e.g. a focus ring with
   positive `outline-offset`) — scope the clipping to a new class,
   `.manage-rows-card`, applied only to the Manage sub-page's row-list
   card, so a full swipe on the first or last row never shows a square
   edge poking past the card's curve.
5. **The card wraps only the rows, as a child of `.settings-manage-body`
   — it is not `.settings-manage-body` itself.** The first version of
   this decision put `.list-card` directly on `.settings-manage-body`.
   That element is also where the FAB-clearance bottom padding (added by
   `WI-011`, `body.settings-subpage-open .settings-manage-body {
   padding-bottom: … }`) lives, so putting the card there made that
   padding render as a large empty area *inside* the rounded card, right
   before its bottom corner — caught live by the maintainer as a
   screenshot showing a suspicious blank space. Fix: `.settings-manage-body`
   stays a plain, unstyled scroll container (as it always was); a new
   inner `<div class="list-card manage-rows-card">` wraps only the row
   list, so the FAB-clearance padding renders where it always
   should have — in the page background below the card, not inside it.
6. **The FAB (`WI-011`) is unaffected.** It's `position: fixed` and
   rendered as a sibling of `.settings-manage-body`, not a descendant of
   the row-list card, so wrapping the rows in a new card element does
   not change its position. Confirm live rather than assuming — a
   `transform` or `filter` on an ancestor would create a new containing
   block for a fixed-position descendant, though nothing in this diff
   introduces one.
7. **Sub-page headers and back buttons need no change.** The Manage
   sub-page header (`.settings-manage-header`) and the Security
   sub-page header (`.settings-security-subpage-header`) already render
   the same shape on mobile — a `.btn.btn-icon` circular back button
   plus a left-aligned title, with the icon/count hidden below 1024px.
   The perceived "header" mismatch is a side effect of the missing card
   below it, not the header itself.
8. **Manage row icon avatars are resized from 30px to the app's default
   40px.** Found live, not planned: the maintainer reported "the icon
   seem too small from normal" and asked to check every sub-page.
   Measured with `getBoundingClientRect()`: Budgets/Bills (sharing
   `categoryIconAvatar()` in `manage-row.js`), Categories, and Accounts
   all rendered their leading icon at 30×30px (the `"sm"` size class
   plus a `width="15" height="15"` glyph override) — a pre-existing
   choice from `docs/specs/settings-manage-row-icons.md`, unrelated to
   this spec until the maintainer surfaced it during this review. Every
   other icon avatar in the app (Transactions, Home, Goals) uses the
   40×40px default. Fixed by removing the size override at its three
   call sites so they fall through to the same default every other
   avatar uses — no new CSS. This revisits (does not reverse) the prior
   spec's icon *choice/color* decision, which stays exactly as-is; only
   the size changes.

## New behavior

- `src/screens/settings.js`: for Budgets, Bills, Categories, and
  Accounts, on mobile only, the row list is wrapped in a new
  `<div class="list-card manage-rows-card">` nested inside the existing
  `.settings-manage-body` (not applied to `.settings-manage-body` itself
  — see Decision 5). Goals only gets this wrapper when its list is
  empty (Decision 0); populated Goals keeps its pre-existing bare
  `.insight-cards` of individually-carded `.goal-card`s. No section
  label is added anywhere (Decision 3). Desktop markup is unchanged.
- `styles.css`: `.manage-rows-card` gets `overflow: hidden` (Decision
  4). No change to the shared `.list-card` rule (line ~197), `.manage-row`
  / `.manage-row-wrap`, or any `.manage-swipe-*` rule.
- Empty-state text (`l.noBudgets` etc.) renders inside the same card
  wrapper for all five sections.
- `manage-row.js`, `settings-accounts.js`, and `settings-categories.js`:
  the leading icon avatar drops its `"sm"` size class and glyph-size
  override (Decision 8).

## Out of scope

- The Security sub-page and the Settings root list — already consistent.
- Any change to `WI-005`'s swipe gesture, reveal math, or button
  styling.
- Any change to `docs/specs/settings-manage-row-icons.md`'s icon
  *choice*/color decision — only the size changes (Decision 8).
- Any change to `.settings-manage-header` / `.settings-security-subpage-header`
  markup or styling (Decision 6).
- Any change to `WI-011`'s FAB positioning, sizing, or behavior.
- Desktop (1024px+) — its master–detail panes are unaffected by this
  mobile-only sub-page styling gap.
- Any schema, storage, sync, or navigation/state change.

## Verification plan

Per `docs/WORKFLOW.md`'s proportional matrix this is a **Screen / UI**
change: `npm test` + `npm run test:e2e` + `npm run build`, plus real-
browser checks against a served `dist/` build at a mobile viewport, in
**both** themes:

1. Each of the five Manage sub-pages shows its row list inside a
   rounded card with a section label above it, visually matching the
   Security sub-page and root list's card treatment.
2. Swipe the **first** and **last** row of a sub-page to full reveal
   and to full-swipe-delete: confirm the action buttons stay clipped
   within the card's rounded corners at both ends, don't regress
   `WI-005`'s reveal math, sizing, or full-swipe-to-delete behavior, and
   the Undo toast still appears correctly positioned (`WI-011`).
3. Press the FAB on each of the five sub-pages: confirm it still opens
   the correct Manage sheet, positioned identically to before this
   change.
4. Confirm Categories' nested/grouped rows and Goals' card-shaped rows
   still render and swipe correctly inside the new card.
5. Confirm the empty state (a section with zero items) renders inside
   the card, not floating outside it.
6. Confirm light and dark mode both render correctly — card background,
   section label contrast, and divider lines between rows.
7. Confirm desktop (1024px+) is pixel-unchanged.
8. Complete diff inspected for unrelated changes.
