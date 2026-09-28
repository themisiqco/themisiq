-- 20260928_ghg_employee_bands_rollback.sql
--
-- Reverses 20260928_ghg_employee_bands.sql.
--
-- ⚠️ REVERT THE CODE FIRST. Batch 3 writes 'business' and 'enterprise' and batch 4 writes
-- employee_count. Narrowing the constraint or dropping the column under a running deployment makes
-- those purchases fail after payment. Roll the deployment back, confirm it, then apply this file.
--
-- ⚠️ IT REFUSES RATHER THAN RE-BANDING ANYBODY. Narrowing the CHECK back to three keys is only
-- possible if no row holds one of the two new ones. A customer on Business or Enterprise is a real
-- purchase with no equivalent in the old three-tier model, and this file has nowhere to put them.
-- It stops and says so instead of choosing a tier on their behalf.

begin;

-- ── 3. Nothing on the new tiers ─────────────────────────────────────────────
do $$
declare
  on_new_tiers integer;
begin
  select count(*) into on_new_tiers
    from public.entitlements
   where ghg_tier in ('business', 'enterprise')
     and not (user_id = '81a8962f-3e5c-40a3-8145-1ac01426df5c' and module_key = 'ghg');
  if on_new_tiers <> 0 then
    raise exception
      '% row(s) are on business or enterprise. Nothing has been committed. Those tiers do not exist in the old model; decide what each becomes before rolling back.',
      on_new_tiers;
  end if;
end $$;

-- The developer test row, back to advisory, under the same single-row assertion the forward file
-- used. Excluded from the count above because the forward file is what put it on enterprise.
do $$
declare
  affected integer;
begin
  update public.entitlements
     set ghg_tier = 'advisory'
   where user_id = '81a8962f-3e5c-40a3-8145-1ac01426df5c'
     and module_key = 'ghg'
     and ghg_tier = 'enterprise';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception
      'ghg_tier rollback: expected exactly 1 enterprise ghg row for the test account, updated %. Nothing has been committed.',
      affected;
  end if;
end $$;

-- ── 2. The column, and the counts in it ─────────────────────────────────────
-- ⚠️ THIS DROPS DATA. Every employee count a customer stated goes with the column, and there is no
-- second copy: ghg_tier records the band, not the number behind it. On a database with real
-- purchases, read the counts out before running this.
alter table public.entitlements drop column employee_count;

-- ── 1. The tier keys, narrowed back ─────────────────────────────────────────
alter table public.entitlements drop constraint entitlements_ghg_tier_check;
alter table public.entitlements
  add constraint entitlements_ghg_tier_check
  check (ghg_tier is null or ghg_tier in ('starter', 'professional', 'advisory'));

commit;
