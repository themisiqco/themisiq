-- Climate-risk materiality engine — bring load-bearing coefficients under model_version.
-- ---------------------------------------------------------------------------
-- Phase 2 fixes for lib/materiality.ts. Two coefficient sets that DETERMINE the scores were
-- living OUTSIDE model_version coverage; this migration moves them into the mr_* reference tables
-- so the version stamp captures them. Re-runnable (add-column-if-not-exists, create-if-not-exists,
-- drop-then-create policy, idempotent grant + upserts).
--
-- ⚠️ DEPLOY ORDER: apply this migration BEFORE the code that reads the new columns/table goes live.
-- The engine's normalised financial score divides by trans_*_high; if those columns are absent the
-- score is NaN. (mr_* tables are hand-created DB drift — not previously in git — so this ALTER
-- assumes mr_model_config already exists.)

-- ── FIX B — transition-driver band thresholds into mr_model_config ──────────
-- Previously hardcoded in computeTransition (policy 12/6, other drivers 4/2). Under the normalised
-- climateFinancial they now set BOTH the display band AND the normalisation denominator — i.e. they
-- determine the E1 financial number — so they are methodology and must be version-covered.
alter table public.mr_model_config
  add column if not exists trans_policy_high numeric not null default 12,
  add column if not exists trans_policy_med  numeric not null default 6,
  add column if not exists trans_driver_high numeric not null default 4,
  add column if not exists trans_driver_med  numeric not null default 2;

-- The scoring FORMULA changed (raw max → per-driver normalised max), so the model version must
-- change too: a report stamped under the old formula must not read as reproducible under the new
-- one. The live version was '1.0' → bump to '1.1'. UNCONDITIONAL (no value guard on model_version):
-- a guard on a stale expected value ('v1.2') would silently no-op and ship the new formula under an
-- unchanged stamp — which is exactly the failure this line exists to prevent.
update public.mr_model_config set model_version = '1.1' where id = 1;

-- ── FIX D — asset modifiers into mr_asset_modifiers ────────────────────────
-- Previously a hardcoded ASSET_MOD const with no cited source. Same coefficients, now a DB row set
-- covered by model_version. The engine reads ref.assetModifiers when present, else falls back to the
-- const; wire the API route to fetch this table (add to the Promise.all + ReferenceData) once applied.
create table if not exists public.mr_asset_modifiers (
  asset_profile text not null,
  hazard        text not null,
  modifier      numeric not null,
  primary key (asset_profile, hazard)
);

-- Seed = the exact ASSET_MOD const values (lib/materiality.ts).
insert into public.mr_asset_modifiers (asset_profile, hazard, modifier) values
  ('coastal', 'coastal', 1.5), ('coastal', 'cyclone', 1.3), ('coastal', 'flood', 1.2),
  ('inland', 'heat', 1.2), ('inland', 'drought', 1.2), ('inland', 'wildfire', 1.2), ('inland', 'coastal', 0.3),
  ('water', 'water', 1.5), ('water', 'drought', 1.4),
  ('distributed', 'coastal', 0.6), ('distributed', 'flood', 0.8), ('distributed', 'heat', 0.8),
  ('distributed', 'drought', 0.8), ('distributed', 'water', 0.8), ('distributed', 'wildfire', 0.8),
  ('distributed', 'cyclone', 0.8), ('distributed', 'cold', 0.8)
on conflict (asset_profile, hazard) do update set modifier = excluded.modifier;

-- Public-readable reference data (matches the other mr_* tables — the API route reads them with the
-- authed client, but they carry no per-user ownership). Read-only to app roles; writes are seed/admin.
alter table public.mr_asset_modifiers enable row level security;
drop policy if exists mr_asset_modifiers_select on public.mr_asset_modifiers;
create policy mr_asset_modifiers_select on public.mr_asset_modifiers
  for select to authenticated, anon using (true);

-- ── GRANT (MANDATORY — hand-run CREATE TABLE does NOT auto-grant; the 42501 trap) ──
grant select on table public.mr_asset_modifiers to authenticated, anon;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the lines above) ──
-- 1) Columns?  select column_name from information_schema.columns
--              where table_name = 'mr_model_config' and column_name like 'trans_%';
-- 2) Version?  select model_version from public.mr_model_config where id = 1;
-- 3) Seed?     select count(*) from public.mr_asset_modifiers;   -- expect 17
-- 4) Grants?   select privilege_type from information_schema.role_table_grants
--              where table_name = 'mr_asset_modifiers' and grantee = 'authenticated';
