-- 20260716_cbam_default_values.sql
-- CBAM default SEE lookup — IR 2025/2621 Annex I ("Default values for goods, except electricity").
-- One row per (cn_code, country). Route is a trailing benchmark attribute, NOT a key.
-- Three escalating marked-up values (10/20/30%) per row; mark-up applies to TOTAL, not direct.
-- see_total transcribed verbatim (source rounding means total may not equal direct+indirect).
-- Lookup data, not logic. World-readable, no RLS. Seed data lands in a later migration after verification.
-- Idempotent: create if not exists — safe to re-run; never drops or recreates, so a re-run after the
-- seed lands cannot destroy seeded rows.
-- TRIPWIRE: the (cn_code, country) primary key is STEEL-SCOPED. It is correct only while no CN code
-- repeats within a country. Extending this table to cement breaks it — 2523 10 00 and 2523 90 00 each
-- appear twice per country (white vs grey clinker), separated only by description. Widening the scope
-- requires widening the key to (cn_code, country, description) IN THE SAME PASS, or the seed collides.

create table if not exists public.cbam_default_values (
  cn_code          text not null,
  country          text not null,
  description      text not null,
  see_direct       numeric not null,
  see_indirect     numeric,
  see_total        numeric not null,
  markup_2026      numeric not null,
  markup_2027      numeric not null,
  markup_2028_plus numeric not null,
  cbam_bm_route    text,
  source_ref       text not null,
  primary key (cn_code, country)
);
