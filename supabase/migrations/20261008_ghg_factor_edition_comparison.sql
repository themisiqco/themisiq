-- ghg_inventories.factor_edition_comparison: the factor editions that changed since the prior year (F-06, T3c diff 4)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- Adds one column, ghg_inventories.factor_edition_comparison jsonb, nullable, no default, and grants it,
-- column-scoped, to authenticated and service_role. No data is written; no RLS policy is created or changed.
--
-- WHY
-- ISO 14064-3:2019 cl. 6.3.1.5 (ruling of 2 Oct 2026, finding F-06): a change of emission-factor edition between the
-- compared years bears on comparability, and the verifier must be able to see it. lib/ghg/factorEditionComparison.ts
-- computes it: for every dataset both years used whose edition changed, the prior and current edition and what the
-- change alone does to this year's figures (or why that could not be calculated).
--
-- WHY A SEPARATE COLUMN FROM comparability_disclosure (Lisa's ruling, 8 Oct 2026)
-- The edition change is computed by the platform, not stated by the company, so it must reach the verifier whether or
-- not the comparability question was answered. comparability_disclosure is NULL exactly when the question was never
-- answered, and that NULL is a fact a verifier reads; storing the platform's comparison inside it would break that.
-- comparability_disclosure keeps its meaning. This column is written on every save, answered or not.
--
-- SHAPE: the FactorEditionComparison of lib/ghg/comparability.ts:
--   { "priorLabel": "reporting year 2025", "currentLabel": "reporting year 2026", "priorHeading": "2025",
--     "unrecordedBecause": null, "state": "changed", "disclosure": "Emission factors changed between years: ...",
--     "changes": [ { "dataset": "desnz_grid", "publisher": "UK DESNZ", "family": "grid electricity",
--                    "priorEdition": "DEFRA 2025", "currentEdition": "DEFRA 2026",
--                    "effect_tco2e": { "scope2_location": 5.5248, "scope2_market": 5.5248 },
--                    "effect_basis": "...", "effectWithheldBecause": null } ] }
--
-- NULL MEANS NO COMPARISON WAS MADE: no stored prior-year inventory for the company (a first inventory, or prior
-- figures typed in), or a save before this column existed. NULLABLE WITH NO DEFAULT, deliberately, unlike
-- factor_editions: "no comparison" and "compared, nothing changed" are different facts, and the second is an object
-- with state "consistent" and no changes. A default of '{}' would make the two indistinguishable.
--
-- DEPLOY ORDER: run this BEFORE the code that writes the column is deployed (every wizard save names it), then
-- 20261009_get_verifier_inventory_factor_edition_comparison.sql, which projects it to verifiers.
--
-- GRANTS: column-scoped, as 20261008_ghg_factor_selection.sql and 20260813_ghg_factor_editions_column.sql grant theirs.
-- authenticated: the wizard writes this row as the signed-in user, under RLS.
-- service_role: SELECT. BYPASSRLS bypasses the policy, not the privilege.
-- anon is deliberately NOT granted. A verifier reaches this table only through get_verifier_inventory, which is
--   SECURITY DEFINER and runs as the function owner; anon holds no direct privilege on ghg_inventories.
-- Scoped to the single column so this CANNOT widen anything: a no-op where the table is table-granted, load-bearing
-- where it is column-granted. The 8 Oct 2026 pre-check found service_role column-granted (UPDATE on free_tier only),
-- so these are issued rather than relied on as inherited.
--
-- NO RLS CHANGE. Row access is governed by ghg_inventories' existing per-row policies, which cover every column.
--
-- PRE-CHECK, run first (the same query as 20261008_ghg_factor_selection.sql):
--   select grantee, column_name, privilege_type
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'ghg_inventories'
--     and grantee not in ('postgres', 'supabase_admin')
--   order by grantee, column_name, privilege_type;
-- PROCEED if the result is as it was on 8 Oct 2026: every role holds its privileges on every column alike, except
-- service_role's UPDATE on free_tier. STOP and report any other column-level grant.
-- VERIFY, after: the same query filtered to column_name = 'factor_edition_comparison' should show authenticated
-- with INSERT, SELECT, UPDATE; service_role with SELECT (and REFERENCES, as on factor_selection); anon with nothing.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the comment is restated and the grants re-issued (a no-op) on every run.
-- ASCII only, so it pastes whole into the SQL editor (the 13 Aug paste failure; lib/ghg/verifierWhitelist.test.ts W-6).

alter table public.ghg_inventories
  add column if not exists factor_edition_comparison jsonb;

comment on column public.ghg_inventories.factor_edition_comparison is
  'F-06: the emission-factor editions that changed since the prior year and the effect of each change alone, as '
  'computed by lib/ghg/factorEditionComparison.ts at save, answered or not. NULL = no comparison made (no stored prior '
  'year). Separate from comparability_disclosure, which is NULL exactly when the comparability question was never '
  'answered. See supabase/migrations/20261008_ghg_factor_edition_comparison.sql.';

grant select (factor_edition_comparison), insert (factor_edition_comparison), update (factor_edition_comparison)
  on public.ghg_inventories to authenticated;
grant select (factor_edition_comparison)
  on public.ghg_inventories to service_role;
