-- User-controlled categories, stage 1 of the custom-categories spec
-- (repo/docs/specs/custom-categories.md). Additive only: transactions,
-- budgets, and bills still store their category as a plain name string
-- for now -- category_id columns on those three tables and the backfill
-- of existing rows come in stage 2, a separate migration.
--
-- Deliberately NOT a single `id text primary key` like the other five
-- tables in this schema (transactions/budgets/bills/goals/
-- push_subscriptions). Those all use a client-generated id that's
-- effectively globally unique on its own. Categories are different: the
-- app's 16 built-in categories (see categories.js's DEFAULT_CATEGORIES)
-- get the *same* fixed id (e.g. "default-expense-food") seeded into
-- every user's own row, on purpose -- that's what lets a rename be keyed
-- by a stable id that survives the rename, per the spec's core
-- requirement. A single-column `id` primary key would reject the second
-- user's row as a duplicate the moment two different accounts both seed
-- "default-expense-food". The composite (id, user_id) key below is what
-- makes that safe: each user's own copy of a given id is independently
-- unique, exactly as intended.
create table if not exists public.categories (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  name text not null,
  icon text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (id, user_id)
);

alter table public.categories enable row level security;

-- Matches the existing pattern on transactions/budgets/bills/goals
-- exactly: a single ALL policy scoped to `authenticated`, auth.uid() =
-- user_id for both qual and with_check. No anon access.
create policy "users manage own categories" on public.categories
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
