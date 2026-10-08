-- ghg_inventories.factor_selection: the frozen class (b) emission-factor edition choices (T3c diff 3)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- Adds one column, ghg_inventories.factor_selection jsonb NOT NULL DEFAULT '{}'. Nothing else: no data is
-- written, no RLS policy is created or changed, and no GRANT is issued.
--
-- WHY
-- A class (b) dataset (eGRID, Green-e, AIB, EEA, the ECCC grid and NIR tables, the MfE grid and T&D series) is
-- published some years after the period it describes. ThemisIQ uses the edition whose data year is the reporting
-- year where one exists, and otherwise the newest edition published on or before the day the inventory was first
-- prepared (docs/review/design-derived-figures.md, T3c; factor-year-selection.md section 8). That second choice
-- depends on the day, so it must be saved with the inventory and kept: a newer edition registered later must not
-- silently re-price an inventory already prepared. lib/ghg/factorSelection.ts writes it on save and every
-- surface that prices a saved inventory reads it back.
--
-- WHY A SEPARATE COLUMN FROM factor_editions
-- factor_editions is recomputed on every save ("a non-empty recompute always wins", lib/ghg/factorEditions.ts,
-- factorEditionsForSave). A frozen choice cannot live in a value that every save rewrites. factor_editions
-- records what priced the figures; factor_selection records what must keep pricing them.
--
-- SHAPE, ONE ENTRY PER CLASS (b) DATASET THE INVENTORY USES
--   { "egrid": { "edition": "eGRID2023", "data_year": 2023, "rule": "data_year_newest",
--                "selected_on": "2026-10-08", "window": "2026-01-01/2026-12-31" } }
-- rule is data_year_match or data_year_newest only. A provisional (R19) or class (a) selection is never stored.
--
-- ⚠️ DEPARTURE FROM THE DESIGN'S COLUMN SHAPE (Lisa's ruling A, 8 Oct 2026). The design specified
-- {dataset: {edition, data_year, rule, selected_on}}. Each entry also records `window`, the reporting window
-- ("yyyy-mm-dd/yyyy-mm-dd", first and last day) it was chosen for. An entry whose window differs from the
-- inventory's current window (its reporting year or year end was changed) is discarded on read and the dataset is
-- selected again, dated that save. Without it, a frozen "eGRID2024: data year 2024 matches reporting year 2024"
-- would survive a change of the reporting year to 2025. Recorded also in the design doc's T3c section.
--
-- '{}' MEANS NO CHOICE IS FROZEN YET: an inventory saved before this column existed, or one created with no class
-- (b) line. Its next save makes the choices, dated that day (pre-launch, design section 4: no customer inventories
-- exist, so nothing is lost). NOT NULL DEFAULT '{}', like factor_editions, because there is one absence to record.
--
-- ⚠️ DEPLOY ORDER: run this BEFORE the code that writes the column is deployed. Until it exists, every save
-- (the wizard and the free-calculator claim) is refused for an unknown column.
--
-- NO RLS OR GRANT CHANGE
-- Row access to ghg_inventories is governed by its existing policies, which are per row and cover every column.
-- Table-level privileges cover a column added later; only a column-level grant would not, and the pre-check below
-- confirms there are none on this table. The verifier RPC (get_verifier_inventory) is NOT changed: the column is
-- not projected to verifiers (ruling E); the workings rows they already receive carry selected_on.
--
-- PRE-CHECK, run first, in the Supabase SQL editor:
--   select grantee, column_name, privilege_type
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'ghg_inventories'
--     and grantee not in ('postgres', 'supabase_admin')
--   order by grantee, column_name, privilege_type;
-- PROCEED if every grantee listed holds every privilege on every column alike, which is what a table-level grant
-- produces (information_schema reports a table grant once per column). In particular, check that anon and
-- authenticated each show the same privilege_type values on every column_name they appear with. STOP and report if
-- any role holds a privilege on some columns of ghg_inventories and not on others: that is a column-level grant,
-- and the new column would not inherit it.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the comment is restated on every run.

alter table public.ghg_inventories
  add column if not exists factor_selection jsonb not null default '{}'::jsonb;

comment on column public.ghg_inventories.factor_selection is
  'T3c: frozen class (b) emission-factor edition choices, {dataset: {edition, data_year, rule, selected_on, window}}. '
  'Written by lib/ghg/factorSelection.ts on save; an entry is kept on every later save for the same reporting window '
  'and discarded when the window changes. {} = no choice frozen yet. Separate from factor_editions, which every save '
  'recomputes. See supabase/migrations/20261008_ghg_factor_selection.sql.';
