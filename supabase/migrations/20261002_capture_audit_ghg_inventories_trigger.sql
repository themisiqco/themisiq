-- 20261002_capture_audit_ghg_inventories_trigger.sql
--
-- RUN 2 October 2026 (checks passed: security definer true; trigger exists 1; enabled O)
--
-- Run from docs/review/patches/capture-triggers.sql, whose SQL is below unchanged. On production it created
-- nothing: the trigger already existed and matched the captured definition, so the file only re-stated log_audit()
-- (create or replace, same body) and verified the trigger. The three post-checks above are its own output.
--
-- WHAT IT CAPTURES. The one GHG audit object that no migration held: the row-level trigger audit_ghg_inventories on
-- public.ghg_inventories, AFTER INSERT OR DELETE OR UPDATE, executing public.log_audit(). It feeds the audit trail
-- that the assurance PDF and the verifier page read (audit_log rows with table_name 'ghg_inventories').
--   - log_audit() itself was already captured, with the audit_log table, in
--     20260726_capture_audit_log_infrastructure.sql, which left this trigger out on purpose ("re-attaching a trigger
--     is not idempotent the way create-or-replace is"). This file closes that gap without dropping anything.
--   - enforce_ghg_location_allowance() and trg_enforce_ghg_location_allowance were already captured, in
--     20260618_ghg_location_allowance.sql, and are not touched here.
-- Source of the captured text: the 1 Oct 2026 schema dump (db/dumps/schema_public_20261001_1057.sql: log_audit at
-- 1550-1574, the trigger at 10082), identical to the 20260726 migration's body.
--
-- RE-RUNNING IS SAFE. log_audit() is create or replace with the same body. The trigger is created only if absent;
-- if present it is compared with the captured definition, and a difference RAISES and changes nothing. It never
-- drops the trigger, so there is no moment without an audit trigger on ghg_inventories.
--
-- REBUILD ORDER: after 20260726_capture_audit_log_infrastructure.sql (the pre-flight refuses if audit_log is absent).
--
-- GRANTS: none needed. No new table; a function replaced in place keeps its owner and its grants.

begin;

-- ── Pre-flight ──────────────────────────────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.audit_log') is null then
    raise exception 'Pre-flight: public.audit_log does not exist. Run 20260726_capture_audit_log_infrastructure.sql first. Nothing was changed.';
  end if;
  if to_regclass('public.ghg_inventories') is null then
    raise exception 'Pre-flight: public.ghg_inventories does not exist. Nothing was changed.';
  end if;
end
$pre$;

-- ── 1. log_audit(), verbatim from live (as captured in 20260726 and in the 1 Oct 2026 dump) ──────
create or replace function public.log_audit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_email text;
begin
  -- prefer profiles, fall back to auth.users
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then
    select email into v_email from auth.users where id = auth.uid();
  end if;
  if (tg_op = 'DELETE') then
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, old.id, 'DELETE', to_jsonb(old), null, auth.uid(), v_email);
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid(), v_email);
    return new;
  else
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, new.id, 'INSERT', null, to_jsonb(new), auth.uid(), v_email);
    return new;
  end if;
end; $function$;

-- ── 2. audit_ghg_inventories: create if absent, otherwise verify ────────────────────────────────
-- Expected definition, as pg_get_triggerdef prints it (db/dumps/schema_public_20261001_1057.sql:10082):
--   CREATE TRIGGER audit_ghg_inventories AFTER INSERT OR DELETE OR UPDATE ON public.ghg_inventories
--   FOR EACH ROW EXECUTE FUNCTION log_audit()
-- pg_get_triggerdef omits the schema on the function when it is on the search_path; the comparison below
-- normalises that one difference and nothing else.
do $trg$
declare
  v_def text;
  v_expected constant text :=
    'CREATE TRIGGER audit_ghg_inventories AFTER INSERT OR DELETE OR UPDATE ON public.ghg_inventories FOR EACH ROW EXECUTE FUNCTION log_audit()';
begin
  select pg_get_triggerdef(t.oid) into v_def
  from pg_trigger t
  where t.tgrelid = 'public.ghg_inventories'::regclass
    and t.tgname = 'audit_ghg_inventories'
    and not t.tgisinternal;

  if v_def is null then
    create trigger audit_ghg_inventories
      after insert or delete or update on public.ghg_inventories
      for each row execute function public.log_audit();
    raise notice 'audit_ghg_inventories was absent and has been created.';
  elsif replace(v_def, 'public.log_audit()', 'log_audit()') <> v_expected then
    raise exception 'audit_ghg_inventories exists but differs from the captured definition. Live: %. Nothing was changed.', v_def;
  else
    raise notice 'audit_ghg_inventories already exists with the captured definition. Nothing to create.';
  end if;
end
$trg$;

-- ── Post-check (house format) ───────────────────────────────────────────────────────────────────
select check_name, expected, actual, actual = expected as pass
from (
  select 'log_audit is security definer' as check_name, 'true' as expected,
         (select p.prosecdef::text from pg_proc p where p.oid = 'public.log_audit()'::regprocedure) as actual
  union all
  select 'audit_ghg_inventories exists', '1',
         (select count(*)::text from pg_trigger t
           where t.tgrelid = 'public.ghg_inventories'::regclass and t.tgname = 'audit_ghg_inventories' and not t.tgisinternal)
  union all
  select 'audit_ghg_inventories enabled', 'O',
         (select t.tgenabled::text from pg_trigger t
           where t.tgrelid = 'public.ghg_inventories'::regclass and t.tgname = 'audit_ghg_inventories')
) c;

commit;
