# Spec: user-controlled categories

Status: **stage 1 of 5 done and live-verified**; stages 2-5 not yet built. Interviewed to find the real goal, then researched the current codebase (categories are plain hardcoded strings with no id anywhere) before staging a build plan, built and verified incrementally rather than as one big change — matching this project's other multi-stage passes (e.g. "Bill reminders via Web Push", the sync-efficiency/sync-correctness passes).

**Stage 1 — done.** New `public.categories` table applied to the live project (`supabase/migrations/20260829060000_categories.sql`), RLS confirmed matching the existing pattern, no new security advisories. `DEFAULT_CATEGORIES` in `src/categories.js` derives all 16 built-in categories' fixed slug ids programmatically from the existing `CATEGORIES`/`CATEGORY_ICON` maps (not hand-retyped, to rule out a Thai-text transcription error). `state.categories` + `setCategories`, `storage.js` persistence, `sync.js`'s `rowToCategory`/`categoryToRow` mappers and `pullCategories`, and the `pending.js`/`watermark.js` table lists all follow the exact shape already used for bills/goals (`mergeRowsById`, no quirk to preserve — categories never had budgets' category-name-keying problem to begin with). `markAllPending`/`syncNow` wired in. One deliberate deviation worth knowing about: `wipeLocalAccountData()` re-seeds `categories` back to `DEFAULT_CATEGORIES` instead of emptying it like transactions/budgets/bills/goals — because unlike those, categories are closer to app vocabulary the Add screen's dropdown needs to function at all, not personal data that should disappear on sign-out.

Nothing in the UI reads `state.categories` yet — this stage is additive by design, confirmed via `npm test` (73/73 pass, unchanged) and a live browser check (categories correctly seed to 16 and persist through `localStorage`, no console errors, existing screens unaffected).

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
4. **Icon picker**: choose from the app's existing icon set (the 41 icons already in `icons/sprite.svg`) rather than free-form icon entry or upload.
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

New icon-picker component: no existing precedent in the app (`GOAL_ICONS` in `categories.js:40` is only auto-cycled by index today, never user-selected), rendering the 41 `icons/sprite.svg` symbols as a selectable grid inside the inline add/edit form.

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
