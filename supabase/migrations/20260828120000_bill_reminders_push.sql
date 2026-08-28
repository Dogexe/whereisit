-- Bill reminders via Web Push.
--
-- This is the first migration file checked into this repo -- there were
-- none before (the four original tables, and error_logs, were all created
-- ad hoc against the live project and are only documented, not scripted,
-- in CLAUDE.md's schema section). Adding this table is what actually
-- forced starting one, per that section's own note.
--
-- VAPID keys themselves are NOT set by this file. They live in Supabase
-- Vault (vault.create_secret), applied once, out of band, with the real
-- key values -- never committed to git. This file only creates the
-- SECURITY DEFINER function the edge function uses to read them back,
-- and locks its EXECUTE grant down to service_role so no ordinary
-- authenticated/anon caller can ever read the private key through it.

-- === push_subscriptions ==================================================
-- One row per browser/device subscription. RLS matches the existing
-- pattern on transactions/budgets/bills/goals exactly: a single ALL
-- policy scoped to `authenticated`, auth.uid() = user_id for both qual
-- and with_check. No anon access, same as the rest of the schema.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_owner_all" on public.push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- === bills.last_notified_cycle ===========================================
-- Mirrors bills.last_paid_cycle's shape (a "YYYY-MM" cycle key, not a
-- boolean) so the reminder job can tell "already notified for this
-- bill's current cycle" apart from "already notified once, ever" --
-- exactly the same reasoning last_paid_cycle uses to know whether *this*
-- cycle specifically was paid. Send-once-per-cycle is what keeps this
-- from nagging: a bill that goes from "due tomorrow" to "due today" to
-- "overdue" over several days only gets one notification for that cycle,
-- the first time the daily job sees daysUntil <= 1 for it.
alter table public.bills add column if not exists last_notified_cycle text;

-- === pg_cron / pg_net ====================================================
-- Needed to invoke the send-bill-reminders edge function on a schedule.
-- GitHub Pages is static; this is the only piece of this app that runs on
-- an actual schedule anywhere.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- === VAPID key access for the edge function ==============================
-- The edge function runs with the service_role key (auto-injected into
-- every Supabase edge function's environment -- nothing to configure for
-- that part) and calls this function via supabase.rpc('get_vapid_keys')
-- to read the two secrets back out of Vault. search_path is pinned so
-- this can't be tricked into resolving `vault`/`decrypted_secrets` from
-- somewhere else; the revoke+grant below is what actually keeps this
-- private-key-bearing function unreachable from anon/authenticated.
create or replace function public.get_vapid_keys()
returns table(public_key text, private_key text)
language sql
security definer
set search_path = vault, public
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key');
$$;

revoke all on function public.get_vapid_keys() from public;
revoke all on function public.get_vapid_keys() from anon;
revoke all on function public.get_vapid_keys() from authenticated;
grant execute on function public.get_vapid_keys() to service_role;

-- === scheduled invocation =================================================
-- Daily at 00:00 UTC (07:00 Thailand time -- a reasonable morning-reminder
-- slot for the app's primary audience). The Authorization header carries
-- the project's anon key, which is not a secret (see sync.js's own
-- comment on SUPABASE_ANON_KEY -- access is enforced by RLS/this
-- function's own grants, not by hiding this key) -- it's only here to
-- satisfy the edge function's verify_jwt requirement, not to grant it any
-- elevated access; the function reaches its own service_role privileges
-- internally, independent of what called it.
select cron.schedule(
  'send-bill-reminders-daily',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://kbpnolgucodpiglarsoj.supabase.co/functions/v1/send-bill-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticG5vbGd1Y29kcGlnbGFyc29qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NDkzOTYsImV4cCI6MjEwMjQyNTM5Nn0.mDSJ8msVCVpWRntJTm6hN3etKKm1cq2R3AGhRlX-V0A'
    ),
    body := jsonb_build_object('trigger', 'cron')
  ) as request_id;
  $$
);
