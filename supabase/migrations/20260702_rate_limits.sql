-- supabase/migrations/20260702_rate_limits.sql
-- Generic fixed-window rate-limit ledger for PUBLIC endpoints. First consumer:
-- /api/order/quote-request (abuse protection before it can trigger live invoice creation in I4).
--
-- Written ONLY by the service-role server (lib/rateLimit.ts via lib/supabaseAdmin). Never read
-- or written by browser clients. RLS is enabled with NO policies → anon/authenticated get zero
-- access; the service-role key bypasses RLS (BYPASSRLS), so the server still reads/writes freely.
--
-- Re-runnable: create-if-not-exists, IF NOT EXISTS indexes, enable-RLS is a no-op if already on.

create table if not exists public.rate_limits (
  id         bigint generated always as identity primary key,
  bucket     text        not null,   -- logical endpoint, e.g. 'order-quote-request'
  ip         text,                   -- client IP (x-forwarded-for), nullable
  email      text,                   -- submitted email (lowercased), nullable
  created_at timestamptz not null default now()
);

-- Support the windowed COUNT queries (bucket + ip/email + created_at).
create index if not exists rate_limits_bucket_ip_time_idx    on public.rate_limits (bucket, ip, created_at);
create index if not exists rate_limits_bucket_email_time_idx on public.rate_limits (bucket, email, created_at);

-- RLS on, no policies: browser roles (anon/authenticated) get nothing; service_role bypasses.
alter table public.rate_limits enable row level security;

-- ⚠️ HOUSEKEEPING: rows accrue indefinitely. Prune anything older than the widest window
-- periodically (a scheduled job or manual run) — rows outside every window are dead weight:
--   delete from public.rate_limits where created_at < now() - interval '1 day';

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────
--   select relname, relrowsecurity from pg_class where relname = 'rate_limits';   -- rowsecurity = t
--   select polname from pg_policy where polrelid = 'public.rate_limits'::regclass; -- expect ZERO rows
