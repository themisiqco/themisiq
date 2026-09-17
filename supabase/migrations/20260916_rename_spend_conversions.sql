-- 20260916_rename_spend_conversions.sql
--
-- ⚠️ RUN. public.region_spend_conversions exists and is loaded; region_currency_multipliers is gone.
--
-- VERIFIED THIS SESSION: 245 rows loaded - 220 basis 'published', 25 'row_composite' - and
-- to_regclass shows region_currency_multipliers dropped. DE/EUR reads
-- to_eur2019_per_unit = 0.8367765223463683, which is 1 / the German CPI ratio and the value the
-- directional check was built to guarantee: below 1, as positive inflation requires.
--
-- ⚠️⚠️ THIS FILE CONTAINS THE FIRST DESTRUCTIVE STATEMENT IN THIS WORKSTREAM.
-- It DROPS public.region_currency_multipliers and creates public.region_spend_conversions in its
-- place, then loads 245 rows. Every other migration in this series was additive; this one is not.
--
-- ═══ WHY THE DROP IS SAFE, POINT BY POINT ════════════════════════════════════════════════════
--
--   1. THE TABLE HAS NO READERS ANYWHERE IN THE REPOSITORY. Verified by grepping every file type
--      for 'region_currency_multipliers': the only occurrences are in 20260916_factor_editions.sql,
--      which created it, and in this file, which drops it. There is no Supabase client call, no
--      .from('region_currency_multipliers'), no RPC, no view, no policy outside those files, and
--      no application, script or test code of any kind touches it. Dropping it cannot break a
--      caller because it has none.
--
--   2. IT HOLDS AT MOST 245 ROWS FROM A SINGLE LOAD. No customer ever wrote to it. There is no
--      accumulated state, no history and no user-entered value to lose - the entire content is one
--      machine-generated batch.
--
--   3. THE VALUES ARE SUPERSEDED, AND THE RECORD OF THEM DOES NOT LIVE IN THIS TABLE. They are
--      replaced by lib/emissionFactors/spendConversions.json, sha256
--      041db80fc43f635124004efbf472b0ad824c9d638fcf1e11cb6e5f0f1de24bc1, which holds the corrected
--      scalar for the same 49 regions and 5 currencies.
--      ⚠️ THE SUPERSEDED ARTEFACT AND ITS GENERATOR HAVE BEEN DELETED, deliberately: a wrong
--      artefact kept "for reference" is an artefact someone regenerates from. What survives is the
--      superseded EDITION ROW in public.factor_editions - id
--      'exiobase-3.8.2-2019-cpi2024-fxnorm', retained, is_active false - whose notes record what
--      was computed, how it was wrong and when it was corrected. The record is that row, not a
--      retained file, and not the contents of this table.
--
--   4. THE VALUES IT HOLDS ARE ARITHMETICALLY WRONG. This is the reason the table is replaced
--      rather than renamed in place. Its 'multiplier' column stored the scalar that carries an
--      AMOUNT of money forward from 2019, and described it as a multiplier for an emission factor.
--      A factor carries money in its DENOMINATOR, so applying that scalar inflated every figure
--      where it should have deflated it: Germany's p28 read 0.3067 kg per 2024 EUR against an
--      honest 0.2147, too high by cpi_ratio squared. All 245 rows were affected, in both the CPI
--      and the FX legs. Keeping the column under a corrected name would leave wrong numbers in a
--      table whose name no longer warned about them.
--
--      The error NEVER REACHED A CUSTOMER FIGURE. Nothing read the table and nothing read the
--      artefact; the spend resolver family it was built for is still unwired.
--
-- ⚠️ IF THE TABLE IS NOT EMPTY OF OTHER EDITIONS, STOP AND LOOK FIRST. This file assumes its only
-- contents are 245 rows of edition 'exiobase-3.8.2-2019-cpi2024-fxnorm', or nothing at all - the
-- migration that would have loaded them has been deleted unrun, so an untouched database has an
-- EMPTY table here. Check before dropping:
--     select edition_id, count(*) from public.region_currency_multipliers group by edition_id;
--
-- ═══ WHAT IT CREATES ═════════════════════════════════════════════════════════════════════════
--
-- public.region_spend_conversions - the same shape as the table it replaces, with one column
-- renamed and re-meaning: multiplier -> to_eur2019_per_unit. The new column is the number of 2019
-- EUR that one unit of the stated currency represents at the price vintage year. It is applied to
-- the SPEND, bringing it onto the basis the published factors are denominated in.
--
-- ⚠️ THE 1e6 IS NOT IN THESE VALUES, AND THAT IS A STATEMENT ABOUT THIS COLUMN RATHER THAN A RULE
-- FOR EVERY CONSUMER. The published factors are per MILLION EUR and their own denominator_note
-- requires whoever reads one to apply that divisor visibly. Whether it is still owed depends on
-- where the factor value came from, and the two cases differ by a factor of a million:
--
--     resolveSpendFactor()  SpendFactor.value is ALREADY per ONE unit of currency - that resolver
--                           is itself a consumer of the factor files, applies the conversion and
--                           records it in SpendFactorSource.unit_conversion. Nothing further is
--                           owed:   kg CO2e = spend * to_eur2019_per_unit * factor.value
--
--     a raw value read straight from exiobaseFactors2019ixi.json / ...pxp.json is per MILLION EUR,
--                           and that reader applies the divisor and says so:
--                           kg CO2e per unit of currency = published_factor * to_eur2019_per_unit / 1e6
--
-- Applying the divisor on the resolver path is a millionfold error. See the doc comment on
-- convertSpendToFactorBasis in lib/emissionFactors/spendAdjustment.ts, whose wording this matches.
--
-- SOURCE OF EVERY VALUE: lib/emissionFactors/spendConversions.json
--   fingerprint sha256 041db80fc43f635124004efbf472b0ad824c9d638fcf1e11cb6e5f0f1de24bc1
--   produced by scripts/generate-spend-conversions.py from lib/emissionFactors/priceIndices.json
--
-- ⚠️ GENERATED, NOT TYPED. Every row was emitted programmatically from that artefact.
--
-- ASSERTED AT GENERATION TIME: 245 rows = 49 regions x 5 currencies (AUD, CAD, EUR, GBP, USD);
-- edition read from the artefact and equal to 'exiobase-3.8.2-2019-cpi2024-spendconv'; basis 'row_composite' for
-- exactly the five W regions; gdp_coverage_pct non-null for exactly those; every value > 0
-- (observed 0.424878804 to 1.461579262). Basis counts are PER ROW: 220 published,
-- 25 row_composite - five composite REGIONS, five currencies each.
--
-- ⚠️ ON UPDATE CASCADE IS NEW ON THE FOREIGN KEY, AND IT IS THERE BECAUSE OF WHAT HAPPENED LAST
-- TIME. The previous table's edition_id FK had no cascade, so when the edition id changed the
-- parent had to be updated by hand before any child row could be inserted, and the ordering became
-- a warning in a header rather than something the database enforced. With ON UPDATE CASCADE an
-- edition rename carries its rows with it. ON DELETE is deliberately left at NO ACTION: deleting an
-- edition that still has conversions should FAIL, because a stored figure citing that edition would
-- lose the scalars that priced it.
--
-- IDEMPOTENT. DROP ... IF EXISTS, CREATE TABLE IF NOT EXISTS, guarded policy, INSERT ... ON
-- CONFLICT DO NOTHING.
-- ⚠️ CORRECTION TO AN EARLIER VERSION OF THIS PARAGRAPH, WHICH WAS WRONG. It claimed re-running was
-- NOT inert because "the DROP at the top removes region_spend_conversions too". IT DOES NOT. The
-- DROP names region_currency_multipliers - the OLD table - and nothing else. Read the statement:
--
--     drop table if exists public.region_currency_multipliers;
--
-- RE-RUNNING IS THEREFORE FULLY INERT, and the walk-through is worth having because the first
-- statement is a DROP and that is alarming at a glance. On a second run: the DROP finds no
-- region_currency_multipliers and IF EXISTS makes it a no-op; CREATE TABLE IF NOT EXISTS finds
-- region_spend_conversions present; the index, grants and RLS enable are all idempotent; the policy
-- block is guarded on pg_policies; and all 245 inserts hit ON CONFLICT DO NOTHING. Nothing is
-- dropped, created or written.
-- ⚠️ THE DANGEROUS RE-RUN IS A DIFFERENT ONE. If region_currency_multipliers is ever RECREATED -
-- by replaying 20260916_factor_editions.sql against a fresh database, say - then re-running this
-- file WOULD drop it again. That is the intended behaviour on a rebuild and a hazard only if
-- something has by then started reading it.
--
-- NO OTHER TABLE IS TOUCHED. factor_editions is not modified, inserted into or deleted from; the
-- new edition row is a separate statement the operator runs, reported alongside this file.

