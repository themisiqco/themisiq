-- 20260916_edition_spendconv_notes_fix.sql
--
-- ⚠️ RUN. The -spendconv edition's notes now carry the corrected text.
--
-- VERIFIED THIS SESSION: zero rows match '%as its own visible step%', the stale sentence this file
-- exists to remove. The -spendconv notes are 5,057 characters, matching the corrected literal in
-- 20260916_edition_spendconv.sql; the superseded -fxnorm row is untouched at 3,006 characters,
-- which is the point - a superseded edition's record is not edited.
--
-- ⚠️ RE-RUNNING IS INERT. It sets one exact string on one row by primary key, so a second run
-- writes the same text again and changes nothing else.
--
-- WHAT IT DOES: one UPDATE, setting notes on ONE row of public.factor_editions - the
-- 'exiobase-3.8.2-2019-cpi2024-spendconv' edition - to the corrected text.
--
-- ⚠️ WHY IT EXISTS. 20260916_edition_spendconv.sql HAS ALREADY BEEN RUN, so that row is live with
-- the notes text as it stood at the time. That text has since been corrected in the migration, and
-- an amendment to an already-executed file changes nothing in the database. This file is the other
-- half of that amendment.
--
-- WHAT WAS WRONG WITH THE OLD TEXT. Its closing sentence said that a consumer applies the
-- MILLION-EUR denominator of the published factors as its own visible step. That is true only of a
-- value read straight out of exiobaseFactors2019ixi.json or ...pxp.json, which is per MILLION EUR.
-- It is FALSE - and wrong by a factor of a million - against a value from resolveSpendFactor, which
-- has already applied the divisor and records that it did in SpendFactorSource.unit_conversion. The
-- sentence read as a general rule while describing one path, which is exactly the error it would
-- have led a reader into. The replacement states both paths, resolver first.
--
-- ⚠️ NO FIGURE WAS EVER WRONG BECAUSE OF THIS. The text is a note on an edition row; nothing reads
-- it and nothing computes from it. It is being corrected because a verifier may read it, and a
-- stored explanation that would mislead someone reproducing a figure is a defect in its own right
-- even when no figure moved.
--
-- ═══ WHAT IT DOES NOT DO ═════════════════════════════════════════════════════════════════════
--   * NOTHING DESTRUCTIVE. No TRUNCATE, no DROP, no DELETE, no column altered. One UPDATE.
--   * TOUCHES ONLY notes. Not is_active, not superseded_by, not any of the five input
--     fingerprints, not fingerprint_spend_conversions, not id, not created_at, not the licences.
--   * TOUCHES ONLY THE -spendconv ROW. The superseded editions keep their own notes exactly as
--     recorded - correcting a superseded row would destroy the record it exists to preserve.
--   * MOVES NO FINGERPRINT. lib/emissionFactors/spendConversions.json is unchanged at sha256
--     041db80fc43f635124004efbf472b0ad824c9d638fcf1e11cb6e5f0f1de24bc1, and the three migrations
--     pinning that digest stay valid. This corrects prose, not data.
--
-- IDEMPOTENT by construction: it sets an exact value, so re-running writes the same text again.
--
-- ⚠️ THE TEXT BELOW WAS EXTRACTED PROGRAMMATICALLY from the notes literal in
-- 20260916_edition_spendconv.sql, not retyped, so the migration and the database cannot drift in
-- the field this statement exists to reconcile.

update public.factor_editions set
  notes =
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
    'that way applies the divisor and says so.'

where id = 'exiobase-3.8.2-2019-cpi2024-spendconv';


-- ── AFTER RUNNING, VERIFY (read-only, safe to paste) ─────────────────────────────────────────
--
--   -- exactly one row updated, and it is the corrected wording:
--   select id, right(notes, 120) as tail from public.factor_editions
--    where id = 'exiobase-3.8.2-2019-cpi2024-spendconv';
--
--   -- the stale sentence is gone (expect 0):
--   select count(*) from public.factor_editions
--    where notes like '%as its own visible step%';
--
--   -- nothing else moved on that row:
--   select id, is_active, superseded_by, fingerprint_spend_conversions,
--          fingerprint_price_indices
--     from public.factor_editions order by id;
