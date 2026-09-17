#!/usr/bin/env python3
"""
Generate lib/emissionFactors/spendConversions.json - how much 2019 EUR one unit of a customer's
currency represents, per EXIOBASE region, at the price vintage year.

INPUT IS lib/emissionFactors/priceIndices.json AND NOTHING ELSE. The World Bank and DGBAS files are
NOT re-read: this derives from the artefact, so the conversions cannot disagree with the series that
were fingerprinted, and a change upstream shows up as a fingerprint mismatch rather than as two
files that quietly diverged.

    /tmp/exio-venv/bin/python scripts/generate-spend-conversions.py

NO NETWORK ACCESS, no third-party imports beyond the sibling generator's redenomination table.

⚠️ THIS SUPERSEDES EDITION 'exiobase-3.8.2-2019-cpi2024-fxnorm', WHICH HELD THE RECIPROCAL OF THIS.
That edition's generator computed the four-step chain A below and stored A/1e6 as a "multiplier" to
be applied to an emission factor. Its generator and artefact have since been DELETED - a wrong
artefact kept for reference is one somebody eventually regenerates from - so what records it now is
the retained factor_editions row, not a file.

A is the scalar that carries an AMOUNT OF MONEY from 2019 EUR forward to the vintage year in the
customer's currency. An emission factor carries money in its DENOMINATOR - kg per EUR - so
converting a factor onto a new money basis is the INVERSE of carrying an amount forward.
Multiplying by A made every factor LARGER under positive inflation, when a unit of money that buys
less must yield a SMALLER figure. Germany's p28 came out at 0.3067 kg per 2024 EUR where
the honest figure is 0.2147, too high by cpi_ratio squared. The stored scalar is now 1/A.

WHAT IS STORED, AND WHAT IS NOT
-------------------------------
to_eur2019_per_unit = the number of 2019 EUR that ONE unit of the stated currency, at the vintage
year, represents. Germany in EUR is 1/cpi_ratio = 0.8368: one 2024 euro buys what 0.8368 euros
bought in 2019.

⚠️ THE 1e6 IS NOT FOLDED INTO THESE SCALARS, DELIBERATELY. The factor files record kg CO2 eq. per
MILLION EUR, and their denominator_note states that "any consumer must apply the 1e6 itself and say
that it did". Folding it in here would satisfy the arithmetic and defeat the note: the division
would vanish into a scalar nobody could see, and a reader could no longer tell a correctly-
normalised figure from one that had the 1e6 applied twice or not at all. Keeping it out is what
leaves the denominator a separate, named quantity in this artefact.

⚠️ THAT IS A STATEMENT ABOUT THIS ARTEFACT, NOT A GENERAL RULE FOR CONSUMERS. Whether a divisor is
still owed depends on where the factor value came from, and the two cases differ by a factor of a
million:

    resolveSpendFactor()  - SpendFactor.value is ALREADY per ONE unit of currency. That resolver is
                            itself a consumer of the factor files and applies the denominator
                            conversion, recording it in SpendFactorSource.unit_conversion. NOTHING
                            FURTHER IS OWED:

                                kg CO2e = spend * to_eur2019_per_unit * factor.value

    a raw value read straight out of exiobaseFactors2019ixi.json / ...pxp.json - per MILLION EUR,
                            because that is how EXIOBASE publishes it. Whoever reads the file that
                            way applies the divisor and says so:

                                kg CO2e = published_factor * to_eur2019_per_unit / 1e6

Applying the divisor on the resolver path is a millionfold error. See the doc comment on
convertSpendToFactorBasis in lib/emissionFactors/spendAdjustment.ts, whose wording this matches.

⚠️ THE ROUND TRIP IS FOUR STEPS IN THIS ORDER, AND THE ORDER IS LOAD-BEARING.

    step 1   EUR2019       -> LCU2019        / FX_EUR(2019)      * FX_region(2019)
    step 2   LCU2019       -> LCU_vintage    * cpi_ratio(region)
    step 3   LCU_vintage   -> USD_vintage    / FX_region(vintage)
    step 4   USD_vintage   -> CUR_vintage    * FX_currency(vintage)

Every FX figure is LCU PER USD, so a division moves INTO USD and a multiplication moves OUT of it.
Reordering breaks the chain silently, because each step's output is only meaningful as the next
step's input: step 2 inflates a LOCAL-currency amount, so applying the CPI ratio before step 1 would
inflate a euro amount by a local price index - arithmetically fine, dimensionally nonsense, and
wrong by the whole currency spread.

    step 5   INVERT        A -> 1/A

⚠️ STEP 5 IS THE WHOLE POINT OF THIS FILE AND IT IS NAMED RATHER THAN FOLDED IN. Steps 1-4 answer
"how much vintage-year currency equals one 2019 euro". That is a question about an AMOUNT. The
question a spend-based calculation actually asks is the opposite one - "how much 2019 euro is this
customer's vintage-year spend worth" - because the factor is denominated per 2019 euro and the
spend must be brought onto that basis before it can be multiplied. Those two are reciprocals, and
the previous generator answered the first while its docstring described the second. Keeping the
inversion as a separate, named, commented step is what stops that happening again: a reader can see
both quantities and check which one the file stores.

⚠️ THE LEVELS CANCEL, WHICH IS WHY THE COMPOSITES ARE COMPUTABLE AT ALL.
Collecting steps 1-4 into one product:

    A  =  cpi_ratio(region) / fx_ratio(region)  *  FX_currency(vintage) / FX_EUR(2019)

        where fx_ratio(region) = FX_region(vintage) / FX_region(2019)

The region's own FX LEVELS appear only as that ratio. A rest-of-world composite has no single
national currency and therefore no 2019 or vintage level - but priceIndices.json publishes its
GDP-weighted cpi_ratio and fx_ratio, and those are exactly and only what the formula needs. So the
round trip IS computable for a composite from ratios alone, with no proxy rate and no substitution.
For named regions this script computes BOTH forms and asserts they agree.
"""

