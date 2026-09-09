# Spec: Manage a bill from Home — mark paid, un-mark, remove for this cycle

Status: **draft** (not built). Closes the residual half of the September 2026
audit's finding D2, deferred by
`docs/specs/reversible-mark-paid-and-announced-toasts.md` under "Deliberately
deferred — the durable un-mark path".

**Contains an approved schema change** (a new `bills` column). See decision 6.

## The problem

`bill.lastPaidCycle` is written in exactly one place and cleared in none.

`markBillPaid()` (`home.js:32-70`) does two things: it creates a real expense,
and it sets `bill.lastPaidCycle = billDueCycle(bill)`. `WI-025` gave that action
a 4-second undo toast which reverses **both** halves, and that closes the
accidental-tap case.

It does not close the residual. Once the toast expires there is no way back.
A user who marked the wrong bill, or who deletes the generated expense from the
Transactions list days later, leaves the bill marked paid for a cycle whose
expense no longer exists — because nothing links the transaction back to the
bill. The bill edit form (`settings-bills.js:37-58`) mutates
`name`/`category`/`categoryId`/`amount`/`day` and never touches
`lastPaidCycle`.

The impact is bounded and self-healing: one bill misses one cycle's reminder,
then reappears on the 1st, because `nextBillDueDate()` deliberately never holds
an overdue bill across a month boundary (`derived.js:203-210`). No data is lost.
But the user has no way to correct it, and — the sharper half — **no way to even
see it**, because a paid bill disappears from Home entirely.

### Why it disappears

`upcomingBills()` (`derived.js:316-320`) filters
`daysUntil <= 7 && lastPaidCycle !== dueCycle`. Marking a bill paid makes
`nextBillDueDate()` roll its date forward to next month, so `daysUntil` jumps to
roughly 30 and the row fails the first clause. The `lastPaidCycle !== dueCycle`
clause is, per its own comment, "a defensive backstop rather than the primary
paid-bill exclusion".

So today "marked paid" is expressed **only as an absence**. The row vanishes,
and vanishing is indistinguishable from a bill the user never had.

## Key decisions

1. **This lives on Home, not in Settings → Bills.** The mistake happens on
   Home's "Upcoming bills" card, and that is where the user looks to confirm it.
   Settings → Bills stays the management surface (rename, re-price, delete); it
   is two taps away and is not where anyone goes to say "no, I hadn't paid
   that."

2. **The row's actions live in the swipe, and the "Mark paid" pill goes away.**
   Home's bill row currently ends in a `.btn-sm` pill (`home.js:280`). That pill
   is replaced by the swipe-to-reveal treatment the rest of the app already
   uses, so Home's bill rows stop being the one list with a bespoke inline
   button.

3. **Two circles, and the first one's identity follows row state.** An unpaid
   row reveals **Mark paid** and **Remove**; a paid row reveals **Un-mark** and
   **Remove**. There is no Edit and no Delete here — those stay in
   Settings → Bills, which is what that section is for.

4. **"No button" means no bespoke pill, not unreachable on desktop.**
   `manageRowHtml()` (`manage-row.js:49-65`) branches on `isDesktopShell()`:
   below 1024px it wraps the row in `manageSwipeWrapHtml()`, at 1024px+ it
   renders the identical actions inline as `.row-actions`. Home's bill row
   adopts that helper, so desktop keeps visible controls for free and mobile
   gets the swipe — without a second implementation and without this spec
   inventing a desktop story of its own.

   `manageSwipeWrapHtml()` already takes `actionCount` and derives its reveal
   geometry from it (`12 + actionCount * 40 + (actionCount - 1) * 4`), and
   Accounts already ships a three-circle row (`settings-accounts.js:20-29`). Two
   circles is a smaller case of a mechanism that is already general.

5. **A paid bill stays on Home through its own cycle.** This is what makes
   un-mark reachable at all: `upcomingBills()` must keep a bill whose
   `lastPaidCycle` matches the cycle it was paid for, instead of letting the
   rolled-forward `daysUntil` drop it. It leaves when the cycle turns over,
   exactly as it does now.

   The user-visible effect is that paying a bill no longer makes it silently
   vanish — it visibly settles into a paid state and then leaves on its own.
   That is better confirmation than an absence, and decision 6 gives anyone who
   disagrees a one-swipe way to clear it.

6. **Remove-for-this-cycle is a new synced field on bills:
   `dismissedCycle`.** *(Schema change, approved by the maintainer before this
   spec was written.)* A dismissed bill hides from Home until its cycle turns,
   then returns — the same self-healing rhythm the rest of the bill logic
   already has, and the reason this is a cycle key rather than a boolean.

   It follows an existing shape exactly: `bills` already carries a nullable
   cycle-key text column, `last_notified_cycle`
   (`supabase/migrations/20260828120000_bill_reminders_push.sql:48`). So the
   change is one `alter table public.bills add column if not exists
   dismissed_cycle text;` in a new timestamped migration, plus the two mapper
   lines in `rowToBill`/`billToRow` (`sync.js:72`, `:74-79`).

