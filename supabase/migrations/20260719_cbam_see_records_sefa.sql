-- 20260719_cbam_see_records_sefa.sql
-- Implements Annex IV §1.2 item (4)(e) — "The specific embedded free allocation of each of the
-- goods produced" (SEFA). The value is computed by lib/cbam/sefa.ts (IR 2025/2620 Equations 2/4/6:
-- SFA_Proc = CBAM_y × CSCF_y × BM*_g, rolled up per Eq 4) and is persisted here alongside the SEE
-- legs so a good's free allocation lives with its embedded emissions.
--   sefa                   — SEFA_g, the good's specific embedded free allocation (Eq 4 total)
--   sfa_proc               — SFA_Proc_g, this process's own free allocation before precursor roll-up
--   sefa_precursor_contrib — Σ m_i · SEFA_i, the precursor contribution
--
-- NULLABLE, unlike see_direct / see_indirect which are NOT NULL. The asymmetry is deliberate and
-- load-bearing: SEE is ALWAYS computable, SEFA is NOT. SFA_Proc = CBAM_y × CSCF_y × BM*_g, and
-- CSCF_y is confirmed UNPUBLISHED for 2026-2030 (spec §11.1). So a record can legitimately carry a
-- fully computed SEE and an UNDETERMINABLE SEFA at the same time — the SEE columns stay NOT NULL,
-- the SEFA columns are null.
--
-- NEVER WRITE 0 FOR AN UNDETERMINABLE SEFA. The absence of a published CSCF is not a value; a silent
-- 0 would fabricate a free-allocation figure and understate the net position. sefa.ts throws rather
-- than returning 0 when CSCF is null, and that refusal must surface here as null + a status, never
-- as a zero.
--
-- sefa_status records WHY a SEFA is absent, so a null is never mistaken for "not attempted" or for
-- zero:
--   'computed'                        — a real SEFA was computed (all three numeric columns set);
--   'not_determinable_cscf_pending'   — CSCF_y unpublished, SEFA not determinable (all three null);
--   null                              — no status recorded yet (all three null).
--
-- The DB owns the value/status CONSISTENCY rule (the constraint below: a status and its columns
-- cannot disagree). The BUILDER owns COMPLETENESS — i.e. when a status must be set at all before a
-- record is report-ready; the DB does not force a status onto every row.
--
-- No claim is made here about deployment state.

alter table public.cbam_see_records
  add column if not exists sefa                     numeric,
  add column if not exists sfa_proc                 numeric,
  add column if not exists sefa_precursor_contrib   numeric,
  add column if not exists sefa_status              text
    check (sefa_status is null or sefa_status in ('computed','not_determinable_cscf_pending'));

-- ADD CONSTRAINT has no IF NOT EXISTS, so guard on pg_constraint for replay safety.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cbam_see_sefa_status_consistent'
  ) then
    alter table public.cbam_see_records
      add constraint cbam_see_sefa_status_consistent check (
        (sefa_status = 'computed' and sefa is not null and sfa_proc is not null
           and sefa_precursor_contrib is not null)
        or (sefa_status = 'not_determinable_cscf_pending' and sefa is null and sfa_proc is null
           and sefa_precursor_contrib is null)
        or (sefa_status is null and sefa is null and sfa_proc is null
           and sefa_precursor_contrib is null)
      );
  end if;
end $$;
