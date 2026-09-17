-- 20260916_edition_spendconv.sql
--
-- ⚠️ RUN. This file HAS been executed, so the -spendconv edition row is live and the supersession
-- links it sets have been applied.
--
-- ⚠️⚠️ AND THE FILE HAS BEEN EDITED SINCE IT RAN, SO ITS notes TEXT NO LONGER MATCHES THE DATABASE.
-- The notes paragraph below was corrected afterwards: its closing sentence used to say that a
-- consumer applies the MILLION-EUR denominator as its own visible step, which is true only of a raw
-- artefact value and is a millionfold error against resolveSpendFactor's, whose value is already
-- per unit of currency. The live row still carries the old wording.
--
-- ⚠️ DO NOT RE-RUN THIS FILE TO RECONCILE IT. The insert is `on conflict (id) do nothing`, so a
-- re-run would leave the existing row - and its stale notes - exactly as they are, while changing
-- nothing. Reconcile with the single UPDATE in 20260916_edition_spendconv_notes_fix.sql, which
-- touches notes and nothing else.
--
-- WHAT IT DOES: two statements against public.factor_editions, in this order.
--
--   INSERT  one row, the corrected edition 'exiobase-3.8.2-2019-cpi2024-spendconv', is_active
--           false, carrying fingerprint_spend_conversions for the derived scalars artefact.
--   UPDATE  superseded_by on the older editions, pointing each forward to its replacement, so the
--           chain records which edition replaced which.
--
-- ⚠️ THIS FILE NO LONGER ONLY INSERTS. The UPDATE is the second statement and it is deliberately
-- narrow: it sets superseded_by AND NOTHING ELSE. It does not touch is_active, any fingerprint,
-- any licence, notes, created_at or id on those rows. A superseded edition is retained exactly as
-- it was recorded; marking it superseded must not also edit what it says.
--
-- ⚠️ ORDER WITHIN THIS FILE MATTERS TOO. The INSERT must precede the UPDATE, because
-- superseded_by is a foreign key to factor_editions(id) and the -spendconv row has to exist before
-- anything can point at it. Both are inside one transaction, so a failure leaves neither applied.
--
-- ⚠️ ONLY ONE OF THE TWO SUPERSESSION LINKS WILL APPLY ON THE CURRENT PATH, AND THAT IS EXPECTED.
-- The live table holds ONE older row, not two. It was seeded as 'exiobase-3.8.2-2019-cpi2024', and
-- the reconciling UPDATE reported alongside 20260916_factor_editions.sql RENAMES that row to
-- '...-fxnorm' rather than adding a second one. So at most one of the two ids below exists at any
-- time, and the UPDATE is written to skip a link whose TARGET row is absent rather than fail on the
-- foreign key. Expect it to report 1 row updated, not 2 - or 0, if the table is empty.
--
-- ⚠️⚠️ RUN ORDER. TWO FILES NOW DEPEND ON EACH OTHER AND THIS ONE IS FIRST.
--
--     1. THIS FILE                                creates the parent edition row
--     2. 20260916_rename_spend_conversions.sql    245 child rows FK to it
--
-- Every row in step 2 carries edition_id 'exiobase-3.8.2-2019-cpi2024-spendconv' and
-- region_spend_conversions.edition_id references factor_editions(id). Run step 2 first and all 245
-- inserts fail on the foreign key, because the parent does not exist yet. That failure is the
-- constraint working, not a fault - but it is avoidable by running these in order.
--
-- ═══ WHAT IT DOES NOT DO ═════════════════════════════════════════════════════════════════════
--   * NOTHING DESTRUCTIVE. No TRUNCATE, no DROP, no DELETE, no ALTER. One INSERT.
--   * DOES NOT EDIT OR REMOVE THE SUPERSEDED EDITION. The 'exiobase-3.8.2-2019-cpi2024-fxnorm'
--     row stays exactly as it is, is_active false. Its scalars were wrong, and superseding rather
--     than editing is what preserves the record of what was computed and when it was corrected.
--     Two inactive editions coexisting is the intended state.
--   * DOES NOT ACTIVATE ANYTHING. is_active false here, and unchanged on every other row. The
--     partial unique index factor_editions_one_active still permits at most one active edition;
--     this file does not use that budget.
--   * CREATES NO TABLE and touches no other table. public.region_spend_conversions is created and
--     filled by step 2, not here.
--   * LOADS NO MULTIPLIERS. This row is an identity: five fingerprints, three licences and a note.
--
-- IDEMPOTENT via ON CONFLICT (id) DO NOTHING. Re-running inserts nothing and changes nothing.
-- ⚠️ WHICH ALSO MEANS IT CANNOT CORRECT THE ROW ONCE INSERTED. If a fingerprint here is wrong, the
-- fix is a new edition with a new id - never an edit to this one. The fingerprints ARE the
-- identity: a changed artefact is a different edition by definition.
--
-- ═══ PROVENANCE OF EVERY LITERAL BELOW ═══════════════════════════════════════════════════════
--
-- ⚠️ EXTRACTED PROGRAMMATICALLY FROM 20260916_factor_editions.sql, NOT RETYPED. The five
-- fingerprints, both short licence strings, the long price-index licence string and the entire
-- notes paragraph were read out of that file's existing seed tuple by a script and re-emitted here
-- unchanged, so the two rows cannot drift in any field they share. Only the id and the superseding
-- note at the end of `notes` are new text.
--
-- THE FIVE DIGESTS WERE ALSO RECOMPUTED FROM THE ARTEFACTS ON DISK and matched, using each file's
-- own canonicalisation - the two factor files hash a pipe-joined text rendering with the value as a
-- 12-digit exponential (NOT JSON: Python writes a float zero as '0.0' and JavaScript as '0', and
-- those files hold 1,108 and 1,662 zeros), while the sector, concordance and price-index files hash
-- sorted compact JSON of their rows with metadata excluded:
--
--     factors_ixi      exiobaseFactors2019ixi.json     8747704c...206fdb   MATCH
--     factors_pxp      exiobaseFactors2019pxp.json     300565c2...29ddc6   MATCH
--     sectors          exiobaseSectors.json            b393d1ad...47e3341  MATCH
--     country_regions  countryRegions.json             e83c3d03...075c9a8  MATCH
--     price_indices    priceIndices.json               64df489c...0d23b158 MATCH
--
-- FOUR OF THE FIVE ARE UNCHANGED FROM THE SUPERSEDED EDITION. Only the derived scalars changed,
-- and those are not fingerprinted here - they live in lib/emissionFactors/spendConversions.json,
-- sha256 041db80fc43f635124004efbf472b0ad824c9d638fcf1e11cb6e5f0f1de24bc1, whose rows step 2
-- loads. The price-index digest 64df489c... is shared with the superseded edition too: the FX
-- renormalisation that produced it predates the inversion fix.
--
-- ⚠️ SO THE TWO EDITIONS DIFFER IN NO FINGERPRINT THIS TABLE RECORDS. They are told apart by their
-- id and their notes alone. That is a real limitation of the schema and it is stated here rather
-- than discovered: factor_editions fingerprints the five INPUT artefacts, not the derived scalars
-- built from them, so an arithmetic correction downstream of the inputs is invisible to it.

