-- New `accounts` table, stage 1 of docs/specs/multi-account-support.md.
-- Additive only -- nothing in the UI reads/writes this yet; this exists so
-- sync plumbing (sync.js's pullAccounts/pushRows, pending.js/watermark.js's
-- TABLES lists) has a real table from the first stage, same shape as
-- custom-categories.md's own stage 1.
--
-- Plain single-column `id text primary key`, matching transactions/budgets/
-- bills/goals/push_subscriptions -- NOT categories' composite (id, user_id)
-- key, which exists only because categories' built-ins intentionally share
-- one fixed id across every user. Accounts have no equivalent (even the
-- default "Cash" account gets a normal per-user-unique id), so pushRows()
-- needs no new onConflict special case for this table either -- see the
-- spec's "Decisions made without a direct question" section.
--
-- `archived` (not hard delete) is the user-facing lifecycle for an account
-- the user no longer wants to log new transactions against but still wants
-- to see historical balance/activity for. `deleted` is the separate,
-- unrelated soft-delete tombstone every synced table already has for
-- cross-device sync (see mergeRowsById) -- an account is only ever
-- `deleted` if the user's own data is being wiped or an account row is
-- corrected by hand; the app itself never offers a delete action.
create table if not exists public.accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null,
  opening_balance numeric not null default 0,
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

alter table public.accounts enable row level security;

-- Matches the existing pattern on transactions/budgets/bills/goals/categories
-- exactly: a single ALL policy scoped to `authenticated`, auth.uid() =
-- user_id for both qual and with_check. No anon access.
create policy "users manage own accounts" on public.accounts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
