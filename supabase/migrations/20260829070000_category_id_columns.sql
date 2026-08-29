-- Stage 2 of docs/specs/custom-categories.md: adds a nullable category_id
-- to the three tables that currently store a category as a plain name
-- string. The existing `category` text column is deliberately left in
-- place (not dropped, not backfilled server-side) -- it stays the
-- fallback/rollback safety net for one release while the client-side
-- one-time backfill (sync.js's backfillCategoryIds) stamps categoryId
-- onto existing rows and the remaining screens migrate to it across
-- stages 3-5.
--
-- No foreign key constraint to categories(id, user_id): user_id is
-- nullable on all three of these tables already (pre-existing, not
-- introduced here), so a strict composite FK would reject a row with a
-- category_id set but a null user_id -- an edge case the app's own RLS
-- and application-level lookups already handle correctly without needing
-- Postgres to enforce it too.
alter table public.transactions add column if not exists category_id text;
alter table public.budgets add column if not exists category_id text;
alter table public.bills add column if not exists category_id text;
