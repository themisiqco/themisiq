-- docs/review/patches/L6-M5-marketing-consents.sql
--
-- ⚠️ NOT RUN. Drafted 5 Oct 2026 (LEAD1 task L6, migration M5; design in docs/review/design-lead1.md sections 4 "M5"
-- and 5). To become supabase/migrations/2026MMDD_marketing_consents.sql.
--
-- RUN ORDER (L6): AFTER the L6 code is deployed is fine and so is before: the code writes this table only through the
-- service role, and until it exists the claim still saves (the consent write is logged and skipped). Then
-- L6-M5-verify.sql. Rollback: L6-M5-rollback.sql.
--
-- WHY. CASL puts the burden of proving consent on the sender. Every choice made at the "Keep my results" box, ticked or
-- not, and every later change on /dashboard, is a row here: the exact wording shown and its version, where it was
-- shown, the email, the user once verified, IP and user agent (Q-L5, kept for proof of consent only), and when.
--
-- WHAT IT DOES
--   1. public.marketing_consents (columns as design section 4, M5), with checks: purpose 'updates' only; wording,
--      version and source page not blank; a withdrawal only on a granted row, and not before it was granted.
--   2. RLS on. One policy: the owner may SELECT their own rows ((select auth.uid()), the wrapped form). No other policy:
--      every write is the service role's (the claim route, /api/unsubscribe, /api/account/marketing-consent).
--   3. Grants (memory: grants-separate-from-rls; BYPASSRLS does not bypass grants):
--        revoke all from public, anon, authenticated;
--        authenticated: SELECT (the policy then limits it to the owner's rows);
--        service_role: SELECT, INSERT, and UPDATE of withdrawn_at ONLY.
--      ⚠️ NOBODY HOLDS DELETE. A withdrawal sets withdrawn_at; a record of consent is kept for the retention period
--      after it ends (privacy policy: 3 years from the last interaction). Deleting it is an erasure-script job, run as
--      the table owner, not something an app path can do.
--   4. user_id references auth.users ON DELETE SET NULL: deleting an account keeps the proof, without the link.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.
-- PARSED OFFLINE with pglast on 5 Oct 2026 (see the L6 report). Re-parse after any edit.

begin;

do $pre$
begin
  if to_regclass('public.marketing_consents') is not null then
    raise exception 'Pre-flight: public.marketing_consents already exists. Already run? Nothing was changed.';
  end if;
end
$pre$;

create table public.marketing_consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete set null,
  email           text not null,
  purpose         text not null,
  granted         boolean not null,
  wording         text not null,
  wording_version text not null,
  source_page     text not null,
  ip              text,
  user_agent      text,
  created_at      timestamptz not null default now(),
  withdrawn_at    timestamptz,
  constraint marketing_consents_purpose check (purpose in ('updates')),
  constraint marketing_consents_email_len check (char_length(email) between 3 and 320),
  constraint marketing_consents_wording_present check (char_length(btrim(wording)) > 0 and char_length(wording) <= 1000),
  constraint marketing_consents_version_present check (char_length(btrim(wording_version)) > 0 and char_length(wording_version) <= 50),
  constraint marketing_consents_source_present check (char_length(btrim(source_page)) > 0 and char_length(source_page) <= 200),
  constraint marketing_consents_ua_len check (user_agent is null or char_length(user_agent) <= 500),
  constraint marketing_consents_withdrawal check (withdrawn_at is null or (granted and withdrawn_at >= created_at))
);

comment on table public.marketing_consents is
  'Proof of marketing consent (CASL), one row per choice, ticked or not (LEAD1 M5). Owner may read their own rows; writes by the service role only; never deleted by the app: a withdrawal sets withdrawn_at.';

create index marketing_consents_user_created on public.marketing_consents (user_id, created_at desc);
create index marketing_consents_email_created on public.marketing_consents (lower(email), created_at desc);

alter table public.marketing_consents enable row level security;

create policy marketing_consents_owner_select on public.marketing_consents
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.marketing_consents from public, anon, authenticated;
grant select on table public.marketing_consents to authenticated;
grant select, insert on table public.marketing_consents to service_role;
grant update (withdrawn_at) on table public.marketing_consents to service_role;

do $post$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.marketing_consents'::regclass) then
    raise exception 'Post-flight: RLS is not on. Nothing committed.';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'marketing_consents') <> 1 then
    raise exception 'Post-flight: expected exactly one policy on marketing_consents. Nothing committed.';
  end if;
  if has_table_privilege('anon', 'public.marketing_consents', 'select,insert,update,delete') then
    raise exception 'Post-flight: anon holds a privilege on marketing_consents. Nothing committed.';
  end if;
  if not has_table_privilege('authenticated', 'public.marketing_consents', 'select')
     or has_table_privilege('authenticated', 'public.marketing_consents', 'insert,update,delete') then
    raise exception 'Post-flight: authenticated must hold SELECT only. Nothing committed.';
  end if;
  if not (has_table_privilege('service_role', 'public.marketing_consents', 'select')
          and has_table_privilege('service_role', 'public.marketing_consents', 'insert')
          and has_column_privilege('service_role', 'public.marketing_consents', 'withdrawn_at', 'update'))
     or has_table_privilege('service_role', 'public.marketing_consents', 'delete')
     or has_column_privilege('service_role', 'public.marketing_consents', 'granted', 'update') then
    raise exception 'Post-flight: service_role must hold SELECT, INSERT and UPDATE (withdrawn_at) only. Nothing committed.';
  end if;
  raise notice 'M5 applied. Next: L6-M5-verify.sql.';
end
$post$;

commit;
