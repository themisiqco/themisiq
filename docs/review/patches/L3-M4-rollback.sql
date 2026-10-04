-- docs/review/patches/L3-M4-rollback.sql
--
-- ⚠️ NOT RUN. Rollback for L3-M4-free-calc-pending.sql: drops public.free_calc_pending and every calculation held in it.
-- Held calculations are at most 24 hours old and are copies of what visitors had on screen; nothing claimed is in this
-- table (a claim writes ghg_inventories and deletes the hold). The pre-flight reports how many would be lost.
--
-- After this, POST /api/ghg/free-calc/pending answers "could not be kept just now" until M4 is run again.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.

begin;

do $pre$
declare
  v_n int;
begin
  if to_regclass('public.free_calc_pending') is null then
    raise exception 'Pre-flight: public.free_calc_pending does not exist. Nothing to roll back.';
  end if;
  select count(*) into v_n from public.free_calc_pending;
  raise notice 'Held calculations that will be dropped: %', v_n;
end
$pre$;

drop table public.free_calc_pending;

commit;
