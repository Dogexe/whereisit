-- Stage 1 of docs/specs/account-transfers.md. Widens transactions.type to
-- allow 'transfer' (previously income/expense only -- confirmed via direct
-- introspection of the live constraint before writing this migration, not
-- assumed) and adds a nullable to_account_id column.
--
-- No new "from" column: the existing account_id column already means "the
-- account this transaction belongs to" for an expense/income row, and for a
-- transfer it means the same thing -- the source account -- just paired
-- with to_account_id as the destination. Nullable, no FK, same precedent
-- as account_id/category_id (user_id is already nullable on transactions
-- for a local-only user; RLS + application-level lookups already cover the
-- edge case without Postgres needing to enforce it).
alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type = any (array['income'::text, 'expense'::text, 'transfer'::text]));
alter table public.transactions add column if not exists to_account_id text;
