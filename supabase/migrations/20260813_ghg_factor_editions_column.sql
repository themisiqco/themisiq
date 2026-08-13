-- ghg_inventories.factor_editions — which emission-factor editions priced this inventory
-- ---------------------------------------------------------------------------
-- TO BE RUN in the Supabase SQL editor (2026-08-13). Unlike coverage_resolutions and
-- pct_estimated, this file is NOT a capture of a column already hand-run — it is the source.
--
-- WHY THIS COLUMN EXISTS:
-- A UK customer whose 2025 inventory was priced with DEFRA 2025 and whose 2026 inventory was priced
-- with DEFRA 2026 sees Scope 2 fall by roughly a quarter, with nothing on any surface saying the
-- factors moved. The fall is real arithmetic and partly real decarbonisation, but the share of it
-- attributable to a published revision is invisible — so the trend line silently mixes operational
-- change with factor revision and invites the customer to claim both as performance.
--
-- ISO 14064-3:2019 7.1.4.9(b) already obliges the verifier to confirm WHICH factor set the figures
-- use; gwp_version answers that for GWP and nothing answers it for the factors themselves. This
-- column is the record, per jurisdiction and per family:
--
--   { "UK": {
--       "combustion":  { "source": "UK DEFRA/DESNZ (2026) GHG Conversion Factors for Company Reporting",
--                        "edition": "DEFRA 2026" },
--       "electricity": { "source": "UK DEFRA/DESNZ GHG Conversion Factors for Company Reporting",
--                        "edition": "2026" } },
--     "US": { ... } }
--
-- Jurisdiction AND family, not one edition per inventory: a single inventory can hold locations in
-- several countries, and within one country the combustion table and the grid table are published
-- on independent cycles. EF_UK is a single edition refreshed wholesale; GRID_EF.UK is year-keyed and
-- holds 2025 and 2026 side by side. One field cannot carry both.
--
-- ⚠️ THE ELECTRICITY EDITION COMES FROM getGridFactor(region, year).usedYear, NOT FROM THE CITATION
-- STRING. This is the part that is easy to get wrong, and getting it wrong defeats the column.
-- EF_SOURCES.electricity_uk was DELIBERATELY made year-neutral ("UK DEFRA/DESNZ GHG Conversion
-- Factors for Company Reporting", no year) precisely BECAUSE GRID_EF.UK holds two editions: a single
-- year in that string would be wrong for one of them. So gridSource(loc) returns the SAME string for
-- a 2025 and a 2026 UK inventory — storing its output would record the two years as identical and
-- record nothing about the one divergence this column exists to expose. usedYear is the year the
-- lookup actually resolved to, including when it resolves backward or forward off the end of the
-- table, and it is the only value that distinguishes them.
--   Combustion is the opposite case: EF_UK is single-edition, so combustionSource(loc) carries its
--   year honestly and IS the right source there. The two families are asymmetric on purpose.
--
-- '{}' MEANS THE INVENTORY PREDATES THIS COLUMN, AND ITS EDITIONS ARE NOT RECOVERABLE.
-- Not "no factors were used" — every inventory was priced with some edition. The editions are
-- unrecoverable because the factor tables are CODE, not data: EF_UK was DEFRA 2025 until August 2026
-- and is DEFRA 2026 now, and nothing in this database records which one was live when a given row
-- was saved. updated_at cannot stand in — it is rewritten on every save, so a row recomputed today
-- looks current whatever priced it originally. Partial recovery is possible for recent saves only:
-- workings[].factor_vintage carries usedYear for grid rows and workings[].ef_source carries the
-- year-bearing citation for combustion rows, but only for inventories saved after the August 2026
-- provenance pass, and only where workings was written at all.
--   Consequence for the consuming code: an empty object must WARN, never block, and must never be
--   read as "consistent". Three states are needed — consistent, changed, unknown — and 'unknown' is
--   the common case for as long as the back catalogue lives. See lib/ghg/engine.ts StreamState for
--   the shape; a boolean here would collapse "the editions match" into "we have no idea".
--
-- NOT NULL DEFAULT '{}' (contrast comparability_disclosure, which is nullable with no default).
-- The distinction there is between "the customer was never asked" and "the customer was asked and
-- had nothing to add" — two answers only a human can give, which a default would collapse. Nothing
-- is asked here: the editions are a fact of the calculation, computed at save with no customer
-- input, so there is exactly one absence to represent and an empty object represents it. A nullable
-- column would add a second, indistinguishable way to say the same thing.
--
-- STATUS AT TIME OF FILING: nothing writes this column, and nothing reads it. It is NOT in
-- get_verifier_inventory's field whitelist, so it does not reach a verifier — deliberately, since
-- projecting it today would show every verifier an empty object and teach them the field is always
-- empty. Whitelisting is a separate migration, to follow the write path, and must change all three
-- coupled sites together: the jsonb_build_object projection, the changed_fields array beside it, and
-- AUDIT_FIELD_LABELS in app/verify/[token]/page.tsx (a column named in the RPC without a label there
-- renders to the verifier as "Another field").
--
-- ⚠️ THE WRITE PATH MUST BE WIRED IN THE SAME COMMIT AS THE FIRST WRITE. The wizard's save payload
-- in app/dashboard/ghg/page.tsx is built key by key, and a column absent from that object is dropped
-- on every save. With this default that erases real editions back to '{}' rather than to null — no
-- error, no flag, and the row still looks like an ordinary pre-column inventory.
--
-- The audit trigger needs no change and gets one anyway: audit_ghg_inventories captures whole-row
-- to_jsonb(old)/to_jsonb(new), so this column starts appearing in audit_log.old_values/new_values on
-- the first save after this runs. It does not leak to verifiers — get_verifier_inventory has
-- returned audit METADATA only since 2026-08-05, and changed_fields iterates the whitelist, so an
-- un-whitelisted column is invisible there by construction.

alter table public.ghg_inventories
  add column if not exists factor_editions jsonb not null default '{}'::jsonb;

comment on column public.ghg_inventories.factor_editions is
  'Emission-factor editions that priced this inventory, keyed by jurisdiction then family (combustion / electricity), each holding {source, edition}. The electricity edition comes from getGridFactor().usedYear, NOT the citation string: EF_SOURCES.electricity_uk is deliberately year-neutral because GRID_EF.UK holds two editions, so the citation cannot distinguish DEFRA 2025 from 2026. An empty object means the inventory predates this column - its editions are NOT recoverable, because the factor tables are code and nothing recorded which revision was live at save. Empty must warn, never block, and never read as consistent.';

-- GRANTS — column-scoped, deliberately.
-- authenticated: the wizard reads and writes this row as the signed-in user, under RLS. It is the
--   only role that will touch the column.
-- service_role: reaches ghg_inventories in app/api/verifier-documents/{route,sign}, and although
--   both select only locations_data today, service_role needs an explicit GRANT regardless -
--   BYPASSRLS bypasses the policy, not the privilege, and the failure is a silent permission error
--   on a path with no UI.
-- anon is deliberately NOT granted. A verifier reaches this table only through
--   get_verifier_inventory, which is SECURITY DEFINER and runs as the function owner. anon holds no
--   direct privilege on ghg_inventories and must not gain one here.
--
-- Scoped to the single column rather than issued at table level so this CANNOT widen anything. If
-- ghg_inventories already carries table-level grants (the usual case, and what the house convention
-- has done for every new table), a table-level GRANT here would silently re-issue whatever verbs it
-- names - potentially adding one the table does not currently give - and these column grants are a
-- documented no-op instead. If the table is column-granted, these are load-bearing.
grant select (factor_editions), insert (factor_editions), update (factor_editions)
  on public.ghg_inventories to authenticated;

grant select (factor_editions)
  on public.ghg_inventories to service_role;
