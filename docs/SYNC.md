# Persistence, sync, auth, and Supabase schema

Read this when touching `storage.js`, `sync.js`/`merge.js`/`pending.js`/
`watermark.js`/`paginate.js`/`account.js`, auth, or any Supabase migration
or schema question. For everything else in `src/`, see
`docs/ARCHITECTURE.md`. For always-loaded invariants, see `CLAUDE.md`.

## Persistence (`storage.js`)

`localStorage` is the source of truth for offline use (`STORAGE_KEY` for
transactions, `SETTINGS_KEY` for lang/dark/budgets/bills/goals/accounts/
categories). Supabase is a sync layer on top, not the primary store.
`saveToStorage`/`saveSettings` report write failures via a toast —
deliberately fired via `queueMicrotask`, not synchronously, so it can't be
silently overwritten by whichever caller's own success toast fires right
after it (the ~20 call sites don't agree on ordering). Keep new
failure-reporting call sites deferred the same way.

## Sync (`sync.js`, plus `merge.js`/`pending.js`/`watermark.js`/`paginate.js`/`account.js`)

`syncNow` and the `push*`/`pull*` functions do last-write-wins per row using
an `updatedAt`/`updated_at` timestamp, with soft deletes (a `deleted`
boolean column, never a real `DELETE`). `syncNow` always pulls before
pushing. Sync runs on load, on `online`, on tab visibility change, every
25s, and after every local mutation. On failure (while online and signed
in), `syncNow` toasts once via `lastSyncFailed`, a module-level flag
suppressing repeat toasts during a continuing outage.

- **Pull side is incremental, not full-table, and paginated**: `merge.js`
  has the pure last-write-wins merge functions (`mergeRowsById`,
  `mergeBudgetsByCategory` — the latter preserves a documented pre-existing
  quirk, not a bug to "fix"), unit-tested in `tests/merge.test.js`.
  `paginate.js`'s `fetchAllPages()` uses **keyset (cursor) pagination** — a
  composite `(updated_at, id)` `.or()` filter, not `.range(offset, ...)`,
  since offset pagination can silently skip a row that moves across a page
  boundary mid-fetch. `watermark.js` filters pulls to `.gte("updated_at",
  watermark)`, advanced only from server-returned timestamps (never the
  local clock), using `.gte` (not `.gt`) so a same-millisecond boundary
  write is never permanently missed (merge functions are idempotent on a
  re-seen `updatedAt`).
- **Push side uploads only pending records, not the whole table, and in
  chunks**: every create/edit/delete pushes its own row immediately via
  `pushTx`/`pushDeleteTx`/`pushRows`, which marks the row(s) pending, sends
  in batches of `PUSH_CHUNK_SIZE` (500), and clears each chunk only once
  its network call confirms success — persisted to `localStorage` so an
  offline edit survives closing the app (`pending.js`). A mid-batch failure
  leaves the failed chunk and everything after it pending. `markAllPending()`
  runs once on a genuine new sign-in (`SIGNED_IN` event specifically);
  `resetWatermark()` runs alongside it.
- **Account isolation on a shared device**: `account.js`'s pure
  `shouldWipeLocalData(storedUserId, incomingUserId)` decides whether to
  wipe (only on an actual account *change*), unit-tested for all four
  cases. `main.js`'s auth listener wipes on `SIGNED_OUT` and on a mismatched
  `SIGNED_IN`/`INITIAL_SESSION` (the safety net for when sign-out never
  fired cleanly — both events need the same check, an early bug fixed once
  discovered). `wipeLocalAccountData()` clears transactions/budgets/bills/
  goals/pending/watermark, leaving `state.lang`/`state.dark` alone, but
  **re-seeds a default account and default categories** rather than wiping
  those two to empty (accounts because zero accounts breaks the Add
  screen's invariant; categories because they're closer to app vocabulary
  than personal data). A `syncEpoch` counter (`sync.js`, bumped by
  `setCurrentUser()` on any identity change) guards the pull side against an
  in-flight pull for the outgoing account resolving *after* a wipe — every
  pull discards its result if the epoch moved while in flight. The push
  side doesn't need this guard: RLS already rejects a stale push under a
  mismatched account server-side.
- **Failure modes to keep in mind if you touch this again**: (1)
  `dropPendingForRemovedIds()` exists because a pull's tombstone can remove
  a local record that still has a stale pending edit sitting in the map —
  without dropping it, the next push would resurrect a row another device
  already deleted. (2) `clearPending()` takes row *objects*, not bare ids,
  and only clears an entry if the map still holds that exact object by
  reference — this matters when two pushes for the same id overlap, so a
  stale first push's eventual success can't wipe out a newer, still-
  unconfirmed edit's pending entry.

## Auth (`sync.js` owns the client/state; the listener is in `main.js`'s boot)

Supabase Google OAuth. `SUPABASE_URL`/`SUPABASE_ANON_KEY` are hardcoded at
the top of `sync.js` — intentional, access is enforced by RLS scoped to
`user_id`, not by hiding this key. `sb.auth.onAuthStateChange` (in
`main.js`) is the single source of truth for `currentUser` (via
`setCurrentUser`, which also bumps `syncEpoch`). `signInWithGoogle`/
`signOutUser` check the SDK's returned `error` and show a toast on failure
— keep the try/catch if you touch these, since both are called
fire-and-forget.

## `hasLiveInputRisk()` (`sync.js`, imported back into `main.js`)

Guards against a background sync's re-render clobbering an in-progress
form (Add screen/sheet open, an inline Settings edit form open, focus in an
input on the current screen). Any new periodic/background re-render must
consult this before calling `renderScreen()`.

## Supabase schema (inferred from code — no migrations checked in before the Bill reminders pass)

Tables: `transactions`, `budgets`, `bills`, `goals`, `categories`,
`accounts`, `push_subscriptions`, `error_logs`. See the `*ToRow`/`rowTo*`
function pairs in `src/sync.js` for exact field mapping (e.g. `tx_date` not
`date`, `limit_amount` not `limit`). Since not every table has a checked-in
migration (some were created ad hoc against the live project and only
documented here — `supabase/migrations/` only exists from the Bill
reminders pass onward), cross-check actual column names/types against the
live Supabase project before assuming these mapper functions are
exhaustive.

- `transactions`/`budgets`/`bills`/`goals`/`categories`/`accounts`/
  `push_subscriptions` all have `id`, `user_id`, `deleted`, `updated_at`,
  plus table-specific columns, and a real FK to `auth.users(id)` with `ON
  DELETE CASCADE` (confirmed via `pg_constraint` introspection) — only
  `error_logs` is the exception (`NO ACTION`, nullable `user_id`, by
  design). `categories` uniquely has a **composite** `(id, user_id)`
  primary key, since its built-in categories intentionally share one fixed
  id across every user; every other table (including `accounts`, confirmed
  by direct introspection before building it) uses a plain single-column
  `id`. `pushRows()` in `sync.js` passes `{ onConflict: "id,user_id" }` only
  for `categories`.
- `transactions.type` allows `"income"`/`"expense"`/`"transfer"` (widened
  from just the first two). A transfer uses `account_id` as the source and
  `to_account_id` as the destination; `category` is `""` for a transfer
  (the column has a real `NOT NULL` constraint, found only by testing a
  live push, not from any schema doc). `account_id`/`to_account_id` are
  composite FKs to `accounts(id, user_id)` (`ON DELETE RESTRICT`, added in
  `20260903150000_transfer_account_fk_and_indexes.sql` after a
  post-migration security audit) — a transaction can only reference an
  account owned by that same row's own `user_id`, closing a gap where
  nothing previously stopped a row from citing a nonexistent or foreign
  account id. This was never a cross-user *read* gap (RLS on `transactions`
  keys visibility to the row's own `user_id`, never to `account_id`/
  `to_account_id`), only a self-integrity one. `categories.parent_id` has
  the same composite-FK shape against `categories(id, user_id)`, added
  earlier in `20260902120000_category_parent_id.sql` — see that migration's
  own comment for why a plain `parent_id → categories(id)` FK would have
  been wrong given the composite primary key below.
- **RLS is confirmed correctly configured** on every table above except
  `error_logs` (verified directly against the live project, most recently
  during the same post-migration audit that added the FKs above):
  `ALL`-command policy scoped to `authenticated` with `auth.uid() =
  user_id` for both `qual` and `with_check`, no `anon` access. Re-verify
  after any migration that touches these tables, but don't treat it as an
  open gap without checking first.
- `accounts.user_id`, `categories.user_id`, `categories.parent_id`,
  `transactions.account_id`, and `transactions.to_account_id` are all
  indexed (`20260903150000_transfer_account_fk_and_indexes.sql`) — every
  query against `accounts`/`categories` is RLS-filtered by `user_id`, so
  this is load-bearing for scale, not just FK-lookup hygiene. The two
  composite-FK indexes (`parent_id`/`account_id`/`to_account_id` paired
  with `user_id`) matter specifically because Supabase's advisor treats a
  single-column index on just the leading column as *not* covering a
  composite FK — confirmed empirically, not assumed.
- `error_logs` has a deliberately different RLS shape: `INSERT` only, for
  `anon`+`authenticated`, `with_check true` — no `select`/`update`/`delete`
  policy for those roles, so default-deny means nobody using the app can
  read a log back through the app's own key. Read it via the Supabase
  dashboard directly.
- `bills.last_notified_cycle` (a `"YYYY-MM"` cycle key, mirroring
  `last_paid_cycle`'s shape) tracks the bill-reminders job's once-per-cycle
  send limit. VAPID keys live in Supabase Vault, read back only via a
  `SECURITY DEFINER` function (`get_vapid_keys()`) granted to `service_role`
  only.
