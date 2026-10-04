-- docs/review/patches/L3-M4-free-calc-pending.sql
--
-- ⚠️ NOT RUN. Drafted 4 Oct 2026 (LEAD1 task L3, migration M4; design in docs/review/design-lead1.md sections 1.6 and 4).
-- To become supabase/migrations/2026MMDD_free_calc_pending.sql.
--
-- RUN ORDER (L3, after the L3 code is live): THIS FILE (M4), then L3-M6-profiles-on-signup.sql (M6), then
-- L3-M4-verify.sql and L3-M6-verify.sql. M4 and M6 do not depend on each other. Until M4 runs, POST
-- /api/ghg/free-calc/pending answers "could not be kept just now" (500): nothing calls it before the L4 screens.
--
-- WHAT IT DOES. Creates public.free_calc_pending: a visitor's calculation held for 24 hours, keyed by email, while
-- they confirm the address with a sign-in code. Written by /pending (no session), read and deleted by /claim once the
-- address is verified, and purged by /pending after expires_at. SERVICE ROLE ONLY: RLS on with no policy, and every
-- privilege revoked from public, anon and authenticated, so no browser can read another visitor's email or figures.
--   - email_key is the lower-cased, trimmed address (lib/assessmentSubmitGuard.ts recipientKey); /claim matches it
--     against the session's verified email, and an id passed by the client must carry the same key.
--   - payload is the calculation as the wizard drafts it (lib/ghg/draft.ts), at most 256 KB; /claim recomputes every
--     figure from it with figuresForSave, so nothing in it is ever stored as a figure.
--   - ip is kept with the hold for the rate limit and abuse review only, and goes when the record does (24 hours).
--
-- GRANTS (memory: grants-separate-from-rls): revoke all from public, anon, authenticated; grant select, insert,
-- delete to service_role. No update: a hold is written once and then claimed or purged.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.
-- PARSED OFFLINE with pglast on 4 Oct 2026 (see the L3 report). Re-parse after any edit.
-- ROLLBACK: L3-M4-rollback.sql.

begin;

do $pre$
begin
  if to_regclass('public.free_calc_pending') is not null then
    raise exception 'Pre-flight: public.free_calc_pending already exists. Already run? Nothing was changed.';
  end if;
end
$pre$;

create table public.free_calc_pending (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  email_key   text not null,
  full_name   text,
  company     text,
  payload     jsonb not null,
  ip          text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  constraint free_calc_pending_email_len check (char_length(email) between 3 and 320),
  constraint free_calc_pending_email_key_normalised check (email_key = lower(btrim(email_key))),
  constraint free_calc_pending_text_len check (coalesce(char_length(full_name), 0) <= 200 and coalesce(char_length(company), 0) <= 200),
  constraint free_calc_pending_payload_size check (pg_column_size(payload) <= 262144),
  constraint free_calc_pending_expiry check (expires_at > created_at)
);

comment on table public.free_calc_pending is
  'A visitor''s free Scope 1 and Scope 2 calculation, held for 24 hours by email until they confirm the address (LEAD1). Service role only. Claimed and deleted by /api/ghg/free-calc/claim; purged after expires_at by /api/ghg/free-calc/pending.';

create index free_calc_pending_email_key_created on public.free_calc_pending (email_key, created_at desc);
create index free_calc_pending_expires on public.free_calc_pending (expires_at);

alter table public.free_calc_pending enable row level security;

revoke all on table public.free_calc_pending from public, anon, authenticated;
grant select, insert, delete on table public.free_calc_pending to service_role;

do $post$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.free_calc_pending'::regclass) then
    raise exception 'Post-flight: RLS is not on. Nothing committed.';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'free_calc_pending') then
    raise exception 'Post-flight: a policy exists on free_calc_pending; it must have none. Nothing committed.';
  end if;
  if has_table_privilege('anon', 'public.free_calc_pending', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.free_calc_pending', 'select,insert,update,delete') then
    raise exception 'Post-flight: anon or authenticated holds a privilege on free_calc_pending. Nothing committed.';
  end if;
  if not (has_table_privilege('service_role', 'public.free_calc_pending', 'select')
          and has_table_privilege('service_role', 'public.free_calc_pending', 'insert')
          and has_table_privilege('service_role', 'public.free_calc_pending', 'delete')) then
    raise exception 'Post-flight: service_role lacks select, insert or delete. Nothing committed.';
  end if;
  raise notice 'M4 applied. Next: L3-M6-profiles-on-signup.sql, then the two L3 verify scripts.';
end
$post$;

commit;
