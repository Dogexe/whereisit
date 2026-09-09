# Spec: Reversible "Mark paid", and toasts that announce themselves

Status: **proposed** (not built). From the September 2026 product audit's
findings D2 (critical) and the toast half of D8 (medium), scoped together as
workstream WS-2 of the approved remediation roadmap.

The roadmap bundles these two because the undo toast *is* D2's remedy, and a
toast no screen reader ever announces is not a remedy for a screen-reader
user. They ship as two tickets (WI-024 then WI-025) so the shared toast
primitive and the Home-screen behavior can be reviewed and attributed
separately.

## Current behavior

### D2 — "Mark paid" is irreversible

`markBillPaid()` (`src/screens/home.js:32-56`), wired at `home.js:292` to the
`[data-mark-paid]` button on each upcoming-bill row, does five things in one
click, with no confirm and no undo:

```js
transactions.push(savedTx);              // a real expense, bill.amount, note = bill.name
bill.lastPaidCycle = billDueCycle(bill); // drops the bill off Home until next cycle
saveToStorage(); saveSettings(); renderScreen();
showToast(checkBudgetAlert(savedTx) || L().toastAdded);   // <- no undo callback
Promise.all([pushTx(savedTx), pushRows("bills", [billToRow(bill, false)])]).then(() => syncNow());
```

Re-verified against current code on 2026-09-08: still exactly as the audit
recorded it. The toast reads "เพิ่มรายการแล้ว" with zero undo buttons, and
`lastPaidCycle` is written here and cleared nowhere — the bill edit form
(`settings-bills.js:52`) mutates `name`/`category`/`categoryId`/`amount`/`day`
in place and leaves `lastPaidCycle` untouched.

The undo pattern already exists twice in this codebase and is the documented
rule (`docs/UX.md`: **"Undo over confirm"**):

- `deleteTx` (`add.js:54-70`) — removes the row, pushes the tombstone, then
  passes a restore callback to `showToast`.
- `deleteBill` (`settings-bills.js:61-77`) — same shape for a bill.

### D8 (toast half) — `#toast` announces to nobody

`index.html:91` is `<div class="toast" id="toast" hidden></div>`: no `role`,
no `aria-live`. Every message the app has — "transaction added", "budget
exceeded", "save failed", and **every undo prompt** — is visual only. The Add
sheet's commit preview (`add.js:328`) already carries `aria-live="polite"`, so
this is an inconsistency with an established in-repo pattern, not a new one.

`docs/UX.md`'s Accessibility section covers accessible names and focus
indicators but says nothing about announcing status — that gap is noted here
and left to the deliberate accessibility pass the roadmap already reserves for
the rest of D8; this spec does not amend `docs/UX.md`.

## Key decisions

1. **Undo, not confirm.** `docs/UX.md` states "Undo over confirm", and both
   existing destructive actions in this app follow it. A confirm dialog on
   "Mark paid" is explicitly rejected: it would add friction to the common
   correct case to protect against the rare wrong one, and it would be the
   only confirm dialog in the product.

2. **Undo reverses both halves of the action.** The undo callback must remove
   the created transaction *and* restore `bill.lastPaidCycle` to whatever it
   was before the click (usually `null`, but an older cycle key for a bill
   paid in a previous month). Restoring only the transaction would leave the
   bill silently marked paid for a cycle whose expense no longer exists —
   which is the exact inconsistency D2 is about. Both halves must also be
   pushed: a tombstone for the transaction and a fresh `billToRow` for the
   bill, so a second device does not resurrect either.

3. **The toast keeps the budget alert when there is one.** Today the message
   is `checkBudgetAlert(savedTx) || L().toastAdded`. It becomes
   `checkBudgetAlert(savedTx) || L().toastBillPaid`, with the undo callback
   attached **unconditionally**. A user who pushes a budget over by paying a
   bill still sees "เกินงบ … แล้ว", and still gets an Undo button. Nothing is
   traded away.