begin;

-- ═══ 1. REPLACE THE TABLE ════════════════════════════════════════════════════════════════════

drop table if exists public.region_currency_multipliers;

create table if not exists public.region_spend_conversions (
  edition_id           text    not null
    references public.factor_editions (id) on update cascade,
  region_code          text    not null,
  currency             char(3) not null check (currency ~ '^[A-Z]{3}$'),
  to_eur2019_per_unit  numeric not null check (to_eur2019_per_unit > 0),
  basis                text    not null check (basis in ('published', 'row_composite')),
  gdp_coverage_pct     numeric,
  primary key (edition_id, region_code, currency)
);

comment on table public.region_spend_conversions is
  'How much 2019 EUR one unit of a customer''s currency represents, per EXIOBASE region, at an '
  'edition''s price vintage year. Applied to the SPEND to bring it onto the basis the published '
  'EXIOBASE factors are denominated in; the factor itself is never touched, so a verifier can open '
  'EXIOBASE and find the number used. '
  'REPLACES region_currency_multipliers, which stored the RECIPROCAL of this divided by 1e6 and '
  'described it as a factor multiplier - inflating every figure where it should have deflated it. '
  'That table was dropped rather than renamed because its values were wrong, not merely misnamed.';

comment on column public.region_spend_conversions.edition_id is
  'Which factor_editions row these conversions belong to. Scalars are only meaningful beside the '
  'fingerprints that produced them, so they are never stored loose. ON UPDATE CASCADE: renaming an '
  'edition carries its conversions with it. ON DELETE is NO ACTION on purpose - deleting an edition '
  'that still has conversions must fail, because a stored figure citing it would lose its basis.';

