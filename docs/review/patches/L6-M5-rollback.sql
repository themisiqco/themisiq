-- docs/review/patches/L6-M5-rollback.sql
--
-- ⚠️ NOT RUN. Rollback for L6-M5-marketing-consents.sql: drops public.marketing_consents.
--
-- ⚠️ THIS DESTROYS PROOF OF CONSENT. Every row is a record CASL may require ThemisIQ to produce. Export the table first
-- (Table editor, Export to CSV) and keep the file for the retention period; the pre-flight reports how many rows exist
-- and how many are active grants. Only run this if M5 itself must be undone, not to clear data.
--
-- After this, the claim route logs "marketing consent not recorded" on every claim (the save itself is unaffected),
-- /api/unsubscribe answers that the choice could not be changed, and no email carries an unsubscribe link.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.

begin;

do $pre$
declare
  v_all int;
  v_active int;
begin
  if to_regclass('public.marketing_consents') is null then
    raise exception 'Pre-flight: public.marketing_consents does not exist. Nothing to roll back.';
  end if;
  select count(*), count(*) filter (where granted and withdrawn_at is null) into v_all, v_active from public.marketing_consents;
  raise notice 'Consent records that will be dropped: % (active grants: %). Export them first.', v_all, v_active;
end
$pre$;

drop table public.marketing_consents;

commit;
