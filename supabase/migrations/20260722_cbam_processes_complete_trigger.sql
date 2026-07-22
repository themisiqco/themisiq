-- supabase/migrations/20260722_cbam_processes_complete_trigger.sql
--
-- Enforces the processes_complete attestation's two invariants at the DB
-- layer, so they hold regardless of write path (form, route, or SQL editor).
-- cbam_installation_disclosures already carries full CRUD to authenticated,
-- so a route alone could be bypassed; a trigger cannot.
--
-- 1. processes_complete_declared_at is stamped with SERVER time whenever
--    processes_complete changes value, and cleared when it is retracted to
--    null. Never client-supplied.
-- 2. processes_complete = true is rejected when the installation has no
--    processes for that reporting period. This does NOT verify completeness
--    — nothing can; the attestation is the operator's assertion. It rejects
--    only the degenerate zero-process case.
--
-- Verified live 22 Jul 2026: guard rejects (errcode 23514), positive case
-- stamps, retraction clears.

create or replace function public.cbam_stamp_processes_complete()
returns trigger
language plpgsql
as $$
begin
  -- Stamp the attestation's own timestamp whenever the flag changes value.
  -- Server time, never client-supplied. Distinct from updated_at, which
  -- tracks any change to the row.
  if tg_op = 'INSERT' then
    if new.processes_complete is not null then
      new.processes_complete_declared_at := now();
    end if;
  elsif new.processes_complete is distinct from old.processes_complete then
    new.processes_complete_declared_at :=
      case when new.processes_complete is null then null else now() end;
  end if;

  -- An attestation that the process set is complete is incoherent when there
  -- are no processes. This does NOT verify completeness — nothing can; the
  -- attestation is the operator's assertion. It only rejects the degenerate case.
  if new.processes_complete is true
     and not exists (
       select 1 from public.cbam_production_processes p
       where p.installation_id = new.installation_id
         and p.company_id      = new.company_id
         and p.reporting_period = new.reporting_period
     )
  then
    raise exception
      'processes_complete cannot be true: no processes exist for installation % in reporting period %',
      new.installation_id, new.reporting_period
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists cbam_stamp_processes_complete_trg
  on public.cbam_installation_disclosures;

create trigger cbam_stamp_processes_complete_trg
  before insert or update on public.cbam_installation_disclosures
  for each row execute function public.cbam_stamp_processes_complete();
