-- docs/review/patches/capture-triggers.sql
--
-- ⚠️ NOT RUN. Drafted 2 Oct 2026 for review. To become supabase/migrations/2026MMDD_capture_ghg_audit_trigger.sql
-- once checked against docs/review/live-trigger-functions.sql (the live pg_get_functiondef / pg_get_triggerdef
-- output Lisa is exporting), which did not yet exist when this was written.
--
-- WHAT IS ACTUALLY MISSING FROM supabase/migrations/. Less than the request assumed; checked 2 Oct 2026:
--   - public.log_audit() IS captured, in 20260726_capture_audit_log_infrastructure.sql (create or replace, with the
--     audit_log table). Its body there is identical, line for line, to the newest schema dump,
--     db/dumps/schema_public_20261001_1057.sql:1550-1574.
--   - The TRIGGER audit_ghg_inventories is NOT captured. 20260726 left it out on purpose ("re-attaching a trigger is
--     not idempotent the way create-or-replace is ... pre-existing GHG drift and out of scope"). The dump has it at
--     db/dumps/schema_public_20261001_1057.sql:10082.
--   - enforce_ghg_location_allowance() and trg_enforce_ghg_location_allowance ARE captured, in
--     20260618_ghg_location_allowance.sql (function body identical to the dump's, 570-628; trigger 127-130). They are
--     not touched here: FI0 replaces the function (docs/review/patches/FI0-entitlement-gate-only.sql).
--   CLAUDE.md's "DB-only objects" list (location_allowance and the enforce trigger) is stale on both counts:
--   20260618 and 20260811_entitlements_definition.sql carry them. Lisa applies that correction.
--
-- WHAT THIS FILE DOES
--   1. Re-states public.log_audit() exactly as live (create or replace: a no-op on prod when the body matches).
--   2. Creates the audit_ghg_inventories trigger ONLY IF IT IS ABSENT. On prod it is present, so this creates
--      nothing; instead it checks that the live definition is the one captured here and RAISES if it is not, so a
--      difference is reported rather than silently papered over. It never drops the trigger: dropping and recreating
--      would be the same end state inside one transaction, but would leave no audit row-level trigger at all if the
--      create ever failed after the drop in a hand-edited run.
--
-- BEFORE RUNNING
--   - Diff the body below against log_audit() in docs/review/live-trigger-functions.sql. Any difference: stop.
--   - Diff the CREATE TRIGGER text below against pg_get_triggerdef for audit_ghg_inventories in the same file.
--   - Parsed offline with pglast on 2 Oct 2026: 6 statements, and each PL/pgSQL body compiles. Re-parse after any edit.
--
-- RUN WITH: the Supabase SQL editor, the whole file at once. It is one transaction.
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
