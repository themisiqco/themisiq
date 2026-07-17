-- 20260717_cbam_process_cn_code.sql
-- Adds cn_code (the specific good produced, e.g. '7208') to cbam_production_processes.
-- category_code drives system-boundary/precursor rules; cn_code is the specific product
-- for default comparison and the see_record. No FK to cbam_cn_map (prefix-based; a specific
-- code may be longer than its matching prefix — app-layer prefix match).
alter table public.cbam_production_processes
  add column if not exists cn_code text not null;
