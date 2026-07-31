-- Distinct origin countries for the precursor form.
--
-- The form previously derived this list by fetching cbam_default_values and
-- deduping client-side. That table holds ~16,000 rows and PostgREST caps a
-- response at 1000, so the dedupe saw a truncated slice: 47 of the 72 countries
-- actually present. A country missing from the picker is not a cosmetic gap —
-- the default value is looked up by (cn_code, origin_country), so an operator
-- forced to pick the nearest available country silently resolves a DIFFERENT
-- default. This view returns 72 rows and cannot be truncated.
--
-- 'other' is excluded: origin_country on cbam_precursor_inputs is CHECK-
-- constrained to two uppercase letters, so 'other' can never be stored there.
-- It remains the fallback key inside the resolver, which reads the base table.

create or replace view public.cbam_origin_countries
with (security_invoker = true) as
select distinct country
from public.cbam_default_values
where country <> 'other';

grant select on public.cbam_origin_countries to anon, authenticated;
