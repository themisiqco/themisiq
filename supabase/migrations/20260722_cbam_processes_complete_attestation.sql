-- supabase/migrations/20260722_cbam_processes_complete_attestation.sql
--
-- Operator attestation that the process set for an installation + reporting
-- period is complete. Gates §1.2 items 5 and 6 (installation-level totals)
-- in lib/cbam/report/build.ts: buildSummaryReport omits those items unless
-- installationProcessesComplete is true, because a partial sum must never be
-- presented as an installation total.
--
-- This differs in kind from the other booleans on this table. Those are
-- factual disclosures (did you import heat?). This is an attestation — a
-- legal-weight assertion under the reasonable-assurance standard. It must
-- only ever be written by an explicit operator action in the UI: never
-- inferred from row counts, never seeded, never defaulted.
--
-- Idempotent: add column if not exists. Replay is a no-op.

alter table public.cbam_installation_disclosures
  add column if not exists processes_complete           boolean,
  add column if not exists processes_complete_declared_at timestamptz;

comment on column public.cbam_installation_disclosures.processes_complete is
  'Operator ATTESTATION that the cbam_production_processes rows for this installation and reporting period are the COMPLETE set. Gates §1.2 items 5 and 6 (installation-level totals) — buildSummaryReport omits them unless this is true, because a partial sum must never be presented as an installation total. Nullable by design: null = not yet declared, false = declared incomplete, true = declared complete. MUST only ever be written by an explicit operator action in the UI — never inferred from row counts, never seeded, never defaulted.';

comment on column public.cbam_installation_disclosures.processes_complete_declared_at is
  'When processes_complete was last set by the operator. Separate from updated_at (which tracks any row change) so the attestation carries its own audit timestamp.';
