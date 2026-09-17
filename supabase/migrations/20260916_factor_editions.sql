-- 20260916_factor_editions.sql
--
-- ⚠️ RUN. This file HAS been executed, so the two tables exist and the seed row is live.
--
-- ⚠️⚠️ AND THE FILE HAS BEEN EDITED SINCE IT RAN, SO IT NO LONGER DESCRIBES THE DATABASE.
-- The edition id and the price-index fingerprint below were both changed after the run, because
-- the upstream FX series were renormalised (see the redenomination note further down). The live
-- row still carries the OLD id 'exiobase-3.8.2-2019-cpi2024' and the OLD fingerprint
-- 'a1ccb9c1...7d8308' until someone runs the UPDATE that reconciles them.
--
-- ⚠️ DO NOT RE-RUN THIS FILE TO RECONCILE IT. The seed is `on conflict (id) do nothing` and the id
-- has CHANGED, so a re-run would not update the existing row - it would INSERT A SECOND EDITION
-- alongside it, and the two would differ only in a fingerprint nobody reads by eye. Reconcile with
-- a single UPDATE against the old id. The statement is in the report accompanying this edit; it
-- touches id, fingerprint_price_indices and notes, and nothing else.
--
-- WHAT IT DOES: creates two tables and seeds ONE row.
--   public.factor_editions              - names a self-consistent set of reference files by their
--                                         fingerprints, so a stored figure can say which edition
--                                         priced it. Seeded with one row, is_active = false.
--   public.region_currency_multipliers  - the per-region, per-currency multiplier an edition
--                                         implies. Created EMPTY. See the gap note below.
-- It touches no existing table. Nothing is backfilled, altered, read or deleted.
--
-- ═══ THE SEEDED TABLE IS EMPTY ON PURPOSE, AND THAT IS THE MOST IMPORTANT LINE IN THIS FILE ═══
--
-- region_currency_multipliers SHOULD HOLD 245 ROWS: 49 EXIOBASE regions x 5 currencies
-- (USD, EUR, GBP, CAD, AUD - the set app/dashboard/scope3/page.tsx offers and DEAL_CURRENCIES in
-- lib/deals/assessment.ts defines). THIS MIGRATION SEEDS NONE OF THEM.
--
-- ⚠️⚠️ THIS TABLE IS SUPERSEDED AND WILL BE DROPPED. DO NOT LOAD IT.
-- An artefact was built for it and then found to hold the RECIPROCAL of what an emission factor
-- needs - the scalar that carries an amount of money forward from 2019, applied to a factor whose
-- money sits in the DENOMINATOR - so every figure came out too large by cpi_ratio squared. That
-- artefact and its generator have been DELETED rather than kept, so nothing can be regenerated
-- from them by mistake, and the migration that would have loaded them was deleted unrun.
--
-- The replacement is public.region_spend_conversions, created and loaded by
-- 20260916_rename_spend_conversions.sql, which also DROPS region_currency_multipliers. Its column
-- to_eur2019_per_unit holds the corrected scalar, from:
--
--     lib/emissionFactors/spendConversions.json
--     sha256 041db80fc43f635124004efbf472b0ad824c9d638fcf1e11cb6e5f0f1de24bc1
--     produced by scripts/generate-spend-conversions.py from lib/emissionFactors/priceIndices.json
--
-- ⚠️ SO region_currency_multipliers SHOULD BE EMPTY, AND EMPTY IS NOW THE CORRECT STATE rather
-- than an unfinished one. The 245-row expectation below belongs to the replacement table, under
-- edition 'exiobase-3.8.2-2019-cpi2024-spendconv'. If this table is NOT empty, something loaded
-- the withdrawn values - look before dropping:
--
--     select edition_id, count(*) from public.region_currency_multipliers group by edition_id;
--
-- The record of the superseded edition is its row in public.factor_editions, id
-- 'exiobase-3.8.2-2019-cpi2024-fxnorm', retained with is_active false and notes describing the
-- error. The record is that row - not a retained artefact, and not this table.
--
-- ═══ WHAT THIS FILE DOES NOT DO ═══════════════════════════════════════════════════════════════
--   * No destructive statement. No TRUNCATE, no DROP, no DELETE, no ALTER ... DROP. Safe against a
--     database holding real customer rows.
--   * No backfill of any other table.
--   * NO FOREIGN KEY FROM region_currency_multipliers.region_code TO ANYTHING, AND THERE IS
--     NOTHING TO POINT IT AT. public.exiobase_sectors is keyed on exio_code - an INDUSTRY or
--     PRODUCT code such as 'i01.a' - not on a region. No region table exists in this database at
--     all: the 49 region codes live in lib/emissionFactors/exiobaseFactors2019ixi.json and in the
--     region_code column of public.country_regions, neither of which is a keyable parent. Creating
--     a region table purely to hang an FK on would be inventing a new source of truth for a list
--     that already has one; the constraint is therefore absent by decision, not by oversight.
--   * No activation. is_active = false on the seeded row, and the partial unique index below means
--     activating it is a deliberate, single-row UPDATE someone has to write.
--
-- STRUCTURALLY IDEMPOTENT: CREATE TABLE IF NOT EXISTS, guarded policy blocks, CREATE INDEX IF NOT
-- EXISTS. Re-running creates nothing twice.
-- ⚠️ THE SEED IS NO LONGER IDEMPOTENT AGAINST THE LIVE DATABASE, because the id below was changed
-- after the run. `on conflict (id) do nothing` keys on the id, so the new id conflicts with nothing
-- and a re-run INSERTS A SECOND EDITION rather than leaving one row alone. See the warning at the
-- top of this file.
--
-- ⚠️ ON CONFLICT (id) DO NOTHING MEANS THIS FILE CANNOT CORRECT THE SEEDED ROW. Intentional for a
-- first seed, but it also means that if a fingerprint here is wrong, re-running will NOT fix it.
-- Correcting one is a new migration that says what changed and why - which is the point of an
-- edition: the fingerprints are the identity, so a changed fingerprint is a DIFFERENT edition with
-- a different id, never an edit to this one.
--
-- ═══ FINGERPRINTS AND LICENCES — READ FROM THE FILES, NOT COPIED FROM ANOTHER MIGRATION ═══════
--
-- All five digests below were recomputed from the files on 16 Sep 2026 and matched their pins.
-- THREE OF THE FIVE FILES CARRY NO FINGERPRINT IN THEIR OWN METADATA - the factor files and the
-- sector file pin theirs in their .test.ts instead (ROWS_SHA256), and the sector one is also seeded
-- in reference_data_fingerprints by 20260914. Only countryRegions.json and priceIndices.json carry
-- metadata.fingerprint_sha256. The digests are therefore not all read from the same place, and the
-- canonicalisation differs by file: the factor files hash a pipe-joined text rendering with the
-- value as a 12-digit exponential (NOT JSON - Python writes a float zero as '0.0' and JavaScript as
-- '0', and those files hold 1,108 and 1,662 zeros respectively), while the other three hash
-- sorted, compact JSON of the rows with metadata excluded.
--
-- THE PRICE-INDEX LICENCE SPANS TWO PUBLISHERS, WHICH IS WHY ITS STRING IS LONGER THAN THE OTHERS.
-- priceIndices.json draws 211 of 212 countries from the World Bank and Taiwan from DGBAS, under
-- different terms, so licence_price_indices names both rather than picking one. The full text of
-- each - including the DGBAS exclusions, which are the part most easily overlooked - lives in that
-- file's metadata.sources and is not duplicated here.
--
-- SOURCES OF THE THREE LICENCE STRINGS:
--   licence_factors       exiobaseFactors2019ixi.json + ...pxp.json, metadata.licence, both 'CC BY-SA 4.0'
--                         (exiobaseSectors.json records the same string)
--   licence_concordance   countryRegions.json, metadata.licence
--   licence_price_indices priceIndices.json, metadata.licence and metadata.sources[*].licence
--
-- ⚠️ CC BY-SA 4.0 ON THE FACTORS IS NOT BOOKKEEPING. ShareAlike attaches obligations to anything
-- published that adapts it, and BY requires attribution wherever a derived figure is shown. The
-- concordance is CC BY 4.0 - attribution, no ShareAlike. The two are different obligations on
-- material that ends up in the same figure; keep them in separate columns, which is why they are.

