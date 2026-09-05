# Spec: Swipe-to-reveal transaction row actions

Status: **built and verified live in the browser** (`src/screens/tx-row.js`, `src/screens/transactions.js`, `styles.css`). Applied to both Home's recent-activity rows and the Transactions screen (the open decision below was resolved: extend to Home too, since it's the same shared component and Home had no edit/delete at all before this). **Current shipped design is "Revision 2" below** — the "wipe reveal" mechanism described in "New behavior" further down (and the z-index/`pointer-events`/`min-width` fixes for its two bugs) is superseded history explaining how the design evolved, not what's in the code today. **Revision 4 was implemented and live-verified, then corrected by Revision 5 (circular buttons + whole-row drag surface, confirmed correct), then corrected by Revision 6 (whole-row content slide, confirmed correct), then Revision 7 added the circle pop-in/scale-up motion ("not bad" but needing polish), then Revision 8 made each circle's pop-in independent ("almost premium," one more fix needed), then Revision 9 fixed a scale/clip mismatch in the pop-in phase (confirmed correct, clean round dots throughout), then Revision 10 extended that same fix to the circle-to-bar growth phase plus added a small resting margin ("almost perfect," one sliver left), then Revision 11 closes that last sliver — none of this has shipped to `main` yet.** Revision 11 is the current target, tracked as `docs/tickets/active/WI-004.md`.

**Two real bugs found and fixed during verification**, neither caught by `npm run build` or by reading the code — only by actually dragging/hovering a row in a live browser (the first via `document.elementFromPoint`, the second reported directly by the user after using the built app):

