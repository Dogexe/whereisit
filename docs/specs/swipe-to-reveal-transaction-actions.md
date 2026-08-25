# Spec: Swipe-to-reveal transaction row actions

Status: **built and verified live in the browser** (`src/screens/tx-row.js`, `src/screens/transactions.js`, `styles.css`). Applied to both Home's recent-activity rows and the Transactions screen (the open decision below was resolved: extend to Home too, since it's the same shared component and Home had no edit/delete at all before this). **Current shipped design is "Revision 2" below** — the "wipe reveal" mechanism described in "New behavior" further down (and the z-index/`pointer-events`/`min-width` fixes for its two bugs) is superseded history explaining how the design evolved, not what's in the code today.

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