begin;

-- ═══ 1. FACTOR EDITIONS ══════════════════════════════════════════════════════════════════════

create table if not exists public.factor_editions (
  id                          text        primary key,
  factor_source               text        not null,
  factor_data_year            integer     not null,
  price_vintage_year          integer     not null,
  fingerprint_factors_ixi     text        not null,
  fingerprint_factors_pxp     text        not null,
  fingerprint_sectors         text        not null,
  fingerprint_country_regions text        not null,
  fingerprint_price_indices   text        not null,
  licence_factors             text        not null,
  licence_concordance         text        not null,
  licence_price_indices       text        not null,
  notes                       text,
  is_active                   boolean     not null default false,
  created_at                  timestamptz not null default now(),

  -- Added after this file first ran. See the ADDED COLUMNS block below for why they are also
  -- emitted as guarded ALTERs, and the accompanying report for the statements that bring an
  -- already-created table into line.
  fingerprint_spend_conversions text,
  superseded_by                 text
    references public.factor_editions (id) on update cascade,
  constraint factor_editions_not_self_superseding check (superseded_by is null or superseded_by <> id)
);

-- ═══ ADDED COLUMNS ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ EMITTED TWICE ON PURPOSE: in the CREATE above, so a database built from scratch gets them,
-- and as guarded ALTERs here, so a database that already ran the CREATE gets them too. Without the
-- second form the COMMENT ON statements below would ERROR on an existing table, because the
-- columns they describe would not exist there.
-- ⚠️ THIS DOES NOT MAKE RE-RUNNING THIS FILE SAFE. The seed further down still inserts a second
-- edition row under a changed id - see the warning at the top. To bring the LIVE table into line,
-- run the standalone ALTER block from the accompanying report, not this file.
alter table public.factor_editions
  add column if not exists fingerprint_spend_conversions text;
