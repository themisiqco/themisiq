-- 20260915_portal_supplier_sector.sql
--
-- ⚠️ RUN. public.campaign_suppliers now carries all four columns.
--
-- VERIFIED THIS SESSION: the four columns are present and nullable, and all six constraints are
-- installed. The tier-coherence constraint was proven live rather than assumed:
-- campaign_suppliers_sector_tier_coherent REJECTED a row with a NULL sector_tier carrying
-- industry_code 'i01.a', raising SQLSTATE 23514. That is the specific hole the CASE form was
-- written to close - a four-way OR would have evaluated to NULL there and PASSED - so the check
-- that matters is the one that fired.
--
-- ⚠️ RE-RUNNING IS INERT. Every column is ADD COLUMN IF NOT EXISTS and every constraint sits behind
-- a pg_constraint guard, so a second run finds all ten things present and does nothing. Nothing
-- here inserts, updates or deletes a row, so the twelve existing campaign_suppliers rows are
-- untouched by a re-run exactly as they were by the first.
--
-- WHAT IT DOES: adds four nullable columns to public.campaign_suppliers so a buyer can record
-- WHAT a supplier makes, at whichever level of precision they actually know. Today the supplier
-- portal captures no sector at all — no questionnaire template asks for one and the table has no
-- column for one — which is why app/api/campaigns/[id]/scope3-cat1/route.ts hardcodes
-- EMISSION_FACTORS.spend['Other'] for every spend-based line it computes. This migration adds the
-- storage. It does NOT change that route, the questionnaire templates, the portal RPCs or any
-- application code; on its own it changes no behaviour and no figure.
--
-- WHAT IT DELIBERATELY DOES NOT DO:
--   · No backfill. No DEFAULT. No UPDATE. The twelve existing campaign_suppliers rows keep NULL
--     in all four columns, and NULL is a meaningful value here — see the column comments.
--   · Nothing destructive. No TRUNCATE, no DROP, no DELETE, no ALTER ... DROP. Unlike
--     20260914_exiobase_sectors.sql, which truncated pre-launch rows because it was making
--     columns NOT NULL, this file only ever adds nullable things, so it is safe to run against a
--     database holding real customer rows.
--   · No GRANT block. Grants attach to the table, not the column, and public.campaign_suppliers
--     already carries its own from 20260618/20260619. A new TABLE would need one; new COLUMNS on
--     an existing table do not.
--   · No change to RLS. Existing policies on campaign_suppliers are row-level and cover these
--     columns as they stand. Note that public.portal_get whitelists the columns it returns
--     (20260815_portal_get_whitelist.sql), so these four are NOT exposed to the unauthenticated
--     supplier portal by adding them here — that would be a separate, deliberate edit.
--
-- IDEMPOTENT. Every column uses ADD COLUMN IF NOT EXISTS; every constraint is guarded on
-- pg_constraint, because Postgres has no ADD CONSTRAINT IF NOT EXISTS. Re-running changes nothing.
--
-- FK TARGETS — VERIFIED AGAINST THE DDL IN 20260914_exiobase_sectors.sql, NOT GUESSED:
--   · public.exiobase_sectors.exio_code  — text PRIMARY KEY, single-column, so a valid FK target.
--   · public.sector_display_groups.heading — text NOT NULL UNIQUE, so a valid FK target. It is
--     already the target of exiobase_sectors.display_group, so this repeats an established shape.
--   The newest schema dump (db/dumps/schema_public_20260914_0856.sql, 08:56) was taken BEFORE that
--   migration was run at 16:47 the same day and contains neither table, so it could not be used to
--   confirm the live shape. See the report accompanying this file.
--
-- ONE CONSTRAINT HERE WAS NOT ASKED FOR, AND IS EASY TO DELETE IF UNWANTED:
--   campaign_suppliers_industry_code_is_industry. exiobase_sectors holds 363 rows — 163 industries
--   ('i…') AND 200 products ('p…') — under one primary key, so a bare FK on exio_code would let a
--   PRODUCT code sit in a column named industry_code and satisfy every other constraint in this
--   file. The prefix check is the same device exiobase_sectors_code_matches_type uses inside that
--   table to keep its single-column key honest. Drop the one guarded block if you would rather the
--   FK stayed exactly as specified.

begin;

-- ═══ 1. COLUMNS ══════════════════════════════════════════════════════════════════════════════

alter table public.campaign_suppliers add column if not exists sector_tier   text;
alter table public.campaign_suppliers add column if not exists industry_code text;
alter table public.campaign_suppliers add column if not exists display_group text;
alter table public.campaign_suppliers add column if not exists country_iso2  char(2);