import hashlib
import importlib.util
import json
import pathlib
import sys
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "lib/emissionFactors/priceIndices.json"
OUT = ROOT / "lib/emissionFactors/spendConversions.json"

EDITION_ID = "exiobase-3.8.2-2019-cpi2024-spendconv"
BASE_YEAR = 2019
OUTPUT_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"]
BUCKETS = {"WA", "WE", "WF", "WL", "WM"}
CURRENCY_SOURCE_REGION = {"USD": "US", "GBP": "GB", "CAD": "CA", "AUD": "AU"}

FINGERPRINTS = {
    "factors_ixi": "8747704c24bb045e87b3c02bc9b952cb69c37ffd2e5e07c5cb2241320f206fdb",
    "factors_pxp": "300565c2a4448605e4b3ec0aa044977ba09b9077bfcfff5bc01ec17a9a29ddc6",
    "sectors": "b393d1ad7d4966cd0ddd7c29379c98b362ab9bed01be7e98afd53226647e3341",
    "country_regions": "e83c3d0388474c36e160572e8db608094d8529e6c3bffaab3444c5229075c9a8",
    "price_indices": "64df489c58c6298c9fe8561289f2185f9bd7f9f1dddda063f16c52c60d23b158",
}

# ── THE EXTERNAL SENSE CHECK ──────────────────────────────────────────────────────────────────
# p28 "Fabricated metal products, except machinery and equipment (28)", region DE, from
# lib/emissionFactors/exiobaseFactors2019pxp.json. Its per-2019-EUR value of 0.256624 was validated
# against Climatiq's published Procurement API figure to 0.0094%, so it is the one number in this
# repo with an independent external corroboration. Hardcoded HERE rather than read from the factor
# file because this is a FIXTURE for an assertion, not an input to a calculation: the point is that
# a specific, externally-confirmed figure must move in a specific direction.
PUBLISHED_P28_DE = 256624.197323          # kg CO2 eq. per MILLION EUR, 2019 basic prices
PUBLISHED_P28_DE_PER_EUR2019 = 0.256624   # the same, per one 2019 EUR, rounded as reported
EXPECTED_P28_DE_2024 = 0.214737           # what it should become per 2024 EUR

