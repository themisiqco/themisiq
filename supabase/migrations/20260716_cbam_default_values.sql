-- 20260716_cbam_default_values.sql
-- CBAM default SEE lookup — IR 2025/2621 Annex I ("Default values for goods, except electricity").
-- One row per (cn_code, country). Route is a trailing benchmark attribute, NOT a key.
-- Three escalating marked-up values (10/20/30%) per row; mark-up applies to TOTAL, not direct.
-- see_total transcribed verbatim (source rounding means total may not equal direct+indirect).
-- description nullable: seeded NULL for steel; authoritative labels sourced later from CN nomenclature by cn_code, not from the 2621 PDF extract.
-- Lookup data, not logic. World-readable, no RLS. Seed data lands in a later migration after verification.
-- Idempotent: create if not exists — safe to re-run; never drops or recreates, so a re-run after the
-- seed lands cannot destroy seeded rows.
-- TRIPWIRE: the (cn_code, country) primary key is STEEL-SCOPED. It is correct only while no CN code
-- repeats within a country. Extending this table to cement breaks it — 2523 10 00 and 2523 90 00 each
-- appear twice per country (white vs grey clinker), distinguished in the source only by description.
-- Widening the scope requires a dedicated product_variant column ('white'/'grey') added to the key as
-- (cn_code, country, product_variant) IN THE SAME PASS, or the seed collides. NOT description: it is
-- nullable and deferred, and Postgres forbids NULL in a PK column, so a description-keyed PK would
-- reject the NULL-description steel rows.

create table if not exists public.cbam_default_values (
  cn_code          text not null,
  country          text not null,
  description      text,
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
