# Spec: Browser Back dismisses overlays instead of exiting the app

Status: **shipped**. From the September 2026 product audit's finding D3
(high), scoped as workstream WS-3 of the approved remediation roadmap.

This spec owns the durable behavior for **all three of WS-3's releases** — the
shared history owner and which surfaces adopt it. All three shipped, as
`WI-026`, `WI-027` and `WI-028`, plus `WI-029`, a fourth ticket inserted after
`WI-027` to fix a latent defect in the owner that Release 3 was the first to
expose (see the "Release" bullet's correction below). All six overlay surfaces
are now history-backed and the app has exactly one `popstate` listener, which
is what retires D3. What each release actually shipped, and the one review
finding against Release 3, are recorded in `docs/CHANGELOG.md` and in each
ticket's Review notes under `docs/tickets/completed/`.

## Current behavior

Re-verified against current code on 2026-09-08; the audit's reading still
holds.

`setTab()` (`router.js:16`) mutates `state.tab` and re-renders. It pushes no
history. Opening a bottom sheet sets a `state.*SheetOpen` flag and unhides a
backdrop — also no history. On a Pixel 7 the audit measured `history.length`
stuck at 2 across Home → Transactions → Insights, unchanged by opening the Add
sheet, and `goBack()` with the sheet open navigated to `about:blank`.

**Exactly one surface is history-backed today:** Settings' mobile sub-page.
`openSettingsSubPage()` (`settings.js:158-162`) pushes
`{ settingsSubPage: section }` with no URL change, `closeSettingsSubPage()`
(`:164-168`) closes it *only* via `history.back()`, and the `popstate` listener
at `:170-174` is the single place that clears the field. `e2e/nav.spec.js:73`
already asserts that round trip, including `history.length + 1` and an
unchanged URL.

That listener **does not inspect `event.state`**. It clears
`state.settingsSubPage` on *any* pop that happens while a sub-page is open. So
the moment a second thing starts pushing entries, any Back that dismisses that
second thing also silently closes the sub-page underneath it — if the two can
be open at once.

### Why the Add sheet is safe to do first

The roadmap's per-sheet co-open analysis (verified on a real Pixel 7) says only
the Manage sheet can be open while a Settings sub-page is. For the Add sheet
that is not just a manual observation — it is an automated, currently-passing
assertion: `e2e/nav.spec.js:90` requires `.tabbar-wrap` to be hidden once a
sub-page opens, and the tab bar's Add button is the only mobile entry point
that exists on Settings. The other entry points (`home.js:24`'s `goAdd`,
`transactions.js:19`, `add.js:51`'s `editTx`) all live on Home or Transactions.

The Add sheet is also mobile-only by construction: every one of those call
sites guards with `!isDesktopShell()`.

## The shared history owner

A new module, `src/overlay-history.js`, owns one stack of dismissable
overlays and one `popstate` listener.

```js
pushOverlayHistory(key, onPop)   // push a tagged entry; no-op if key is already on the stack
releaseOverlayHistory(key)       // if key is the top entry, drop it and history.back()
```

- **Push** appends `{ key, onPop }` to a module-level stack and calls
  `history.pushState({ overlay: key }, "")` — same-URL, exactly like
  `settings.js:161`. Deep links, the PWA start URL, and every e2e navigation
  assertion are unaffected because the URL never changes.
- **Popstate** pops the stack and calls that entry's `onPop()`. An empty stack
  means the pop was not ours (a Settings sub-page, or a real navigation) and is
  ignored, so `settings.js`'s existing listener keeps working untouched.
- **Release** is what a UI dismissal (Cancel, backdrop tap, Escape, swipe-down,
  save) calls. It removes the entry from the stack *before* calling
  `history.back()`, so the resulting popstate does not re-run the released
  entry's `onPop`. That ordering is the re-entrancy guard.

  **Correction (`WI-029`).** As first shipped, that ordering was *not* enough:
  the popstate listener pops unconditionally, so on a stack of two the
  release-triggered pop finds the entry *below* and closes that overlay too.
  "Finds nothing" holds only for a stack of one, which is every consumer up to
  and including `WI-027`. `WI-029` shipped the fix: a module-level counter of
  the pops release itself caused, so the listener swallows exactly one popstate
  per release and then resumes closing overlays normally. A counter rather than
  a boolean, so two releases queued in the same task each consume their own
  event. That is what lets `WI-028` stack two entries at all.

### Key decisions

1. **The module's own stack is the source of truth for dispatch, not
   `event.state`.** The roadmap's shorthand was "dispatches on `event.state`",
   and taken literally that is backwards: on `popstate`, `event.state` is the
   state being landed *on*, not the one being left, so the entry to close is
   never the one named in the event. Two further reasons the tag cannot be
   trusted for dispatch, both found in current code:
   `main.js:73` calls `replaceState(null, …)` after a bill-reminder deep link —
   directly on top of an entry `openSettingsSubPage()` just pushed — and
   `main.js:109` does the same on any auth-state change carrying a hash or
   query string. Either nulls a tag out from under us.

2. **Entries are still tagged `{ overlay: key }`.** The tag earns its place
   even though dispatch does not use it: it makes an entry identifiable in
   DevTools and assertable from an e2e test (`page.evaluate(() =>
   history.state)`), and Release 3 needs it so `settings.js` can tell an
   overlay pop from its own.

3. **A stack, not a single slot.** One slot would cover Releases 1 and 2 (no
   two sheets ever co-open), but Release 3 stacks the Manage sheet on top of a
   Settings sub-page — a documented, already-verified requirement, not a
   speculative one. The difference is about five lines, and the alternative is
   redesigning the owner inside the one release that carries real risk.

4. **Pushing a key already on the stack is a no-op.** A double-tap on the Add
   button would otherwise push two entries and leave a stale one behind,
   costing the user a second Back press that appears to do nothing.

5. **`releaseOverlayHistory` only ever releases the top entry.** Releasing from
   the middle would `history.back()` past someone else's entry. If the key is
   not on top, it returns `false` and does nothing — a signal that the adopting
   code closed things out of order.

6. **The module does not branch on viewport.** `settings.js` guards its history
   on `isDesktopShell()` because its sub-page concept is responsive; a sheet's
   is not. The Add sheet is already mobile-only at every call site, and the
   Filters sheets in Release 2 exist on both, where Back-dismisses-the-sheet is
   also correct. Keeping the owner viewport-agnostic keeps the responsive
   decision with the caller that already makes it.

7. **No new user-visible UI, no string, no CSS.** Every sheet keeps its Cancel
   button, backdrop tap, Escape key and swipe-down exactly as they are. Back
   becomes one more route into the *same* dismissal function.

8. **Tab switches still push nothing.** The roadmap defers "should tab switches
   push browser history?" as a routing-model change affecting deep links, the
   PWA back stack, and every e2e navigation assertion. This spec does not
   touch `setTab()`.

## The three releases

### Release 1 — the owner, adopted by the Add sheet only (`WI-026`)

Build `src/overlay-history.js` and wire exactly one consumer:
`openAddSheet()` (`add.js:578`) pushes, `closeAddSheet()` (`add.js:583`)
releases. `closeAddSheet` is already the single funnel every dismissal reaches
— Cancel, backdrop tap, swipe-down, Escape (`add.js:591`), and the post-save
path (`add.js:574`) — so one call site covers all five. `settings.js` is not
touched.

New behavior: with the Add sheet open, Back closes the sheet and stays in the
app. With it closed, Back does whatever it did before. Saving or cancelling
the sheet leaves no stale entry, so a later Back is not swallowed.

### Release 2 — the four remaining safe sheets (`WI-027`)

Transactions Filters, Insights Filters, Export, Import. Still no `settings.js`
change. Each already has exactly one named close function that **every**
dismissal funnels through — including the action-completed closes
(`export-sheet.js:82`/`:89`/`:93` after each export type,
`import-sheet.js:260` after a commit), which is what makes this release
mechanical:

| Sheet | Push at | Release in |
|---|---|---|
| Transactions Filters | `transactions.js:326` (inline open handler) | `closeTxFilterSheet` (`transactions.js:307`) |
| Insights Filters | `insights.js:160` (inline open handler) | `closeInsightsFilterSheet` (`insights.js:242`) |
| Export | `export-sheet.js:69` (inline open handler) | `closeExportSheet` (`export-sheet.js:47`) |
| Import | `openImportSheet` (`import-sheet.js:37`) | `closeImportSheet` (`import-sheet.js:47`) |

Two constraints specific to this release:

- **`onPop` must be the named close function, never a closure over a captured
  element.** All four sheets live inside `#screen`'s `innerHTML`, and
  `renderSettings()` has non-sync callers that can rebuild Settings markup.
  The open state survives via the `state.*SheetOpen` flag and the `hidden`
  binding, but the DOM node does not. The 25-second background-sync path is
  not the reason: every background re-render caller is gated by
  `hasLiveInputRisk()`, which returns true while any of these four sheets is
  open. Every close function already looks its backdrop up fresh by id and
  says so in a comment
  (`transactions.js:304-306`); the history entry must hold that same
  discipline.
- Insights' Breakdown filter sheet regenerates its markup on nearly every
  interaction, so anything wired for it must live inside the re-render, not a
  one-time setup call (`docs/ARCHITECTURE.md:89-96`). Its two close paths also
  differ — `dismiss` (`insights.js:264`) re-renders afterward, the Escape
  listener (`:248`) does not — so the release call belongs in the shared
  `closeInsightsFilterSheet`, which both reach.

### Release 3 — Settings sub-page and the Manage sheet (`WI-028`)

The only release where two entries stack, and the only one carrying real risk.
Two findings from reading the code shape it:

1. **The Manage sheet already detects its own open and close transitions.**
   It has no explicit open call — it is a derived render over `state[*EditId]`
   (`settings.js:78-88`) — but `renderManageSheet()` already computes both
   edges to arm and disarm its focus trap: the close edge at
   `settings.js:83` (`if (state.manageSheetOpen) { … = false; …deactivate() }`)
   and the open edge at `settings.js:127`
   (`if (!state.manageSheetOpen) { … = true; …activate() }`). The history
   push/release ride those exact two lines. No new detection mechanism is
   needed.

2. **Migrating the sub-page inverts its current contract, and that is the
   trap.** Today `closeSettingsSubPage()` (`settings.js:164`) only calls
   `history.back()`; it never clears `state.settingsSubPage`. The `popstate`
   listener at `:172` is the sole place that clears it —
   `docs/ARCHITECTURE.md:71-73` documents this as "a Settings sub-page closes
   only through `history.back()`". But the shared owner de-registers an entry
   *before* calling `history.back()` precisely so the resulting pop does not
   re-close the released overlay (decision, "Release" above, including
   `WI-029`'s correction — on a stack of two that pop is harmless only
   because `WI-029` shipped). Port the function as-is and nothing clears the
   field: the sub-page stays open in state while its history entry vanishes.
   `closeSettingsSubPage` must therefore start clearing the field and
   re-rendering itself, exactly as `closeAddSheet()` closes its own sheet, with
   the owner responsible only for the history entry. **`docs/ARCHITECTURE.md`
   must be updated in the same change**, since that sentence stops being true.

After the migration `settings.js`'s own `popstate` listener is deleted, leaving
one listener in the app — which is what actually retires D3's hazard rather
than routing around it.

One path reaches both surfaces at once without a user gesture and is worth
testing deliberately: a bill-reminder notification tap (`main.js:68-74`) sets
`state.tab`, calls `openSettingsSubPage("bills")`, sets `state.billEditId`, and
renders — pushing the sub-page *and* the Manage sheet in one tick — then calls
`replaceState(null, …)` on top of the entry it just pushed. Stack-based
dispatch (decision 1) is what keeps that working.

## Out of scope

- Tab switches pushing history (deferred by the roadmap, decision 8).
- Any URL, route, or deep-link change. Every entry is same-URL.
- The app-lock overlay (`applock-ui.js`). It is not dismissable by the user
  and deliberately has no dismiss gesture at all; Back while locked is
  unchanged by this spec.
- Any change to what a sheet's dismissal *does* — no "unsaved changes"
  confirmation is introduced (`add.js:565-568` documents that silent discard is
  deliberate and matches the Filters sheet).
- Fixing the pre-existing inconsistency where Insights' Escape path
  (`insights.js:248`) skips the re-render its `dismiss` path does
  (`insights.js:264`). Noted while investigating Release 2; unrelated to
  history, and not this spec's to change.

## UX constraints

- Follow `docs/UX.md`.
- Match existing: `openSettingsSubPage`/`closeSettingsSubPage`/`popstate`
  (`settings.js:158-174`) — the same same-URL `pushState`, the same
  close-only-through-`history.back()` discipline, generalized.
- Reuse: the existing dismissal functions of each sheet. Back is a new caller
  of `closeAddSheet()`, not a new close path.
- New design primitives required by this spec: **none.** No new CSS, class,
  string, icon, or visible control. Anything visual in the diff is a defect.
- Mobile (<1024px): Back closes the open Add sheet. Desktop (≥1024px):
  unchanged — the Add sheet does not exist there.
- Thai and English: no user-visible text is added or changed.

## Verification plan

`overlay-history.js` calls `window.history` and registers a `window` listener,
and the `tests/` suite is DOM-less `node:test` over pure modules
(`docs/TESTING.md`). Making the stack unit-testable would mean injecting a
history object purely for the test — an abstraction with one real
implementation. Playwright is the correct layer, and it can drive real Back.

Release 1, Medium risk:

1. **`npm run test:e2e`**, extending `e2e/nav.spec.js`'s existing
   history-round-trip test (`nav.spec.js:73-108`) as the model — it already
   asserts `history.length + 1` and an unchanged URL:
   - Opening the Add sheet on mobile adds exactly one history entry, leaves the
     URL unchanged, and sets `history.state.overlay` to the sheet's key.
   - Back closes the sheet, keeps the URL, and **stays in the app** — assert on
     a still-rendered app element, since this is the exact failure the audit
     recorded (`goBack()` landing on `about:blank`).
   - Cancelling the sheet (not Back) also releases the entry, so a subsequent
     Back is not swallowed. Because `history.back()` retains the released entry
     as a forward entry, `history.length` does not return to its pre-open value;
     coverage instead asserts that the base state is restored and repeated
     open/close cycles keep the length stable rather than accumulating entries.
   - Saving a transaction from the sheet leaves no stale entry either.
   - Opening the sheet, closing it, and reopening it does not accumulate
     entries.
2. **`npm test`** — expect no change; nothing here touches a module the unit
   suite covers.
3. **`npm run build`.**
4. A real-browser check is **not** required: Playwright's `goBack()` drives the
   same `popstate` this feature is built on, at the mobile viewport the
   existing specs already use.

Regression watch for Release 1: `e2e/nav.spec.js:73-108` (Settings sub-page
history) must still pass unchanged. It is the direct evidence that the new
listener has not disturbed `settings.js`'s.