_PI_GEN = ROOT / "scripts/generate-price-indices.py"
EURO_TABLE_COMPLETE_FROM = 2010


def die(msg: str) -> None:
    sys.exit(f"ABORT: {msg}")


def _load_redenominations():
    """Euro entry years, imported rather than copied - two tables would eventually disagree."""
    spec = importlib.util.spec_from_file_location("gen_price_indices", _PI_GEN)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)      # safe: that module's work is behind a __main__ guard
    table = getattr(mod, "REDENOMINATIONS", None)
    if not table:
        die(f"{_PI_GEN.name} exposes no non-empty REDENOMINATIONS table")
    return table


ROUND_TRIP_STATEMENT = (
    "Each value is the number of 2019 EUR that one unit of the stated currency represents at the "
    "price vintage year. It is built in five steps. Steps 1-4 carry an AMOUNT of money forward: "
    "(1) a 2019 euro amount is moved to the region's 2019 local currency, dividing by the euro's "
    "2019 USD rate and multiplying by the region's; (2) it is carried from 2019 to the vintage year "
    "by the region's CPI ratio; (3) it is moved to vintage-year USD by dividing by the region's "
    "vintage USD rate; (4) it is moved to the output currency by multiplying by that currency's "
    "vintage USD rate. Step (5) INVERTS the result, because an emission factor carries money in its "
    "DENOMINATOR: bringing a spend onto the factor's 2019 basis is the reciprocal of carrying an "
    "amount of money forward from it. "
    "THE 1e6 IS NOT INCLUDED IN THESE SCALARS. Whether a divisor is still owed depends on where "
    "the factor value came from: a value from resolveSpendFactor is ALREADY per one unit of currency, "
    "because that resolver applies the denominator conversion itself and records it, so nothing "
    "further is owed and applying a divisor there is a millionfold error. A raw value read from "
    "exiobaseFactors2019*.json is per MILLION EUR and that reader applies it: "
    "kg CO2e per unit of currency = published_factor * to_eur2019_per_unit / 1e6. "
    "NO PRICE-BASIS CONVERSION IS PERFORMED: EXIOBASE publishes in basic prices and a customer's "
    "spend is a purchaser-price figure, and the 3.8.2 archive carries no margin data from which the "
    "difference could be derived. These scalars close the currency and price-year gaps only."
)

COMPOSITE_NOTE = (
    "WHAT A COMPOSITE VALUE IS. For the five rest-of-world regions there is no single national "
    "currency and no single CPI, so steps 1 and 3 have no exchange-rate LEVEL to use. What the "
    "formula needs from the region is only the RATIO of its vintage rate to its 2019 rate, and "
    "priceIndices.json publishes a GDP-weighted average of exactly that (fx_ratio), alongside a "
    "GDP-weighted average of the members' CPI ratios (cpi_ratio). Those are used directly. No proxy "
    "rate is substituted and no member stands in for the bucket. "
    "WHAT IT IS NOT: it is not any country's currency path. It is the average price-and-currency "
    "movement of the members that had usable data, weighted by their GDP, so it understates or "
    "overstates any individual member by however far that member diverges from the bucket. "
    "gdp_coverage_pct says how much of the bucket's MEASURABLE GDP stood behind the average; it is "
    "not a share of the bucket, because members with no GDP figure are absent from both sides of "
    "that fraction. A figure priced through a composite must be described as a regional average."
)

