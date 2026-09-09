# Remediation roadmap

Last updated: 2026-09-08

Sequenced remediation plan from the September 2026 product audit. This file
owns **what is planned and in what order**, and the open product decisions
that block work. It does not own behavior (that's `docs/specs/`), execution
contracts (`docs/tickets/`), or current reality (`docs/SOT.md`).

Direction approved by the maintainer; revision 2 applied three maintainer
changes (see "Decisions already settled" below).

**`docs/AUDIT-2026-09.md` owns the findings and their evidence** — file/line
locations, measurements, and reproduction steps. This file owns only what is
planned and in what order. The table below is a scanning aid, not the source;
read the audit entry before acting on any finding, and re-verify it against
current code, since that file records 2026-09-08 and will age.

Presented copies: [audit](https://claude.ai/code/artifact/4a8fd7c9-d010-4f2b-bedd-cefc5f7389e3)
· [roadmap](https://claude.ai/code/artifact/43ee2bd8-e200-4081-8a79-81a415173092)

## Finding IDs referenced below

| ID | Finding | Class · severity |
|---|---|---|
| D1 | Fresh install seeds four bills and four budgets, rendered as the user's own data | Defect · critical |
| D2 | "Mark paid" writes an expense with no confirm, no undo; `lastPaidCycle` is never cleared | Defect · critical |
| D3 | Tabs and sheets push no history; Back exits the app and discards an open Add sheet | Defect · high |
| D4 | English translates chrome but not categories, accounts, or bills | Defect · high |
| D5 | `navigator.storage.persist()` is never requested, on an app whose only copy is `localStorage` | Defect · high |
| D6 | Transaction list renders every row; ~726 ms blocking work per search keystroke at 2 000 rows | Defect · high |
| D7 | Amounts with >2 decimals rejected by native validation with an untranslated message | Defect · medium |
| D8 | No `aria-current` on nav, no `h1`, `#toast` is not a live region, navs unlabelled | Defect · medium |
| D9 | `docs/SYNC.md:31` documents `mergeBudgetsByCategory`, which no longer exists | Defect · low |
| U1 | Add sheet opens with focus on Cancel, so the keypad never appears | UX weakness · medium |
| U2 | Trend chart has no axis, values, or interaction | UX weakness · medium |
| U3 | Filtering a transaction list never shows the filtered total | UX weakness · medium |
| U4 | Future-dated entries join the balance and pin to the top of Recent activity | UX weakness · low |
| U5 | Insights segmented control stretches the full desktop width | UX weakness · low |
| C1 | No in-app numeric keypad or calculator | Competitive gap · medium |
| C2 | No recurring transactions; bills are monthly reminders only | Competitive gap · medium |
| C3 | No way to erase all data and start over | Competitive gap · medium |
| C4 | Currency hardcoded to ฿ | Competitive gap · low |
| F1 | `sync.js` orchestration has no automated coverage | Engineering risk · medium |

Findings already recorded in `docs/UX.md`'s "Known UI debt" are deliberately
excluded from this roadmap — that stream keeps its own ownership.

## Workstreams

| # | Workstream | Contains | Scope · risk | Status |
|---|---|---|---|---|
| WS-1 | Honest first run | D1 + the two empty states its removal exposes | M · low | **WI-023 Completed** |
| WS-2 | Reversible actions | D2 + a `role="status"` live region for toasts (toast half of D8) | M · medium | **WI-024 + WI-025 Completed** |
| WS-3 | History and dismissal | D3, in three releases (below) | M–L · see below | **WI-026 Ready; WI-027/028 Draft** |
| WS-4 | Transaction list at scale | D6 + U3 filtered totals | S · low | Not started |
| WS-5 | Storage durability | `navigator.storage.persist()` half of D5 | XS · none | Not started |
| WS-6 | Entry quality | U1 + D7 | S · low | Not started |
| WS-7 | Product decisions | Five open decisions (below) | — | **Blocking** |
| WS-8 | Planned improvements | U3, U2, C2, C4 — ordered below | S–XL | Not started |
| WS-9 | Sync orchestration coverage | F1 | M · medium | Gate before C2 |

WS-1's behavior is specified in `docs/specs/first-run-empty-defaults.md` and
executed by `docs/tickets/completed/WI-023.md`. WS-2's is specified in
`docs/specs/reversible-mark-paid-and-announced-toasts.md` and executed by
`docs/tickets/completed/WI-024.md` (shipped — the toast live region) and
`docs/tickets/completed/WI-025.md` (shipped — the reversible Mark paid).
The remaining workstreams have no spec yet — each needs one before it
becomes a ticket.

WS-2 covers D2's accidental-tap case (undo) but deliberately leaves D2's second
half open: `lastPaidCycle` still has no clearing path once the toast expires,
so deleting the generated expense later leaves the bill marked paid. Closing it
needs either a `billId` link on the transaction (schema + sync mappers) or an
"un-mark paid" control in Settings → Bills. **That is a sixth open product
decision** — see the spec's "Deliberately deferred" section for both options
and the bounded impact of leaving it open.

## WS-3's three releases

D3's hazard is `settings.js:170`'s `popstate` listener, which does not inspect
`event.state` and clears any open Settings sub-page on any pop. That only
collides when a sheet can be open *while* a Settings sub-page is open.
Verified in a real browser on Pixel 7, all six sheets:

| Sheet | Opens from | Co-open with a sub-page? |
|---|---|---|
| Add / Edit | Tab bar | No — the tab bar is hidden while a sub-page is open |
| Transactions Filters | Transactions screen | No |
| Insights Filters | Insights screen | No |
| Export | Settings **root** | No |
| Import | Settings **root** | No |
| **Manage** | Inside a Settings sub-page | **Yes** |

So:

1. **Release 1** — build the shared history owner (tags entries, dispatches on
   `event.state`), adopt it for the Add sheet only. `settings.js` untouched.
   Delivers the highest-value half of D3 at near-zero blast radius.
2. **Release 2** — Transactions Filters, Insights Filters, Export, Import.
   Still no `settings.js` change. Note Insights' Breakdown filter regenerates
   its markup on nearly every interaction, so its wiring must live inside the
   re-render, not a one-time setup call (`docs/ARCHITECTURE.md`).
3. **Release 3** — migrate the Settings sub-page onto the shared owner, then
   adopt the Manage sheet. The only release carrying real risk, now isolated.

Migrating all six at once is explicitly ruled out: five are trivially safe and
one carries all the risk, so batching would put the risky migration in a
release where a regression is hard to attribute.

All three releases are specified in
`docs/specs/back-button-dismisses-overlays.md` and ticketed as `WI-026`
(Ready), `WI-027` and `WI-028` (both `Draft`). The two Draft tickets carry
settled requirements and finished investigation, but every line of each calls
the module `WI-026` creates — they move to `Ready` once it exists and their
call names can be checked against it rather than predicted. One
correction the spec records: the shorthand "dispatches on `event.state`" above
is backwards as written — on `popstate`, `event.state` is the state being
landed *on*, and `main.js:73`/`:109` can `replaceState` a tag away — so the
owner dispatches off its own stack and uses the tag for identification only.

## Open product decisions (WS-7)

These block work. Each needs a maintainer answer before a spec can be written.

1. **English scope — is English a supported locale or a courtesy for Thai
   speakers?** Blocks D4. Decide first: it is the only open decision blocking a
   high-severity defect. Scope it *after* WS-1 ships — seeded bills and budgets
   are roughly two thirds of the Thai strings visible in English mode, so the
   remaining problem (built-in categories, the default account) is smaller and
   clearer. If English is real, built-in categories need translation keys and a
   rule for which name wins after a user rename.
2. **Multi-currency as a product capability.** Blocks C4. Deliberately *not*
   gated on the English decision — a Thai-first user may hold a USD savings
   account or a SGD travel account. Not a yes/no: it has to resolve per-account
   currency; cross-currency transfers (which need a rate stored on the row,
   since a historical transfer cannot be re-derived from today's rate); and
   whether Home's "Total balance", budgets, and Insights still aggregate to a
   single number across mixed currencies. "No" is a legitimate answer.
3. **Storage strategy — does the transaction store move to IndexedDB?**
   Gates that move only; WS-5 addresses eviction independently and should not
   wait for this. Measured: 357 KB at 2 000 transactions, ~28 000 before the
   quota. Quota is not the risk; eviction is.
4. **Are future-dated transactions a feature?** Shapes U4. Planned spending is
   legitimate; if it is not intended, the date field wants a ceiling. Today it
   is neither, which is why Home's balance and its month cards disagree with no
   visible cause.
5. **Erase-all semantics — this device, or the account?** Blocks C3. For a
   signed-in user a local-only wipe is undone by the next pull, so these are two
   different features with two different confirmations. Urgency drops once WS-1
   ships, since "escape the demo data" was one of its three motivations.

Deferred from WS-3: **should tab switches push browser history?** A routing-model
change affecting deep links, the PWA back stack, and every e2e navigation
assumption. The sheet fix does not need it.

## Priority 3 order

1. **Filtered totals (U3)** — no dependencies, smallest scope, shares a function
   with WS-4. Execute inside WS-4.
2. **Trend-chart redesign (U2)** — self-contained, read-only view over existing
   data. No schema, no sync, no mappers.
3. **Recurring transactions (C2)** — needs WS-2 (mark-paid semantics), decision 4
   (future-dated), and WS-9 (sync coverage) in front of it. **Also requires a
   lockstep edit of `supabase/functions/send-bill-reminders/index.ts:31`**, which
   holds a hand-written duplicate of `derived.js`'s `nextBillDueDate`. Adding a
   frequency field changes that algorithm; ship only the client half and push
   reminders keep firing monthly, silently, server-side, with nothing in the repo
   failing. Any spec for this must name that file.
4. **Multi-currency (C4)** — last on blast radius: `fmtMoney` is called from every
   screen, and the feature reaches into per-account currency, cross-currency
   transfers, aggregation, and every sync mapper.

## Deliberately not on this roadmap

- **In-app calculator / keypad (C1)** — reassess only after U1 ships; WS-6 may
  close enough of the gap that the build isn't justified.
- **Everything in `docs/UX.md`'s "Known UI debt"** — already ticketed work with
  recorded reasoning, including one consciously-shipped contrast failure. This
  roadmap does not reopen that stream.
- **U5** — belongs to the UI-debt stream above; fix it when that file is already
  open.
- **D9** — a one-line correction; ride it along with whatever touches sync next,
  which on this plan is WS-9. Don't schedule it.
- **Retro-cleaning seeded rows on existing installs** — `restore.js:15` already
  makes WS-1 new-installs-only, and some users will have edited those seeds into
  real budgets.
- **Last-write-wins and conflict UI** — the sync model is sound and deliberately
  chosen. Nothing in the audit argues against it.
- **Virtualising the transaction list** — cap-and-debounce first; virtualisation
  is gated on decision 3.
- **The rest of D8** (`aria-current`, `h1`, nav labels, skip link) — do it as one
  deliberate accessibility pass alongside extending `docs/UX.md`'s Accessibility
  section, which currently covers names and focus rings but nothing about
  conveying current state or announcing status. Not scattered across other
  tickets.

## Decisions already settled

Recorded so they are not relitigated:

- `navigator.storage.persist()` is split from D6's list work (WS-5), because it
  shares no code or verification with it and is correct under either answer to
  decision 3.
- The toast half of D8 ships with WS-2, because the undo toast *is* D2's remedy
  and a silent toast is not a remedy for screen-reader users.
- Multi-currency is its own decision, not a consequence of the English one.
- WS-3 is incremental, on the evidence above, not batched.
- WS-9 is a gate before recurring transactions, not immediate work: P1 barely
  touches sync, and building the harness first would delay user-facing fixes to
  insure against risk that is not yet present.