alter table public.factor_editions
  add column if not exists superseded_by text;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'factor_editions_superseded_by_fkey'
                   and conrelid = 'public.factor_editions'::regclass) then
    alter table public.factor_editions
      add constraint factor_editions_superseded_by_fkey
      foreign key (superseded_by) references public.factor_editions (id) on update cascade;
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'factor_editions_not_self_superseding'
                   and conrelid = 'public.factor_editions'::regclass) then
    alter table public.factor_editions
      add constraint factor_editions_not_self_superseding
      check (superseded_by is null or superseded_by <> id);
  end if;
end $$;

comment on column public.factor_editions.fingerprint_spend_conversions is
  'sha256 of the DERIVED scalars artefact, lib/emissionFactors/spendConversions.json. '
  '⚠️ THIS IS NOT ONE OF THE FIVE INPUT FINGERPRINTS AND IT IS THE ONLY PLACE A DOWNSTREAM '
  'ARITHMETIC CORRECTION IS VISIBLE. The other five identify the published artefacts an edition '
  'reads FROM - factors, sectors, concordance, price indices. This one identifies what was COMPUTED '
  'from them. Those are different failure surfaces: an edition can carry five unchanged input '
  'digests and still produce different numbers, because the fault was in the derivation rather than '
  'in the data. That is exactly what happened between the -fxnorm and -spendconv editions, whose '
  'five input fingerprints are identical to one another and whose scalars are reciprocals. Without '
  'this column those two rows are distinguishable only by their id and their notes. '
  'NULLABLE, because the two earlier editions have no valid value: the artefact one of them '
  'described held inverted scalars and has been deleted, and the other predates the artefact '
  'entirely. NULL here means "no derived artefact is validly identified for this edition", never '
  '"not applicable" and never "unchanged from the previous edition".';

comment on column public.factor_editions.superseded_by is
  'The edition that replaces this one, or NULL if this edition is current. Self-referencing foreign '
  'key with ON UPDATE CASCADE, so renaming an edition carries the pointers to it. '
  '⚠️ A SUPERSEDED EDITION MUST NEVER PRICE A FIGURE. Once this column is non-null the row is a '
  'RECORD ONLY: it exists so that the history of what was computed, and when it was corrected, '
  'survives - and so that a figure stored under it long ago can still be traced. It is not a '
  'fallback, not a legacy option and not something to read from when the current edition lacks a '
  'row. A calculation that finds superseded_by non-null on the edition it was about to use must '
  'stop, not continue. '
  'Superseding is also why a wrong edition is never edited in place: correcting a row would destroy '
  'the record this column exists to keep. The chain is append-only - each edition points forward to '
  'its replacement, and the current edition is the one with NULL here.';


