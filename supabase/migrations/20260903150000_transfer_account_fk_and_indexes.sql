-- Follow-up from a Supabase security/performance audit run after the
-- accounts/transfers/category-nesting migrations. Two unrelated fixes
-- bundled here since they came out of the same review pass; the audit's
-- other findings (auth_rls_initplan pattern, pg_net schema placement,
-- leaked-password protection) predate this migration batch and are left
-- alone as out of scope.
--
-- 1. transactions.account_id/to_account_id had no constraint tying them to
--    an account actually owned by the same user_id -- unlike
--    categories.parent_id, which already gets this right via a composite
--    FK to categories(id, user_id) (20260902120000_category_parent_id.sql).
--    RLS on transactions is keyed to transactions.user_id only, never to
--    account_id/to_account_id, so this was never a cross-user read/write
--    path (a row is only ever visible to its own owner regardless of what
--    account it references) -- but nothing stopped a user's own row from
--    referencing a nonexistent or foreign account id, corrupting that
--    user's own client-side balance/list rendering. Confirmed via a live
--    data check before writing this: 0 existing rows violate it (0
--    orphaned account_id/to_account_id, 0 already pointing at another
--    user's account), so this lands as a normal validated constraint, not
--    NOT VALID.
--
--    MATCH SIMPLE (Postgres' default) means a null account_id/to_account_id,
--    or the existing nullable-user_id local-only-user edge case, still
--    isn't checked -- same precedent category_id/account_id's own prior
--    migrations already established for why that's fine here too.
--
--    accounts.id is already a single-column primary key; adding a separate
--    UNIQUE(id, user_id) (not touching the PK itself) is what lets the
--    composite FK reference it without disturbing pushRows()'s existing
--    plain "id" onConflict target for this table.
--
--    ON DELETE RESTRICT mirrors category_parent_id's own reasoning: a
--    narrow safety net against a direct, out-of-band hard delete only --
--    the app's own deleteAccount() already blocks deleting an account any
--    transaction still references (accountUsageCount), so this constraint
--    should never actually fire in normal use.
alter table public.accounts add constraint accounts_id_user_id_key unique (id, user_id);

alter table public.transactions add constraint transactions_account_id_fkey
  foreign key (account_id, user_id) references public.accounts(id, user_id)
  on delete restrict;
alter table public.transactions add constraint transactions_to_account_id_fkey
  foreign key (to_account_id, user_id) references public.accounts(id, user_id)
  on delete restrict;

-- 2. accounts.user_id and categories.user_id had no covering index --
-- every query against either table is RLS-filtered by user_id (categories'
-- own composite (id, user_id) primary key doesn't serve a user_id-only
-- filter), so every query on these two tables was a full sequential scan.
-- Surfaced by the Supabase performance advisor and confirmed directly
-- against pg_indexes.
create index if not exists accounts_user_id_idx on public.accounts(user_id);
create index if not exists categories_user_id_idx on public.categories(user_id);

-- categories_parent_id_fkey and the two transactions FKs added in step 1
-- above are composite -- Supabase's advisor specifically wants an index
-- covering the *full* referencing column set for a composite FK, not just
-- its leading column (confirmed empirically: a single-column index on just
-- parent_id/account_id/to_account_id still left all three flagged as
-- unindexed). parent_id in particular has much lower cardinality than
-- account_id/to_account_id (a handful of category ids shared across every
-- user, vs. effectively-unique per-user account ids), so the trailing
-- user_id column here isn't just for the advisor -- it's what keeps a
-- parent_id lookup from scanning every other user's children sharing the
-- same default-category id before narrowing to this user's own.
create index if not exists categories_parent_id_idx on public.categories(parent_id, user_id);
create index if not exists transactions_account_id_idx on public.transactions(account_id, user_id);
create index if not exists transactions_to_account_id_idx on public.transactions(to_account_id, user_id);
