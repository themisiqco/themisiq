-- docs/review/patches/L1-M1-rollback.sql
--
-- ⚠️ NOT RUN, AND NOT TO BE RUN UNLESS L1 IS BEING UNDONE: kept for reference (M1, M3 and M2 were RUN on 4 Oct 2026).
-- Rollback for L1-M1-ghg-free-tier.sql. Run only to undo M1, and only AFTER M2 has been rolled back
-- (L1-M2-rollback.sql): M2's function reads free_tier, so dropping the column under it would break every save.
--
-- WHAT IT DOES. Drops the index ghg_inventories_one_free_per_user and the column ghg_inventories.free_tier (which takes
-- the service_role column grant with it).
--
-- ⚠️ IT REFUSES WHILE ANY free_tier ROW EXISTS. Dropping the column would turn each free calculation into an ordinary
-- inventory owned by an account with no plan: invisible to the rules, and silently a paid row. Those rows have to be
-- looked at first (deleted, or converted on purchase), not swept up by a rollback.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.

begin;

do $pre$
declare
  v_n int;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'ghg_inventories' and column_name = 'free_tier') then
    raise exception 'Pre-flight: ghg_inventories.free_tier does not exist. Nothing to roll back.';
  end if;
  if position('free_tier' in pg_get_functiondef('public.enforce_ghg_location_allowance()'::regprocedure)) > 0 then
    raise exception 'Pre-flight: enforce_ghg_location_allowance() still reads free_tier. Run L1-M2-rollback.sql first. Nothing was changed.';
  end if;
  select count(*) into v_n from public.ghg_inventories where free_tier;
  if v_n <> 0 then
    raise exception 'Pre-flight: % free_tier row(s) exist. Resolve them before dropping the column. Nothing was changed.', v_n;
  end if;
end
$pre$;

drop index public.ghg_inventories_one_free_per_user;
alter table public.ghg_inventories drop column free_tier;

commit;
