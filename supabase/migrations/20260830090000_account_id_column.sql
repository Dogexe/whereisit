-- Stage 2 of docs/specs/multi-account-support.md. Nullable, no FK -- matches
-- category_id's own precedent exactly (user_id is already nullable on
-- transactions for a local-only user; RLS + application-level lookups
-- already cover that edge case without Postgres needing to enforce it too).
alter table public.transactions add column if not exists account_id text;