begin;

insert into public.factor_editions (
  id, factor_source, factor_data_year, price_vintage_year,
  fingerprint_factors_ixi, fingerprint_factors_pxp, fingerprint_sectors,
  fingerprint_country_regions, fingerprint_price_indices,
  licence_factors, licence_concordance, licence_price_indices,
  fingerprint_spend_conversions,
  notes, is_active
) values (
  'exiobase-3.8.2-2019-cpi2024-spendconv',
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
  -- the DERIVED artefact: lib/emissionFactors/spendConversions.json. NOT one of the five
  -- input fingerprints; see its column comment for why it is the only place a downstream
  -- arithmetic correction is visible.
  '041db80fc43f635124004efbf472b0ad824c9d638fcf1e11cb6e5f0f1de24bc1',
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
  'rather than any automated test is what will catch it.'
  'SUPERSEDES exiobase-3.8.2-2019-cpi2024-fxnorm, WHOSE SCALARS WERE INVERTED. That edition stored '
  'in region_currency_multipliers the scalar that carries an AMOUNT of money forward from 2019, and '
  'applied it to emission factors, which carry money in their DENOMINATOR. Every figure it produced '
  'was too LARGE by cpi_ratio squared where it should have been smaller: Germany p28 read 0.3067 kg '
  'per 2024 EUR against an honest 0.2147. All 245 rows were affected, in both the CPI and the FX '
  'legs, named regions and rest-of-world composites alike. '
  'THE ERROR NEVER REACHED A CUSTOMER FIGURE. No application code, route, script or test read '
  'region_currency_multipliers or the artefact behind it - verified by grep across every file type '
  '- and the spend resolver family they were built for is still unwired. NO TABLE READ IT: the '
  'wrong values sat in a table with no readers for the whole of their existence, which is why '
  'correcting them needed no data migration and touched no stored figure. '
  'THE SUPERSEDED GENERATOR AND ARTEFACT HAVE BEEN DELETED, deliberately - a wrong artefact kept '
  'for reference is one somebody eventually regenerates from. The surviving record is the '
  'exiobase-3.8.2-2019-cpi2024-fxnorm row itself, retained rather than edited, is_active false. '
  'The replacement stores to_eur2019_per_unit - the number of 2019 EUR that one vintage-year unit '
  'represents - in public.region_spend_conversions, with the 1e6 deliberately NOT folded in, so the '
  'denominator stays a separate named quantity rather than vanishing into a scalar. That is a '
  'statement about the stored value, not a rule for every consumer: whether a 1e6 divisor is owed '
  'depends on where the factor value came from. A value from resolveSpendFactor is already per one '
  'unit of currency, because that resolver applies the denominator conversion itself and records '
  'it, so nothing further is owed and applying a divisor there is a millionfold error. A raw value '
  'read from exiobaseFactors2019ixi.json or ...pxp.json is per MILLION EUR, and whoever reads it '
  'that way applies the divisor and says so.',
  false
)
on conflict (id) do nothing;