7. **Un-marking clears `lastPaidCycle` and nothing else. It is not an undo.**
   It cannot be: with no `billId` on the transaction, the expense that
   `markBillPaid()` created is unfindable once the toast is gone, and in the
   motivating case the user has already deleted it themselves. Guessing —
   matching on amount, date and note — would eventually delete the wrong row.

   So un-mark is honest about its scope, and its toast says the bill was
   un-marked, **not** that anything was undone. The existing 4-second undo toast
   on `markBillPaid()` is unaffected and stays: within that window the user
   still gets the real both-halves reversal.

8. **Visual paid state mirrors Accounts' archived state.** `accountRowHtml()`
   (`settings-accounts.js:20-29`) already solves this: a state word in the row's
   `sub` slot plus a modifier class on the row (`archivedLabel` /
   `manage-row-archived`). A paid bill gets the same treatment, so the app has
   one way of saying "this row is in a settled state", not two.

9. **Push reminders are unaffected; the Edge Function is not touched.**
   `supabase/functions/send-bill-reminders/index.ts:19-47` is a hand-kept
   faithful port of `nextBillDueDate`/`daysUntilBillDue`/`billDueCycle`, and it
   selects its own reminder set. This spec changes `upcomingBills()`, which has
   no counterpart there — that is the one safe seam for a change of this shape.

   So removing a bill from Home hides the **card**, not the reminder. That is
   the deliberate reading: the two are different channels, and a user clearing
   a crowded card has not necessarily said "stop reminding me". Teaching the
   Edge Function about `dismissed_cycle` is a High-risk server-side change
   requiring verification against a real deployed request, and it is cleanly
   separable — see Out of scope.

## Out of scope

- **A `billId` on transactions.** That is the other way to close D2 — deleting
  the expense could then clear the bill automatically — but it is a second
  schema change plus `txToRow`/`rowToTx` work and needs its own approval and
  spec. If it ever ships, automatic clearing rides along with it and the
  controls specified here still stand.
- **Teaching push reminders about `dismissedCycle`** (decision 9). A reasonable
  follow-up, but server-side and separately verifiable.
- Any change to the reminder algorithm or to the three ported date functions.
- Marking a bill paid from anywhere other than Home.
- Editing or deleting a bill from Home.
- A restore path for dismissed bills — they come back on their own next cycle,
  so there is nothing to restore.
- Recurring transactions (C2), gated on WS-9 elsewhere.
- Holding an overdue bill across a month boundary — `derived.js:203-210`
  decided against that deliberately and this spec does not revisit it.

## UX constraints

- Follow `docs/UX.md`.
- Match existing: Accounts' swipe row and its archived state
  (`settings-accounts.js:20-29`, `:103-116`) — same circle geometry, same
  conditional `aria-label`, same state-word-plus-modifier-class treatment.
- Reuse: `manageRowHtml`, `manageSwipeWrapHtml`, `showToast(msg, undoFn)`,
  `billToRow`, `pushRows`, `saveSettings`, the `.manage-row` markup Home's bill
  row already uses.
- New design primitives required: **none.** New `STRINGS` keys and one new
  migration only.
- Mobile (<1024px): swipe reveals two circles.
- Desktop (≥1024px): the same two actions inline via `.row-actions`.
- No action here takes Delete's full-swipe-to-commit gesture. That behaviour is
  reserved for genuinely destructive actions; nothing on this row destroys
  anything, and all three are one tap to reverse.

## Releases

Three tickets, ordered so the riskiest change lands alone.

### Release 1 — a paid bill stays visible and says so

`upcomingBills()` keeps a bill through the cycle it was paid for, and Home's row
renders that state (state word in `sub`, modifier class on the row). The
existing "Mark paid" pill is hidden on a row already in that state, since
marking it again is meaningless.

No new action, no schema, no swipe. On its own this already fixes the "vanished
without a trace" half of the complaint, and it is almost entirely `derived.js`
plus one template — unit-testable in `tests/derived.test.js` without touching
the interaction layer. **Risk: Low.**

### Release 2 — the Mark / Un-mark swipe control

Home's bill row adopts `manageRowHtml()`, so it gets swipe-on-mobile and
inline-on-desktop for free, with one circle whose identity follows row state.
The pill from Release 1 is removed here. Adds `unmarkBillPaid(id)` in `home.js`
beside `markBillPaid()`, shaped like `toggleArchiveAccount()`
(`settings-accounts.js:103-116`): find, guard, clear the field, stamp
`updatedAt`, `saveSettings()`, re-render, `pushRows` + `syncNow`, toast.
**Risk: Medium.**

### Release 3 — remove from Home for this cycle

The migration, the two mapper lines, `upcomingBills()`'s second new exclusion,
and the Remove circle. Isolated last because it is the only release touching the
schema and the sync mappers, so a sync regression is attributable to it and not
to the two UI releases. **Risk: High** — schema plus sync mapper, and per
`docs/WORKFLOW.md` that means verification against a real deployed request, not
just a local pass.

Splitting this way keeps the `derived.js` filter change in a release with no
interaction surface, the interaction change in a release with no persistence
change, and the persistence change alone.
