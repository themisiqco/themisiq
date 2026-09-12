-- 20260910_erasure_log.sql
--
-- NOT RUN. Propose only. Lisa runs this in the Supabase SQL editor.
--
-- The record that an account was erased, and nothing about who it was.
--
-- scripts/erase-account.mjs deletes a customer's rows, their storage objects and
-- their auth user. Afterwards there is, by design, nothing left to ask "did we
-- honour that request?" — the audit_log rows are gone too, because they carried
-- to_jsonb(old) of every deleted row. This table is the one thing that survives:
-- proof the erasure happened, when, on whose authority, and how much was removed.
--
-- ── WHY IT HOLDS NO EMAIL AND NO CUSTOMER DATA ───────────────────────────────
-- An erasure record containing the erased person's email is not an erasure. The
-- subject_user_id is a uuid that no longer resolves to anything once auth.users
-- is gone, which is exactly the property wanted: it proves a request was actioned
-- without re-identifying the person who made it. table_counts and storage_counts
-- are integers per table and per bucket — enough to show the work was done, not
-- enough to reconstruct any of it.
--
-- ⚠️ notes IS FREE TEXT AND IS THE ONE PLACE THIS CAN GO WRONG. It exists for
-- operational facts — "auth.users deletion deferred to the admin API (42501)",
-- "resumed after a partial run". It must never carry a name, an email, a company
-- or a figure from the account. The script writes it; a human editing a row by
-- hand is the risk this comment is addressed to.
--
-- ── NO FK TO auth.users, DELIBERATELY ────────────────────────────────────────
-- An FK would make this row undeletable-or-cascading against the very row the
-- script is trying to remove: NO ACTION would block the erasure (this is the
-- fifth blocker the script does not need), CASCADE would delete the proof at the
-- moment it becomes the only proof. A bare uuid column has neither problem.
--
-- ── RLS ENABLED, ZERO POLICIES ───────────────────────────────────────────────
-- Fail-closed. No customer may read it and no customer may write it; there is no
-- surface in the product that shows it. service_role reaches it by GRANT while
-- bypassing RLS, which is the only access path this table has or should have.
-- See the CLAUDE.md note: a table with RLS enabled and no policy is a deliberate
-- state here, not the "first policy on an old table" hazard.

begin;

-- ── PRE-FLIGHT ───────────────────────────────────────────────────────────────
-- Refuse rather than silently redefine. If a table of this name already exists,
-- someone has run a version of this file (or something else) and the shape is
-- not known to be the shape below.
do $$
begin
  if to_regclass('public.erasure_log') is not null then
    raise exception 'Pre-flight: public.erasure_log already exists. Inspect it before running this file; nothing was changed.';
  end if;
end $$;

create table public.erasure_log (
  id              uuid primary key default gen_random_uuid(),
  subject_user_id uuid        not null,
  requested_at    timestamptz,
  completed_at    timestamptz,
  performed_by    text,
  table_counts    jsonb       not null default '{}'::jsonb,
  storage_counts  jsonb       not null default '{}'::jsonb,
  notes           text,
  created_at      timestamptz not null default now()
);

-- NOT UNIQUE, ON PURPOSE. A resumed erasure writes a second row rather than
-- overwriting the first, so a partial run followed by a completion is legible as
-- two events. Uniqueness here would force the script to choose between losing the
-- first record and failing the second.
create index erasure_log_subject_idx on public.erasure_log (subject_user_id);
create index erasure_log_created_idx  on public.erasure_log (created_at desc);

comment on table public.erasure_log is
  'Proof that an account erasure was performed, holding no customer data. subject_user_id is a uuid that deliberately no longer resolves once auth.users is deleted: it evidences the action without re-identifying the subject. Written by scripts/erase-account.mjs. RLS enabled with no policies; service_role only.';
comment on column public.erasure_log.subject_user_id is
  'The erased auth.users id. No FK: NO ACTION would block the erasure and CASCADE would delete this record at the moment it becomes the only proof.';
comment on column public.erasure_log.requested_at   is 'When the customer asked, from --requested-at. Null if not supplied.';
comment on column public.erasure_log.completed_at   is 'Set after storage removal is verified, in a second statement — the database transaction commits before the Storage API calls are made, so this is null between the two.';
comment on column public.erasure_log.performed_by   is 'Operator name from --performed-by. A ThemisIQ person, never the subject.';
comment on column public.erasure_log.table_counts   is 'Rows deleted per table, as {"public.ghg_entries": 12}. Counts only.';
comment on column public.erasure_log.storage_counts is 'Objects removed per bucket, as {"source-documents": 4}. Counts only.';
comment on column public.erasure_log.notes          is 'Operational facts only — deferrals, resumes, privilege fallbacks. MUST NOT carry a name, an email, a company or any figure from the account.';

alter table public.erasure_log enable row level security;

-- ── GRANTS ───────────────────────────────────────────────────────────────────
-- A hand-run CREATE TABLE does not grant anything, and service_role is not a
-- member of authenticated, so the grant below is what makes the table reachable
-- at all. Revoking from the customer-facing roles is belt to the RLS braces: with
-- zero policies RLS already refuses them, but a future policy written without
-- this context would then find the GRANT already in place.
revoke all on public.erasure_log from public;
revoke all on public.erasure_log from anon;
revoke all on public.erasure_log from authenticated;
grant all on public.erasure_log to service_role;

-- ── POST-FLIGHT ──────────────────────────────────────────────────────────────
-- Asserting is cheaper than assuming. The failure this catches is a table that
-- exists but is readable — the one defect that would make the erasure record a
-- new disclosure rather than a closed one.
do $$
declare v_rls boolean; v_pol int; v_bad int;
begin
  select c.relrowsecurity into v_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'erasure_log';
  if not v_rls then
    raise exception 'Post-flight: RLS is not enabled on public.erasure_log.';
  end if;

  select count(*) into v_pol from pg_policies
   where schemaname = 'public' and tablename = 'erasure_log';
  if v_pol <> 0 then
    raise exception 'Post-flight: public.erasure_log must have zero policies, found %.', v_pol;
  end if;

  select count(*) into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'erasure_log'
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_bad <> 0 then
    raise exception 'Post-flight: public.erasure_log carries % grant(s) to anon/authenticated/PUBLIC.', v_bad;
  end if;

  raise notice 'public.erasure_log created: RLS on, 0 policies, service_role only.';
end $$;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the CREATE) ──
-- select relrowsecurity from pg_class where oid = 'public.erasure_log'::regclass;
-- select * from pg_policies where tablename = 'erasure_log';
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema='public' and table_name='erasure_log' order by grantee;