4. **One new `STRINGS` key: `toastBillPaid`.** `toastAdded` ("เพิ่มรายการแล้ว"
   / "Transaction added") is wrong here once Undo is attached, because undo
   reverts more than the transaction. `toastBillPaid` —
   `["บันทึกการจ่ายแล้ว", "Bill marked paid"]` — names what actually happened.
   This is the only new string, class, icon, or primitive either ticket may
   add.

5. **The live region is a separate always-rendered `.sr-only` element, not a
   role on `#toast` itself.** The roadmap's shorthand was `role="status"` on
   `#toast`; that specific placement is unreliable and is deliberately not
   what ships. `styles.css:1223` is `.toast[hidden] { display: none; }`, so
   `#toast` is absent from the accessibility tree for all but ~2-4 seconds at
   a time. A live region must already be rendered in the accessibility tree
   *before* its content changes for the change to be announced; mutating a
   `display:none` region and revealing it in the same frame is the classic
   way to get silence, and support for announcing a pre-filled region that
   merely becomes visible varies by screen reader. The reliable pattern — and
   the one this repo already has CSS for — is a permanently rendered,
   visually hidden announcer:

   ```html
   <div id="toastLive" class="sr-only" role="status"></div>
   ```

   `.sr-only` already exists at `styles.css:679` and is described there as the
   "standard visually-hidden-but-still-announced pattern". **No new CSS rule
   is required, and `#toast`'s own markup, classes, and styles are untouched.**
   The roadmap's intent — `role="status"` covering the app's toasts — is met;
   only the element carrying it differs, for the reason above.

6. **The visible toast is *not* `aria-hidden`.** The Undo button inside it
   must stay reachable and focusable for keyboard and screen-reader users —
   it already has a focus indicator (`styles.css:1091`). The announcer
   therefore duplicates the message text into the accessibility tree; that
   redundancy is accepted, and is inherent to the announcer pattern.

7. **The announcer includes the undo affordance.** When `showToast` is called
   with an undo callback, the announced text is the message plus the `undoBtn`
   label, matching what the visible toast reads. Announcing only "Transaction
   deleted" would tell a screen-reader user that something happened while
   hiding the one control that lets them take it back.

8. **Two identical consecutive toasts must both announce.** Assigning the same
   string to `textContent` is not a mutation and produces silence — and "add
   two transactions in a row" makes this a real flow, not a hypothetical. The
   announcer's content is therefore cleared and re-set on a later tick rather
   than assigned directly.

9. **The announcer is cleared when the toast hides**, so a screen-reader user
   browsing the page later does not find a stale message sitting in the
   accessibility tree with no visible counterpart.

10. **Auto-hide timings are unchanged** (2200 ms plain, 4000 ms with undo),
    matching `deleteTx` and `deleteBill`. Changing them would change every
    toast in the app and belongs to its own decision if it is ever wanted.

## New behavior

- `markBillPaid()` shows a toast with a working Undo button. Undo removes the
  created expense, restores the bill's previous `lastPaidCycle`, re-renders,
  and pushes both changes.
- After undo, Home shows the bill back in Upcoming bills exactly as before the
  click, and the transaction is gone from Recent activity and from
  Transactions.
- `#toastLive` exists on every page load, is never `display:none`, and carries
  the text of each toast — including the Undo label when one is offered — for
  as long as that toast is visible.
- Every existing `showToast` caller gains announcement for free; none of them
  changes.

## Deliberately deferred — the durable un-mark path

D2's second half is that `lastPaidCycle` has no clearing path at all. Undo
closes the accidental-tap case, which is the critical one. It does **not**
close this residual: a user who deletes the generated expense from the
Transactions list days later still leaves the bill marked paid for that cycle,
because nothing links the transaction back to the bill.

That residual is accepted for now, and its impact is bounded: one bill misses
one cycle's reminder, then reappears on the 1st (`derived.js:203-210` already
documents that an overdue bill is never held across a month boundary). No data
is lost and nothing is silently wrong about the ledger.

Closing it properly is one of two changes, both larger than this workstream:

- **A `billId` on the transaction**, so deleting the expense can clear the
  bill's cycle. This is a schema and sync-mapper change (`txToRow`/`rowToTx`,
  a Supabase column and migration) and needs maintainer approval before it is
  specified.
