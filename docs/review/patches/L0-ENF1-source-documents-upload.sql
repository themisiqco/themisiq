-- docs/review/patches/L0-ENF1-source-documents-upload.sql
--
-- ⚠️ NOT RUN. Drafted 4 Oct 2026 (LEAD1 task L0, ENF1; design in docs/review/design-derived-figures.md section 11
-- and docs/review/design-lead1.md). To become supabase/migrations/2026MMDD_source_documents_writes_require_ghg.sql.
--
-- WHAT IT DOES. Uploading to, and deleting from, the GHG 'source-documents' bucket now need an ACTIVE GHG plan,
-- enforced by Postgres, not just by the wizard. Viewing does not. Until this file, the bucket's INSERT policy "Users can upload own documents" checked only that
-- the object sits under the uploader's own uid folder (20260804_ghg_source_documents_policies.sql:63-66, wrapped to
-- (select auth.uid()) by 20260908_storage_rls_initplan.sql), so any signed-in account, including an expired or
-- never-bought one, could write documents through the Storage API with the public anon key.
--   1. New function public.has_active_entitlement(p_module text): true when THE CALLER holds an entitlement row for
--      p_module whose term_end is after now(). It takes no user argument, so nobody can ask about anyone else. It is
--      SECURITY DEFINER so the storage policy does not depend on the caller's grants on entitlements, with an empty
--      search_path and every name schema-qualified. Same clock and same strict comparison as
--      enforce_ghg_location_allowance() (term_end > now()).
--   2. "Users can upload own documents" (INSERT) and "Users can delete own documents" (DELETE) are dropped and
--      recreated with the same names, commands and role, and one added condition each:
--      and (select public.has_active_entitlement('ghg')). The subselect lets the planner evaluate it once per
--      statement (the auth_rls_initplan rule).
--      WHY DELETE TOO. An expired plan's inventories are read-only (enforce_ghg_location_allowance() refuses their
--      writes), so a document deleted from one could never be detached from it: the inventory would go on citing
--      evidence that no longer exists. The documents behind a read-only inventory stay exactly as they were, which is
--      what an ISO 14064-3 verifier follows back. Renewing restores deleting along with saving.
--
-- WHAT IT DOES NOT CHANGE
--   - "Users can view own documents" (SELECT). Reading is not withdrawn by expiry; the post-flight checks it is
--     byte-for-byte as before.
--   - Account erasure. scripts/erase-account.mjs deletes storage objects through the Storage API with the SERVICE
--     ROLE key (createClient(SUPABASE_URL, SERVICE_KEY) at :1226, admin.storage.from(bucket).remove(...) at :1251).
--     The service role bypasses RLS, so neither new condition applies to it; an expired or never-bought account is
--     erased exactly as before. L0-ENF1-verify.sql case 8 deletes as service_role to show it.
--   - There is no UPDATE policy on this bucket today (the pre-flight asserts exactly three policies: SELECT, INSERT,
--     DELETE), so an overwrite (upsert) is already refused for everyone and nothing is added for it.
--   - Objects already uploaded by accounts whose plan has ended stay where they are and stay readable (and, from now,
--     cannot be deleted by those accounts until they renew). The pre-flight reports how many there are; nothing is
--     deleted.
--   - Bill Review: its uploads are the same INSERT from the same wizard handler, and Bill Review already requires an
--     active GHG plan, so an active plan uploads exactly as before. The extract route reads documents with the
--     service role (app/api/concierge/extract/route.ts:148), which RLS does not apply to.
--   - cbam-source-documents: untouched.
--
-- GRANTS. revoke all on the function from public, anon, authenticated; grant execute to authenticated only (the
-- policy is "to authenticated", and anon must not be able to call it). No table grants change.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction. Then run L0-ENF1-verify.sql.
-- PARSED OFFLINE with pglast on 4 Oct 2026 (see the L0 report). Re-parse after any edit.
-- ROLLBACK: recreate the INSERT and DELETE policies without the added condition (the pre-flight prints their current
-- definitions), then drop function public.has_active_entitlement(text).

begin;

-- ── Pre-flight ──────────────────────────────────────────────────────────────────────────────────────────────────
create temp table _enf1_before on commit drop as
select policyname, cmd, roles::text as roles, permissive, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%''source-documents''%';

do $pre$
declare
  v_n int;
  v_cmds text;
  v_orphans int;
  r record;
