-- 20260716_cbam_reference.sql
-- CBAM exporter-side SEE module — reference data (iron & steel).
-- Four world-readable reference tables + steel-tree seed. No RLS (published law, like mr_*).
-- No `active` column (deliberate — dormant-column trap, cf. mr_jurisdictions).
-- All CN codes and category assignments transcribed verbatim from IR 2025/2547 Annex I Table 1.

create table public.cbam_goods_categories (
  code text primary key,
  label text not null,
  greenhouse_gases text[] not null default '{CO2}',
  annex_ii_direct_only boolean not null,
  functional_unit text not null,
  provenance text not null default 'starter',
  source_ref text
);

create table public.cbam_cn_map (
  cn_prefix text primary key,          -- digits only, no spaces; engine matches by longest prefix
  category_code text not null references public.cbam_goods_categories(code),
  description text
);

create table public.cbam_precursor_edges (
  category_code text not null references public.cbam_goods_categories(code),
  precursor_category_code text not null references public.cbam_goods_categories(code),
  primary key (category_code, precursor_category_code)
);

create table public.cbam_production_routes (
  category_code text not null references public.cbam_goods_categories(code),
  route_code text not null,
  boundary_note text,
  primary key (category_code, route_code)
);

-- Categories (6) — all steel: CO2-only, Annex II direct-only, functional unit = tonne
insert into public.cbam_goods_categories
  (code, label, greenhouse_gases, annex_ii_direct_only, functional_unit, provenance, source_ref) values
  ('sintered_ore',        'Sintered Ore',           '{CO2}', true, 'tonne', 'primary_source', 'IR 2025/2547 Annex I Table 1'),
  ('pig_iron',            'Pig Iron',               '{CO2}', true, 'tonne', 'primary_source', 'IR 2025/2547 Annex I Table 1'),
  ('dri',                 'DRI',                    '{CO2}', true, 'tonne', 'primary_source', 'IR 2025/2547 Annex I Table 1'),
  ('ferroalloy',          'FeMn/FeCr/FeNi',         '{CO2}', true, 'tonne', 'primary_source', 'IR 2025/2547 Annex I Table 1'),
  ('crude_steel',         'Crude steel',            '{CO2}', true, 'tonne', 'primary_source', 'IR 2025/2547 Annex I Table 1'),
  ('iron_steel_products', 'Iron or steel products', '{CO2}', true, 'tonne', 'primary_source', 'IR 2025/2547 Annex I Table 1');

-- CN map (44) — prefixes digits-only. CN codes verbatim from Annex I.
insert into public.cbam_cn_map (cn_prefix, category_code) values
  ('26011200', 'sintered_ore'),
  ('7201', 'pig_iron'),
  ('7203', 'dri'),
  ('72021', 'ferroalloy'), ('72024', 'ferroalloy'), ('72026', 'ferroalloy'),
  ('7206', 'crude_steel'), ('7207', 'crude_steel'),
  ('7218', 'crude_steel'),   -- crude_steel, NOT products: inside 7208-7229 span but deliberately excluded
  ('7224', 'crude_steel'),   -- crude_steel, NOT products
  ('7205', 'iron_steel_products'),  -- 7205 dual-listed; pig-iron-granule exception is operator-resolved
  ('7208', 'iron_steel_products'), ('7209', 'iron_steel_products'), ('7210', 'iron_steel_products'),
  ('7211', 'iron_steel_products'), ('7212', 'iron_steel_products'), ('7213', 'iron_steel_products'),
  ('7214', 'iron_steel_products'), ('7215', 'iron_steel_products'), ('7216', 'iron_steel_products'),
  ('7217', 'iron_steel_products'), ('7219', 'iron_steel_products'), ('7220', 'iron_steel_products'),
  ('7221', 'iron_steel_products'), ('7222', 'iron_steel_products'), ('7223', 'iron_steel_products'),
  ('7225', 'iron_steel_products'), ('7226', 'iron_steel_products'), ('7227', 'iron_steel_products'),
  ('7228', 'iron_steel_products'), ('7229', 'iron_steel_products'), ('7301', 'iron_steel_products'),
  ('7302', 'iron_steel_products'), ('7303', 'iron_steel_products'), ('7304', 'iron_steel_products'),
  ('7305', 'iron_steel_products'), ('7306', 'iron_steel_products'), ('7307', 'iron_steel_products'),
  ('7308', 'iron_steel_products'), ('7309', 'iron_steel_products'), ('7310', 'iron_steel_products'),
  ('7311', 'iron_steel_products'), ('7318', 'iron_steel_products'), ('7326', 'iron_steel_products');

-- Precursor edges (7) — the steel tree
insert into public.cbam_precursor_edges (category_code, precursor_category_code) values
  ('pig_iron', 'sintered_ore'),
  ('dri', 'sintered_ore'),
  ('ferroalloy', 'sintered_ore'),
  ('crude_steel', 'pig_iron'),
  ('crude_steel', 'dri'),
  ('crude_steel', 'ferroalloy'),
  ('iron_steel_products', 'crude_steel');

-- Production routes (6)
insert into public.cbam_production_routes (category_code, route_code) values
  ('pig_iron', 'blast_furnace'),
  ('pig_iron', 'smelting_reduction'),
  ('dri', 'direct_reduction'),
  ('ferroalloy', 'submerged_arc'),
  ('crude_steel', 'bof'),
  ('crude_steel', 'eaf');