- **An "un-mark paid" control on the bill row in Settings → Bills**, clearing
  `lastPaidCycle` with no schema change but adding UI and a string, and only
  ever meaningful for the current cycle.

**This needs a maintainer decision before it becomes a spec.** It is raised
here rather than guessed at.

## Out of scope

- Any confirm dialog on "Mark paid" (decision 1).
- The rest of D8 — `aria-current` on nav, the missing `<h1>`, `<nav>` labels,
  the skip link. The roadmap reserves those for one deliberate accessibility
  pass alongside extending `docs/UX.md`'s Accessibility section; scattering
  them into this ticket is explicitly ruled out there.
- Changing `#toast`'s markup, classes, position, or timings.
- Any change to `nextBillDueDate`/`daysUntilBillDue`/`billDueCycle`, or to
  `supabase/functions/send-bill-reminders/index.ts`'s hand-kept duplicate of
  them. Nothing here alters that algorithm.
- Recurring transactions (C2) — a separate roadmap item gated on WS-9.
- Amending `docs/UX.md` (see the note under D8 above).

## UX constraints

- Follow `docs/UX.md`.
- Match existing: the delete-and-undo toast on transaction rows
  (`add.js:63-69`) and on bills (`settings-bills.js:70-76`) — same toast, same
  Undo button, same 4000 ms window.
- Reuse: `showToast(msg, undoFn)` (`toast.js:5`), `.toast-undo-btn`
  (`styles.css:1225`), `l.undoBtn` (`i18n.js:105`), `.sr-only`
  (`styles.css:679`), `pushDeleteTx` (`sync.js:170`), `billToRow`
  (`sync.js:73`), `setTransactions` (`state.js:139`).
- New design primitives required by this spec: **one new `STRINGS` key**
  (`toastBillPaid`, decision 4) and **one new DOM element** (`#toastLive`,
  decision 5). No new CSS rule, no new class, no new icon, no new button
  style. Anything else new in the diff is a defect.
- Mobile (<1024px) and desktop (≥1024px): identical. The toast already has its
  own bottom-offset rules for both shells; neither ticket touches them. The
  announcer is invisible at every viewport.
- Thai and English: `toastBillPaid` ships both. No fixed-width surface holds
  it — the toast is a centered pill with `max-width: 420px` and wraps — so no
  Thai string-width verification is needed.

## Verification plan

`toast.js` and `home.js` are both DOM-coupled; the `tests/` suite is
DOM-less `node:test` over pure modules, so neither behavior can be covered
there. Playwright is the correct and only automated layer for both.

**WI-024 (announcer), Medium risk:**

1. `npm run test:e2e` with new coverage asserting `#toastLive` exists on load
   with `role="status"`, is not `display:none`, receives the message text
   after a toast fires, additionally carries the `undoBtn` label when an undo
   toast fires, and is empty again after the toast auto-hides.
2. One test firing the *same* toast twice in a row and asserting the announcer
   is re-populated the second time (decision 8) — assert on the clear-then-set
   transition, not just the final value, or the test passes on the broken
   implementation.
3. `npm run build` — bundled application code changes.
4. Actual screen-reader announcement cannot be automated. The e2e assertions
   above are the contract; a manual NVDA/VoiceOver pass is welcome but is not
   a required gate.

**WI-025 (undo), High risk** — it writes two persisted arrays and emits two
sync rows on the undo path, where a wrong `lastPaidCycle` restore desyncs
silently across devices:

1. `npm test` — expect no change; nothing here touches a module the unit suite
   covers. A unit test needing a change is a signal the change went wider than
   intended.
2. `npm run test:e2e` with a new `createBill()` helper in `e2e/helpers.js`
   (model it on the existing `createBudget()`, `helpers.js:70`) and a new test
   that creates a bill due today, marks it paid from Home, asserts the row
   disappears and the transaction exists, clicks `#toastUndoBtn`, and then
   asserts **both**: the bill row is back on Home *and* the transaction is
   gone from the Transactions list. Asserting only one half would pass on a
   half-implemented undo.
3. `npm run build`.
4. Full matrix per the High tier.