INVERSION_NOTE = (
    "SUPERSEDES EDITION exiobase-3.8.2-2019-cpi2024-fxnorm, WHICH HELD THE RECIPROCAL OF THIS "
    "DIVIDED BY 1e6. That edition stored the four-step chain itself - the scalar that carries an "
    "amount of money forward from 2019 - and described it as a multiplier for an emission factor. "
    "Because a factor is denominated per unit of money, applying it that way inflated every figure "
    "instead of deflating it: Germany's p28 read 0.3067 kg per 2024 EUR against an honest 0.2147, "
    "high by cpi_ratio squared, and every one of the 245 rows was affected in both the CPI and the "
    "FX legs. The error never reached a customer figure - nothing in the repo read the artefact or "
    "the table - and it was found by checking the direction of travel against inflation rather than "
    "by any of the three assertions that had passed on the wrong numbers. The directional check "
    "below is that missing test, and it is now the headline one. The superseded generator and "
    "artefact have been DELETED rather than retained, so nothing can be regenerated from them by "
    "mistake; the surviving record is that edition row in public.factor_editions, kept with "
    "is_active false and notes describing the error."
)


def main() -> None:
    if not SRC.exists():
        die(f"input not found: {SRC.relative_to(ROOT)}. Run scripts/generate-price-indices.py first.")
    src = json.loads(SRC.read_text(encoding="utf-8"))
    meta, regions = src["metadata"], src["regions"]

    if meta["fingerprint_sha256"] != FINGERPRINTS["price_indices"]:
        die(
            "priceIndices.json fingerprint does not match the edition this script is pinned to.\n"
            f"       file  : {meta['fingerprint_sha256']}\n"
            f"       pinned: {FINGERPRINTS['price_indices']}\n"
            "       The series changed. That is a NEW edition, so update EDITION_ID and\n"
            "       FINGERPRINTS together - never one without the other."
        )
    vintage = meta["data_vintage"]
    if meta["base_year"] != BASE_YEAR:
        die(f"priceIndices.json base_year is {meta['base_year']}, expected {BASE_YEAR}")

    named = sorted(c for c in regions if regions[c]["kind"] == "country")
    composites = sorted(c for c in regions if regions[c]["kind"] == "row_composite")
    if set(composites) != BUCKETS:
        die(f"composites are {composites}, expected {sorted(BUCKETS)}")
    if len(regions) != 49:
        die(f"{len(regions)} regions in the input, expected 49")

    def rate(code: str, year: int):
        v = regions[code]["fx_lcu_per_usd"].get(str(year))
        if v is None:
            die(f"{code} has no FX rate for {year}; the round trip needs both legs")
        return v

    # ── THE EURO'S USD RATE ───────────────────────────────────────────────────────────────────
    # Only members ALREADY IN THE EURO in the year being checked are compared; a later adopter's
    # earlier rate is a converted national rate that legitimately differs. Entry years come from
    # the price-index generator's table, imported rather than copied.
    if BASE_YEAR < EURO_TABLE_COMPLETE_FROM:
        die(
            f"BASE_YEAR is {BASE_YEAR}, before {EURO_TABLE_COMPLETE_FROM}. The euro-entry table is\n"
            "       known incomplete before then (Slovakia 2009, Cyprus 2008, Greece 2001 omitted\n"
            "       upstream as uncorroborated), so 'absent from the table' can no longer be read\n"
            "       as 'in the euro throughout'."
        )
    redenominations = _load_redenominations()
    euro_members = meta["euro_area_members"]

    def in_euro(iso2: str, year: int) -> bool:
        entry = redenominations.get(iso2)
        return True if entry is None else year >= entry[2]

    euro_rate, euro_cohort = {}, {}
    for year in (BASE_YEAR, vintage):
        cohort = sorted(m for m in euro_members if in_euro(m, year))
        euro_cohort[year] = {
            "in_euro": cohort,
            "not_yet_in_euro": sorted(m for m in euro_members if m not in cohort),
        }
        if not cohort:
            die(f"no euro-area member was in the euro in {year}; there is no rate to establish")
        seen = {}
        for m in cohort:
            seen.setdefault(rate(m, year), []).append(m)
        if len(seen) != 1:
            groups = "\n".join(
                "         {!r}  <- {}".format(v, ", ".join(f"{m} ({regions[m]['country_name']})" for m in ms))
                for v, ms in sorted(seen.items(), key=lambda kv: -len(kv[1]))
            )
            die(
                f"members already in the euro in {year} do not agree on the LCU-per-USD rate.\n"
                f"       {len(seen)} distinct rates among {len(cohort)} members:\n{groups}"
            )
        euro_rate[year] = next(iter(seen))

    fx_eur_base, fx_eur_vintage = euro_rate[BASE_YEAR], euro_rate[vintage]

    fx_currency_vintage = {"EUR": fx_eur_vintage}
    for cur, src_region in CURRENCY_SOURCE_REGION.items():
        if regions[src_region]["currency"] != cur:
            die(f"region {src_region} is labelled {regions[src_region]['currency']}, expected {cur}")
        fx_currency_vintage[cur] = rate(src_region, vintage)

    # ── BUILD ────────────────────────────────────────────────────────────────────────────────
    def amount_chain(fx_region_base, cpi_ratio, fx_region_vintage, fx_cur_vintage):
        """Steps 1-4: how much vintage-year currency equals one 2019 euro. An AMOUNT."""
        step1 = (1.0 / fx_eur_base) * fx_region_base       # EUR2019     -> LCU2019
        step2 = step1 * cpi_ratio                          # LCU2019     -> LCU_vintage
        step3 = step2 / fx_region_vintage                  # LCU_vintage -> USD_vintage
        step4 = step3 * fx_cur_vintage                     # USD_vintage -> CUR_vintage
        return step4

    def invert(a: float) -> float:
        """Step 5. See the docstring: a factor's money is in the denominator, so the scalar that
        brings a spend onto the factor's basis is the reciprocal of the one that carries an amount
        away from it. This is a separate named function so the inversion is visible at every call
        site and in the tests, rather than being a stray reciprocal inside a longer expression."""
        if not a > 0:
            die(f"amount chain produced {a!r}; cannot invert")
        return 1.0 / a

    rows = []
    ratios = {}
    for code in named + composites:
        r = regions[code]
        if r["kind"] == "country":
            cpi = r["cpi"]
            cb, cv = cpi.get(str(BASE_YEAR)), cpi.get(str(vintage))
            if cb is None or cv is None:
                die(f"{code} lacks CPI for {BASE_YEAR} or {vintage}")
            cpi_ratio = cv / cb
            fb, fv = rate(code, BASE_YEAR), rate(code, vintage)
            fx_ratio = fv / fb
        else:
            cpi_ratio, fx_ratio = r["cpi_ratio"], r["fx_ratio"]
            if cpi_ratio is None or fx_ratio is None:
                die(f"composite {code} has cpi_ratio={cpi_ratio!r} fx_ratio={fx_ratio!r}")
            fb = fv = None
        ratios[code] = (cpi_ratio, fx_ratio)

        for cur in OUTPUT_CURRENCIES:
            collected = cpi_ratio / fx_ratio * fx_currency_vintage[cur] / fx_eur_base
            if r["kind"] == "country":
                stepwise = amount_chain(fb, cpi_ratio, fv, fx_currency_vintage[cur])
                if abs(stepwise - collected) > abs(stepwise) * 1e-12:
                    die(f"{code}/{cur}: step form {stepwise!r} != collected form {collected!r}")
                a = stepwise
            else:
                a = collected
            rows.append({
                "region_code": code,
                "currency": cur,
                "to_eur2019_per_unit": invert(a),
                "basis": "published" if r["kind"] == "country" else "row_composite",
                "gdp_coverage_pct": None if r["kind"] == "country" else r["gdp_coverage_pct"],
            })

    # ── ASSERTS ──────────────────────────────────────────────────────────────────────────────
    expected = len(regions) * len(OUTPUT_CURRENCIES)
    if len(rows) != expected or expected != 245:
        die(f"{len(rows)} rows, expected {expected} and 245")
    for row in rows:
        if not row["to_eur2019_per_unit"] > 0:
            die(f"{row['region_code']}/{row['currency']} is {row['to_eur2019_per_unit']!r}, must be > 0")

    # ⚠️ THE HEADLINE CHECK: DIRECTION OF TRAVEL AGAINST INFLATION.
    # Positive inflation means a vintage unit of money buys LESS than a 2019 unit, so the number of
    # 2019 EUR it represents must FALL. Tested by re-running the chain with the CPI leg neutralised
    # and requiring the real value to sit below it. Expressed this way rather than as a bare
    # "< 1" because a bare threshold conflates inflation with currency magnitude - one yen is a
    # small number of euros however stable Japanese prices are - and because it is well defined for
    # composites, which have no own currency at all.
    # THIS IS THE CHECK WHOSE ABSENCE LET THE INVERSION SHIP. Under the previous generator every
    # one of these comparisons ran the other way, while the row count, the bounds band and the EUR
    # self-check all passed.
    violations = []
    for row in rows:
        code, cur = row["region_code"], row["currency"]
        cpi_ratio, fx_ratio = ratios[code]
        neutral = invert(1.0 / fx_ratio * fx_currency_vintage[cur] / fx_eur_base)  # same chain, cpi_ratio = 1
        real = row["to_eur2019_per_unit"]
        if cpi_ratio > 1 and not real < neutral:
            violations.append((code, cur, cpi_ratio, real, neutral, "inflation must LOWER the value"))
        if cpi_ratio < 1 and not real > neutral:
            violations.append((code, cur, cpi_ratio, real, neutral, "deflation must RAISE the value"))
    if violations:
        lines = "\n".join(
            f"         {c}/{u}  cpi_ratio {cr:.6f}  value {v:.9f}  vs cpi-neutral {n:.9f}   {why}"
            for c, u, cr, v, n, why in violations[:20]
        )
        die(
            f"DIRECTIONAL CHECK FAILED on {len(violations)} of {len(rows)} rows.\n"
            "       The value moved the WRONG WAY against inflation. A vintage unit of money that\n"
            "       buys less must represent FEWER 2019 euro, not more. This is the signature of an\n"
            "       inverted CPI leg - the exact defect this file was written to correct.\n"
            f"{lines}"
        )
    inflating = sum(1 for c in ratios if ratios[c][0] > 1)

    # EUR SELF-CHECK, restated for the new direction. For a euro-area region priced in EUR at the
    # vintage, both FX legs are the same currency in the same two years and cancel, so what survives
    # is the reciprocal of the CPI ratio alone.
    probe = euro_cohort[BASE_YEAR]["in_euro"][0]
    pc = regions[probe]["cpi"]
    probe_cpi_ratio = pc[str(vintage)] / pc[str(BASE_YEAR)]
    expect_eur = 1.0 / probe_cpi_ratio
    got_eur = next(r["to_eur2019_per_unit"] for r in rows
                   if r["region_code"] == probe and r["currency"] == "EUR")
    eur_delta = abs(got_eur - expect_eur)
    if eur_delta > 1e-12:
        die(f"EUR self-check failed for {probe}: {got_eur!r} != 1/cpi_ratio {expect_eur!r}")

    # EXTERNAL SENSE CHECK. The one figure with independent corroboration must fall.
    de_eur = next(r["to_eur2019_per_unit"] for r in rows
                  if r["region_code"] == "DE" and r["currency"] == "EUR")
    de_2024 = PUBLISHED_P28_DE * de_eur / 1e6
    if not de_2024 < PUBLISHED_P28_DE_PER_EUR2019:
        die(
            f"external sense check failed: p28 DE is {de_2024!r} kg per {vintage} EUR, which is NOT\n"
            f"       less than the published {PUBLISHED_P28_DE_PER_EUR2019} kg per {BASE_YEAR} EUR.\n"
            "       German prices rose between those years, so the figure must fall."
        )

    # ── WRITE ────────────────────────────────────────────────────────────────────────────────
    payload_rows = json.dumps({"rows": rows}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    digest = hashlib.sha256(payload_rows.encode("utf-8")).hexdigest()

    payload = {
        "metadata": {
            "edition_id": EDITION_ID,
            "data_vintage": vintage,
            "base_year": BASE_YEAR,
            "output_currencies": OUTPUT_CURRENCIES,
            "generated_on": date.today().isoformat(),
            "generated_from": [SRC.name],
            "generated_by": "scripts/generate-spend-conversions.py",
            "supersedes": (
                "edition exiobase-3.8.2-2019-cpi2024-fxnorm, whose generator and artefact were deleted; "
                "the surviving record of it is that row in public.factor_editions"
            ),
            "upstream_fingerprints": FINGERPRINTS,
            "field_meaning": (
                "to_eur2019_per_unit: the number of 2019 EUR that ONE unit of the stated currency, "
                "at the vintage year, represents. Multiply a spend by it to bring that spend onto "
                "the basis the published EXIOBASE factors are denominated in."
            ),
            "round_trip": ROUND_TRIP_STATEMENT,
            "denominator_note": (
                "THE 1e6 IS NOT INCLUDED IN THESE VALUES. The published factor files record kg CO2 "
                "eq. per MILLION EUR and their own denominator_note requires every consumer to "
                "apply that divisor itself and say that it did. Folding it in here would hide the "
                "step inside a scalar, so the denominator stays a separate named quantity in this "
                "artefact. "
                "THAT IS A STATEMENT ABOUT THIS ARTEFACT, NOT A GENERAL RULE FOR CONSUMERS, and the "
                "two paths differ by a factor of a million. A value from resolveSpendFactor is "
                "ALREADY per one unit of currency - that resolver is itself a consumer of the "
                "factor files, applies the denominator conversion and records it in "
                "SpendFactorSource.unit_conversion - so nothing further is owed and applying a "
                "divisor there is a millionfold error: kg CO2e = spend * to_eur2019_per_unit * "
                "factor.value. A raw value read straight from exiobaseFactors2019ixi.json or "
                "...pxp.json is per MILLION EUR, and whoever reads it that way applies the divisor "
                "and says so: kg CO2e per unit of currency = published_factor * "
                "to_eur2019_per_unit / 1e6."
            ),
            "inversion_note": INVERSION_NOTE,
            "directional_check": (
                "Every row is asserted to move the right way against inflation: where a region's "
                "cpi_ratio exceeds 1, its value must be lower than the same chain computed with the "
                "CPI leg neutralised, because a vintage unit of money that buys less represents "
                "fewer 2019 euro. This is the check whose absence allowed the superseded artefact "
                "to ship inverted."
            ),
            "euro_rate_basis": (
                f"No EMU aggregate row exists in the input. The euro's USD rate is taken from the "
                f"members already IN the euro in the year checked, after asserting unanimity. "
                f"{BASE_YEAR}: {fx_eur_base} from {len(euro_cohort[BASE_YEAR]['in_euro'])} members"
                + (f" (excluded, not yet in the euro: {', '.join(euro_cohort[BASE_YEAR]['not_yet_in_euro'])})"
                   if euro_cohort[BASE_YEAR]["not_yet_in_euro"] else "")
                + f"; {vintage}: {fx_eur_vintage} from {len(euro_cohort[vintage]['in_euro'])} members."
            ),
            "euro_cohorts": {str(y): euro_cohort[y] for y in (BASE_YEAR, vintage)},
            "composite_note": COMPOSITE_NOTE,
            "price_basis_note": (
                "NO BASIC-TO-PURCHASER CONVERSION IS APPLIED. EXIOBASE 3.8.2 publishes in current "
                "basic prices; customer spend is a purchaser-price figure off an invoice. The "
                "3.8.2 archive carries no margin data from which the difference could be derived. "
                "These scalars close the currency and price-year gaps and leave the basis gap open."
            ),
            "external_sense_check": (
                f"p28 (Fabricated metal products, except machinery and equipment), region DE: the "
                f"published {PUBLISHED_P28_DE} kg per million 2019 EUR becomes {de_2024!r} kg per "
                f"one {vintage} EUR, below the published {PUBLISHED_P28_DE_PER_EUR2019} per 2019 "
                f"EUR as positive inflation requires. That published value is corroborated against "
                f"Climatiq's Procurement API figure to 0.0094%."
            ),
            "fingerprint_sha256": digest,
        },
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # ── PRINT ────────────────────────────────────────────────────────────────────────────────
    print(f"wrote {OUT.relative_to(ROOT)}")
    print("  supersedes edition exiobase-3.8.2-2019-cpi2024-fxnorm (held the reciprocal / 1e6)")
    print()
    print(f"edition: {EDITION_ID}   vintage: {vintage}   base: {BASE_YEAR}")
    print(f"ROWS: {len(rows)}  ({len(regions)} regions x {len(OUTPUT_CURRENCIES)} currencies)")
    print()
    print("DIRECTIONAL CHECK  [headline]")
    print(f"  regions with cpi_ratio > 1: {inflating} of {len(regions)}")
    print(f"  rows moving the wrong way against inflation: {len(violations)}  -> PASS")
    print("  (this is the check the superseded generator did not have)")
    print()
    print("EUR SELF-CHECK  [restated for the new direction]")
    print(f"  {probe} priced in EUR at {vintage}: both FX legs cancel, leaving 1/cpi_ratio")
    print(f"    computed      : {got_eur!r}")
    print(f"    1 / cpi_ratio : {expect_eur!r}")
    print(f"    delta {eur_delta:.3e}   tolerance 1e-12   PASS")
    print()
    print("EXTERNAL SENSE CHECK  [p28 Germany, the externally-corroborated figure]")
    print(f"  {PUBLISHED_P28_DE} * {de_eur!r} / 1e6")
    print(f"    = {de_2024!r} kg per {vintage} EUR")
    print(f"    published      : {PUBLISHED_P28_DE_PER_EUR2019} kg per {BASE_YEAR} EUR")
    print(f"    expected near  : {EXPECTED_P28_DE_2024}")
    print(f"    LESS than published: {de_2024 < PUBLISHED_P28_DE_PER_EUR2019}   PASS")
    print()
    print("MIN / MAX PER CURRENCY")
    for cur in OUTPUT_CURRENCIES:
        vals = [(r["to_eur2019_per_unit"], r["region_code"]) for r in rows if r["currency"] == cur]
        lo, hi = min(vals), max(vals)
        print(f"  {cur}: min {lo[0]:.9f} ({lo[1]})   max {hi[0]:.9f} ({hi[1]})   spread {hi[0]/lo[0]:.2f}x")
    print()
    print("COMPOSITES (EUR shown)")
    for b in sorted(BUCKETS):
        row = next(r for r in rows if r["region_code"] == b and r["currency"] == "EUR")
        print(f"  {b}: {row['to_eur2019_per_unit']:.9f}   cpi_ratio {ratios[b][0]:.4f}  "
              f"fx_ratio {ratios[b][1]:.4f}  gdp_coverage {row['gdp_coverage_pct']}%")
    print()
    print(f"payload sha256: {digest}")


if __name__ == "__main__":
    main()