comment on column public.region_spend_conversions.region_code is
  'The EXIOBASE 3 region - one of 49: the 44 individually-resolved countries by ISO alpha-2 code, '
  'or one of the five rest-of-world buckets WA, WL, WE, WF, WM. '
  '⚠️ NO FOREIGN KEY, AND NO TABLE TO POINT ONE AT: public.exiobase_sectors is keyed on exio_code, '
  'an industry or product code, not a region, and no region table exists in this database. The '
  'authoritative list is the distinct region values in exiobaseFactors2019ixi.json. '
  '⚠️ WF IS A REGION CODE HERE MEANING RoW AFRICA, and separately an ISO 3166-1 country code '
  'meaning Wallis and Futuna in public.country_regions.iso2. Never join those two columns.';

comment on column public.region_spend_conversions.currency is
  'ISO 4217 of the currency the customer''s spend is denominated in, uppercase. One of the five the '
  'product offers. Together with region_code it answers: a buyer paying in THIS currency, for '
  'output from THIS region.';

comment on column public.region_spend_conversions.to_eur2019_per_unit is
  'The number of 2019 EUR that ONE unit of this currency represents at the edition''s price vintage '
  'year. Multiply a spend by it to bring the spend onto the basis the factors are denominated in. '
  '⚠️ WHETHER A 1e6 DIVISOR IS THEN OWED DEPENDS ON THE FACTOR VALUE, and the two cases differ by a '
  'million. A value from resolveSpendFactor is already per unit of currency - multiply directly. A '
  'raw value from exiobaseFactors2019*.json is per MILLION EUR - divide first. '
  'A value BELOW 1 means a vintage unit buys less real output than a 2019 unit did - the usual case '
  'under positive inflation. A value ABOVE 1 is legitimate and not an error: it means the region''s '
  'currency weakened against the customer''s by more than its prices rose, so the same money buys '
  'more of that region''s output than it did in 2019. Japan priced in EUR is the clear example.';

