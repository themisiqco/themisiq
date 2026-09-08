-- 20260908_grant_audit_log_select.sql
--
-- Grants SELECT on public.audit_log to `authenticated`. Nothing else changes.
--
-- ⚠️ DELIBERATELY SEPARATE FROM 20260908_drop_audit_insert_policy.sql. That migration REMOVES a
-- write path; this one OPENS a read path. They are opposite directions on the same table and want
-- to be decided, reviewed and reverted independently.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY: A POLICY WAS GUARDING A DOOR NOBODY COULD REACH
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- audit_log carries `audit_select_own`:
--
--     FOR SELECT TO authenticated USING (user_id = auth.uid())
--
-- but `authenticated` held only REFERENCES and TRIGGER on the table — no SELECT. RLS is permission
-- ON TOP OF a grant, never instead of one, so PostgREST refused every read at the grant layer
-- BEFORE the policy was consulted. The policy has never once run.
--
-- The failure was invisible because both call sites discarded the error and coerced the result to
-- an empty array. /dashboard/ghg tab 7 therefore rendered "0 changes logged - entries cannot be
-- edited or deleted - ISO 14064-3 / ISAE 3410 traceability" and "No entries recorded yet" for an
-- inventory with live verifier links issued against it, and the assurance package printed the same
-- thing into a document a verifier reads. Confirmed live in the browser network panel, 8 Sep 2026.
-- Both call sites are fixed in the same change-set; this migration is what makes the read succeed.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY A GRANT AND NOT AN RPC
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- The narrower alternative is a SECURITY DEFINER function returning the caller's rows. It would
-- work, and it would be the right answer if the read needed to cross a boundary RLS cannot express.
-- It does not: `audit_select_own` already expresses exactly the intended rule, per-user and
-- per-row. Adding an RPC would mean a second place that decides who may read the audit trail, and
-- the policy would stay dead. One authority, already written, already reviewed — make it live.
--
-- ⚠️ THIS GRANT IS SAFE ONLY BECAUSE THE POLICY EXISTS AND RLS IS ENABLED. If either were removed,
-- this line would expose every audit row to every signed-in user. The verification block below
-- asserts both BEFORE granting, and refuses to run if either is missing.

begin;

do $$
begin
  -- 1. RLS must be enabled. Without it, a grant is unconstrained.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'audit_log' and c.relrowsecurity
  ) then
    raise exception 'Refusing to grant: row level security is not enabled on public.audit_log. '
                    'The grant would expose every row to every authenticated user.';
  end if;

  -- 2. The constraining policy must exist, be FOR SELECT, apply to authenticated, and filter on
  --    the caller. Granting without it is the failure this migration exists to avoid.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'audit_log'
       and policyname = 'audit_select_own'
       and cmd = 'SELECT'
       and 'authenticated' = any (roles)
       and coalesce(qual, '') like '%auth.uid()%'
  ) then
    raise exception 'Refusing to grant: audit_select_own is missing, or no longer a SELECT policy '
                    'for authenticated filtering on auth.uid(). Inspect pg_policies first.';
  end if;
end $$;

-- Idempotent: re-granting an existing privilege is a no-op in PostgreSQL.
grant select on public.audit_log to authenticated;

do $$
declare v_write text;
begin
  if not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'audit_log'
       and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    raise exception 'Post-flight: authenticated still has no SELECT on public.audit_log.';
  end if;

  -- Read only. A write privilege reaching `authenticated` would defeat append-only, and this is
  -- the migration that would most plausibly be edited to add one.
  select string_agg(privilege_type, ', ') into v_write
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'audit_log'
     and grantee = 'authenticated'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if v_write is not null then
    raise exception 'Post-flight: authenticated holds write privilege(s) on audit_log: %. '
                    'This migration grants SELECT only.', v_write;
  end if;

  raise notice 'authenticated now holds SELECT on public.audit_log, constrained by '
               'audit_select_own to the caller''s own rows.';
end $$;

commit;
