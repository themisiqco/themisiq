-- Provenance columns for the value-bearing mr_* reference tables.
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES
-- Adds three columns — provenance / source_ref / source_date — to the nine mr_* tables that carry
-- model VALUES (coefficients, multipliers, thresholds), so every scoring input can state where it
-- came from and how firm it is. Dimension/label tables (mr_regions, mr_esrs_topics,
-- mr_region_aliases) are deliberately NOT touched — they hold no calibratable value.
--
-- KNOWN EXCLUSION (not an oversight): mr_asset_modifiers also does NOT get these columns here. It
-- is a small derived table; it gets the provenance treatment later, in the model_config/multipliers
-- provenance pass. Left out on purpose so nobody re-adds it thinking it was missed.
--
--   provenance  text not null default 'starter'
--               check (provenance in ('starter','primary_source','expert_judgment'))
--   source_ref  text   -- free-text citation / origin note (nullable until sourced)
--   source_date date   -- when that source was taken (nullable until sourced)
--
-- WHY 'starter' IS THE HONEST DEFAULT
-- Every value currently in these tables is a STARTER value — independently derived from the public
-- frameworks (IPCC AR6, TCFD, SSP/NGFS, ESRS) and seeded from the ThemisIQ materiality methodology
-- doc §4.4 ("Calibration note"), PENDING entity-specific calibration. That is the same engineering
-- reality as a GHG emission-factor set at first commercial release: a defensible foundation that
-- improves with calibration against worked examples and sector validation. Defaulting to 'starter'
-- says exactly that — not 'primary_source' (a value transcribed from a citable primary source) and
-- not 'expert_judgment' (a deliberate expert-set value) — so a verifier is never told a number is
-- firmer than it is. Provenance is stamped alongside model_version so a report traces to both the
-- version AND the sourcing state of the inputs that produced it.
--
-- DEPLOYMENT NOTE
-- This ALREADY RAN against production (2026-07-15); the mr_* tables are hand-created DB drift not
-- previously in git (see CLAUDE.md), and this file captures the change for parity. Re-runnable:
-- add-column-if-not-exists on every column, and the reconciliation UPDATE is value-stable.

-- ── Add the three provenance columns to the nine value-bearing tables ───────
-- A do-block over the fixed table list keeps the column definition in ONE place (identical across
-- all nine) rather than nine copy-pasted ALTERs that could drift.
do $$
declare
  t text;
  value_tables text[] := array[
    'mr_model_config',
    'mr_industries',
    'mr_jurisdictions',
    'mr_scenarios',
    'mr_region_hazards',
    'mr_industry_hazards',
    'mr_industry_topic_baselines',
    'mr_industry_opportunities',
    'mr_industry_transition_drivers'
  ];
begin
  foreach t in array value_tables loop
    execute format(
      'alter table public.%I
         add column if not exists provenance text not null default ''starter''
           check (provenance in (''starter'', ''primary_source'', ''expert_judgment'')),
         add column if not exists source_ref text,
         add column if not exists source_date date',
      t
    );
  end loop;
end $$;

-- ── mr_region_hazards reconciliation ───────────────────────────────────────
-- These rows already carried source_note = 'AR6 WGI starter'. Populate source_ref with the full,
-- honest origin of that label so the citation stands on its own (the intensities are seeded starter
-- values from §4.4, NOT yet transcribed from AR6 WGI Ch12). Provenance stays 'starter' — this is a
-- citation, not a promotion of the values' firmness.
-- Keyed on provenance = 'starter': the do-block above has just defaulted every row to 'starter', so
-- this targets exactly those (all rows) and sets their source_ref.
update public.mr_region_hazards
set source_ref = 'Seeded from ThemisIQ methodology doc §4.4; labelled "AR6 WGI starter". Pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct baseline.'
where provenance = 'starter';