-- ── SUPERSESSION CHAIN ───────────────────────────────────────────────────────────────────────
--
-- Point each older edition forward to the one that replaced it. TOUCHES superseded_by ONLY.
--
--   exiobase-3.8.2-2019-cpi2024         -> ...-fxnorm      (the FX renormalisation)
--   exiobase-3.8.2-2019-cpi2024-fxnorm  -> ...-spendconv   (the inversion correction)
--
-- ⚠️ THE `exists` GUARD IS NOT DEFENSIVE CLUTTER. superseded_by is a foreign key, so pointing at
-- an edition that was never inserted raises rather than recording anything. On the current path
-- the plain-id row is RENAMED to -fxnorm rather than duplicated, so exactly one of these two ids
-- exists and the other link has no row to attach to. Skipping it is correct; failing on it is not.
-- Idempotent: re-running sets the same values.
update public.factor_editions e
   set superseded_by = t.next_id
  from (values
      ('exiobase-3.8.2-2019-cpi2024',        'exiobase-3.8.2-2019-cpi2024-fxnorm'),
      ('exiobase-3.8.2-2019-cpi2024-fxnorm', 'exiobase-3.8.2-2019-cpi2024-spendconv')
  ) as t (this_id, next_id)
 where e.id = t.this_id
   and exists (select 1 from public.factor_editions p where p.id = t.next_id);

commit;


-- ── AFTER RUNNING, VERIFY (read-only, safe to paste) ─────────────────────────────────────────
--
--   -- two editions, both inactive, the superseded one intact:
--   select id, price_vintage_year, is_active from public.factor_editions order by id;
--
--   -- the four shared fingerprints really are identical across the two rows (expect 4 x true):
--   select
--     max(fingerprint_factors_ixi)     = min(fingerprint_factors_ixi)     as ixi_same,
--     max(fingerprint_factors_pxp)     = min(fingerprint_factors_pxp)     as pxp_same,
--     max(fingerprint_sectors)         = min(fingerprint_sectors)         as sectors_same,
--     max(fingerprint_country_regions) = min(fingerprint_country_regions) as regions_same
--     from public.factor_editions;
--
--   -- at most one active edition, still (expect 0 here, nothing was activated):
--   select count(*) from public.factor_editions where is_active;
--
--   -- the parent exists, so step 2 can now run:
--   select exists(select 1 from public.factor_editions
--                  where id = 'exiobase-3.8.2-2019-cpi2024-spendconv');   -- expect t