1. **Clicks swallowed.** `.tx-row-inner`'s own transparent box is exactly as wide as the row, so once `.tx-trail` slides away it leaves "dead" transparent space directly over `.tx-row-actions`. Because `.tx-row-inner` comes after `.tx-row-actions` in DOM order and neither had a z-index that out-ranked the other for stacking purposes, `.tx-row-inner`'s own (invisible) box won hit-testing there and silently swallowed every click on the revealed Edit/Delete buttons — the buttons were visible but not clickable. Fixed with `pointer-events: none` on `.tx-row-inner` and `pointer-events: auto` on its `.tx-lead`/`.tx-trail` children, so clicks fall through the empty space to the actions panel underneath.
2. **Edit icon's circle visibly clipped.** `.tx-lead` (flex:1) and `.tx-trail` (flex-shrink:0, width = however wide the amount text is) always split 100% of the row's width. For a short amount like "−฿75.00", trail's natural width (~69px) was *narrower* than the 88px `.tx-row-actions` needs — so `.tx-lead`'s box (which sits on top via z-index so it can never be covered) extended a few pixels into the actions zone and painted its opaque background over the left edge of the Edit button, clipping its circle into a flat-edged shape. The Delete button, being further right, was never reached and looked fine — which is exactly why only the pencil looked broken. Fixed by giving `.tx-trail` `min-width: 88px` (matching `.tx-row-actions`'s full width) plus `justify-content: flex-end` so the amount stays flush right; flexbox then automatically shrinks `.tx-lead` to leave the full 88px free, regardless of how short the amount text is.

Confirmed both fixes via a real hover → click → edit-form-opens flow and hover → click → delete flow on both screens, plus measuring the actual DOM rects (`lead.right` vs `actions.left`) for both a short amount ("−฿75.00") and a long one ("+฿125,000.00") to make sure the fix holds regardless of amount length.

## Revision 2: amount slides alongside the buttons, not behind them

**Built and verified live** (`src/screens/tx-row.js`, `styles.css`). Confirmed by measuring actual DOM rects (not just eyeballing) for both a short amount ("−฿75.00") and a long one ("+฿125,000.00"): `.tx-lead`'s right edge never crosses into the amount's box in either case, and the gap between the amount and the Edit button is a tight 12px (matches the app's existing row-internal spacing rhythm) — tuned down from an initial 16px which read as too loose to look like "one block." Also re-verified: click-through to `editTx`/`deleteTx` still works (trivially now, since the buttons are plain flow elements, not fighting any positioning trick), the one-row-open-at-a-time invariant, and dark mode.

The two bugs above were both symptoms of the same underlying design: `.tx-row-actions` was a *static* panel, permanently sitting at its final position, revealed only by `.tx-trail` (the amount) sliding away to uncover it — a "wipe" reveal. That shape of interaction is what needed a z-index fight (which layer paints on top), a `pointer-events` override (clicks falling through empty space), and a `min-width` reservation (stopping `.tx-lead` from encroaching) to get right.

Per feedback, the amount should instead **stay visible and slide left together with the buttons, as one physically joined block** — not disappear behind anything. Confirmed: fully open, the amount sits flush against the Edit button, both buttons flush at the row's right edge, all three sliding as a single unit.

**This turned out to eliminate the workarounds rather than need new ones.** `.tx-trail` (amount) and `.tx-row-actions` (Edit/Delete) merge into one flex item, `.tx-trail-group`, containing `[amount][edit][delete]` inline, sized naturally (no `min-width` hack needed). Two transform states:
- **Closed**: `translateX(+88px)` — shifts the whole group right by exactly the actions' width, so the actions portion sits clipped off-canvas past the row's right edge (hidden by `.tx-row-wrap`'s existing `overflow: hidden`, no `pointer-events` trick needed — content clipped by `overflow: hidden` isn't hit-testable either), while the amount lands flush at the row's right edge — the same rest appearance as before.
- **Open**: `translateX(0)` — the group's natural flex position, immediately after `.tx-lead`, with amount+buttons all visible flush together.

Because `.tx-lead` has `flex: 1` and `.tx-trail-group` has `flex-shrink: 0`, `.tx-lead`'s box is always exactly `rowWidth - (amountWidth + 88px)` — constant, regardless of transform, since transform never affects flex layout. The group's transform only ever shifts it *right* of that natural position (closed) or *to* it (open) — it can never move left of `.tx-lead`'s edge, so overlap with `.tx-lead` is now structurally impossible rather than something to guard against. `.tx-lead` no longer needs an explicit `z-index` or `pointer-events: auto`, and `.tx-row-inner` no longer needs `pointer-events: none` — none of that machinery has anything left to do.

Drag and hover mechanics are unchanged in spirit — 50% snap threshold, hover-to-reveal on desktop, one row open at a time — just remapped from the old `[-88, 0]` range to the new `[0, +88]` range (closed and open swapped ends).

## Revision 3: category/note get full width at rest, only squeeze while open

**Built and verified live** (`src/screens/tx-row.js`, `styles.css`). Per feedback: Edit/Delete should stay hidden at rest (already true), and category/note should show as much text as the row actually has room for at rest, only shrinking to make room *while the row is being swiped open* — not all the time. Measured the gap directly: `.tx-lead`'s width was **identical** in both open and closed states (428.8px either way, confirmed via `getBoundingClientRect()`), because Revision 2's `translateX` reveal doesn't touch layout at all — `.tx-lead`'s flex-basis is always `rowWidth - (amountWidth + 88px)`, permanently reserving room for the buttons even when they're not shown. Harmless on a wide desktop test window; on an actual phone-width row, reserving 88px of a ~350px-wide row that isn't even displaying anything there is a meaningfully bigger, avoidable bite out of the category/note space.

**Fix: switch the reveal mechanism from sliding (`transform`) to expanding (`width`)**, a deliberate trade-off against the earlier "transform-only, no layout animation" rule (see Revision 1/2 above and the swipe-to-reveal build notes) — accepted here because getting "full text at rest" right matters more than staying purely compositor-driven for this one property, and the element being resized is a single small flex item, not the page.
- `.tx-trail-group` no longer transforms. Its `width` is set directly (in JS, `wireTxRowActions` measures each row's amount's natural width once via `getBoundingClientRect()` and stores it in `dataset.trailWidth`) and animated via `transition: width 240ms ...`. Closed = the amount's natural width (no reserved space at all); open = that plus `REVEAL` (88px).
- `overflow: hidden` on `.tx-trail-group` itself (not just `.tx-row-wrap`) clips Edit/Delete whenever the group is narrower than its full content — so at rest, closed, they're genuinely zero-width-visible and non-interactive, no separate hit-testing concern.
- `.tx-trail` and `.tx-row-actions` (the group's two children) both need `flex-shrink: 0` — without it, a default flex item would *squish* to fit the group's changing width instead of being cleanly clipped by its `overflow: hidden`, which would visibly compress the amount text or the buttons rather than just hiding part of them.
- Because `.tx-lead` is `flex: 1` and the group's width now genuinely shrinks to just the amount at rest, `.tx-lead` automatically reclaims that space — and automatically gives it back, frame by frame, as the group's width transitions back open. This is what produces the "squeeze" — it's a direct, unavoidable consequence of the flex algorithm re-running as the sibling's width animates, not separate code.

**This surfaced a second, unrelated real bug**, found only by measuring rather than eyeballing: setting an explicit, growing `width` on `.tx-trail-group` made the *entire page* grow horizontally while a row was open (confirmed: `.tx-row-wrap`, `.list-card`, and `document.body.scrollWidth` all grew by exactly the same 88px `.tx-trail-group` grew by). Root cause: `.home-columns`'s desktop grid (`@media (min-width: 880px)`) used bare `grid-template-columns: 1.4fr 1fr`. A bare `Nfr` track's minimum size defaults to `auto` (based on its content's min-content size) — so a wide descendant anywhere inside that column can push the whole grid track, and everything depending on it, wider instead of the column's content shrinking to fit. `transform`-based changes never trigger this (transform doesn't participate in min-content/layout calculations at all), which is exactly why Revision 2 never hit it. **Fixed at the root** by changing every bare `Nfr` desktop grid column in `styles.css` to `minmax(0, Nfr)` (`.home-columns`, `.breakdown-columns`, `.insight-cards`) — a general CSS Grid correctness fix, not a swipe-row-specific patch, since the same blowout could otherwise be triggered by something as ordinary as a long unwrapped string anywhere in those columns.

Verified live: measured `.tx-lead`'s width shrinking by exactly 88px between closed and open (previously 0px difference), confirmed the page/card width no longer changes when a row opens, and visually confirmed with a long note that (a) it renders in full, unwrapped-more-than-necessary at rest, (b) it visibly re-wraps to fewer available characters per line only while the row is open, and (c) the row's own height stays stable across both states for a note that happens to wrap the same number of lines either way (not exhaustively tested for a note right at the line-count boundary, where opening could in principle add a wrapped line and change row height abruptly, since only `width` is transitioned, not `height`).

## Revision 4: Apple-style colored full-height actions + full-swipe-to-delete

**Requested directly**: make the swipe actions look and feel more like iOS's
native swipe actions (Mail, Reminders, Messages) instead of small neutral
circular icon buttons floating in a revealed strip.

Clarified via interview:

1. **Both visual restyle and the full-swipe-to-delete gesture** are in
   scope — not visual-only, and not gesture-only.
2. **Icon only, no visible text label** inside the buttons (kept consistent
   with this app's existing icon-only `.btn-icon` convention; only the
   `aria-label` carries the text, as today).
3. **Full-swipe-to-delete fires the delete immediately** and relies on the
   existing act-then-undo pattern (`deleteTx` in `src/screens/add.js`
   already deletes with no `confirm()` dialog and shows a 4s Undo toast) —
   this app has no `confirm()` dialog anywhere by established convention,
   so full-swipe shouldn't introduce the app's first one.
4. Applies identically to both Home's recent-activity rows and the
   Transactions screen (same shared `tx-row.js` component), and this same
   visual language is applied to Settings' Manage rows too — see the
   corresponding new revision in
   `docs/specs/settings-manage-swipe-and-sheet.md`, which reuses the colors
   and full-swipe math defined here rather than re-deriving them.

### Visual: full-height colored rectangles, not small circles

- Edit and Delete stop being 30px circular `.btn-icon` buttons sitting in a
  padded strip. Each becomes a full-height rectangle (`align-self: stretch`
  so it fills `.tx-row-wrap`'s full row height) filling a fixed-width slot,
  laid out edge-to-edge with no gap between them or against the row's right
  edge — matching iOS's look of the action(s) being one continuous colored
  block, not separated pills.
- **Colors reuse existing tokens, no new colors introduced**: Delete uses
  `var(--color-expense)` background with a white icon (`#fff`) — identical
  treatment to this app's existing `.btn-danger`. Edit uses
  `var(--color-border)` background with `var(--color-text)` icon — a
  neutral gray, deliberately *not* `var(--color-accent)` (this app's accent
  is itself a warm orange/red, close enough in hue to `--color-expense`
  that reusing it for Edit would read as a second "danger-ish" color next
  to the real danger button).
- Each button gets `border-radius: var(--radius-md)` (matches this app's
  general button/input rounding) on its own box. Because `.tx-row-wrap`
  sits inside `.list-card`'s own `14px` horizontal padding, the revealed
  buttons never actually reach the card's own rounded outer edge — so each
  button is treated as its own independent rounded rectangle rather than
  only rounding the outermost corners to fake a flush card edge.
- Per-button width increases from the current cramped circle-in-padding
  layout to a fixed **64px** per action (wide enough for a centered icon
  with real breathing room, closer to iOS's action width). New
  `REVEAL = 128` (2 × 64, no gaps) replaces the current `REVEAL = 88`.
- Hover-state color shifts for the two buttons are explicitly **not**
  required for this pass (out of scope below) — the row's own reveal
  animation already communicates interactivity on desktop hover.

### Gesture: full-swipe-to-delete

- Once a row is dragged open past `REVEAL` (both buttons fully visible),
  continuing to drag further grows the Delete button (the rightmost/last
  action) to visually fill the entire additionally-revealed width, visually
  covering/replacing Edit — the same "committing to delete" affordance iOS
  uses. Edit becomes unreachable once this growth starts (matches iOS: you
  cannot tap a secondary action while mid-way into a full swipe).
- **Commit threshold**: measured against the row's own width (`.tx-row-wrap`'s
  `getBoundingClientRect().width`, measured once the same way
  `wireTxRowActions` already measures `naturalWidth`) — dragging past **65%**
  of the row's total width and releasing there commits to delete
  immediately. Below that threshold on release, the row settles back to
  the normal open (`REVEAL`) or closed state exactly as it does today (the
  existing 50%-of-`REVEAL` snap logic is unchanged for that shorter range).
- Committing calls the existing `deleteTx(id)` unchanged — no new
  confirmation step, no new deletion code path. The row disappears the same
  way it already does today when Delete is tapped directly (the list
  re-renders via `renderScreen()` inside `deleteTx`); **no new collapse/exit
  animation is being added for the full-swipe case** — building a
  coordinated "row collapses, then the list re-renders" animation across a
  full list re-render is a real architecture change this pass isn't
  requesting, and the plain instant removal already matches how every
  other delete in this app behaves today.
- Releasing anywhere past `REVEAL` but below the 65% commit threshold just
  snaps back to the fully-open (`REVEAL`) position, not closed — matching
  the existing "once past 50% snap open" behavior, now with an added
  further commit zone past it.

### Out of scope (this revision)

- No visible text labels inside the buttons (icon-only, per the interview
  decision above).
- No hover-color change for Edit/Delete specifically (existing row-level
  hover-to-reveal on desktop is unchanged and still sufficient).
- No collapse/exit animation when a row is removed (full-swipe or tap —
  both already behave this way today).
- No change to `editTx`/`deleteTx` logic, to the Undo toast, or to the
  one-row-open-at-a-time invariant.
- No change to Settings' Manage rows in this file's ticket — tracked as its
  own ticket against `docs/specs/settings-manage-swipe-and-sheet.md`'s
  corresponding new revision, reusing this revision's colors/thresholds.

### Verification plan (this revision)

After implementing, `npm run build`, serve `dist/`, then in a real browser:

1. Drag a row open to `REVEAL` (128px) and confirm both buttons render as
   full-height colored rectangles (red Delete, gray Edit), no visible
   circular button shape remaining, correct in both light and dark mode.
2. Continue dragging past `REVEAL` and confirm Delete visually grows to
   cover the additional revealed width and Edit becomes unreachable.
3. Release past the 65%-of-row-width commit point and confirm the
   transaction is deleted immediately with the existing Undo toast shown,
   and that Undo correctly restores it.
4. Release between `REVEAL` and the commit point and confirm the row snaps
   back to the fully-open (not closed, not deleted) position.
5. Confirm normal open/close dragging below `REVEAL`, hover-to-reveal on
   desktop, and the one-row-open-at-a-time invariant are all unaffected.
6. Confirm tapping Edit/Delete directly (no full swipe) still works exactly
   as before.

## Revision 5: whole-row drag surface + circular actions matching the category icon

**Requested directly, after live-checking Revision 4**: two corrections —
(1) on mobile, the drag-to-swipe gesture should work from anywhere on the
row's content, not just the amount; (2) the full-height rectangle buttons
read as too large — they should be circular and sized to match the
category icon avatar (`.icon-avatar`, 40px), not the 64px rectangles.

Clarified via interview:

1. **Circle color treatment stays solid**, not the category icons' own
   soft-tint style: Delete stays a solid `var(--color-expense)` circle with
   a white icon; Edit stays a solid `var(--color-border)` circle with a
   `var(--color-text)` icon. Only the shape/size changes (rectangle → 40px
   circle to match `.icon-avatar`), not the color treatment established in
   Revision 4.
2. **Full-swipe growth**: since a fixed 40px circle can't "fill the row" the
   way a full-height rectangle did, Delete's circle grows into a pill (same
   40px height, widening) as the drag continues past the normal-open point,
   then grows to fill the row's full width **and** height as the drag
   approaches the 65%-of-row-width commit threshold from Revision 4 —
   ending as a full-bleed bar right around the point delete actually
   commits, so the "about to delete" affordance still reads clearly even
   though it starts from a small circle. Edit still fades out once the
   drag passes the normal-open (`REVEAL`) point, same as Revision 4.
3. **The 65%-of-row-width commit threshold, immediate-delete-with-Undo
   behavior, snap-back-to-open when released between `REVEAL` and the
   commit point, and every other Revision 4 gesture rule are unchanged** —
   only the buttons' resting shape/size and the drag surface change in this
   revision.
4. **Same corrections apply to Settings' Manage rows** — see the matching
   revision in `docs/specs/settings-manage-swipe-and-sheet.md`.

### Whole-row drag surface

- The drag handle moves from `.tx-trail` (the amount only) to the whole
  `.tx-row-wrap`, mirroring `manage-row-swipe.js`'s existing whole-row-drag
  pattern exactly (`docs/specs/settings-manage-swipe-and-sheet.md`'s
  decision 5): a `pointerdown` that originates inside `.tx-row-actions`
  (an Edit/Delete tap) is excluded from starting a drag, so button taps
  keep working as plain clicks.
- Reuse the same fix `manage-row-swipe.js`'s own build already needed for
  exactly this change: `touch-action: pan-y; user-select: none;` on the
  drag surface — without it, a mouse-drag gesture on a widened whole-row
  surface selects text instead of committing to the swipe (confirmed the
  hard way during that earlier build; see that spec's Stage 2 notes).
- Hover-to-reveal on desktop already listens on `rowEl` (the whole row),
  not `.tx-trail` specifically, so no change needed there.

### Circular actions matching the category icon

- Edit and Delete become fixed 40×40px circles (`border-radius: 20px`,
  matching `.icon-avatar`'s own sizing convention), vertically centered in
  the row rather than stretched to its full height.
- `REVEAL` is recomputed for the new circle size using the same padding/gap
  formula the original (pre-Revision-4) 30px circles used —
  `12 + 40 + 4 + 40 + 12 = 108` — replacing Revision 4's `128`.
- Icon-only, no visible label — unchanged from Revision 4.

### Out of scope (this revision)

- Everything Revision 4's own "Out of scope" section already lists.
- Any change to the delete-commit math itself (still 65% of `.tx-row-wrap`'s
  own width) or to `deleteTx`/the Undo toast.

### Verification plan (this revision)

Same real-browser checks as Revision 4's verification plan, plus:

1. Confirm a drag started anywhere on the row's content (icon, category
   name, note — not just the amount) opens/closes/full-swipes it correctly.
2. Confirm Edit/Delete remain plain, undragged taps (starting a drag from
   on top of either button must not happen).
3. Confirm Edit and Delete render as 40px circles at rest, matching the
   category icon avatar's size, in both light and dark mode.
4. Confirm the full-swipe growth reads as circle → pill → full-row-filling
   bar as the drag approaches the commit threshold, and that releasing
   before commit shrinks it back to the resting circle pair.

## Revision 6: the whole row slides together, not just the amount

**Requested directly, with a reference screenshot** (an iOS Mail-style
swipeable list: the entire row — leading avatar, title, and message text —
visibly shifts left as one block and is clipped at the row's own left edge,
revealing flag/delete actions on the right; the leading content is not
squeezed/re-wrapped, it's genuinely cut off by the row's own edge). The
maintainer confirmed Revision 5's circular buttons and growth animation are
correct and should not change — only the swipe mechanic itself needs to move
the entire row's content together, not just `.tx-trail-group` (amount +
actions).

### Why this isn't just "turn Revision 3's squeeze into a slide"

Revisions 2–3 deliberately chose to grow `.tx-trail-group`'s own `width`
(shrinking `.tx-lead` via flexbox) specifically *instead of* sliding
content, because an earlier "wipe reveal" design (`.tx-row-actions` sitting
as a static panel, revealed only by a narrower sibling sliding away) caused
two real bugs — documented in this file's history above and in `CLAUDE.md`'s
"Standing CSS/layout lessons" — both root-caused to the same shape: a
*wider, untransformed parent* (`.tx-row-inner`) staying in place over the
actions zone while only a *narrower child* (`.tx-trail`) moved, leaving dead
transparent space that swallowed clicks, and a static width mismatch that
let `.tx-lead` visually encroach into the actions area.

This revision reintroduces a sliding/translating design, but **must avoid
recreating that exact shape**: `.tx-row-inner` (containing both `.tx-lead`
and `.tx-trail-group` — i.e. everything except `.tx-row-actions`) becomes
the thing that translates, as **one single unit**, via
`transform: translateX(-offset)`. Because a CSS transform moves an
element's actual hit-testing box along with its paint, not just its visual
appearance, there is no leftover untransformed parent sitting on top of the
revealed area the way Revision 1's bug had — the whole content box
genuinely moves out of the way, both visually and for click purposes. Pull
`.tx-row-actions` out from inside `.tx-trail-group` to be a sibling of
`.tx-row-inner` directly inside `.tx-row-wrap`, absolutely positioned at
the row's right edge, sitting behind `.tx-row-inner` in stacking order
(`.tx-row-inner` needs its own opaque background so it isn't visible
through it before the slide reveals it) — `.tx-row-wrap`'s existing
`overflow: hidden` clips the leading edge as content slides away, exactly
matching the reference image.

### What changes from Revision 5

- `.tx-row-inner` translates left by the same `offset` value the drag/
  full-swipe logic already tracks (reusing all of Revision 4/5's math
  unchanged: `REVEAL = 108`, 50%-of-`REVEAL` snap, 65%-of-row-width commit
  threshold, the circle → pill → full-row-bar growth for Delete). At rest
  (`offset = 0`), `translateX(0)` — pixel-identical to today, no reserved
  space, no change in resting layout.
- `.tx-row-actions` (the Edit/Delete circles) moves out of `.tx-trail-group`
  to be a plain positioned sibling of `.tx-row-inner`. The circle → pill →
  full-row-bar growth math should now be computed relative to
  `.tx-row-wrap`'s own box (which `wireTxRowActions` already measures into
  `dataset.rowWidth`/`dataset.rowHeight`) rather than `.tx-trail-group`'s,
  since it's no longer nested inside the thing that used to grow.
- `.tx-trail-group` no longer needs its own width-growth mechanism — the
  translate now does the reveal job Revision 3's width growth used to do.
  Whether `.tx-trail-group` survives as a plain wrapper or gets flattened
  away is an implementation detail, as long as the amount stays visually
  joined to the rest of the row's content (per Revision 2's original
  reasoning: it should never look like it's a separate thing from the
  icon/category/note — it just all moves together now).
- Text no longer needs to squeeze/re-wrap while opening (Revision 3's
  specific concern) — since content now slides as a rigid block instead of
  the lead shrinking, there's nothing to re-wrap; this is an accepted,
  intended consequence of matching the reference image, not a regression.

### Unchanged

Drag physics (whole-row surface, `touch-action`/`user-select` fix), `REVEAL`
value, the 65%-of-row-width commit threshold and immediate delete + Undo,
snap-back-to-open between `REVEAL` and the commit point, circle color
treatment and 40px sizing, icon-only buttons, hover-to-reveal on desktop,
one-row-open-at-a-time, applying identically to Home and Transactions.

### Verification plan (this revision)

Same real-browser checks as Revision 5's plan, plus — **critically, since
this reintroduces the shape of design that caused real bugs before** — a
live click-through check, not just a visual check: with a row dragged open
(not just visually inspected, actually opened via a real drag/click),
confirm a click on the now-revealed Edit and Delete circles/bar actually
fires `editTx`/`deleteTx` and isn't swallowed by dead space from
`.tx-row-inner`. Also confirm the icon avatar visibly clips at the row's
left edge as the row opens (matching the reference image), and that it's
never possible to see a gap or double-rendered sliver between the sliding
content and the revealed actions at any drag position.

## Revision 7: circles pop in and scale up as the row first opens

**Requested directly, with a reference video** (an iPad Mail-style swipe:
dragging a row open reveals its action circles as small dots that visibly
grow/pop up to their full size as the drag continues, rather than being
static circles that are merely uncovered at fixed size). The maintainer
confirmed Revision 6's whole-row slide is correct; this revision only adds
motion to how the circles themselves enter, layering on top of everything
already built.

Watched frame-by-frame: at the very start of the drag, the revealed circle
is a small dot, clearly smaller than its resting 40px size; a few frames
later (still within the initial open range, well before any commit
threshold) it has grown to its full resting circle size. This confirms the
circles scale up *with drag progress during the initial `0 → REVEAL` range*
— they don't just get clipped-open at a fixed size the way they do today.
Revision 5/6's later circle → pill → full-row-bar growth (during the
`REVEAL → commit threshold` range) is unaffected and already matches the
reference's later frames, where the non-primary circles shrink away while
the primary one keeps expanding.

### What changes

- During the `0 → REVEAL` portion of the drag (before Revision 5's
  circle-to-pill growth even starts), both Edit and Delete circles scale
  from a small size up to their full 40px resting size, tracking drag
  progress (`offset / REVEAL`, clamped `[0, 1]`) — e.g. `transform: scale()`
  on each `.tx-swipe-action`, driven the same way `deleteButton`'s
  width/height are already driven by JS in `setRevealOffset`. A small
  starting scale (not literally 0 — a `0`-scale circle has no width for
  drag-progress math to key off of comfortably; something in the range of
  `0.3–0.4` read well in the reference) growing to `1` by the time
  `offset` reaches `REVEAL` is the target feel.
- This must feel like one continuous motion together with Revision 5's
  existing `REVEAL → commit` growth, not two disconnected animations
  stitched together — the circle should read as continuously growing the
  entire time the row is being dragged open, from "just barely visible" all
  the way to "full-row delete bar" at commit, matching the reference video.
- Snapping open via a tap/hover (not a drag-in-progress) should still land
  the circles at their full resting scale immediately (or with the row's
  existing settle transition) — this revision is about the *drag-tracking*
  phase reading smoothly, not about slowing down the tap-to-open case.
- Releasing before `REVEAL` (row settles closed) should shrink the circles
  back down smoothly as part of the same close transition, not disappear
  abruptly.

### Unchanged

Everything else from Revisions 4-6: `REVEAL = 108`, the 65%-of-row-width
commit threshold and immediate delete + Undo, whole-row drag surface and
translate mechanic, circle colors/40px resting size, icon-only buttons,
hover-to-reveal on desktop, one-row-open-at-a-time, applying identically to
Home and Transactions.

### Verification plan (this revision)

Real-browser check: drag a row open slowly and confirm the circles visibly
grow from small to full size as the drag progresses through `0 → REVEAL`
(not appear at fixed size), confirm the growth reads as one continuous
motion into Revision 5's existing pill/full-row-bar growth past `REVEAL`,
confirm tapping/hovering to open still lands at full resting size, and
confirm releasing before `REVEAL` shrinks the circles back down smoothly
rather than cutting them off abruptly. Confirm in both light and dark mode.

## Revision 8: each circle pops in independently, gated by its own position

**Requested directly, after live-checking Revision 7**: "each button should
behave separately and not show its full size until the row's edge has
moved past it — I don't want them to overlap, it doesn't feel premium."
The maintainer confirmed Revision 7's overall approach (pop-in + continuous
growth into the pill/bar) isn't bad, just needs this one polish pass.

### Root cause of the "not premium" feeling

Revision 7's `setRevealOffset` scales **both** circles together from one
shared `openProgress = offset / REVEAL` value. But `.tx-row-actions` sits
*behind* `.tx-row-inner` (Revision 6), so a given circle is only actually
visible once the sliding content has uncovered its specific position — and
Edit (further from the row's right edge than Delete) only becomes visible
well after `offset` has already climbed past roughly half of `REVEAL`. The
practical effect: Edit's scale has been silently climbing the whole time it
was still hidden, so the instant it's finally uncovered it's already most of
the way to full size — it doesn't read as popping in small and growing, it
reads as appearing abruptly at a mismatched size. That mismatch between
"when a circle becomes visible" and "what scale it's rendered at" is the
concrete cause of the reported feeling, not a literal bounding-box overlap
(the two circles' flex layout boxes never actually intersect).

### Fix: gate each circle's scale to its own reveal window

Compute each circle's own local reveal-progress from **its own position**
within the fixed-width `.tx-row-actions` box, relative to how much of the
row `.tx-row-inner`'s translate has actually uncovered — not the shared
`offset / REVEAL` value. Concretely, with the current layout (`12px`
padding, `40px` circle, `4px` gap, `40px` circle, `12px` padding = the
`108px` `REVEAL`) and Delete being the rightmost (closest-to-edge) circle:

- **Delete** occupies the row's rightmost `12–52px` (measuring inward from
  the row's right edge). Its own local progress is
  `(offset - 12) / (52 - 12)`, clamped to `[0, 1]` — it starts popping in
  almost immediately and finishes well before `REVEAL`.
- **Edit** occupies `56–96px` from the right edge. Its own local progress
  is `(offset - 56) / (96 - 56)`, clamped to `[0, 1]` — it stays at its
  smallest scale (invisible anyway, still covered by `.tx-row-inner`) until
  the row's edge genuinely reaches it, then pops in and grows to full size
  on its own, finishing just before `REVEAL`.
- Each circle's scale is `INITIAL_ACTION_SCALE + (1 - INITIAL_ACTION_SCALE)
  * thatCircle'sOwnLocalProgress` — same formula as Revision 7, just keyed
  per-button instead of shared.
- Deriving these numbers from each button's own measured position within
  `.tx-row-actions` (rather than hardcoding a second copy of the
  padding/gap arithmetic `REVEAL` already encodes) is preferable if it's
  not meaningfully more code — avoids the two needing to be kept in sync by
  hand — but hardcoding is acceptable if simpler; either way the *effect*
  (a button's scale only moves once its own slot starts being uncovered)
  is what matters, not the specific mechanism.
- Because both circles' local reveal windows end well before `offset`
  reaches `REVEAL` (52 and 96, both < 108), there's still no visible jump
  where Revision 7's `REVEAL → commit` pill/bar growth takes over — Delete
  is already sitting at a settled `scale(1)` well before that phase begins.

### Unchanged

Everything else from Revisions 4–7: the `REVEAL → commit` circle-to-pill-
to-bar growth, the 65%-of-row-width commit threshold and immediate delete +
Undo, whole-row drag surface, `.tx-row-inner` translate mechanic, circle
colors/40px resting size, instant full-scale on tap/hover-open and smooth
shrink on releasing before `REVEAL`, icon-only buttons, one-row-open-at-a-
time, applying identically to Home and Transactions, and the desktop
dense-table view's static (unscaled) actions column.

### Verification plan (this revision)

Real-browser check: drag a row open slowly and confirm Delete visibly pops
in and finishes growing to full size distinctly *before* Edit even starts
appearing — a genuine staggered, sequential cascade, not two circles
growing in lockstep. Confirm neither circle ever appears to jump straight
to a partial size the instant it becomes visible. Confirm the `REVEAL →
commit` growth still continues smoothly with no jump at the boundary, and
that tap/hover-open, release-before-`REVEAL` shrink, and the desktop
dense-table view are all still correct. Confirm light and dark mode.

## Revision 9: a circle must never render larger than its available space

**Requested directly, after live-checking Revision 8**: "almost premium —
can you adjust the logic so the icon only shows full size when the space
is sufficient?" (maintainer's own words, technical term unspecified).
Claude verified this live before writing the fix rather than guessing what
"space is sufficient" meant: served a build, dragged a row open in small
increments via Playwright, and screenshotted the actions area zoomed in at
each step. **The screenshots show the exact defect**: partway through a
circle's reveal window, it doesn't render as a small, cleanly-round dot —
it renders as a **flat-edge "D" shape**, a disc that's been sliced by a
straight vertical line. That's `.tx-row-inner`'s opaque covering correctly
doing its job (Revision 6), but only because Revision 8's scale is, at that
moment, larger than the space actually uncovered so far — so the circle's
far edge pokes past the reveal boundary and gets visibly chopped flat by
the covering layer, instead of the circle itself simply being small.

### Root cause

Revision 8's scale formula is
`INITIAL_ACTION_SCALE + (1 - INITIAL_ACTION_SCALE) * localProgress` (a
`0.3–0.4` floor, growing to `1`), applied via `transform: scale()`, which
by CSS default scales around the element's **center**. Two compounding
problems:

1. **The floor itself**: the instant a button's `revealStart` threshold is
   crossed, `localProgress = 0`, but the scale is already `~0.35` — even
   though essentially zero space has actually been uncovered yet. A
   `0.35`-scale 40px circle (14px) immediately has nowhere near enough
   revealed room to sit in without being clipped.
2. **Center-anchored scaling**: even without the floor, a center-anchored
   circle scaled to fraction `s` extends `20s` px in *both* directions from
   its fixed center — including into the not-yet-revealed side — rather
   than growing outward only from the edge where revealed space is actually
   opening up.

### Fix

Make the rendered circle's far edge track the reveal boundary **exactly**,
so it can never extend past the space that's actually available:

- Drop the `INITIAL_ACTION_SCALE` floor for this calculation — use
  `localProgress` (`(offset - revealStart) / (revealEnd - revealStart)`,
  clamped `[0, 1]`) directly as the scale factor. At `revealStart`, scale is
  `0`; at `revealEnd`, scale is `1`. (The constant may still be dead-coded
  elsewhere or removed entirely — this revision just stops using it here.)
- Set `transform-origin` on `.tx-swipe-action` to the edge closest to the
  row's right edge (`right center` / `100% 50%`) instead of the CSS
  default center. Because reveal always progresses right-to-left across
  the whole `.tx-row-actions` area, this is *each* button's own right
  edge, for both Edit and Delete — verify this against the actual DOM
  order/flex layout rather than assuming, but it should hold for both.
- With scale driven by unmodified `localProgress` and the origin anchored
  at the near edge, the rendered circle's far edge lands at exactly
  `revealStart + (revealEnd - revealStart) * localProgress`, which — by
  construction — equals `offset` (the current reveal boundary) at every
  point in between. The circle's own edge and the reveal boundary
  coincide, so there is no longer a gap for `.tx-row-inner`'s opaque
  covering to visibly chop flat.
- This produces a circle whose *visible portion* grows smoothly and always
  reads as a clean, appropriately-sized dot — never a sliced/flat-edged
  shape — reaching true full size exactly when its slot is fully uncovered,
  which is the literal meaning of "only full size when space is sufficient."

### Unchanged

Everything else from Revisions 4–8: the per-button independent reveal
windows (Revision 8), `REVEAL → commit` circle-to-pill-to-bar growth,
commit threshold and immediate delete + Undo, whole-row drag surface,
`.tx-row-inner` translate mechanic, circle colors/40px resting size,
instant full-scale on tap/hover-open, icon-only buttons, one-row-open-at-
a-time, desktop dense-table view's static (unscaled) actions column.

### Verification plan (this revision)

Real-browser check, the same way this defect was originally caught: drag a
row open in small increments and screenshot/inspect the actions area
zoomed in at each step. Confirm neither circle ever shows a flat/chopped
edge at any point during the drag — each should read as a small, cleanly-
round dot that grows smoothly to full size, never a partially-sliced disc.
Confirm the staggered Delete-then-Edit cascade from Revision 8 still holds,
the `REVEAL → commit` growth still continues with no jump, and light/dark
mode are both correct.

## Revision 10: the efficient-space rule extended to the full bar, plus a small resting margin

**Requested directly, after live-checking Revision 9**: "when the delete
button scales up it should follow the efficient space rule too, this one
somehow feels inconsistent" — plus "add a little space between row margin
and expanding button too." The maintainer confirmed the pop-in phase
(Revision 9) is right; this is about the *later* `REVEAL → commit` growth
(circle → pill → full-row bar).

### Root cause

That later phase never adopted Revision 9's rule. It computes the bar's
`width`/`height`/`right`/`top` from an **independent** `progress` value
(`(offset - REVEAL) / (commitThreshold - REVEAL)`) that has no direct
relationship to how far `.tx-row-inner`'s translate has actually receded —
`.tx-row-inner` still just translates by the raw drag `offset`, unchanged.
The two were never reconciled: at the commit threshold, the bar's formula
resolves to the row's *full* width, but `.tx-row-inner` has only translated
by `commitThreshold` (`65%` of the row), not the full row — so the bar
claims more space than has actually been uncovered, and the excess is
silently sliced off by `.tx-row-inner`'s own opaque covering, the same
mismatch class Revision 9 fixed for the pop-in, just unaddressed here.

### Fix

Apply the same principle Revision 9 established — a button's rendered
extent must never exceed what's actually been revealed — to this phase
too. Two acceptable directions, either is fine as long as the effect holds
with no discontinuity where the phases meet (still one continuous motion,
per Revision 7's original requirement):

- Drive the bar's growth **directly from the same value** that governs how
  far `.tx-row-inner` has revealed (rather than two independently
  interpolated curves that can diverge), so there's one source of truth
  instead of two numbers that have to be kept in sync by hand; or
- Make `.tx-row-inner`'s translate distance during this phase keep pace
  with (never fall behind) whatever depth the bar's current size actually
  needs, with a floor at `REVEAL` so it never jumps backward at the phase
  boundary.

Verify this the same way Revision 9's fix was verified — not just at the
two endpoints, but at several points through the middle of the `REVEAL →
commit` range, screenshotted zoomed in, confirming the bar's edge is never
visibly sliced by `.tx-row-inner`'s covering at any point along the way.

### Also this revision: a small resting margin around the full bar

The fully-expanded bar (and its growth toward that state) should stop
short of `.tx-row-wrap`'s own edges by a small, consistent gap on every
side, rather than sitting perfectly flush/edge-to-edge against the row
boundary. Use `var(--space-xs)` (`8px`, this app's existing smallest
spacing token — reuse it rather than inventing a new value) as that
margin. Concretely: the bar's maximum width is `rowWidth - 2 ×
var(--space-xs)`, maximum height is `rowHeight - 2 × var(--space-xs)`, and
it stays inset by that same margin on all sides at full expansion (right
inset settles at the margin value instead of `0`; vertical centering
already keeps top/bottom margins equal once height is capped this way, no
separate change needed there).

### Unchanged

Everything else from Revisions 4–9: `REVEAL = 108`, per-button independent
pop-in windows and their exact-fit scaling (Revision 9), the 65%-of-row-
width commit threshold and immediate delete + Undo, whole-row drag
surface, `.tx-row-inner` translate mechanic, circle colors/40px resting
size, icon-only buttons, one-row-open-at-a-time, desktop dense-table
view's static (unscaled, unmargined) actions column.

### Verification plan (this revision)

Real-browser check, same zoomed-screenshot technique as Revision 9: drag a
row past `REVEAL` toward the commit threshold in small increments and
inspect the bar at each step. Confirm its edge is never visibly sliced by
`.tx-row-inner`'s covering at any point. Confirm a small, consistent gap is
visible between the bar and the row's own edges once it's fully expanded
(not flush). Confirm no discontinuity at the `REVEAL` boundary or at the
commit threshold itself, and that everything else from Revisions 4-9 still
holds in both light and dark mode.

## Revision 11: clear every last sliver of row content once the bar is fully expanded

**Requested directly, after live-checking Revision 10**: "almost perfect,
just add a little bit space so there is no content from the row present
when delete button fully expand." The maintainer confirmed Revision 10's
efficient-space fix and margin are otherwise right; this is one remaining
sliver.

### Root cause

Confirmed by the same zoomed-screenshot technique used for Revisions 9-10:
near full commit, a sliver of the amount text (e.g. the trailing `"00"` of
`"−฿55.00"`) is still visible at the row's left edge, next to the bar.
Revision 10's fix computes `.tx-row-inner`'s translate distance as
`Math.max(REVEAL, width + right)` — but at full progress, `width` is
already capped at `rowWidth - 2 × margin` and `right` settles at `margin`,
so `width + right` only reaches `rowWidth - margin` (`8px` short of the
row's true full width with the current `8px` margin) — not `rowWidth`
itself. The **bar** is correctly inset from the row's edge by the margin
(that part is right, and intentional — Revision 10's whole point), but
`.tx-row-inner` was made to stop exactly at the bar's own near edge instead
of continuing on to fully clear the row, leaving that last `margin`-sized
strip of actual row content peeking out unclipped in the gap between the
bar and the row's true edge.

### Fix

`.tx-row-inner`'s translate target needs to reach the row's true full
width once the bar is fully expanded, **regardless of** the bar's own
margin inset — the bar stays visually inset from the row edge, but the row
content underneath must be fully cleared all the way to that same true
edge, not just up to where the bar itself stops. Concretely: add the same
margin back on top of the bar's own reach when computing how far
`.tx-row-inner` needs to translate, e.g.
`Math.max(REVEAL, width + right + margin)` instead of Revision 10's
`Math.max(REVEAL, width + right)` — at full progress this resolves to
exactly `rowWidth`, fully clearing all content, while the bar itself still
settles at `rowWidth - 2 × margin` wide, inset as Revision 10 intended.
(This is one reasonable way to express it; the requirement is the effect —
zero row content visible anywhere once the bar reaches full expansion —
not this exact formula.)

### Unchanged

Everything else from Revisions 4–10: the margin value and where the bar
itself sits (`var(--space-xs)`, `8px`, inset from the row edge), the
pop-in phase's exact-fit scaling (Revision 9), `REVEAL = 108`, the
commit threshold and immediate delete + Undo, whole-row drag surface,
circle colors/40px resting size, icon-only buttons, one-row-open-at-a-time,
desktop dense-table view.

### Verification plan (this revision)

Real-browser check, same zoomed-screenshot technique as Revisions 9-10:
drag a row to just short of, at, and just past the commit threshold, and
confirm **zero** row content (icon, category, note, amount) is visible
anywhere at or near full bar expansion — only the bar itself and, outside
its margin inset, plain row/card background. Confirm the bar's own margin
inset from Revision 10 is unchanged, confirm no discontinuity anywhere in
the drag range, confirm light and dark mode.

## Goal

Replace the always-visible Edit/Delete buttons on transaction rows with a
swipe-to-reveal (touch) / hover-to-reveal (mouse) interaction, so the row
reads cleaner at rest and actions only appear when the user asks for them.

## Current behavior (for reference)

- `txRowHtml(t)` in `src/screens/tx-row.js` renders `.tx-row` with avatar,
  info (category + note), amount, and conditionally an `.actions` block
  (Edit + Delete buttons) — only when `t.__actions` is truthy.
- `src/screens/transactions.js` sets `__actions: true` on every row it
  passes in, so the Transactions screen's list always shows both buttons.
- `src/screens/home.js` never sets `__actions`, so Home's recent-activity
  rows show no actions at all today — there's no way to edit/delete from
  Home currently.

## New behavior

- Actions are never rendered inline/always-visible. Remove the
  `__actions` flag and its conditional entirely.
- Every transaction row gets a hidden `.tx-row-actions` panel (Edit +
  Delete icon buttons, reusing the existing `.btn-icon` styling) absolutely
  positioned at the row's right edge, sized to exactly fit two 34px
  circular buttons + gap + padding (100px total).
- The row's content splits into two independent layers so category and
  note can never be covered or clipped, at any drag position:
  - `.tx-lead` — icon avatar + category + note. `flex: 1`, never
    transforms, painted above the sliding layer via `z-index`.
  - `.tx-trail` — the amount only. `flex-shrink: 0`, slides via
    `transform: translateX()` to reveal the actions panel sitting behind
    it. Because only this small trailing box moves, the leading content
    is structurally guaranteed to stay put — this isn't a tuning knob,
    it's the reason the old "translate the whole row" approach clipped
    into the category text and this one doesn't.
- **Touch**: dragging `.tx-trail` left reveals the panel. Releasing past
  50% of the reveal width (50px of the 100px travel) snaps fully open
  (`translateX(-100px)`); otherwise it snaps closed. Only one row stays
  open at a time — opening a new row closes whichever was previously open.
- **Desktop / mouse**: hovering the row (`pointerenter`/`pointerleave`,
  gated on `pointerType === "mouse"` so it doesn't fire from touch)
  reveals/hides the same panel — no drag required, no click needed.
- Clicking Edit or Delete runs the existing `editTx`/`deleteTx` (no
  logic changes there) and closes the row.
- Tapping the row itself while it's open closes it instead of opening
  the edit form — matches the standard swipe-list convention.
- Animation is `transform`-only: `transition: transform 240ms
  cubic-bezier(.22,1,.36,1)` when settling open/closed, `transition: none`
  while actively dragging so the row tracks the pointer 1:1. No
  width/left/margin animation — those force layout reflow and were
  explicitly ruled out for smoothness.
- `touch-action: pan-y` on the draggable layer so vertical list scrolling
  keeps working normally on touch devices while horizontal drags are
  captured by the row.

## Files to change

- **`src/screens/tx-row.js`** — rewrite `txRowHtml()` markup to the
  lead/trail structure above; delete the `__actions` conditional; add
  drag (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`) and hover
  (`pointerenter`/`pointerleave`) wiring in `wireTxRowActions()`, which
  today only binds plain `click` on `[data-edit]`/`[data-delete]`.
- **`src/screens/transactions.js`** — remove the
  `Object.assign({}, t, { __actions: true })` mapping; pass transactions
  through unchanged.
- **`src/styles.css`** — replace `.tx-row .actions` with
  `.tx-row-wrap` / `.tx-row-actions` / `.tx-lead` / `.tx-trail`, using the
  app's existing `--color-*` tokens (this mirrors the verified preview's
  CSS, just with the preview's `--a-*` prefixed copies swapped back for
  the real token names).

## Out of scope

- No changes to `editTx`/`deleteTx` logic itself.
- No changes to `groupedTxRowsHtml`/date grouping.
- No changes to Home's or Transactions' surrounding screen chrome.

## Open decision to confirm before implementation

Should this apply to **Home's recent-activity rows too** (giving Home
edit/delete for the first time, since it has none today), or stay
Transactions-screen-only like the current always-visible buttons did?
`tx-row.js` is shared either way — the preview built it universally
since it's the same component regardless — but extending edit/delete to
Home is a small scope increase beyond "hide the existing buttons," so
flag if you want it scoped to Transactions only instead.

## Verification plan

After implementing, `npm run build`, serve `dist/`, then in a real
browser (per this repo's rule: a build succeeding is not proof the
feature works):

1. Drag a row (or use a touch-capable device/emulation) and confirm it
   snaps fully open/closed at the 50% threshold, and that category/note
   are never covered or clipped at any point mid-drag.
2. Hover a row with a mouse and confirm reveal/hide without clicking.
3. Confirm only one row stays open at a time, across both Home and
   Transactions.
4. Confirm dark mode renders correctly (no new colors introduced, just
   existing `--color-*` tokens).
5. Confirm vertical scrolling of the transaction list still works
   normally on a touch device — `touch-action: pan-y` didn't break it.
