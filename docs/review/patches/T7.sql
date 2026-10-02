-- supabase/migrations/20261002_ghg_derivation_version.sql
-- NOT RUN.
--
-- T7 (docs/review/design-derived-figures.md, section 11). Adds ghg_inventories.derivation_version.
-- Written against db/dumps/schema_public_20261001_1057.sql, where the column does not exist.
--
-- RUN THIS BEFORE THE T7 CODE SAVES ANYTHING. The T7 save payload writes derivation_version; against a
-- table without the column, PostgREST refuses the whole save (unknown column), so every save fails.
-- Running it first is safe for the code already on main: main never names the column, an insert takes
-- the default and an update leaves it alone.
--
-- No grant or policy change: an added column is covered by the table's existing grants and RLS policies.
-- The audit trigger and enforce_ghg_location_allowance() fire on update and do not read this column.
-- Idempotent (add column if not exists; comment on replaces the comment).

begin;

alter table public.ghg_inventories
  add column if not exists derivation_version smallint not null default 2;

comment on column public.ghg_inventories.derivation_version is
  '2 = location figures derived from accepted documents through applyResolutions at every save. '
  'No version 1 inventories exist (column added pre-launch).';

commit;