comment on column public.region_spend_conversions.basis is
  'How the underlying series was arrived at. ''published'' means one of the 44 regions with its own '
  'national CPI and FX series. ''row_composite'' means one of the five rest-of-world buckets, where '
  'the ratios are GDP-weighted averages across member countries - a multi-economy average, not a '
  'national figure, and it must be described that way wherever it is shown.';

comment on column public.region_spend_conversions.gdp_coverage_pct is
  'For a row_composite row: the share of the bucket''s MEASURABLE GDP held by members that had '
  'usable price data. NULL for a ''published'' row, where the concept does not apply - NULL means '
  '"not applicable" here, never "unknown" or "100". '
  '⚠️ MEASURABLE, NOT TOTAL: members with no GDP figure at all are absent from both sides of that '
  'fraction, so 100.0 can coexist with members missing entirely.';

create index if not exists region_spend_conversions_edition_idx
  on public.region_spend_conversions (edition_id);

grant select on public.region_spend_conversions to authenticated;
grant all    on public.region_spend_conversions to service_role;

alter table public.region_spend_conversions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'region_spend_conversions'
                   and policyname = 'region_spend_conversions_read') then
    create policy region_spend_conversions_read on public.region_spend_conversions
      for select to authenticated using (true);
  end if;
end $$;


-- ═══ 2. LOAD — 245 ROWS, GENERATED ══════════════════════════════════════════════════════════
--
-- ⚠️ THE EDITION ROW MUST EXIST FIRST. These rows reference
-- 'exiobase-3.8.2-2019-cpi2024-spendconv', which is inserted by the statement reported alongside
-- this migration. Run that first or every insert here fails on the foreign key.

insert into public.region_spend_conversions
  (edition_id, region_code, currency, to_eur2019_per_unit, basis, gdp_coverage_pct)
