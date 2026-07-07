-- supplier_documents — RLS remediation (capture of an already-applied live fix)
-- ---------------------------------------------------------------------------
-- ⚠️ ALREADY APPLIED TO LIVE via the Supabase SQL editor on 2026-07-07. This
-- file is the GIT RECORD ONLY — it exists so a from-scratch rebuild reproduces
-- the fix. It is idempotent/re-runnable; running it again against live is a safe
-- no-op-equivalent (drops are `if exists`, RLS enable + grants are idempotent).
--
-- WHAT WAS WRONG: supplier_documents was found in production with a LIVE PUBLIC
-- READ/WRITE EXPOSURE:
--   • RLS was DISABLED on the table, and
--   • a permissive policy `service_role_supplier_documents` existed with
--     roles = public and qual = true (i.e. everyone, unconditionally), and
--   • the anon (and authenticated) roles held full table DML.
-- Net effect: anyone with the anon key could read or write every row. The table
-- is ORPHANED — no application code references supplier_documents anywhere
-- (confirmed by repo-wide grep) — so this was pure attack surface with no
-- legitimate caller depending on the open access.
--
-- THE FIX (mirrors the June 2026 supplier-portal RLS remediation on
-- supplier_campaigns / campaign_suppliers / supplier_responses):
--   1. Drop the permissive public policy.
--   2. Revoke all table DML from anon and authenticated.
--   3. Enable RLS.
--   4. Add a single owner-scoped policy: an authenticated buyer may touch a
--      supplier_documents row only when its campaign_supplier belongs to a
--      campaign they own (supplier_campaigns.buyer_id = auth.uid()).
--   5. Restore service_role full access (server-side / definer paths).
-- No anon policy is added — anon gets nothing on this table.
--
-- DEPLOY: do NOT auto-run; already live. Kept here for repo fidelity so the DB
-- is reproducible from git.

begin;

-- 1) Remove the permissive public read/write policy (roles=public, qual=true).
drop policy if exists service_role_supplier_documents on public.supplier_documents;

-- 2) Strip direct table DML from the untrusted roles.
revoke all on public.supplier_documents from anon;
revoke all on public.supplier_documents from authenticated;

-- 3) Turn RLS on (it was disabled).
alter table public.supplier_documents enable row level security;

-- 4) Owner-scoped access: a buyer reaches a document only through a
--    campaign_supplier that belongs to one of their own campaigns.
--    drop-if-exists first so the file is idempotent/re-runnable.
drop policy if exists supplier_documents_owner on public.supplier_documents;
create policy supplier_documents_owner on public.supplier_documents
  for all to authenticated
  using (
    campaign_supplier_id in (
      select cs.id
        from public.campaign_suppliers cs
        join public.supplier_campaigns sc on sc.id = cs.campaign_id
       where sc.buyer_id = auth.uid()
    )
  )
  with check (
    campaign_supplier_id in (
      select cs.id
        from public.campaign_suppliers cs
        join public.supplier_campaigns sc on sc.id = cs.campaign_id
       where sc.buyer_id = auth.uid()
    )
  );

-- 5) Restore service_role full access (server-side / SECURITY DEFINER paths).
grant all on public.supplier_documents to service_role;

commit;
