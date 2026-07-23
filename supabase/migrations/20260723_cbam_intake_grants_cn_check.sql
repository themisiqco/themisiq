-- supabase/migrations/20260723_cbam_intake_grants_cn_check.sql
--
-- Settles the write-path decision deferred in 20260722_cbam_customer_grants.sql
-- ("the write path for these is an open decision (RPC vs direct DML), to be
-- settled when the intake UI is built"). Direct DML is chosen.
--
-- Rationale: every validity rule on these tables is already expressed as a
-- CHECK or FK constraint, so it is enforced on every write path regardless of
-- caller. An RPC layer would add indirection without adding enforcement. The
-- four sibling intake tables (operator_profile, installation_disclosures,
-- process_parameters, charge_mix) already use direct DML.
--
-- RLS still scopes every write: the *_owner policies carry WITH CHECK on
-- company_id IN (select id from companies where user_id = auth.uid()).

-- Write access for the intake UI. Direct DML: every validity rule on these
-- tables is already a CHECK or FK constraint, so it applies on every write
-- path; an RPC layer would add indirection without adding enforcement.
grant insert, update, delete on
  public.cbam_installations,
  public.cbam_production_processes,
  public.cbam_source_streams,
  public.cbam_precursor_inputs
to authenticated;

-- §10.7: a process must carry the exact 8-digit spaced CN code (e.g.
-- '7206 10 00'). A 4-digit heading is an unseeded "see below" row, so
-- defaultLookup returns nothing and default_compared lands null — a silent
-- loss of the actual-vs-default comparison, failing in the costly direction.
-- Verified 23 Jul 2026: all 119 eight-digit codes in cbam_default_values
-- match this pattern; the 4- and 6-digit codes deliberately do not.
-- Precursor CN codes are NOT constrained this way — they legitimately use
-- narrower seeded codes (7203 DRI, 7201 pig iron).
alter table public.cbam_production_processes
  add constraint cbam_pp_cn_code_8digit_spaced
  check (cn_code ~ '^[0-9]{4} [0-9]{2} [0-9]{2}$');