begin
  select count(*), string_agg(cmd, ',' order by cmd) into v_n, v_cmds from _enf1_before;
  if v_n <> 3 or v_cmds <> 'DELETE,INSERT,SELECT' then
    raise exception 'Pre-flight: expected exactly three source-documents policies (SELECT, INSERT, DELETE), found % (%). Nothing was changed.', v_n, v_cmds;
  end if;
  if not exists (select 1 from _enf1_before where policyname = 'Users can upload own documents' and cmd = 'INSERT') then
    raise exception 'Pre-flight: the INSERT policy is not named "Users can upload own documents". Nothing was changed.';
  end if;
  if not exists (select 1 from _enf1_before where policyname = 'Users can delete own documents' and cmd = 'DELETE') then
    raise exception 'Pre-flight: the DELETE policy is not named "Users can delete own documents". Nothing was changed.';
  end if;
  if exists (select 1 from _enf1_before
              where (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%has_active_entitlement%') then
    raise exception 'Pre-flight: a source-documents policy already calls has_active_entitlement. Already run? Nothing was changed.';
  end if;
  for r in select policyname, cmd, qual, with_check from _enf1_before order by cmd loop
    raise notice 'Before: % [%] using (%) with check (%)', r.policyname, r.cmd, r.qual, r.with_check;
  end loop;

  -- Informational: documents already held by accounts with no active GHG plan. They are kept and stay readable.
  select count(*) into v_orphans
    from storage.objects o
   where o.bucket_id = 'source-documents'
     and not exists (
       select 1 from public.entitlements e
        where e.user_id::text = (storage.foldername(o.name))[1]
          and e.module_key = 'ghg' and e.term_end > now());
  raise notice 'Objects in source-documents owned by accounts with no active GHG plan (kept, still readable): %', v_orphans;
end
$pre$;

-- ── 1. The function ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.has_active_entitlement(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
      from public.entitlements e
     where e.user_id = (select auth.uid())
       and e.module_key = p_module
       and e.term_end > now()
  );
$fn$;

comment on function public.has_active_entitlement(text) is
  'True when the CALLER (auth.uid()) holds an entitlement for p_module whose term_end is after now(). No user argument by design. Used by the source-documents INSERT and DELETE policies (ENF1).';

revoke all on function public.has_active_entitlement(text) from public, anon, authenticated;
grant execute on function public.has_active_entitlement(text) to authenticated;

-- ── 2. The INSERT and DELETE policies ───────────────────────────────────────────────────────────────────────────
drop policy "Users can upload own documents" on storage.objects;
create policy "Users can upload own documents"
  on storage.objects for insert to authenticated
  with check (
    (bucket_id = 'source-documents'::text)
    and (((select auth.uid()))::text = (storage.foldername(name))[1])
    and (select public.has_active_entitlement('ghg'))
  );

drop policy "Users can delete own documents" on storage.objects;
create policy "Users can delete own documents"
  on storage.objects for delete to authenticated
  using (
    (bucket_id = 'source-documents'::text)
    and (((select auth.uid()))::text = (storage.foldername(name))[1])
    and (select public.has_active_entitlement('ghg'))
  );

-- ── Post-flight ─────────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare
  v_n int;
  v_bad int;
  v_check text;
begin
  select count(*) into v_n
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%''source-documents''%';
  if v_n <> 3 then
    raise exception 'Post-flight: % source-documents policies after the change, expected 3. Nothing committed.', v_n;
  end if;

  -- SELECT exactly as before.
  select count(*) into v_bad
    from _enf1_before b
    left join pg_policies a
      on a.schemaname = 'storage' and a.tablename = 'objects' and a.policyname = b.policyname
   where b.cmd = 'SELECT'
     and (a.policyname is null or a.cmd is distinct from b.cmd or a.roles::text is distinct from b.roles
          or a.qual is distinct from b.qual or a.with_check is distinct from b.with_check);
  if v_bad <> 0 then
    raise exception 'Post-flight: the SELECT policy changed. Nothing committed.';
  end if;

  select with_check into v_check
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can upload own documents' and cmd = 'INSERT';
  if v_check is null or v_check not like '%has_active_entitlement%' or v_check not like '%foldername%'
     or v_check not like '%source-documents%' then
    raise exception 'Post-flight: the INSERT policy is not as intended: %. Nothing committed.', v_check;
  end if;

  select qual into v_check
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can delete own documents' and cmd = 'DELETE';
  if v_check is null or v_check not like '%has_active_entitlement%' or v_check not like '%foldername%'
     or v_check not like '%source-documents%' then
    raise exception 'Post-flight: the DELETE policy is not as intended: %. Nothing committed.', v_check;
  end if;

  if has_function_privilege('anon', 'public.has_active_entitlement(text)', 'execute') then
    raise exception 'Post-flight: anon can execute has_active_entitlement. Nothing committed.';
  end if;
  if not has_function_privilege('authenticated', 'public.has_active_entitlement(text)', 'execute') then
    raise exception 'Post-flight: authenticated cannot execute has_active_entitlement. Nothing committed.';
  end if;

  raise notice 'ENF1 applied: uploading to and deleting from source-documents need an active GHG plan. Now run L0-ENF1-verify.sql.';
end
$post$;

commit;
