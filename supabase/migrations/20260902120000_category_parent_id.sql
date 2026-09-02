-- One level of category nesting (repo/docs/specs/category-nesting.md, stage
-- 1). Additive only: no existing column changes, no behavior change until
-- the app itself starts writing/reading parent_id in a later stage.
--
-- Nullable text, not a foreign-key-only column with no default -- null
-- means "top-level category", exactly like today's flat model. Composite
-- FK (parent_id, user_id) -> categories(id, user_id), matching this
-- table's own composite primary key (see 20260829060000_categories.sql's
-- doc comment: built-in categories intentionally share the same id across
-- every user's row, so a plain parent_id -> categories(id) FK would let
-- one user's category reference a same-id row belonging to a different
-- user). `on delete restrict` is a narrow safety net against a direct,
-- out-of-band hard delete only -- this app's own deleteCategory() never
-- issues a real SQL DELETE, it always soft-deletes (deleted = true), so
-- the actual live guard against deleting a parent that still has children
-- is the app-level childrenOf(...) check added in this same spec's stage
-- 2, not this constraint.
alter table public.categories add column if not exists parent_id text;
alter table public.categories
  add constraint categories_parent_id_fkey
  foreign key (parent_id, user_id) references public.categories(id, user_id)
  on delete restrict;

-- RLS unchanged: the existing single ALL policy (auth.uid() = user_id) on
-- this table already covers every column, including this new one -- no
-- new policy needed.
