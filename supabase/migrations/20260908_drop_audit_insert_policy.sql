-- 20260908_drop_audit_insert_policy.sql
--
-- Drops public.audit_log's INSERT policy `audit_insert`. Nothing else changes.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- THE POLICY BEING DROPPED, RECORDED IN FULL BECAUSE NOTHING ELSE RECORDS IT
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- `audit_insert` exists in NO migration. It was created directly in the database and never
-- captured — and 20260726_capture_audit_log_infrastructure.sql, written expressly to capture this
-- table's drift into git, captured the table and log_audit() and MISSED THE POLICY. Dropping an
-- object that was never written down would otherwise leave no evidence it ever existed, and the
-- next person to capture drift would have no way to know it had been considered and removed
-- rather than overlooked. Its definition, from pg_policies on 8 Sep 2026:
--
--     policyname : audit_insert
--     tablename  : audit_log        (schema public)
--     permissive : PERMISSIVE
--     cmd        : INSERT
--     roles      : {anon, authenticated, service_role}
--     qual       : null             -- INSERT has no USING clause
--     with_check : true
--
-- Equivalent statement, should it ever need restoring:
--
--     create policy audit_insert on public.audit_log
--       as permissive for insert
--       to anon, authenticated, service_role
--       with check (true);
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY IT GOES
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. THE TRIGGERS DO NOT NEED IT. audit_log is written only by public.log_audit() and
--    public.log_audit_cbam_disclosures(), both SECURITY DEFINER and both OWNED BY postgres, which
--    also owns audit_log. FORCE ROW LEVEL SECURITY is not set on the table, so an owner-owned
--    definer function bypasses RLS entirely. The policy grants those triggers nothing they do not
--    already have. Verified 8 Sep 2026: proowner = relowner = postgres, relforcerowsecurity = false.
--
-- 2. NO APPLICATION PATH INSERTS. Every .ts/.tsx under app/, lib/ and scripts/ was searched.
--    audit_log appears twice, both SELECT (app/dashboard/ghg/page.tsx:2449 and :2988). The only
--    INSERT INTO public.audit_log statements in the repository are the six inside the two trigger
--    function bodies.
--
-- 3. anon HOLDS NO GRANT ON THE TABLE. Confirmed 8 Sep 2026:
--       authenticated  REFERENCES, TRIGGER
--       service_role   REFERENCES, TRIGGER, TRUNCATE
--       anon           (none)
--    RLS is permission ON TOP OF a grant, never instead of one — see the "Grants separate from RLS"
--    note. So the policy was LATENT, not live: it authorised an INSERT that the missing grant
--    already refused.
--
-- 4. WHICH IS EXACTLY WHY IT SHOULD NOT SURVIVE. `with check (true)` for anon is pure attack
--    surface waiting on a broad GRANT. A single `grant insert on all tables in schema public to
--    anon` — the kind of statement written to unblock something unrelated — would turn a dormant
--    policy into an open write path onto an assurance record, with nothing in the diff to show it.
--    A policy whose only protection is a missing grant elsewhere is a defect held in place by luck.
--
-- ⚠️ WHAT THIS DOES NOT CHANGE, STATED SO IT IS NOT LATER MISREAD AS A FIX:
-- append-only on audit_log comes from the ABSENCE of UPDATE and DELETE policies, and it did before
-- this migration too. This closes "append-anything", not "append-only". The owner (postgres) can
-- still modify or truncate audit_log; no policy binds a table owner while FORCE RLS is unset.

begin;

-- Idempotent: `if exists` makes a second run a no-op rather than an error.
drop policy if exists audit_insert on public.audit_log;

do $$
declare
  v_insert int;
  v_write  int;
  v_select int;
begin
  -- The policy must be gone.
  select count(*) into v_insert
    from pg_policies
   where schemaname = 'public' and tablename = 'audit_log' and cmd = 'INSERT';
  if v_insert <> 0 then
    raise exception 'Post-flight: % INSERT policy/policies remain on audit_log.', v_insert;
  end if;

  -- Nothing else may have appeared. append-only depends on there being no UPDATE or DELETE policy,
  -- so assert that here rather than trusting it to have stayed true.
  select count(*) into v_write
    from pg_policies
   where schemaname = 'public' and tablename = 'audit_log' and cmd in ('UPDATE', 'DELETE', 'ALL');
  if v_write <> 0 then
    raise exception 'Post-flight: % UPDATE/DELETE/ALL policy/policies exist on audit_log. '
                    'append-only is not holding.', v_write;
  end if;

  -- audit_select_own must survive: this migration drops one policy, not two.
  select count(*) into v_select
    from pg_policies
   where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_select_own';
  if v_select <> 1 then
    raise exception 'Post-flight: expected audit_select_own to remain, found % copy/copies.', v_select;
  end if;

  -- RLS must still be enabled. With no INSERT policy and RLS on, a non-owner INSERT is refused.
  -- With RLS OFF, the same statement would be allowed to anyone holding a grant.
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'audit_log' and c.relrowsecurity
  ) then
    raise exception 'Post-flight: row level security is not enabled on audit_log.';
  end if;

  raise notice 'audit_insert dropped. audit_log now carries % policy (audit_select_own), '
               'no INSERT/UPDATE/DELETE policy, RLS enabled.', v_select;
end $$;

commit;
