-- 20260717_cbam_process_electricity.sql
-- Electricity consumed by the production process (MWh), for the indirect SEE calculation:
-- own_indirect = (electricity_consumed × grid_factor) / activity_level  [IR 2025/2547 Eq 44/56/58]
-- NULLABLE by design: only goods NOT in Annex II price their own indirect (e.g. sintered ore).
-- Annex II goods (ch.72 steel) suppress own-indirect, so the field is absent/irrelevant for them.
-- Absent electricity => own_indirect = 0 (the engine treats null as "no own indirect"), NOT an error.
-- CHECK allows null but forbids negative (unlike source_streams.activity_data, where negatives are
-- the deliberate output sign convention — different semantics).
alter table public.cbam_production_processes
  add column if not exists electricity_consumed numeric
    check (electricity_consumed is null or electricity_consumed >= 0);
