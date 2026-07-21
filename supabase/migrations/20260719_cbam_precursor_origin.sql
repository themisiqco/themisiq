-- 20260719_cbam_precursor_origin.sql
-- Implements Annex IV §1.2 item (16) from docs/cbam-annex-iv-verbatim.md — "Information on the
-- operator and the installation of origin of the precursor". Adds the four origin-identity fields
-- to cbam_precursor_inputs.
--
-- Nullable by the same PROGRESSIVE-INTAKE principle as the identity and disclosure migrations: the
-- schema stores partial progress, and the REPORT BUILDER enforces completeness at report time, not
-- NOT NULL constraints here. Item (16) itself carries an "if applicable" qualifier on the registry
-- identifier — origin_cbam_registry_id is legitimately absent for an origin installation not
-- registered in the CBAM Registry, so it must not be forced.
--
-- THESE COLUMNS ARE NOT origin_country. origin_country (already on cbam_precursor_inputs) is a
-- CALCULATION input: it drives zero-rating and default-value lookup. Item (16)'s fields are for
-- TRACEABILITY — WHO produced the precursor and WHERE — and feed no calculation. Do not conflate
-- them or derive one from the other; a precursor's origin country and its origin operator/
-- installation identity answer different questions.
--
-- origin_reporting_period is the PRECURSOR'S reporting period, which MAY DIFFER from the process's
-- own reporting_period (already on cbam_precursor_inputs). That difference is not noise: it is
-- exactly what §1.2 items (14) and (15) — Article 14 multi-period / multi-installation averaging of
-- specific embedded emissions — turn on. Capturing it now is the data foundation for that deferred
-- work; without it, the averaging in (14)/(15) could not later be reconstructed.
--
-- No claim is made here about deployment state.

alter table public.cbam_precursor_inputs
  add column if not exists origin_operator_name     text,   -- (16) name of the operator (of origin)
  add column if not exists origin_installation_name text,   -- (16) name of the installation (of origin)
  add column if not exists origin_cbam_registry_id  text,   -- (16) unique installation identifier in the CBAM Registry, IF APPLICABLE
  add column if not exists origin_reporting_period  int;    -- (16) applicable reporting period (the precursor's, may differ from the process's — see (14)/(15))
