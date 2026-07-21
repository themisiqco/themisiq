-- 20260718_cbam_route_split_eaf.sql
-- Splits the ambiguous crude_steel 'eaf' route into 'eaf_dri' and 'eaf_scrap'.
--
-- WHY: IR 2025/2620's §5.3 benchmark indicators treat DRI/EAF and scrap/EAF as DISTINCT
-- routes — (D) vs (E) for carbon steel, (G) vs (H) for low alloy. The values are materially
-- different, not a rounding detail: 7206 10 00 Column B gives (D) = 0.424 and (E) = 0.027,
-- roughly a 16x spread. A single 'eaf' code cannot express which of the two an operator ran,
-- so the indicator simply could not be derived from it — deriveIndicator would have had no
-- basis to choose between D and E. This is a correctness fix, not a modelling preference.
--
-- The route is OPERATOR-DECLARED, and evidenced by cbam_charge_mix against the >50 % metallic
-- charge mass rule. Splitting the enum is what makes that evidence checkable: with one 'eaf'
-- value there was nothing for the mass balance to corroborate or contradict.
--
-- REFERENCE-DATA CHANGE — the first modification to previously-seeded reference data in this
-- codebase (20260716_cbam_reference.sql seeded six routes; this deletes one and adds two).
-- Every prior CBAM migration was additive. It is safe only because no cbam_production_processes
-- row referenced 'eaf'. Note that safety is NOT enforced by the database:
-- cbam_production_processes.route_code is a bare `text` column with no foreign key to
-- cbam_production_routes, so this delete cannot be blocked by referential integrity and would
-- NOT cascade — a process row carrying 'eaf' would silently survive as an orphan pointing at a
-- route that no longer exists. The precondition was checked before applying, not guaranteed by
-- the schema. If this migration is ever replayed against a database that has real process rows,
-- re-check that precondition first; it does not re-verify itself.
--
-- No claim is made here about deployment state.

delete from public.cbam_production_routes
  where category_code = 'crude_steel' and route_code = 'eaf';

insert into public.cbam_production_routes (category_code, route_code) values
  ('crude_steel', 'eaf_dri'),
  ('crude_steel', 'eaf_scrap')
on conflict (category_code, route_code) do nothing;
