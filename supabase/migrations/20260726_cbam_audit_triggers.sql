-- CBAM audit triggers — change history for the verifier portal
-- ---------------------------------------------------------------------------
-- Scope (deliberate): audit only the two OPERATOR-EDITABLE, tuple-bearing
-- report tables — cbam_installation_disclosures (boundary declarations) and
-- cbam_production_processes (process/route definitions). These are the human
-- decisions a verifier scrutinizes. NOT audited: cbam_see_records (computed
-- outputs — integrity already guaranteed by the stale-record tripwire, and not
-- reliably attributable to a report tuple after the fact), cbam_installations
-- and cbam_operator_profile (low-stakes identity, grain-awkward). See the
-- verifier-portal design notes.
--
-- Two triggers because the two tables have different PK shapes:
--   • cbam_production_processes has a single-uuid `id` → reuses the existing
--     generic log_audit() verbatim (record_id = new.id / old.id).
--   • cbam_installation_disclosures has a COMPOSITE PK
--     (installation_id, reporting_period) and NO `id` column → log_audit()
--     would throw ("record new has no field id"). It needs a variant that sets
--     record_id = installation_id (Option B). The reporting_period lives in the
--     old_values/new_values snapshot; the verifier read filters by
--     record_id = installation_id AND new_values->>'reporting_period' = period.
--
-- DEPLOY: do NOT auto-run. Hand-run in the Supabase SQL editor after review.

-- ── Disclosures variant: record_id = installation_id (composite-PK case) ─────
create or replace function public.log_audit_cbam_disclosures()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_email text;
begin
  -- actor resolution identical to log_audit(): profiles first, then auth.users
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then
    select email into v_email from auth.users where id = auth.uid();
  end if;
  if (tg_op = 'DELETE') then
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, old.installation_id, 'DELETE', to_jsonb(old), null, auth.uid(), v_email);
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, new.installation_id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid(), v_email);
    return new;
  else
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, new.installation_id, 'INSERT', null, to_jsonb(new), auth.uid(), v_email);
    return new;
  end if;
end; $function$;

-- ── Attach triggers ─────────────────────────────────────────────────────────
-- drop-if-exists first so this migration is safely re-runnable (attaching a
-- trigger is not idempotent on its own).

drop trigger if exists audit_cbam_production_processes on public.cbam_production_processes;
create trigger audit_cbam_production_processes
  after insert or update or delete on public.cbam_production_processes
  for each row execute function public.log_audit();

drop trigger if exists audit_cbam_installation_disclosures on public.cbam_installation_disclosures;
create trigger audit_cbam_installation_disclosures
  after insert or update or delete on public.cbam_installation_disclosures
  for each row execute function public.log_audit_cbam_disclosures();