values
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'AT', 'AUD', 0.4857621584199733, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'AT', 'CAD', 0.5375531031674867, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'AT', 'EUR', 0.7967441505115781, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'AT', 'GBP', 0.9408101657053923, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'AT', 'USD', 0.7361035915880003, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'AU', 'AUD', 0.5154951313056264, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'AU', 'CAD', 0.5704561433982557, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'AU', 'EUR', 0.8455119925786051, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'AU', 'GBP', 0.9983961317231086, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'AU', 'USD', 0.781159691060441, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BE', 'AUD', 0.502282832581787, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BE', 'CAD', 0.5558351770346402, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BE', 'EUR', 0.8238412602241728, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BE', 'GBP', 0.9728069318723915, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BE', 'USD', 0.7611383279814684, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BG', 'AUD', 0.44918429928108666, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BG', 'CAD', 0.4970753892358631, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BG', 'EUR', 0.7367493674639694, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BG', 'GBP', 0.8699672210232907, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BG', 'USD', 0.6806750387087207, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BR', 'AUD', 0.6039613778613797, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BR', 'CAD', 0.6683544760232324, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BR', 'EUR', 0.9906137944362802, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BR', 'GBP', 1.1697350115406975, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'BR', 'USD', 0.9152177289195753, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CA', 'AUD', 0.5143389623059756, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CA', 'CAD', 0.5691767060794456, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CA', 'EUR', 0.8436156511870261, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CA', 'GBP', 0.9961568968850494, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CA', 'USD', 0.779407681072891, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CH', 'AUD', 0.49277556099174596, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CH', 'CAD', 0.5453142600440991, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CH', 'EUR', 0.8082474909373091, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CH', 'GBP', 0.9543935219247615, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CH', 'USD', 0.746731407552765, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CN', 'AUD', 0.579696208203255, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CN', 'CAD', 0.6415022047573155, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CN', 'EUR', 0.9508142101105551, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CN', 'GBP', 1.1227389294226815, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CN', 'USD', 0.8784473090212118, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CY', 'AUD', 0.5242243663923349, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CY', 'CAD', 0.5801160712617222, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CY', 'EUR', 0.8598296311044172, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CY', 'GBP', 1.0153026629669593, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CY', 'USD', 0.7943876076195294, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CZ', 'AUD', 0.42699695657575026, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CZ', 'CAD', 0.47252247848404927, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CZ', 'EUR', 0.700357822323088, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CZ', 'GBP', 0.8269954143369352, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'CZ', 'USD', 0.6470532705859934, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'DE', 'AUD', 0.5101692548971204, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'DE', 'CAD', 0.5645624331928517, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'DE', 'EUR', 0.8367765223463683, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'DE', 'GBP', 0.9880811276011102, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'DE', 'USD', 0.773089081432456, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'DK', 'AUD', 0.5282532756162075, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'DK', 'CAD', 0.5845745343555072, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'DK', 'EUR', 0.8664378236147268, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'DK', 'GBP', 1.0231057383791171, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'DK', 'USD', 0.8004928475985371, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'EE', 'AUD', 0.4337176031879303, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'EE', 'CAD', 0.4799596663733249, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'EE', 'EUR', 0.7113809861967968, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'EE', 'GBP', 0.8400117692407809, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'EE', 'USD', 0.6572374564540542, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ES', 'AUD', 0.514566601157766, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ES', 'CAD', 0.5694286153092205, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ES', 'EUR', 0.8439890230531737, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ES', 'GBP', 0.9965977812605853, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ES', 'USD', 0.7797526354368393, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'FI', 'AUD', 0.5145807693159209, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'FI', 'CAD', 0.5694442940467472, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'FI', 'EUR', 0.8440122615803783, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'FI', 'GBP', 0.9966252217414673, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'FI', 'USD', 0.7797741052691908, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'FR', 'AUD', 0.5303659260998322, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'FR', 'CAD', 0.5869124312124273, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'FR', 'EUR', 0.8699029801439602, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'FR', 'GBP', 1.027197459022902, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'FR', 'USD', 0.8036942694915571, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'GB', 'AUD', 0.4777309079103885, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'GB', 'CAD', 0.5286655775360435, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'GB', 'EUR', 0.783571342062237, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'GB', 'GBP', 0.9252554708989447, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'GB', 'USD', 0.7239333715686443, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'GR', 'AUD', 0.5232987804005153, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'GR', 'CAD', 0.5790918012284832, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'GR', 'EUR', 0.8583114905658943, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'GR', 'GBP', 1.0135100146611076, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'GR', 'USD', 0.7929850134464508, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'HR', 'AUD', 0.48991772250411086, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'HR', 'CAD', 0.5421517247976801, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'HR', 'EUR', 0.8035600815566847, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'HR', 'GBP', 0.9488585426051357, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'HR', 'USD', 0.7424007590276326, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'HU', 'AUD', 0.4905455564235667, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'HU', 'CAD', 0.5428464970557231, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'HU', 'EUR', 0.804589850949274, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'HU', 'GBP', 0.9500745132680625, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'HU', 'USD', 0.7433521522043579, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ID', 'AUD', 0.5781657122592777, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ID', 'CAD', 0.6398085305387509, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ID', 'EUR', 0.9483038999317798, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ID', 'GBP', 1.1197747089338972, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ID', 'USD', 0.8761280596895287, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IE', 'AUD', 0.5106526202127635, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IE', 'CAD', 0.5650973339068814, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IE', 'EUR', 0.8375693352098724, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IE', 'GBP', 0.9890172956307187, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IE', 'USD', 0.7738215529490748, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IN', 'AUD', 0.5281190406129104, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IN', 'CAD', 0.58442598749708, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IN', 'EUR', 0.8662176521752329, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IN', 'GBP', 1.0228457558887019, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IN', 'USD', 0.8002894335072351, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IT', 'AUD', 0.5192872185238434, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IT', 'CAD', 0.5746525350197537, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IT', 'EUR', 0.8517317510694096, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IT', 'GBP', 1.0057405370916626, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'IT', 'USD', 0.7869060609094715, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'JP', 'AUD', 0.7546473485106656, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'JP', 'CAD', 0.8351062695136946, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'JP', 'EUR', 1.237768010955509, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'JP', 'GBP', 1.4615792619803663, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'JP', 'USD', 1.1435609258405783, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'KR', 'AUD', 0.6007673332940335, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'KR', 'CAD', 0.664819889108482, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'KR', 'EUR', 0.9853749418797453, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'KR', 'GBP', 1.1635488779636203, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'KR', 'USD', 0.9103776078089413, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LT', 'AUD', 0.4374645248231764, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LT', 'CAD', 0.4841060769519162, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LT', 'EUR', 0.7175266643719307, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LT', 'GBP', 0.8472686992083335, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LT', 'USD', 0.6629153842738637, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LU', 'AUD', 0.5239261479799218, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LU', 'CAD', 0.5797860574262768, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LU', 'EUR', 0.8593404950703593, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LU', 'GBP', 1.0147250821300506, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LU', 'USD', 0.7939356999510339, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LV', 'AUD', 0.45517384684754575, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LV', 'CAD', 0.5037035298291772, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LV', 'EUR', 0.7465733871103521, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LV', 'GBP', 0.8815676043401582, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'LV', 'USD', 0.6897513477608678, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'MT', 'AUD', 0.5263316556798571, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'MT', 'CAD', 0.5824480353230309, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'MT', 'EUR', 0.8632859942322701, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'MT', 'GBP', 1.0193840002004557, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'MT', 'USD', 0.7975809053809392, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'MX', 'AUD', 0.4298805778376716, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'MX', 'CAD', 0.47571354541019173, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'MX', 'EUR', 0.7050875204539586, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'MX', 'GBP', 0.832580328991638, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'MX', 'USD', 0.6514229892453967, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'NL', 'AUD', 0.4966953641092491, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'NL', 'CAD', 0.5496519843667864, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'NL', 'EUR', 0.8146767282726872, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'NL', 'GBP', 0.961985283770735, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'NL', 'USD', 0.7526713127164301, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'NO', 'AUD', 0.5966086865394414, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'NO', 'CAD', 0.6602178561399615, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'NO', 'EUR', 0.9785539546572278, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'NO', 'GBP', 1.1554945306364754, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'NO', 'USD', 0.9040757690198554, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'PL', 'AUD', 0.4248788035944597, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'PL', 'CAD', 0.4701784924646776, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'PL', 'EUR', 0.6968836406305056, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'PL', 'GBP', 0.822893036614061, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'PL', 'USD', 0.6438435104389033, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'PT', 'AUD', 0.5226928227976054, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'PT', 'CAD', 0.5784212376940746, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'PT', 'EUR', 0.8573176025752225, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'PT', 'GBP', 1.0123364134183548, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'PT', 'USD', 0.7920667707218573, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'RO', 'AUD', 0.4466744532340083, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'RO', 'CAD', 0.49429794865574866, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'RO', 'EUR', 0.7326327331769374, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'RO', 'GBP', 0.865106223445531, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'RO', 'USD', 0.6768717233257426, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'RU', 'AUD', 0.5851430344035841, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'RU', 'CAD', 0.6475297601682279, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'RU', 'EUR', 0.9597480614588799, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'RU', 'GBP', 1.1332881856199288, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'RU', 'USD', 0.8867012008884978, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SE', 'AUD', 0.530284501437637, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SE', 'CAD', 0.5868223252231509, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SE', 'EUR', 0.8697694279061272, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SE', 'GBP', 1.027039758080981, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SE', 'USD', 0.8035708819751626, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SI', 'AUD', 0.501978611862852, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SI', 'CAD', 0.5554985209393131, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SI', 'EUR', 0.8233422792433068, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SI', 'GBP', 0.9722177259409881, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SI', 'USD', 0.7606773246695349, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SK', 'AUD', 0.45268307920531214, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SK', 'CAD', 0.5009472017535057, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SK', 'EUR', 0.7424880451074096, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SK', 'GBP', 0.8767435572677278, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'SK', 'USD', 0.685976942992034, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'TR', 'AUD', 0.6040197159916008, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'TR', 'CAD', 0.6684190340428099, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'TR', 'EUR', 0.9907094802841784, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'TR', 'GBP', 1.1698479991520394, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'TR', 'USD', 0.91530613207416, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'TW', 'AUD', 0.5579886832936413, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'TW', 'CAD', 0.6174802689704612, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'TW', 'EUR', 0.9152096592124878, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'TW', 'GBP', 1.0806964200314688, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'TW', 'USD', 0.845552636652275, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'US', 'AUD', 0.48042972582795357, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'US', 'CAD', 0.5316521377720033, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'US', 'EUR', 0.7879979268668458, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'US', 'GBP', 0.9304824637558848, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'US', 'USD', 0.7280230469946254, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WA', 'AUD', 0.525131827928355, 'row_composite', 96.9),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WA', 'CAD', 0.5811202844476142, 'row_composite', 96.9),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WA', 'EUR', 0.8613180440202979, 'row_composite', 96.9),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WA', 'GBP', 1.0170602083485332, 'row_composite', 96.9),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WA', 'USD', 0.795762736752818, 'row_composite', 96.9),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WE', 'AUD', 0.5252248396773888, 'row_composite', 90.4),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WE', 'CAD', 0.5812232129146788, 'row_composite', 90.4),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WE', 'EUR', 0.8614706013277927, 'row_composite', 90.4),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WE', 'GBP', 1.0172403508267074, 'row_composite', 90.4),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WE', 'USD', 0.7959036828543964, 'row_composite', 90.4),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WF', 'AUD', 0.6587339765080916, 'row_composite', 90.6),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WF', 'CAD', 0.7289668145117973, 'row_composite', 90.6),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WF', 'EUR', 1.0804514790390332, 'row_composite', 90.6),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WF', 'GBP', 1.2758170039637806, 'row_composite', 90.6),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WF', 'USD', 0.9982178265714696, 'row_composite', 90.6),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WL', 'AUD', 0.5181306808479553, 'row_composite', 69.7),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WL', 'CAD', 0.5733726897172172, 'row_composite', 69.7),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WL', 'EUR', 0.8498348049772987, 'row_composite', 69.7),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WL', 'GBP', 1.0035005882120795, 'row_composite', 69.7),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WL', 'USD', 0.7851534922454216, 'row_composite', 69.7),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WM', 'AUD', 0.48157085076749234, 'row_composite', 100.0),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WM', 'CAD', 0.532914927064496, 'row_composite', 100.0),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WM', 'EUR', 0.7898695930821343, 'row_composite', 100.0),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WM', 'GBP', 0.9326925616913644, 'row_composite', 100.0),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'WM', 'USD', 0.7297522598447521, 'row_composite', 100.0),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ZA', 'AUD', 0.5843279347023111, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ZA', 'CAD', 0.6466277562426127, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ZA', 'EUR', 0.9584111398650174, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ZA', 'GBP', 1.1317095239812467, 'published', null),
  ('exiobase-3.8.2-2019-cpi2024-spendconv', 'ZA', 'USD', 0.8854660330039492, 'published', null)
