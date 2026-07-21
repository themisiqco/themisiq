-- 20260719_cbam_charge_mix_scrap_split.sql
-- Splits cbam_charge_mix.material_type's flat 'scrap' value into 'scrap_pre_consumer' and
-- 'scrap_post_consumer'.
--
-- WHY: Annex IV §2 requires, for crude steel and iron/steel products, "% of scrap that is
-- pre-consumer scrap" (see docs/cbam-annex-iv-2-verbatim.md). A single 'scrap' value cannot express
-- that split. Splitting the enum:
--   * keeps the answer MASS-BASED, like every other charge-mix row — pre- and post-consumer scrap
--     are recorded as masses, not as a separately-entered percentage;
--   * makes the §2 percentage DERIVABLE — pre / (pre + post) — rather than stored alongside the
--     masses, so there is no two-sources-of-truth risk between a typed percentage and the masses;
--   * PRE-SEPARATES the pre-consumer mass now, in case the pre-consumer-scrap precursor proposal
--     (spec §11.11) is adopted and pre-consumer scrap becomes a precursor in its own right.
--
-- §2 attaches NO "if known" qualifier to this parameter. An operator who cannot classify their scrap
-- as pre- vs post-consumer therefore cannot satisfy §2. Forcing the split at ENTRY (there is no
-- generic 'scrap' bucket to fall back into) makes that failure VISIBLE — an unclassifiable total
-- cannot pass silently as a flat 'scrap' figure that looks complete but is not.
--
-- CONSEQUENCE: the §2 scrap ratio, "tonnes scrap used for producing 1 t crude steel", is now
-- (pre + post) / activity_level — summing BOTH scrap types. Any consumer computing that ratio must
-- add the two rows; neither alone is "the scrap mass".
--
-- This MODIFIES previously-seeded schema (the CHECK from 20260718_cbam_charge_mix.sql). It is safe
-- only because cbam_charge_mix is empty — no existing row carries the retired 'scrap' value, so the
-- new CHECK cannot reject stored data. If this is ever replayed against a populated table, any row
-- with material_type = 'scrap' would make the ADD CONSTRAINT fail until it is reclassified.
-- The drop uses IF EXISTS so the drop-then-add pair is idempotent on re-run.
--
-- No claim is made here about deployment state.

alter table public.cbam_charge_mix
  drop constraint if exists cbam_charge_mix_material_type_check;

alter table public.cbam_charge_mix
  add constraint cbam_charge_mix_material_type_check
  check (material_type in (
    'scrap_pre_consumer','scrap_post_consumer','dri','pig_iron_bf',
    'pig_iron_smelting_reduction','hot_metal','ferroalloy','other_metallic'));