comment on table public.factor_editions is
  'A named, self-consistent set of the reference files that price a spend-based figure. An edition '
  'is identified BY ITS FINGERPRINTS: if any of the five files changes, that is a new edition with '
  'a new id, never an edit to an existing row. The point is that a figure stored months ago can say '
  'which files produced it, and a verifier can check those files still hash to the same values. '
  'This table holds no factors and no multipliers - only the identity of the inputs.';

comment on column public.factor_editions.id is
  'Human-readable slug naming the edition, e.g. ''exiobase-3.8.2-2019-cpi2024'': the factor source, '
  'the year the factors describe, and the price vintage they are paired with. Chosen by a person so '
  'it can be quoted in a report; the fingerprints below are what actually establish identity.';

comment on column public.factor_editions.factor_source is
  'The published dataset the emission factors come from, in the publisher''s own naming, e.g. '
  '''EXIOBASE 3.8.2''. Note the publisher is inconsistent about this string: the archive''s own '
  'metadata.json reads "v3.81" while its folder is exio382_ntnu and the Zenodo record says 3.8.2. '
  'The Zenodo label is used. The discrepancy is the publisher''s and is reported, not resolved.';

comment on column public.factor_editions.factor_data_year is
  'The year the emission factors DESCRIBE - the EXIOBASE IOT year, 2019. Not the year the file was '
  'downloaded and not the year a customer is reporting on.';

comment on column public.factor_editions.price_vintage_year is
  'The latest year of price data this edition carries, from priceIndices.json metadata.data_vintage. '
  'It is DERIVED there as the latest year with CPI for at least 80% of the 212 countries, so it '
  'moves when the World Bank publishes, not when we choose. A customer reporting on a later year is '
  'reading factors deflated to this year; see notes.';

comment on column public.factor_editions.fingerprint_factors_ixi is
  'sha256 of lib/emissionFactors/exiobaseFactors2019ixi.json, over the FACTOR ROWS only. The file '
  'carries no fingerprint in its own metadata - the digest is pinned as ROWS_SHA256 in its .test.ts. '
  'Canonical form is a pipe-joined text rendering with the value as a 12-digit exponential, NOT '
  'JSON, because Python and JavaScript render a float zero differently and the file holds 1,108 '
  'zeros.';

comment on column public.factor_editions.fingerprint_factors_pxp is
  'sha256 of lib/emissionFactors/exiobaseFactors2019pxp.json, over the factor rows only. Same '
  'canonicalisation and same absence of a metadata fingerprint as the ixi file; 1,662 zeros here.';

comment on column public.factor_editions.fingerprint_sectors is
  'sha256 of lib/emissionFactors/exiobaseSectors.json, over its groups, industries and products '
  'with metadata excluded. Also seeded in reference_data_fingerprints by 20260914 under the dataset '
  'key ''exiobase_sectors''; the two must agree, and a disagreement means one of them is stale.';

comment on column public.factor_editions.fingerprint_country_regions is
  'sha256 of lib/emissionFactors/countryRegions.json, over its mapping rows with metadata excluded. '
  'This file DOES record the digest itself, at metadata.fingerprint_sha256. Also seeded in '
  'reference_data_fingerprints by 20260915 under ''country_regions''.';

comment on column public.factor_editions.fingerprint_price_indices is
  'sha256 of lib/emissionFactors/priceIndices.json, over its regions with metadata excluded. The '
  'file records it at metadata.fingerprint_sha256. Not yet in reference_data_fingerprints.';

comment on column public.factor_editions.licence_factors is
  'The licence of the emission-factor and sector files, as those files record it. CC BY-SA 4.0: the '
  'ShareAlike term attaches obligations to anything we PUBLISH that adapts the data, and the '
  'attribution term requires crediting EXIOBASE wherever a derived figure is shown. This is an '
  'obligation on our output, not a note about the input.';

comment on column public.factor_editions.licence_concordance is
  'The licence of the country-to-region concordance, as countryRegions.json records it. CC BY 4.0 - '
  'attribution required, no ShareAlike. A DIFFERENT obligation from the factors'' CC BY-SA, on '
  'material that ends up in the same figure, which is why it has its own column.';

comment on column public.factor_editions.licence_price_indices is
  'The licence of the price-index sources, as priceIndices.json records them. TWO PUBLISHERS, TWO '
  'LICENCES: the World Bank series under its Open Data default CC BY 4.0 plus the Bank''s mandatory '
  'dispute-resolution terms, and the Taiwan series under the Open Government Data License, Taiwan '
  '1.0. Both require attribution; neither is share-alike and neither restricts commercial use. The '
  'full text of each, including the DGBAS exclusions - which cover copyright only and grant no '
  'patent, trademark or logo rights, and do not permit representing DGBAS as endorsing a derivative '
  '- is in that file''s metadata.sources rather than duplicated here.';

comment on column public.factor_editions.notes is
  'Free text recording what a reader of a figure priced by this edition needs to know and cannot '
  'work out from the columns - principally the ways the edition is known to be approximate.';

comment on column public.factor_editions.is_active is
  'Whether this edition is the one new calculations should use. At most one row may be true at a '
  'time, enforced by factor_editions_one_active below. A seeded edition starts FALSE: activating it '
  'is a deliberate UPDATE someone writes after checking the fingerprints still match the files.';

comment on column public.factor_editions.created_at is
  'When this row was seeded. Bookkeeping only; nothing reads it. Edition ordering comes from '
  'factor_data_year and price_vintage_year, which are facts about the data rather than about us.';

-- AT MOST ONE ACTIVE EDITION. A partial unique index rather than a CHECK, because the constraint is
-- across rows and not within one. Two active editions would mean two different answers to "what
-- priced this?" with nothing to break the tie.
create unique index if not exists factor_editions_one_active
  on public.factor_editions ((true)) where is_active;

comment on index public.factor_editions_one_active is
  'At most one row with is_active = true. Indexed on the constant (true) and filtered to active '
  'rows, so every active row collides with every other. Inactive rows are unconstrained.';


-- ═══ 2. REGION x CURRENCY MULTIPLIERS ════════════════════════════════════════════════════════

create table if not exists public.region_currency_multipliers (
  edition_id       text    not null references public.factor_editions (id),
  region_code      text    not null,
  currency         char(3) not null check (currency ~ '^[A-Z]{3}$'),
  multiplier       numeric not null check (multiplier > 0),
  basis            text    not null check (basis in ('published', 'row_composite')),
  gdp_coverage_pct numeric,
  primary key (edition_id, region_code, currency)
);

comment on table public.region_currency_multipliers is
  'The multiplier that converts a customer''s spend, in their currency and their reporting year, '
  'onto the basis an edition''s factors are denominated in. '
  '⚠️ EXPECTED TO HOLD 245 ROWS - 49 EXIOBASE regions x 5 currencies (USD, EUR, GBP, CAD, AUD). '
  'IT IS CREATED EMPTY AND 20260916 SEEDS NONE. The values depend on an FX rate convention that has '
  'not been decided (lib/emissionFactors/spendAdjustment.ts declares currency_conversion and '
  'deliberately does not implement it), and seeding a number here would settle that question by '
  'accident. A count of 0 against an expected 245 means NOT LOADED YET, never "no multipliers '
  'apply".';

comment on column public.region_currency_multipliers.edition_id is
  'Which factor_editions row these multipliers belong to. Multipliers are only meaningful beside '
  'the fingerprints that produced them, so they are never stored loose: a new edition means a new '
  'full set of 245, not an update of these.';

comment on column public.region_currency_multipliers.region_code is
  'The EXIOBASE 3 region - one of 49: the 44 individually-resolved countries by their ISO alpha-2 '
  'code, or one of the five rest-of-world buckets WA, WL, WE, WF, WM. '
  '⚠️ NO FOREIGN KEY, AND NO TABLE TO POINT ONE AT. public.exiobase_sectors is keyed on exio_code '
  '(an industry or product code like ''i01.a''), not on a region, and no region table exists in '
  'this database. The authoritative list is the distinct region values in '
  'lib/emissionFactors/exiobaseFactors2019ixi.json. Absent by decision, not oversight. '
  '⚠️ ALSO: WF is a region code here meaning RoW Africa, and separately an ISO 3166-1 country code '
  'meaning Wallis and Futuna in public.country_regions.iso2. Never join those two columns.';

comment on column public.region_currency_multipliers.currency is
  'ISO 4217 of the customer''s spend, uppercase. One of the five the product offers. This is the '
  'currency the multiplier converts FROM; what it converts TO is fixed by the edition''s factors, '
  'which EXIOBASE denominates in EUR.';

comment on column public.region_currency_multipliers.multiplier is
  'The number a spend amount is multiplied by before the emission factor is applied. Strictly '
  'positive - a zero or negative multiplier is a data error, not a very small adjustment, so the '
  'CHECK refuses it rather than letting it price a purchase at nothing. '
  'It is applied to the SPEND and never to the factor: the published factor value stays exactly as '
  'published so a verifier can open EXIOBASE and find the number we used.';

comment on column public.region_currency_multipliers.basis is
  'How this row''s underlying price series was arrived at. ''published'' means the region is one of '
  'the 44 with its own national CPI and FX series. ''row_composite'' means it is one of the five '
  'rest-of-world buckets, where the ratio is a GDP-weighted average across member countries - a '
  'multi-economy average, not a national figure, and it must be described that way wherever it is '
  'shown.';

comment on column public.region_currency_multipliers.gdp_coverage_pct is
  'For a row_composite row: the share of the bucket''s MEASURABLE GDP held by members that actually '
  'had usable price data, as priceIndices.json computes it. NULL for a ''published'' row, where the '
  'concept does not apply - NULL here means "not applicable", never "unknown" or "100". '
  '⚠️ MEASURABLE, NOT TOTAL: members with no GDP figure at all are absent from both sides of that '
  'fraction, so 100.0 can coexist with members missing entirely. Read it beside the bucket''s '
  'members_unmeasured in priceIndices.json.';

create index if not exists region_currency_multipliers_edition_idx
  on public.region_currency_multipliers (edition_id);

grant select on public.factor_editions            to authenticated;
grant select on public.region_currency_multipliers to authenticated;
grant all    on public.factor_editions            to service_role;
grant all    on public.region_currency_multipliers to service_role;

alter table public.factor_editions             enable row level security;
alter table public.region_currency_multipliers  enable row level security;

-- Reference data: a published classification and its derived multipliers, with no customer data in
-- either. Readable by any signed-in user, writable only by service_role.
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'factor_editions'
                   and policyname = 'factor_editions_read') then
    create policy factor_editions_read on public.factor_editions
      for select to authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'region_currency_multipliers'
                   and policyname = 'region_currency_multipliers_read') then
    create policy region_currency_multipliers_read on public.region_currency_multipliers
      for select to authenticated using (true);
  end if;
end $$;


-- ═══ 3. SEED — ONE EDITION, INACTIVE ═════════════════════════════════════════════════════════
--
-- Every digest below was recomputed from the file on 16 Sep 2026 and matched its pin. Do not
-- hand-edit them: a changed file is a new edition row, not an edit to this one.

insert into public.factor_editions (
  id, factor_source, factor_data_year, price_vintage_year,
  fingerprint_factors_ixi, fingerprint_factors_pxp, fingerprint_sectors,
  fingerprint_country_regions, fingerprint_price_indices,
  licence_factors, licence_concordance, licence_price_indices,
  notes, is_active
) values (
  'exiobase-3.8.2-2019-cpi2024-fxnorm',
  'EXIOBASE 3.8.2',
  2019,
  2024,
  '8747704c24bb045e87b3c02bc9b952cb69c37ffd2e5e07c5cb2241320f206fdb',
  '300565c2a4448605e4b3ec0aa044977ba09b9077bfcfff5bc01ec17a9a29ddc6',
  'b393d1ad7d4966cd0ddd7c29379c98b362ab9bed01be7e98afd53226647e3341',
  'e83c3d0388474c36e160572e8db608094d8529e6c3bffaab3444c5229075c9a8',
  '64df489c58c6298c9fe8561289f2185f9bd7f9f1dddda063f16c52c60d23b158',
  'CC BY-SA 4.0',
  'CC BY 4.0 (Creative Commons Attribution 4.0 International)',
  'World Bank WDI (CPI, exchange rate, GDP): CC BY 4.0, the World Bank Open Data default, with the '
  'World Bank''s additional mandatory dispute-resolution terms. DGBAS Taiwan (CPI, exchange rate, '
  'GDP): Open Government Data License, Taiwan, version 1.0. Both require attribution. Neither is '
  'share-alike and neither restricts commercial use. See metadata.sources in '
  'lib/emissionFactors/priceIndices.json for the full text of each, including the DGBAS exclusions.',
  'PRICE VINTAGE LAGS THE REPORTING YEAR BY CONSTRUCTION. This edition''s price data ends at 2024, '
  'because that is the latest year with CPI for at least 80% of the 212 countries in the source. A '
  'customer reporting on 2025 or later is therefore reading factors whose price basis stops short '
  'of their reporting period, and the gap widens until the source publishes and the edition is '
  'rebuilt. The lag is a property of the published data, not an error, but it must be stated beside '
  'any figure this edition prices rather than left for a verifier to discover. '
  'NO BASIC-TO-PURCHASER PRICE CONVERSION IS APPLIED, AND NONE IS POSSIBLE FROM THIS ARCHIVE. '
  'EXIOBASE 3.8.2 publishes in current BASIC prices; a customer''s spend is a PURCHASER-price figure '
  'off an invoice or an AP ledger. The difference is trade margins, transport margins and taxes less '
  'subsidies on products, and those margins are a large share of the delivered price in retail-heavy '
  'and import-heavy sectors. The 3.8.2 archive carries NO trade-margin and NO transport-margin data '
  'of any kind - the only related rows are the tax component - so the conversion cannot be derived '
  'from it at any level of effort. Multiplying an invoice total by a basic-price multiplier prices '
  'the wrong quantity, in a direction and magnitude that vary by sector, and nothing in the '
  'arithmetic reveals it. See PriceBasis in lib/emissionFactors/spend.ts. '
  'Attribution is required by all three licence families in this edition: EXIOBASE 3.8.2 under '
  'CC BY-SA 4.0, the region concordance from Bjelle et al. 2020 under CC BY 4.0, and the price and '
  'exchange rate series under World Bank CC BY 4.0 and OGDL-Taiwan-1.0. No licensor has reviewed or '
  'endorses the values derived from their data. The CC BY-SA obligation on the EXIOBASE inputs '
  'attaches to the combination, so whether a factor table derived from this edition must itself be '
  'licensed CC BY-SA is an open legal question and is not answered here. '
  'EXCHANGE RATE SERIES ARE NORMALISED TO A SINGLE DENOMINATION ACROSS THE WINDOW. The World Bank '
  'publishes each year in the currency then in force, so a series spanning a currency changeover '
  'mixes denominations with nothing marking the break, and a ratio taken across it measures the '
  'redenomination rather than a price movement. Pre-changeover figures are therefore converted at '
  'the official fixed rate before any ratio is taken. CROATIA IS THE CASE INSIDE THIS WINDOW: it '
  'adopted the euro in 2023, so its 2019-2022 figures are kuna and its 2023-2024 figures euro, and '
  'the pre-2023 values are converted at 7.53450 HRK per EUR. Left uncorrected, Croatia''s '
  'multiplier would have been wrong BY A FACTOR OF ABOUT 7.4 - an error that is invisible in the '
  'arithmetic, because every intermediate value looks like a plausible exchange rate. Bulgaria '
  'adopts the euro in 2026 and is tabulated but inert at this vintage; its conversion rate of '
  '1.95583 is small enough to pass an ordinary discontinuity check unnoticed, so the recorded rate '
  'rather than any automated test is what will catch it.',
  false
)
on conflict (id) do nothing;

commit;


-- ── AFTER RUNNING, VERIFY (read-only, safe to paste) ─────────────────────────────────────────
--
--   -- one edition, inactive:
--   select id, factor_data_year, price_vintage_year, is_active from public.factor_editions;
--
--   -- the multiplier table exists and is EMPTY - 0 against an expected 245:
--   select count(*) as loaded, 245 as expected from public.region_currency_multipliers;
--
--   -- the one-active index actually bites (the second must ERROR):
--   --   update public.factor_editions set is_active = true where id = 'exiobase-3.8.2-2019-cpi2024';
--   --   insert into public.factor_editions (...) values (..., true);   -- expect unique violation
--
--   -- the sector fingerprint agrees with the row 20260914 seeded:
--   select e.fingerprint_sectors, f.fingerprint,
--          e.fingerprint_sectors = f.fingerprint as agrees
--     from public.factor_editions e
--     join public.reference_data_fingerprints f on f.dataset = 'exiobase_sectors'
--    where e.id = 'exiobase-3.8.2-2019-cpi2024';   -- expect agrees = t
--
--   -- likewise the concordance fingerprint against 20260915:
--   select e.fingerprint_country_regions = f.fingerprint as agrees
--     from public.factor_editions e
--     join public.reference_data_fingerprints f on f.dataset = 'country_regions'
--    where e.id = 'exiobase-3.8.2-2019-cpi2024';   -- expect agrees = t
