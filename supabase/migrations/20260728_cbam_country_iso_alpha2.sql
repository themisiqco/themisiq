begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- ISO 3166 alpha-2 uppercase enforcement on the two country columns that act as
-- LOOKUP KEYS. Same gap class as cn_code before 20260728_cbam_cn_codes_fk:
-- validity was checked in the browser only, and intake is direct DML, so the
-- database had no rule.
--
-- Why these two and not all three country columns:
--   cbam_installations.country      — keys gridFactor() and, since 28 Jul 2026,
--                                     the default-value comparison. A wrong
--                                     value silently changes a number.
--   cbam_precursor_inputs.origin_country
--                                   — keys the per-country precursor default
--                                     (IR 2025/2621 Annex I). Same silent-change
--                                     risk. See §11.16: this column must NOT
--                                     accept an 'unknown' sentinel until Annex IV
--                                     is seeded, or unidentified origin would
--                                     fall through to the 'other' average and
--                                     UNDERSTATE. This CHECK is what enforces that.
--
-- DELIBERATELY NOT CONSTRAINED: cbam_operator_profile.country. It is §1.2 item
-- (1)(c), part of the operator's postal address rendered as free text in the
-- report. It keys nothing, so a wrong value is visible in the output rather than
-- silent, and alpha-2 would reject a legitimately-spelled 'Canada' in an address
-- block. Different risk class — omission is a decision, not an oversight.
--
-- Verified before running: 2 installations, 2 precursor_inputs, ZERO rows
-- violating ^[A-Z]{2}$ in either column.
--
-- Note 'other' is a REFERENCE-table sentinel (cbam_default_values.country,
-- cbam_grid_factors.country_code) and is never written to an intake column.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cbam_installations_country_iso_alpha2'
  ) then
    alter table public.cbam_installations
      add constraint cbam_installations_country_iso_alpha2
      check (country ~ '^[A-Z]{2}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cbam_precursor_origin_country_iso_alpha2'
  ) then
    alter table public.cbam_precursor_inputs
      add constraint cbam_precursor_origin_country_iso_alpha2
      check (origin_country ~ '^[A-Z]{2}$');
  end if;
end $$;

commit;

-- Verification (run after commit):
-- select conname, conrelid::regclass as table_name, convalidated
-- from pg_constraint
-- where conname in (
--   'cbam_installations_country_iso_alpha2',
--   'cbam_precursor_origin_country_iso_alpha2'
-- )
-- order by conname;
-- Applied 28 Jul 2026 — both rows returned, convalidated = true.

-- WHEN IR 2025/2621 ANNEX IV IS SEEDED (§11.16): the precursor constraint must be
-- WIDENED DELIBERATELY, in a migration that states the reasoning — not dropped.
-- The correct sequence is (1) seed Annex IV with a distinguishable source_ref,
-- (2) widen this CHECK to admit the specific sentinel that routes to it, and
-- (3) only then let intake offer an "origin cannot be identified" option. Doing
-- (3) first is the silent-understatement defect this constraint exists to prevent.
