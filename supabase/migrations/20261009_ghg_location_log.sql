-- RUN 9 Oct 2026 in the Supabase SQL editor; grants verified.
--
-- ghg_inventories.location_log: the record each deleted location leaves (T18 section D)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- Adds one column, ghg_inventories.location_log jsonb NOT NULL DEFAULT '[]', and grants it, column-scoped, to
-- authenticated and service_role (below). No data is written, and no RLS policy is created or changed.
--
-- WHY
-- Deleting a location removed its documents and their files, and the document log that held their tombstones went
-- with it (found in T18 diff 2). Ruled 9 Oct 2026 (docs/review/design-derived-figures.md, T18 section D): deleting a
-- location that holds any document requires a reason and leaves an inventory-level, append-only record: who, when,
-- the reason, the location's name and country, and a tombstone for each of its documents. A location with no
-- documents leaves a lighter record of who and when. The record cannot live in locations_data, because the location
-- it describes is no longer there.
--
-- SHAPE: an array of LocationEvent (lib/ghg/engine.ts), oldest first:
--   [ { "kind": "location_deleted", "locationId": "loc-2", "name": "Leeds", "country": "GB",
--       "at": "2026-10-09T10:00:00.000Z", "by": { "userId": "...", "email": "..." }, "reason": "Site closed in 2024",
--       "documents": [ { "kind": "deleted", "docId": "...", "file": "gas-jan.pdf", "documentType": "utility_bill_gas",
--                        "uploadedAt": "...", "sha256": null, "at": "...", "by": { ... }, "reason": "Site closed in 2024" } ],
--       "document_log": [ ... ], "typed_entries": [ ... ] } ]
-- reason and the tombstones are present only when the location held documents. No reading and no source quote.
--
-- APPEND-ONLY. The page refuses a save whose location_log lacks an entry the loaded record had
-- (lib/ghg/savePayload.ts, locationLogProblem). The record reaches the saved workings as one row per entry
-- (gwp_basis 'location_event'), which is how a verifier sees it: get_verifier_inventory projects workings, and this
-- column is NOT added to that function (the workings rows carry everything in it).
--
-- '[]' MEANS NO LOCATION HAS BEEN DELETED. NOT NULL DEFAULT '[]', so a row saved before this column, and the
-- free-calculator claim (which does not name the column), read as an empty record.
--
-- DEPLOY ORDER: run this BEFORE the code that writes the column is deployed. Until it exists, every wizard save names
-- an unknown column and is refused.
--
-- GRANTS: column-scoped, as 20261008_ghg_factor_selection.sql grants factor_selection.
-- authenticated: the wizard reads and writes this row as the signed-in user, under RLS.
-- service_role: SELECT. BYPASSRLS bypasses the policy, not the privilege.
-- anon is deliberately NOT granted. A verifier reaches this table only through get_verifier_inventory (SECURITY
--   DEFINER); anon holds no direct privilege on ghg_inventories and must not gain one here.
--
-- NO RLS CHANGE. Row access is governed by ghg_inventories' existing per-row policies, which cover every column.
--
-- PRE-CHECK, run first (the query 20261008_ghg_factor_selection.sql used):
--   select grantee, column_name, privilege_type
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'ghg_inventories'
--     and grantee not in ('postgres', 'supabase_admin')
--   order by grantee, column_name, privilege_type;
-- PROCEED if every role holds its privileges on every column alike, except service_role's UPDATE on free_tier (the
-- 8 Oct 2026 result). STOP and report any other column-level grant.
-- RESULT, 9 Oct 2026 (Lisa): every role held its privileges on all 34 columns alike, except service_role, which holds
--   UPDATE on free_tier only (the 8 Oct 2026 result).
-- VERIFY, after: the same query filtered to column_name = 'location_log' should show authenticated with INSERT,
-- SELECT, UPDATE; service_role with SELECT (and REFERENCES, as on factor_selection); anon with nothing.
-- VERIFIED, 9 Oct 2026 (Lisa), after running: all 35 columns alike for authenticated (INSERT, SELECT, UPDATE) and
--   service_role (REFERENCES, SELECT); service_role UPDATE still on 1 column (free_tier); anon holds nothing on
--   ghg_inventories.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the comment is restated and the grants re-issued (a no-op) on every run.
-- ASCII only, so it pastes whole into the SQL editor (lib/ghg/verifierWhitelist.test.ts W-6).

alter table public.ghg_inventories
  add column if not exists location_log jsonb not null default '[]'::jsonb;

comment on column public.ghg_inventories.location_log is
  'T18 section D: every location deleted from this inventory, append-only: who, when, its name and country, and, when '
  'it held documents, the reason and a tombstone for each document. Written by the wizard (lib/ghg/documentActions.ts, '
  'locationDeleteRecord); a save that drops or changes an entry is refused. [] = no location deleted. '
  'See supabase/migrations/20261009_ghg_location_log.sql.';

grant select (location_log), insert (location_log), update (location_log)
  on public.ghg_inventories to authenticated;
grant select (location_log)
  on public.ghg_inventories to service_role;
