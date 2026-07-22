-- supabase/migrations/20260722_cbam_customer_grants.sql
--
-- Captures the per-customer grants applied live during the CBAM build and
-- never written to a migration (spec §10.4 pin). Verified 22 Jul 2026
-- against information_schema.role_table_grants: these five tables are
-- granted live but absent from every migration file. The other four
-- per-customer tables carry their grants in their own seed migrations.
--
-- GRANT and RLS are separate layers. Neither implies the other.
-- service_role is intentionally granted nothing on cbam_* tables (§10.4).
--
-- REFERENCES / TRIGGER / TRUNCATE appear live for all three roles — that is
-- ALTER DEFAULT PRIVILEGES residue, not deliberate, and is not captured here.
--
-- Idempotent: GRANT is a no-op on replay. Nothing to apply in Supabase;
-- this closes the repo side only.

-- Read-only: consumed by the compute route and the report fetch layer.
-- No DML granted — the write path is an open decision (RPC vs direct DML),
-- to be settled when the intake UI is built.
grant select on
  public.cbam_installations,
  public.cbam_production_processes,
  public.cbam_source_streams,
  public.cbam_precursor_inputs
to authenticated;

-- Computed records: append-only BY GRANT ONLY.
-- The policy on this table is `for all`, so RLS permits UPDATE and DELETE.
-- The append-only property rests entirely on this grant. The report route's
-- recompute-and-assert-equality tripwire depends on it: a recomputation
-- writes a NEW row, never mutates a verified figure.
-- Do not add update/delete here without revisiting that design.
grant select, insert on public.cbam_see_records to authenticated;