-- ═══ 2. CONSTRAINTS ══════════════════════════════════════════════════════════════════════════
--
-- Each block is guarded rather than plain, so this file can be re-run after a partial apply.

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaign_suppliers_sector_tier_valid'
       and conrelid = 'public.campaign_suppliers'::regclass
  ) then
    alter table public.campaign_suppliers
      add constraint campaign_suppliers_sector_tier_valid
      check (sector_tier is null or sector_tier in ('industry', 'group', 'region'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaign_suppliers_industry_code_fkey'
       and conrelid = 'public.campaign_suppliers'::regclass
  ) then
    alter table public.campaign_suppliers
      add constraint campaign_suppliers_industry_code_fkey
      foreign key (industry_code) references public.exiobase_sectors (exio_code);
  end if;
end $$;

-- Not specified; see the header. An 'i' prefix is what makes the FK mean "one of the 163
-- industries" rather than "one of the 363 industries-and-products".
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaign_suppliers_industry_code_is_industry'
       and conrelid = 'public.campaign_suppliers'::regclass
  ) then
    alter table public.campaign_suppliers
      add constraint campaign_suppliers_industry_code_is_industry
      check (industry_code is null or industry_code like 'i%');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaign_suppliers_display_group_fkey'
       and conrelid = 'public.campaign_suppliers'::regclass
  ) then
    alter table public.campaign_suppliers
      add constraint campaign_suppliers_display_group_fkey
      foreign key (display_group) references public.sector_display_groups (heading);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaign_suppliers_country_iso2_format'
       and conrelid = 'public.campaign_suppliers'::regclass
  ) then
    alter table public.campaign_suppliers
      add constraint campaign_suppliers_country_iso2_format
      check (country_iso2 is null or country_iso2 ~ '^[A-Z]{2}$');
  end if;
end $$;

-- ── TIER COHERENCE ───────────────────────────────────────────────────────────────────────────
--
-- WRITTEN AS A CASE, AND THAT IS NOT A STYLE CHOICE. A CHECK constraint passes when it evaluates
-- to NULL, not only when it evaluates to true. The obvious four-way OR of `sector_tier = '…' and
-- …` returns NULL — and therefore PASSES — for a row with sector_tier NULL and industry_code set,
-- which is precisely the incoherent row this constraint exists to reject. CASE routes a NULL
-- sector_tier to the ELSE arm (NULL = 'industry' is not true, so it is not a match) and every arm
-- returns a plain boolean, so the constraint is never NULL and the NULL tier is genuinely enforced.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaign_suppliers_sector_tier_coherent'
       and conrelid = 'public.campaign_suppliers'::regclass
  ) then
    alter table public.campaign_suppliers
      add constraint campaign_suppliers_sector_tier_coherent
      check (
        case sector_tier
          when 'industry' then industry_code is not null and display_group is null
          when 'group'    then display_group is not null and industry_code is null
          when 'region'   then industry_code is null     and display_group is null
          else                 industry_code is null     and display_group is null
        end
      );
  end if;
end $$;


-- ═══ 3. COMMENTS ═════════════════════════════════════════════════════════════════════════════

comment on column public.campaign_suppliers.sector_tier is
  'How precisely this supplier''s activity is known, and therefore which of the columns beside it '
  'is filled in: ''industry'' means a specific EXIOBASE industry is recorded in industry_code; '
  '''group'' means only the broad heading is known, recorded in display_group; ''region'' means '
  'neither is known and only the country is. NULL means nobody has said anything about this '
  'supplier''s sector at all. NULL, and ''region'', both resolve to a regional average when a '
  'figure is estimated — a country-level factor rather than a sector-specific one.';

comment on column public.campaign_suppliers.industry_code is
  'The one EXIOBASE industry this supplier''s output belongs to, as an ixi code such as ''i01.a'' '
  '(Cultivation of paddy rice). Foreign key to exiobase_sectors.exio_code, restricted to industry '
  'codes. Set only when sector_tier is ''industry''. NULL means no specific industry is recorded, '
  'and an estimate falls back to a regional average.';

comment on column public.campaign_suppliers.display_group is
  'The broad heading this supplier sits under when the exact industry is not known — one of the '
  'twenty ThemisIQ dropdown headings, such as ''Mining & quarrying''. Foreign key to '
  'sector_display_groups.heading. PRESENTATION HEADINGS, not a published classification: they are '
  'ours, not EXIOBASE''s, ISIC''s or NACE''s. Set only when sector_tier is ''group''. NULL means no '
  'group is recorded, and an estimate falls back to a regional average.';

comment on column public.campaign_suppliers.country_iso2 is
  'Where this supplier operates, as a two-letter uppercase ISO 3166-1 alpha-2 code such as ''DE'' '
  'or ''VN''. Independent of sector_tier: a supplier can have a country and no sector, or both. '
  'NULL means the country was never recorded, which leaves a regional average with no region to '
  'resolve to — such a supplier can only be estimated from a global default or not at all.';

commit;

-- ── AFTER RUNNING, VERIFY (read-only, safe to paste) ─────────────────────────────────────────
--
--   -- the four columns exist, all nullable, no defaults:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'campaign_suppliers'
--      and column_name in ('sector_tier','industry_code','display_group','country_iso2')
--    order by column_name;
--
--   -- the twelve existing rows are untouched:
--   select count(*) as total,
--          count(sector_tier)   as with_tier,
--          count(industry_code) as with_industry,
--          count(display_group) as with_group,
--          count(country_iso2)  as with_country
--     from public.campaign_suppliers;   -- expect 12, 0, 0, 0, 0
--
--   -- the six constraints are present:
--   select conname from pg_constraint
--    where conrelid = 'public.campaign_suppliers'::regclass
--      and conname like 'campaign_suppliers_%'
--    order by conname;
--
--   -- the NULL-tier hole is actually closed (both must ERROR, not insert):
--   --   update public.campaign_suppliers set industry_code = 'i01.a' where false;  -- no-op, fine
--   -- Test on a scratch row only; do not run these against a real row.
