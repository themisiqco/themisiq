-- Drop the 8-digit-spaced CN format CHECK on cbam_production_processes.
-- The format rule was a steel-era assumption that wrongly rejected
-- legitimately-seeded 4/6-digit CN codes (aluminium 7601/7603, steel
-- 7201/7203/7202 11). CN validity is now enforced by seed-membership in the
-- setup form (accept iff the code exists in cbam_default_values), which
-- matches the engine's resolver exactly. See spec §10.2/§10.7.
alter table public.cbam_production_processes
  drop constraint if exists cbam_pp_cn_code_8digit_spaced;
