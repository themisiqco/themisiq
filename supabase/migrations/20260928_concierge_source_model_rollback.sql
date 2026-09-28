-- 20260928_concierge_source_model_rollback.sql
--
-- Reverses 20260928_concierge_source_model.sql.
--
-- ⚠️ REVERT THE CODE FIRST. The Batch 3 webhook writes ghg_tier and source_allowance. Dropping
-- them under a running deployment makes every grant fail, which is worse than the state this
-- undoes. Roll the deployment back, confirm it, then apply this file.
--
-- ⚠️ THIS DROPS DATA. On a database with real Concierge customers it would drop their source
-- counts with no way to recover them. It is written for the state the forward file ran against:
-- one developer test row and three empty tables. Read the assertions before running it anywhere
-- else; each one refuses rather than improvising.

begin;

-- ── 5. concierge_jobs, reversed ─────────────────────────────────────────────
do $$
declare
  jobs integer;
begin
  select count(*) into jobs from public.concierge_jobs;
  if jobs <> 0 then
    raise exception
      'concierge_jobs holds % row(s). Nothing has been committed. Restoring the old tier CHECK would reject any row keyed concierge.',
      jobs;
  end if;
end $$;

alter table public.concierge_jobs drop column source_count;
alter table public.concierge_jobs drop constraint concierge_jobs_tier_check;
alter table public.concierge_jobs
  add constraint concierge_jobs_tier_check
  check (tier = any (array['concierge-basic', 'concierge-standard', 'concierge-enterprise']));

-- ── 4. Re-key, reversed ─────────────────────────────────────────────────────
-- Back to concierge-basic, the tier the row held. Selected on the same source value, and asserted
-- the same way: exactly one row, or nothing is committed.
do $$
declare
  affected integer;
begin
  update public.entitlements
     set module_key = 'concierge-basic',
         source_allowance = null
   where module_key = 'concierge'
     and source = 'manual-test';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception
      're-key rollback: expected exactly 1 concierge row with source manual-test, updated %. Nothing has been committed.',
      affected;
  end if;
end $$;

-- Any OTHER concierge row was bought under the source model, and this file has nowhere to put it:
-- the old keys are location bands and a source count does not map onto one.
do $$
declare
  others integer;
begin
  select count(*) into others
    from public.entitlements
   where module_key = 'concierge';
  if others <> 0 then
    raise exception
      '% concierge row(s) were bought under the source model and cannot be mapped back to a band. Nothing has been committed. Decide what they become before rolling back.',
      others;
  end if;
end $$;

-- ── 3, 2, 1. Columns dropped last, after everything that reads them is gone ──
-- The ghg_tier backfill is not separately reversed: the column goes, and the value with it.
alter table public.entitlements drop column source_allowance;
alter table public.entitlements drop column ghg_tier;

commit;
