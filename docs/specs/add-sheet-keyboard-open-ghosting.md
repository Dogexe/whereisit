# Spec: Add sheet's Type-tabs content ghosts above the header when the keyboard opens

Status: **fixed on-device by attempt 2** — moving each sheet's header out
of the scrollport (`.sheet-body`) eliminated the ghosting, confirmed by the
maintainer on the affected phone. Attempt 1 (`contain: paint`) was shipped
and disproven first; see Investigation, and do not retry it. Reported
directly with
a screenshot ("visible text... above drag handle"), then confirmed live via
a real-device screen recording (see Investigation below) before writing
this spec, per this repo's "difficult/intermittent bug" workflow.

## Confirmed repro (real device, not simulated)

1. Open the Add sheet (mobile, bottom-sheet layout).
2. Tap the Note field to focus it and open the on-screen keyboard.
3. For roughly 1-1.5 seconds while the keyboard is animating open, the Type
   field's segmented-control content (first the "Expense / Income /
   Transfer" text, then just its active-segment's rounded background
   shape once the text disappears) renders **above the sheet's own rounded
   top edge and above the sticky header** ("Cancel / Add transaction /
   Save"), overlapping the dimmed backdrop and the screen behind it. It
   self-corrects with no user action once the keyboard finishes opening
   and the sheet's content settles into place (Category becomes the
   topmost visible field below the header, as expected).

Confirmed via a screen recording of the actual phone (Android, Chrome),
frame-extracted at 2fps/1024px around the 0.5-2.5s window. The glitch
persists across at least 2-3 consecutive extracted frames (not a
single-frame flicker), then is gone by the next second.

## Investigation

- **Desktop-simulated keyboard resize does NOT reproduce this.** Before
  getting the recording, `syncSheetToViewport()`'s exact effect (`utils.js`)
  was manually replicated in a desktop Chrome devtools session — setting
  `.filter-sheet-backdrop`'s `height`/`top` and `.filter-sheet`'s
  `max-height` directly to the same values the function would compute for
  a shrunk `visualViewport` — and the sticky header stayed correctly
  positioned throughout, no ghosting. **This rules out the resize math
  itself as the bug** and means any fix must be verified on a real device
  (or a mobile emulator with a genuine virtual keyboard), not by faking
  the resulting inline styles on desktop. Save future sessions the same
  dead end.
- **The likely trigger is the interaction, not either piece alone**:
  `syncSheetToViewport()` (`utils.js:156-166`) mutates `.filter-sheet`'s
  inline `max-height` (and the backdrop's `height`/`top`) synchronously
  inside the `visualViewport` `resize` handler, at the *same moment* the
  browser is independently running its own native "scroll the focused
  input into view" behavior on the same sheet (the exact interaction
  `syncSheetToViewport()` was originally written to tame — see its own
  comment block and `docs/CHANGELOG.md`'s "On-screen keyboard pushing the
  whole sheet off-screen" entry). `.filter-sheet` is simultaneously: the
  `overflow-y: auto` scroll container, the element being resized via
  inline style, and the element the native scroll-into-view is operating
  on. The visible symptom (previously-laid-out content painting outside
  the box's *new*, shorter clip bounds, above rather than below) points
  at the clip/paint pass lagging one or more frames behind the box's own
  resize+scroll during that resize event, not at a plain CSS positioning
  mistake — this needs to be confirmed by direct on-device inspection
  (remote debugging via `chrome://inspect`, or adding a temporary
  diagnostic) rather than further guessing from static code reading.
- Not yet confirmed: the exact frame-by-frame mechanism (compositor layer
  promotion/demotion timing, a stale painted layer, or something else).
  Left for implementation to pin down with real on-device inspection
  tools, per the acceptance criteria below.
- **`contain: paint` on the sheet does NOT fix this — ruled out on the real
  device, do not retry it.** Attempt 1 (commit `81cb197`) scoped
  `contain: paint` to `#addSheetBackdrop .filter-sheet`, deployed it, and
  the maintainer reproduced the ghosting unchanged on the same phone.
  This is a strong negative result, not just a failed guess: with paint
  containment active it is spec-impossible for a *descendant* to paint
  outside the sheet's box, so whatever is on screen above the sheet's
  rounded top edge is very likely **a stale compositor texture of the
  sheet from an earlier frame**, not a live paint escaping a clip. That
  explains all four known facts at once — no desktop repro (no real
  compositor/keyboard interaction), self-corrects in ~1s (next full
  repaint), persists across several extracted frames (a whole composited
  frame, not a flicker), and immunity to clipping CSS (no clip applies to
  a snapshot). Any further fix aimed at *clipping* is aimed at the wrong
  layer.
- Following from that: the remaining suspect is that `.filter-sheet` plays
  three roles simultaneously — the `overflow-y: auto` scrollport, the
  element `syncSheetToViewport()` mutates inline, and the element Chrome
  runs native scroll-into-view on. Attempt 2 splits those roles by moving
  the header out of the scrollport: `.filter-sheet` stops scrolling, and a
  new `.sheet-body` wrapper inside it becomes the scroll container, so the
  resized element and the scrolled element are no longer the same box.
  This requires a markup change, because four of the six sheets (Export,
  Insights, Settings/Manage, Transactions) currently render the header
  plus several loose sibling `.field` blocks directly under
  `.filter-sheet`, with no single body element to make scrollable; only
  Add (`#addForm`) and Import (`#importSheetBody`) already have one.

## Constraints on the fix

- Must not reintroduce the bug `syncSheetToViewport()` already fixed: the
  sheet (sticky header included) getting dragged off-screen by the
  browser's native scroll-into-view when the keyboard opens on a short
  viewport. Re-verify that scenario alongside the new fix.
- Must not regress `wireSheetDrag()`'s swipe-to-dismiss gesture or the
  scroll-lock/focus-trap behavior every other sheet also relies on
  (`createFocusTrap()`, `utils.js`) — this bug is specific to the Add
  sheet's Type field being the first thing below the header, but any fix
  likely touches shared sheet code (`syncSheetToViewport()`, `.filter-sheet`
  CSS) used by all six sheets in the app.

## Out of scope

- The Type-selector's own visual redesign (icon/color) — tracked
  separately (`docs/specs/type-selector-icon-color.md`, WI-006). This bug
  is about *positioning/paint*, not what the Type field looks like; it
  would affect whatever content happens to be the sheet's first field
  regardless of that field's own styling.

## Verification plan

Cannot be verified by resizing a desktop browser window or devtools
device-mode alone (see Investigation above) — requires one of:

1. A real Android/iOS device: open the Add sheet, focus Note, confirm no
   content ever paints above the sheet's rounded top edge throughout the
   keyboard's open animation, screen-recorded to confirm across several
   repeats (this bug's timing may be device/OS-version sensitive).
2. Remote debugging (`chrome://inspect`) against a real device while
   reproducing, to inspect computed styles/paint at the exact glitch
   frame if the fix needs further diagnosis.

Also required: `npm run build`, `npm test`, `npm run test:e2e` (the e2e
suite runs signed-out/offline and doesn't simulate a real virtual
keyboard, so it won't catch this bug itself, but must stay green), plus
re-confirming the keyboard-avoidance scenario from the "On-screen keyboard
pushing the whole sheet off-screen" changelog entry still works.
