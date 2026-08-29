# Spec: user-controlled categories

Status: **stages 1-3 of 5 done and live-verified**; stages 4-5 not yet built. Interviewed to find the real goal, then researched the current codebase (categories are plain hardcoded strings with no id anywhere) before staging a build plan, built and verified incrementally rather than as one big change — matching this project's other multi-stage passes (e.g. "Bill reminders via Web Push", the sync-efficiency/sync-correctness passes).

**Stage 1 — done.** New `public.categories` table applied to the live project (`supabase/migrations/20260829060000_categories.sql`), RLS confirmed matching the existing pattern, no new security advisories. `DEFAULT_CATEGORIES` in `src/categories.js` derives all 16 built-in categories' fixed slug ids programmatically from the existing `CATEGORIES`/`CATEGORY_ICON` maps (not hand-retyped, to rule out a Thai-text transcription error). `state.categories` + `setCategories`, `storage.js` persistence, `sync.js`'s `rowToCategory`/`categoryToRow` mappers and `pullCategories`, and the `pending.js`/`watermark.js` table lists all follow the exact shape already used for bills/goals (`mergeRowsById`, no quirk to preserve — categories never had budgets' category-name-keying problem to begin with). `markAllPending`/`syncNow` wired in. One deliberate deviation worth knowing about: `wipeLocalAccountData()` re-seeds `categories` back to `DEFAULT_CATEGORIES` instead of emptying it like transactions/budgets/bills/goals — because unlike those, categories are closer to app vocabulary the Add screen's dropdown needs to function at all, not personal data that should disappear on sign-out.

**Stage 2 — done.** `category_id` (nullable text) added to `transactions`/`budgets`/`bills` (`supabase/migrations/20260829070000_category_id_columns.sql`); the existing `category` text column stays untouched as a fallback. `sync.js`'s `backfillCategoryIds()` (called once at boot, gated on a local flag) stamps `categoryId` onto every pre-existing row by matching name+type against the current category list, then pushes just the changed rows through the existing chunked `pushRows` — live-verified against a fresh local install's default seed data: all 4 budgets and 4 bills matched correctly with zero "Uncategorized" fallbacks needed. `derived.js`'s `computeBudgets`/`computeBudgetsForYear`/`unbudgetedSpend`/`unbudgetedSpendForYear`/`checkBudgetAlert`/`computeBreakdown`/`computeBreakdownForYear` all switched from matching by raw `.category` string to a `categoryId`-first lookup (via new `findCategoryId`/`categoryDisplayName` helpers in `categories.js`) that falls back to name+type matching for any row that predates the backfill — so display always reflects the category's *current* name, not a possibly-stale stored string, which is the actual point of this migration. `merge.js`'s `mergeBudgetsByCategory` quirk (ignored `updatedAt`, never honored delete tombstones) is gone — `pullBudgets` now uses a plain `mergeRowsById` like bills/goals, since budgets already carried a real row id end-to-end and category-name-keying was never actually necessary. This is a genuine behavior change: a budget deleted on one device now correctly disappears from another device's next sync, which it never did before.

`computeBudgets`/`checkBudgetAlert`/`computeBreakdown` had zero test coverage before this stage — added 4 new tests in `tests/derived.test.js` specifically covering categoryId-based matching, including a rename scenario (budget/transaction's stored `.category` string differs from the category's current name, confirming display resolves via `categoryId` not the stale string) and a pre-backfill row (no `categoryId` at all, confirming the name+type fallback). All 72 tests pass (68 after removing `mergeBudgetsByCategory`'s 5 now-obsolete tests, +4 new). Live-verified end-to-end in a browser on a fresh local install: added a transaction that crossed a budget's 80% threshold, confirmed `checkBudgetAlert`'s toast fired with the correct category name, and confirmed Home's budget preview, Insights' Budgets tab, and Insights' Categories breakdown all rendered correctly — these three screens weren't code-changed in this stage but consume the refactored functions' output, so this was the actual regression check.

**Stage 3 — done.** Settings gained a full "Categories" management section (`src/screens/settings.js`), following the exact `wireInlineCrud`/`manageRowHtml`/`inlineForm` pattern already used for Budgets/Bills/Goals — no new UI pattern invented. Add/edit/delete all work, including on today's 16 built-ins, per the confirmed "full control" requirement. A category's `type` is only choosable at creation, never editable afterward (changing an expense category to income out from under budgets/bills that reference it is a data-integrity question this spec deliberately doesn't take on — renaming and re-iconing don't have that problem, so those stay editable). New icon picker (`CATEGORY_ICON_CHOICES` in `categories.js`, the ~16 icons already used by a built-in category — corrected from an earlier draft of this doc that said "all 41 sprite icons," which didn't match what was actually confirmed in the interview) renders as a grid; selection is tracked purely via a `.selected` DOM class, read directly at save time, no extra state field needed. New pre-delete "in use" check (`categoryUsageCount`) — this app's first delete flow that queries other tables before allowing deletion — reuses `derived.js`'s exported `resolveCategoryId` so it catches a category still referenced by name alone (pre-backfill or pre-stage-4 rows), not just rows with `categoryId` already set; blocks with a toast naming the exact count.

Also folded into this stage (not originally called out, found while implementing): Budgets' and Bills' own category-picker `<select>`s in Settings (`budgetFormHtml`/`billFormHtml`) switched from the hardcoded `CATEGORIES.expense` list to `state.categories` (id-valued options, name resolved via `categoryDisplayName`) — otherwise creating a *new* budget/bill right after renaming a category would still show the stale name, which would make the rename feature look broken in its own neighboring UI. `budgetRowHtml`/`billRowHtml`'s icon rendering also now resolves through the live category record first, so an icon edit shows up immediately on those rows too. Both `saveBudgetForm`/`saveBillForm` now write `categoryId` directly at creation time (not just `.category` name) — so unlike transactions (still stage 4's job), new budgets/bills no longer depend on the backfill's name+type fallback at all.

Live-verified end-to-end in a browser: added a custom category (icon picker selection confirmed via a different-icon pick), deleted it successfully (not in use); attempted to delete an in-use built-in (blocked with the correct "1 item" count, toast text confirmed via DOM); renamed a built-in and confirmed the new name instantly appeared in the category list, the budget row, the budget's own edit-form label, Home's budget preview, *and* a fresh "add budget" dropdown (which also correctly excluded already-budgeted categories by id); created a real new budget through the id-based picker end-to-end. Confirmed in both light/dark theme and Thai/English, including that the new icon-picker buttons get a visible keyboard-focus outline (matching the earlier UI/UX-fundamentals pass's `.btn:focus-visible` treatment, added here too since `.icon-picker-option` isn't a `.btn`). Zero console errors throughout.

Nothing in the UI writes `categoryId` yet on a *newly created transaction* specifically (that's stage 4 — the Add screen) — the read path already tolerates that via the same name+type fallback the backfill itself uses, so there's no functional gap, just an efficiency one (every new transaction still needs a fallback lookup until stage 4 ships).

## Goal

Full user control over income/expense categories — add, rename, and delete, including today's *built-in* categories (Food & Drinks, Salary, etc.), not just ones the user creates. Categories sync across devices via Supabase, consistent with how transactions/budgets/bills/goals already work.

The request started as "add edit or delete categories manually." Interviewed to find the actual driver: not a specific missing category, not clutter, not wrong wording — just wanting full control over the list going forward. That framing is why built-ins being editable/deletable is in scope rather than layering custom categories on top of a protected default list.

## Why this needs a schema change, not just new UI

Categories today (`src/categories.js`) are plain hardcoded Thai strings with **no id at all**:
- `CATEGORIES = { income: [...strings], expense: [...strings] }`
- `transactions.category`, `budgets.category`, `bills.category` (Supabase columns, all `text` type) store the raw string directly — confirmed via `src/sync.js`'s mapper functions (`rowToTx`/`txToRow` lines 41-50, `budgetRowToObj`/`budgetToRow` lines 51-57).
- `CATEGORY_KEYWORDS` (used by `guessCategory` for note-based auto-suggestion) and `CATEGORY_ICON` (used by `iconFor()`) are both keyed by the exact category string.

One of the confirmed requirements is that **renaming a category must propagate everywhere** — every past transaction/budget/bill using it should show the new name instantly. With today's plain-string model, a rename would mean rewriting every affected row. The correct fix is giving categories a stable id that transactions/budgets/bills reference, with the display name resolved by lookup — not stored per-row. That's a real, if fairly standard, schema migration across three existing tables, which is why this is staged rather than a single change.

One thing this unlocks for free: `src/merge.js`'s `mergeBudgetsByCategory` currently has to key by category *name* (not id) because that's the only shared field it has — documented in its own doc comment as a deliberate-to-preserve quirk, since it ignores `updatedAt` and never honors deletion tombstones. Budgets already carry a real `id` end-to-end today (`src/state.js:15-18`, and Settings' UI already keys edit/delete by id at `settings.js:75,101,113`) — the sync-merge path is the only place still using category-name matching. Once budgets reference `category_id`, this becomes a plain id-keyed merge like everything else (`mergeRowsById`), which is a genuine correctness improvement: a budget deleted on one device will, for the first time, correctly disappear on another device's next sync.

## Decisions (confirmed via interview)

1. **Full CRUD**, including built-in categories — not just additive custom ones. (Answer to "what's actually driving this": "just want full control.")
2. **Syncs across devices** via a new Supabase table, consistent with transactions/budgets/bills/goals, rather than local-only.
3. **Deleting an in-use category is blocked** (with an explanation naming what still references it), not auto-relabeled to "Uncategorized" and not silently orphaned. No reassignment UI in v1 — the user fixes the conflicting transactions/budgets themselves first, then deletes.
4. **Icon picker**: choose from the ~15 icons already used by a built-in category (food, car, home, etc.), not the app's full icon set or free-form entry — stays visually consistent with the rest of the app, no new icons to design.
5. **Renaming propagates everywhere** instantly — this is the requirement driving the whole id-based schema change described above.

## Decisions made without a direct question (flagged for review before building)

- **Auto-guess (`guessCategory`) keeps working for built-in categories, not custom ones.** Each of today's 16 defaults gets a fixed internal slug id at seed time (e.g. `default-food`, mechanically derived from `CATEGORY_ICON`'s existing keys in `categories.js:33-37`), and `CATEGORY_KEYWORDS` keys off that id instead of the display string — so keyword matching survives a rename. There's no UI today for defining custom keywords, and building one is out of scope; a category the user creates from scratch simply won't get auto-suggested from note text.
- **Category names stay plain, single-language free text** — no `[th,en]` translation pairs like the rest of the app's UI strings (`src/i18n.js`'s `STRINGS` pattern). Category names are user-authored-equivalent content, same as a transaction note or bill name, neither of which the app translates either. (This also matches today's actual behavior — category names already display in Thai regardless of the language toggle, confirmed via `screens/router.js`'s `renderChrome()` never touching them.)
- **Unmatched legacy category text falls back to an "Uncategorized" default category** during the one-time backfill (stage 2 below), rather than blocking the whole migration on every edge case (e.g. a category name that was manually edited in the database, or drifted some other way).
- **The one-time backfill re-syncs every existing transaction/budget/bill once.** Each row gets a fresh `updated_at` when it's stamped with its new `category_id`, reusing the existing chunked `pushRows` (`src/sync.js`, `PUSH_CHUNK_SIZE`-sized batches) so it doesn't build one oversized request for a user with thousands of transactions. This is a one-time cost when the feature first ships, gated behind a local flag so it never re-runs.

## Staged build plan

### Stage 1 — `categories` table + sync plumbing (additive, no behavior change yet)
New Supabase table: `id, user_id, type, name, icon, sort_order, updated_at, deleted`. RLS matching the existing four-table pattern (one `ALL` policy, `auth.uid() = user_id`). New migration file following `supabase/migrations/20260828120000_bill_reminders_push.sql`'s precedent (this repo's first checked-in migration, from the bill-reminders pass).

Today's 16 built-ins get fixed slug ids assigned at seed time (e.g. `default-food`), seeded locally on first load (matching how budgets/bills already ship with sample defaults) and once per Supabase account on first sync. New `state.categories` array + setter in `src/state.js`, `rowToCategory`/`categoryToRow` mappers in `src/sync.js`, `pushCategories`/`pullCategories` following `pullBudgets`'s existing shape, reusing `mergeRowsById` directly (no quirk to preserve here — unlike budgets today).

Categories join the five-table wiring already used by the other four: `markAllPending`, `wipeLocalAccountData` (account-isolation on sign-out/account-switch), `syncNow`'s pull/push/`dropPendingForRemovedIds` sequence, and `pending.js`/`watermark.js`'s `TABLES` arrays.

**Verify**: sign in on two devices, confirm the 16 default categories appear identically with matching ids on both; a local-only (never signed in) user still sees the defaults with zero network calls.

### Stage 2 — `category_id` backfill on transactions/budgets/bills + the merge fix
Add nullable `category_id` to `transactions`, `budgets`, `bills`. The existing `category` text column stays for one release as a fallback/rollback safety net.

One-time local backfill matches existing rows to the new category records by exact name+type match (falling back to "Uncategorized" per the decision above for anything unmatched), pushed via the existing chunked `pushRows`, gated behind a one-time local flag.

`src/derived.js`'s category-string equality (`computeBudgets`, `computeBudgetsForYear`, `unbudgetedSpend`/`unbudgetedSpendForYear`, `checkBudgetAlert`, `computeBreakdown`/`computeBreakdownForYear`) switches from `t.category === b.category` string matching to `categoryId` matching, with display name resolved via a new `categoryName(id)` lookup helper. `mergeBudgetsByCategory` (`src/merge.js:32-40`) replaced by a direct `mergeRowsById` call.

**Verify**: existing transactions/budgets/bills retain correct category display after backfill, on both a fresh local-only profile and an existing multi-device account; a budget deleted on device A now correctly disappears from device B on its next sync (a deliberate behavior change from today, worth confirming feels right in practice, not just in theory).

### Stage 3 — Settings "Categories" management UI
New manage group in `state.settingsGroupOpen` and a new `state.categoryEditId`, following the exact `wireInlineCrud`/`manageRowHtml`/`inlineForm` pattern already used for Budgets/Bills/Goals (`src/screens/settings.js:26-66`) — no new UI pattern invented, reuses what exists.

New icon-picker component: no existing precedent in the app (`GOAL_ICONS` in `categories.js:40` is only auto-cycled by index today, never user-selected), rendering the ~15 icons already used by a built-in category as a selectable grid inside the inline add/edit form (see decision 4 above — not the app's full icon sprite).

New pre-delete "in use" check: this app's first delete flow that queries other tables before allowing deletion (today's `deleteBudget`/`deleteBill`/`deleteGoal` in `settings.js` have no such guard at all). Blocks with a toast naming how many transactions/budgets/bills still reference the category.

**Verify**: attempting to delete an in-use category is blocked with an accurate count; renaming a category instantly reflects across Home/Insights/Transactions without needing a full reload.

### Stage 4 — Add screen + auto-guess migration
`src/screens/add.js`'s category `<select>` and `state.formCategory` move to `state.formCategoryId`. `guessCategory`/`CATEGORY_KEYWORDS` re-keyed to the default-slug ids assigned in stage 1, so auto-suggest survives a rename. Kept as its own stage since it touches auto-suggest logic specifically, distinct from the purely-visual changes in stage 5.

**Verify**: adding a transaction still auto-guesses the right category from note text for built-in categories even after one has been renamed; a newly created custom category has no auto-guess behavior (expected, per the decision above) and doesn't error.

### Stage 5 — Remaining display touchpoints
`src/screens/transactions.js`'s category filter dropdown and filter/search matching, `src/screens/insights.js`'s category breakdown display, `src/screens/tx-row.js`'s icon lookup (`iconFor`) — all pure read/display, lower risk than stage 4, batchable together in one pass.

**Verify**: filtering transactions by category, and the Insights category breakdown, both reflect renamed categories correctly and show the right icon for both built-in and custom categories.

## Explicitly out of scope

- Reassigning a category's existing transactions/budgets as part of deletion — v1 is block-only; the user resolves conflicts manually before deleting.
- User-defined auto-guess keywords for custom categories.
- Reordering categories beyond whatever `sort_order` defaults to at creation time.
