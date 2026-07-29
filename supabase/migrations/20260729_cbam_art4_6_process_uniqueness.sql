begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- ART 4(6) INVARIANT: one production process per (installation, CN code, period).
--
-- IR (EU) 2025/2547 Art 4(2): for steel and aluminium the FUNCTIONAL UNIT is tonnes
-- of goods under the same CN code. Art 4(1): a production process is identified for
-- goods to which the same functional unit applies. Art 4(6): where such goods are
-- produced by DIFFERENT production routes within an installation, a SINGLE process
-- shall encompass all of them — recital (7): emissions are the weighted average
-- across routes.
--
-- The engine needs no aggregation logic for this. One process carrying the source
-- streams of every route, with the combined activity level, yields
-- aeG = total attrEm / total activity — which IS the weighted average, by construction.
-- Splitting per route is what breaks it: two intensities for one CN code, and §1.2
-- item (4)(a) reports intensity, not total. Item (5) would still sum correctly, which
-- is why this hides in the number that is right and shows in the number that matters.
--
-- No legitimate case for two rows: Art 4(7) splits into separate INSTALLATIONS
-- (different installation_id); Art 4(8) is one process spanning several CN codes,
-- not the reverse. Different reporting periods and different installations remain
-- distinct rows, correctly.
--
-- Step 1 removes the test fixture, which was itself in the forbidden shape — built to
-- exercise a two-route configuration that turns out not to be a valid one. Recorded in
-- docs/backlog.md as deliberate-delete-when-ready. The GOLDEN fixture that matters
-- (FIXTURE_A in engine.test.ts, DirEm 218.008) is in-memory and untouched.
-- ─────────────────────────────────────────────────────────────────────────────

delete from public.cbam_installations
where id = '244c7b71-eb87-4b38-be37-1c5a16d3cd40';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cbam_pp_installation_cn_period_uniq'
  ) then
    alter table public.cbam_production_processes
      add constraint cbam_pp_installation_cn_period_uniq
      unique (installation_id, cn_code, reporting_period);
  end if;
end $$;

commit;

-- Verification (run after commit):
-- select
--   (select count(*) from public.cbam_production_processes) as processes,
--   (select count(*) from public.cbam_installations)        as installations,
--   (select count(*) from pg_constraint
--      where conname = 'cbam_pp_installation_cn_period_uniq') as constraint_added;
-- Applied 29 Jul 2026 — returned 1 / 1 / 1.

-- REPLAY WARNING. The DELETE targets a specific UUID that existed only in the 28 Jul 2026
-- production database. On any other database it is a no-op — harmless, but it means this
-- migration does NOT self-verify its own precondition. If replayed against a database
-- holding real process rows, the ALTER will fail if ANY (installation_id, cn_code,
-- reporting_period) is duplicated. That failure is correct behaviour: it means data exists
-- in a shape Art 4(6) forbids, and it must be merged into a single process — never
-- deleted to make the constraint fit.
--
-- Detection query:
--   select installation_id, reporting_period, cn_code, count(*), array_agg(route_code)
--   from public.cbam_production_processes
--   group by installation_id, reporting_period, cn_code
--   having count(*) > 1;

-- WHAT THIS DOES NOT ADDRESS. The setup form still has no client-side duplicate check —
-- a user attempting a second process for the same good now receives a raw Postgres unique-
-- violation rather than an explanation of why one process must cover both routes. The
-- database is correct; the message is not. See the CBAM helper design, Layer 2.5.