on conflict (edition_id, region_code, currency) do nothing;

commit;


-- ── AFTER RUNNING, VERIFY (read-only, safe to paste) ─────────────────────────────────────────
--
--   -- the old table is gone:
--   select to_regclass('public.region_currency_multipliers');   -- expect null
--
--   -- total, expect 245:
--   select count(*) from public.region_spend_conversions;
--
--   -- per basis, expect published 220 and row_composite 25 (PER ROW):
--   select basis, count(*) from public.region_spend_conversions group by basis order by basis;
--
--   -- DIRECTION. Germany in EUR must be 1/cpi_ratio = 0.8367765223463683, comfortably below 1.
--   -- If this reads above 1 the inversion has returned:
--   select to_eur2019_per_unit from public.region_spend_conversions
--    where region_code = 'DE' and currency = 'EUR';
--
--   -- the externally-corroborated figure, which MUST fall below its published 0.256624:
--   select 256624.197323 * to_eur2019_per_unit / 1e6 as kg_per_2024_eur
--     from public.region_spend_conversions
--    where region_code = 'DE' and currency = 'EUR';       -- expect ~0.214737
--
--   -- values above 1 are legitimate; list them so nobody "fixes" one:
--   select region_code, currency, to_eur2019_per_unit
--     from public.region_spend_conversions
--    where to_eur2019_per_unit > 1
--    order by to_eur2019_per_unit desc;
--
--   -- the cascade works (read-only demonstration, rolled back):
--   --   begin;
--   --     update public.factor_editions set id = id || '-tmp'
--   --      where id = 'exiobase-3.8.2-2019-cpi2024-spendconv';
--   --     select count(*) from public.region_spend_conversions
--   --      where edition_id = 'exiobase-3.8.2-2019-cpi2024-spendconv-tmp';   -- expect 245
--   --   rollback;
