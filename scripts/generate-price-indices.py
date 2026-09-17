#!/usr/bin/env python3
"""
Generate lib/emissionFactors/priceIndices.json - CPI and FX series per EXIOBASE 3 region.

SERIES ONLY. THIS SCRIPT COMPUTES NO FACTOR ADJUSTMENT AND CONVERTS NO CURRENCY.
It emits the inputs a deflation or FX step would need and stops there. Nothing here multiplies an
EXIOBASE factor, divides one, or rebases one. lib/emissionFactors/spendAdjustment.ts is where a
deflation is applied, against a caller-supplied index and against the SPEND rather than the factor;
this file is a candidate source for that index, not the application of it.

WHY A GENERATOR
---------------
Two of the three World Bank files are 265 x 66 grids of numbers nobody can eyeball, and the
composite ratios for the five rest-of-world buckets are GDP-weighted averages over up to 52 members
each. A hand-maintained copy would drift silently, and the drift would surface as a deflator that
is wrong by a few per cent - which is invisible in a report and wrong in a disclosure.

REQUIRES pycountry and babel, neither of which is a project dependency and neither of which may be
added to package.json. Install in a throwaway virtualenv:

    python3 -m venv /tmp/exio-venv
    /tmp/exio-venv/bin/pip install pycountry babel
    /tmp/exio-venv/bin/python scripts/generate-price-indices.py

Tests (stdlib unittest, no pytest):

    /tmp/exio-venv/bin/python scripts/generate-price-indices.test.py

NO NETWORK ACCESS. Every input is a file on disk; pycountry and babel ship their tables inside the
package. Nothing is fetched.

⚠️ THE COMPOSITES WEIGHT RATIOS, NEVER LEVELS, AND THAT IS NOT A STYLE CHOICE.
A CPI level is meaningless across countries: the World Bank series are indexed to 2010 = 100 and
Taiwan's DGBAS series to 2021 = 100, so "120" means one thing in one row and another in the next.
An FX level is worse - it is denominated in a different currency per row, so averaging JPY-per-USD
with EUR-per-USD produces a number with no unit at all. A RATIO of two years of the same series is
dimensionless and base-independent: CPI(end)/CPI(2019) is the same number whatever the base year,
and FX(end)/FX(2019) is the same whatever the currency. Only the ratios may be averaged. Anything
that averages the levels is wrong in a way the arithmetic will not reveal.

END YEAR IS DERIVED, NOT HARDCODED. See END_YEAR_MIN_COVERAGE below.

⚠️ TWO KINDS OF MISSING MEMBER, AND CONFLATING THEM FLATTERS THE COVERAGE FIGURE.
A member with GDP but no CPI stays in the denominator of gdp_coverage_pct and drops out of the
numerator, so it REDUCES coverage - that is the gap the figure is meant to show. A member with no
GDP at all drops out of BOTH, so it cannot move the figure in either direction no matter how large
its economy is. Reporting them in one list made WM read 100.0% while Syria and Yemen were missing
entirely. They are now two fields, and gdp_coverage_pct is explicitly a share of MEASURABLE GDP
rather than of the bucket. The unmeasured members are the part the percentage cannot see.

STRUCTURE: the pure helpers sit at module level and the work is inside main(), so the test file can
import this module without running a generation.
"""

import csv
import datetime
import hashlib
import json
import os
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
HOME = pathlib.Path(os.path.expanduser("~"))

CPI_CSV = HOME / "Downloads/API_FP/API_FP.CPI.TOTL_DS2_en_csv_v2_329222.csv"
FX_CSV = HOME / "Downloads/API_PA/API_PA.NUS.FCRF_DS2_en_csv_v2_372594.csv"
GDP_CSV = HOME / "Downloads/API_NY/API_NY.GDP.MKTP.CD_DS2_en_csv_v2_372592.csv"
TW_FXGDP = ROOT / "data/reference/dgbas-taiwan-fx-gdp-E018101010.xlsx"
TW_CPI = ROOT / "data/reference/dgbas-taiwan-cpi-E030101015.xlsx"
COUNTRY_REGIONS = ROOT / "lib/emissionFactors/countryRegions.json"
REFERENCE_49 = ROOT / "lib/emissionFactors/exiobaseFactors2019ixi.json"
OUT = ROOT / "lib/emissionFactors/priceIndices.json"

BASE_YEAR = 2019
END_YEAR_MIN_COVERAGE = 0.80   # the latest year meeting this, over the 212, is the end year
WB_CPI_BASE_YEAR = 2010        # "Consumer price index (2010 = 100)"
TW_CPI_BASE_YEAR = 2021        # DGBAS: "Indices Base Period:2021"
BUCKETS = ["WA", "WE", "WF", "WL", "WM"]

CPI_NULL_REASON = "not published in the source file for this year"
FX_NULL_REASON = "official exchange rate not published in the source file for this year"

GDP_COVERAGE_NOTE = (
    "Share of MEASURABLE GDP, not of the bucket. The denominator counts only members with a GDP "
    "figure for 2025 or 2024; members in unmeasured_no_gdp are absent from both the numerator and "
    "the denominator and cannot move this number in either direction, however large their economy. "
    "Read it together with members_unmeasured: 100.0% means every member we can measure is "
    "covered, not that every member is."
)

# ── WL BIAS NOTE — A CONSTANT, NOT A COMPUTED STRING ──────────────────────────────────────────
# Written by hand and stored verbatim because it is a JUDGEMENT about what the coverage figure
# fails to convey, not a restatement of it. A computed sentence could say "69.7% covered"; it could
# not say that the missing third is systematically the high-inflation third, which is the part a
# reader needs. Recomputing this from the data would lose exactly the claim worth making.
WL_BIAS_NOTE = (
    "DIRECTIONAL BIAS, NOT JUST A GAP. Argentina is 22.0% of this bucket's GDP and the World Bank "
    "publishes no CPI for it in ANY year from 2015 to 2025 - the series is empty, not sparse. "
    "Venezuela and Puerto Rico are likewise absent across the window. All three are among the "
    "region's highest-inflation economies, so their exclusion does not merely shrink the sample: it "
    "removes the upper tail and biases this composite's cpi_ratio DOWNWARD. The composite therefore "
    "understates Latin American price change by an amount that cannot be quantified from these "
    "files. Do not present it as a regional average without saying so."
)

# ── LICENCES ──────────────────────────────────────────────────────────────────────────────────
#
# ⚠️ TWO PUBLISHERS, TWO LICENCES, AND THE ARTEFACT IS UNDER NEITHER ON ITS OWN. Both require
# attribution, so a published figure derived from this file must credit both. Recorded per source
# rather than as one blanket string, because the terms are not the same and the exclusions are not
# the same.
#
# ⚠️ THE WORLD BANK LICENCE IS BETTER EVIDENCED FOR GDP THAN FOR CPI AND FX, AND THE DIFFERENCE IS
# WORTH KNOWING BEFORE ANYTHING IS REPUBLISHED. The source_organization strings below say it
# plainly: FP.CPI.TOTL and PA.NUS.FCRF name the IMF's International Financial Statistics database
# alone, so what the Bank distributes there is REDISTRIBUTED IMF material, and the Bank's own Open
# Data terms are the terms of the redistributor rather than of the originating publisher.
# NY.GDP.MKTP.CD names World Bank staff estimates alongside national statistics and the OECD, so
# the Bank is a producer there and its default licence sits on firmer ground. No per-indicator
# licence field exists in the downloaded files to settle the question either way - see
# WB_LICENCE_BASIS. If CPI or FX is ever republished rather than used internally, check the IMF's
# own terms rather than relying on this.
WB_LICENCE = (
    "CC BY 4.0 (World Bank Open Data default), with the World Bank's additional mandatory "
    "dispute-resolution terms: non-binding mediation, then UNCITRAL arbitration if unsettled after "
    "45 days, seated at the licensor's headquarters."
)
WB_LICENCE_URL = "https://datacatalog.worldbank.org/public-licenses"
WB_LICENCE_BASIS = (
    "Applies as the World Bank Open Data default. The downloaded Metadata_Indicator files carry no "
    "per-indicator licence field, so no explicit per-series label was available to verify. "
    "Verified 16 Sep 2026."
)

# SOURCE_ORGANIZATION column of the Metadata_Indicator files, VERBATIM - embedded newlines included.
# The GDP string is published across three lines and is kept that way: reflowing it to one line
# would be a silent edit to a transcribed field, and the whole point of the field is that a reader
# can match it against the publisher's file character for character.
SOURCE_ORG_IMF_IFS = "International Financial Statistics database, International Monetary Fund (IMF)"
SOURCE_ORG_GDP = (
    "Country official statistics, National Statistical Organizations and/or Central Banks;\n"
    "National Accounts data files, Organisation for Economic Co-operation and Development (OECD);\n"
    "Staff estimates, World Bank (WB)"
)

DGBAS_LICENCE = (
    "Open Government Data License, Taiwan, version 1.0 (OGDL-Taiwan-1.0). Perpetual, worldwide, "
    "irrevocable, sublicensable, free of charge. Permits reproduction, adaptation, compilation, "
    "public transmission and derivative products and services. Attribution required."
)
DGBAS_LICENCE_EXCLUSIONS = (
    "Covers copyright only; does not grant patent, trademark or entity logo rights. Works by named "
    "authors marked as requiring additional approval are outside its scope. The licence does not "
    "permit representing DGBAS as recommending, permitting or approving derivative works."
)

# The top-level summary. It describes the COMBINATION; the per-source entries carry the terms.
#
# ⚠️ SUPPLIED WORDING, NOT DRAFTED HERE. This paragraph is a statement about licence obligations,
# so it is recorded as given rather than paraphrased. Two of its claims are the ones a future
# reader is most likely to get wrong on their own: no licensor has reviewed the DERIVED values -
# the composites are ours, not theirs - and the ShareAlike obligation that arrives with EXIOBASE
# attaches to the COMBINATION downstream, not to this file, so this file is not itself
# ShareAlike-encumbered. Do not reword either without the same care.
ARTEFACT_LICENCE = (
    "This artefact combines sources under two licences. The World Bank series (CPI, exchange rate, "
    "GDP) are under the World Bank Open Data default CC BY 4.0 with the World Bank's additional "
    "mandatory dispute-resolution terms. The Taiwan series (CPI, exchange rate, GDP) are under the "
    "Open Government Data License, Taiwan, version 1.0. Both require attribution. Neither is "
    "share-alike and neither restricts commercial use. No licensor endorses or has reviewed the "
    "derived values in this file. Note that this artefact is combined downstream with EXIOBASE "
    "data under CC BY-SA 4.0, which is share-alike; that obligation attaches to the combination, "
    "not to this file."
)

# ── REDENOMINATIONS ───────────────────────────────────────────────────────────────────────────
#
# ⚠️ THE WORLD BANK FX SERIES IS DENOMINATED IN WHATEVER CURRENCY WAS IN FORCE THAT YEAR, AND
# NOTHING IN THE FILE MARKS THE CHANGEOVER. PA.NUS.FCRF is "local currency units per US$", and
# "local currency unit" silently means kuna in 2019 and euro in 2024 for the same Croatian row. A
# consumer taking the ratio of two such years measures the REDENOMINATION, not a price movement:
# Croatia's raw 2019/2024 legs imply a 7.4x move that is really the 7.53450 conversion factor. Read
# as an exchange-rate change it is wrong by that whole factor, and nothing in the arithmetic shows
# it. Every series is therefore normalised to ONE denomination - the currency in force at the
# vintage year - before any ratio is taken.
#
# ⚠️ RATES ARE RECORDED ONLY WHERE THIS REPO'S OWN DATA CORROBORATES THEM. Each rate below was
# checked offline against the World Bank FX file itself: for the three years before adoption, the
# country's LCU-per-USD divided by the euro's LCU-per-USD gives an implied LCU-per-EUR, which for a
# pegged or ERM II currency must sit on the official conversion rate. The measured deviation is
# recorded per row. Three entrants are DELIBERATELY OMITTED because that check did not corroborate
# them - see OMITTED_REDENOMINATIONS.
#
# ⚠️ NO COUNCIL REGULATION NUMBERS ARE CITED, DELIBERATELY. Each of these rates was fixed by a
# Council of the European Union regulation, but those instruments were not read from this machine
# and a regulation number typed from memory is an unverified legal citation in a field a verifier
# may rely on. The provenance recorded is what was actually done: the rate, and the corroboration
# against this repo's data. Add the citations after reading the Official Journal, not before.
REDENOMINATIONS = {
    # iso2: (from, to, effective_year, rate_lcu_per_new, corroboration)
    # ACTIVE at vintage 2024 - the break falls INSIDE the 2019..2024 window:
    "HR": ("HRK", "EUR", 2023, 7.53450,
           "implied HRK/EUR from WB data 2020-2022: 7.55455, 7.52233, 7.53956; max deviation 0.266%"),
    # INERT at vintage 2024 - the break is before the base year, so no value in the current window
    # is converted. They are recorded because THE WINDOW MOVES: base year 2019 is a constant in this
    # file, and the day it is moved back these become live. A table that only holds the currently
    # relevant row teaches the next reader that the others do not exist.
    "LT": ("LTL", "EUR", 2015, 3.45280,
           "implied LTL/EUR from WB data 2012-2014: 3.45132, 3.45445, 3.45449; max deviation 0.049%"),
    "LV": ("LVL", "EUR", 2014, 0.702804,
           "implied LVL/EUR from WB data 2011-2013: 0.69769, 0.70262, 0.70309; max deviation 0.727%"),
    "EE": ("EEK", "EUR", 2011, 15.6466,
           "implied EEK/EUR from WB data 2008-2010: 15.72891, 15.70167, 15.65254; max deviation 0.526%"),
    "MT": ("MTL", "EUR", 2008, 0.429300,
           "implied MTL/EUR from WB data 2005-2007: 0.43018, 0.42803, 0.42714; max deviation 0.502%"),
    "SI": ("SIT", "EUR", 2007, 239.640,
           "implied SIT/EUR from WB data 2004-2006: 239.30333, 239.74300, 239.85486; max deviation 0.140%"),
    # FUTURE - Bulgaria adopts the euro on 1 January 2026. Inert at vintage 2024, because the lev is
    # still the currency in force across the whole window. It is here so that the day the vintage
    # advances past 2025 the break is handled rather than discovered.
    # ⚠️ AND BECAUSE THE CONTINUITY CHECK BELOW CANNOT CATCH IT: 1.95583 is inside the band of
    # ordinary exchange-rate movement, so a Bulgarian break would produce no flag at all. This row,
    # not the assertion, is what protects against it.
    "BG": ("BGN", "EUR", 2026, 1.95583,
           "implied BGN/EUR from WB data 2023-2025: 1.95598, 1.95677, 1.96074; max deviation 0.251%"),
}

# Checked and NOT recorded, because the corroboration above did not hold to within 1%. Each of these
# currencies was floating or appreciating into adoption, so the annual-average data cannot pin the
# rate, and a rate that cannot be corroborated is not typed here. All three break far outside any
# plausible window for a 2019-base file, so omitting them costs nothing operationally today.
OMITTED_REDENOMINATIONS = {
    "SK": "SKK -> EUR 2009. Implied SKK/EUR 2006-2008: 37.28783, 33.84304, 31.41742 - a 23.8% "
          "spread against the rate that would have been recorded. The koruna appreciated sharply "
          "into adoption and the rate was fixed mid-2008, so annual averages cannot corroborate it.",
    "CY": "CYP -> EUR 2008. Implied CYP/EUR 2005-2007: 0.57735, 0.57621, 0.58399 - 1.548% deviation.",
    "GR": "GRD -> EUR 2001. Implied GRD/EUR 1999-2000: 325.75095, 337.48670 - 4.402% deviation.",
}
# The 1999 cohort (AT, BE, DE, ES, FI, FR, IE, IT, LU, NL, PT) is not tabulated at all. Their breaks
# are two decades before any window this file could plausibly use, and the same corroboration
# problem applies to pre-1999 annual averages.

# Flagged by the continuity check and CLASSIFIED AS GENUINE CURRENCY MOVEMENTS, not redenominations.
# ⚠️ THIS LIST IS THE HUMAN HALF OF THE CHECK AND IT CANNOT BE DERIVED. A redenomination and a
# devaluation look identical in an FX series - both are a large, permanent, discontinuous jump - so
# nothing in the data separates them. Each entry below was looked at and classified. An unlisted,
# unexplained jump ABORTS, which is what makes the check worth having: a new break cannot pass.
REVIEWED_DISCONTINUITIES = {
    ("AR", 2023, 2024): "Argentine peso devaluation following the December 2023 policy change. Unit unchanged.",
    ("LB", 2022, 2023): "Lebanese pound: the official peg was abandoned/reset. Unit unchanged.",
    ("LB", 2023, 2024): "Lebanese pound, continued repricing of the official rate. Unit unchanged.",
    ("LY", 2020, 2021): "Libyan dinar devaluation, January 2021. Unit unchanged.",
    ("SD", 2020, 2021): "Sudanese pound devaluation/managed-float reform, February 2021. Unit unchanged.",
    ("ZW", 2021, 2022): "Zimbabwe dollar depreciation. Unit unchanged in this series.",
    ("ZW", 2022, 2023): "Zimbabwe dollar depreciation. Unit unchanged in this series.",
}

# A year-on-year move by more than this factor, in either direction, is flagged for classification.
FX_JUMP_FACTOR = 3.0

# Kosovo: the World Bank publishes it under XKX, which is not an ISO 3166-1 assignment. Recorded as
# a RESOLUTION rather than a lookup so the record says a person decided this.
KOSOVO_WB_CODE = "XKX"

EXPECTED_EURO = {"AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
                 "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"}


def die(msg: str) -> None:
    sys.exit(f"ABORT: {msg}")


try:
    import pycountry
    from babel.numbers import get_territory_currencies
    import babel
except ImportError:
    die("pycountry and/or babel not importable. See the module docstring for the venv invocation.")


# ── READERS ───────────────────────────────────────────────────────────────────────────────────

def read_wb(path: pathlib.Path) -> dict:
    """World Bank WDI bulk CSV: 4 metadata lines, header on line 5, year columns from 1960."""
    if not path.exists():
        die(f"input not found: {path}")
    rows = list(csv.reader(open(path, encoding="utf-8-sig")))
    if len(rows) < 6:
        die(f"{path.name}: fewer than 6 lines; not a WDI bulk export")
    header = rows[4]
    if header[:2] != ["Country Name", "Country Code"]:
        die(f"{path.name}: header row 5 starts {header[:2]}, expected Country Name/Country Code")
    year_idx = {int(y): i for i, y in enumerate(header) if y.isdigit()}
    out = {}
    for r in rows[5:]:
        if len(r) < 5:
            continue
        vals = {}
        for y, i in year_idx.items():
            if i < len(r) and r[i].strip() != "":
                try:
                    vals[y] = float(r[i])
                except ValueError:
                    pass
        out[r[1].strip()] = {"name": r[0].strip(), "values": vals}
    return out


def read_wb_updated(path: pathlib.Path) -> str:
    for r in csv.reader(open(path, encoding="utf-8-sig")):
        if r and r[0] == "Last Updated Date":
            return r[1]
    return "unknown"


_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def read_xlsx_rows(path: pathlib.Path) -> list:
    """Minimal xlsx reader.

    ⚠️ NOT openpyxl, and not by preference. openpyxl 3.1.5 - the newest release supporting this
    Python - raises `TypeError: __init__() got an unexpected keyword argument 'xxid'` on both DGBAS
    workbooks: their stylesheet carries an attribute the library does not model. The styles are
    irrelevant to us, so the sheet XML is read directly rather than routing around a parser that
    aborts on formatting we never look at.
    """
    if not path.exists():
        die(f"input not found: {path}")
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall(f"{_NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{_NS}t")))
    sheets = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
    if not sheets:
        die(f"{path.name}: no worksheets")
    rows = []
    for row in ET.fromstring(z.read(sheets[0])).iter(f"{_NS}row"):
        vals = []
        for c in row.findall(f"{_NS}c"):
            t, v = c.get("t"), c.find(f"{_NS}v")
            if t == "s" and v is not None:
                vals.append(shared[int(v.text)])
            elif t == "inlineStr":
                vals.append("".join(x.text or "" for x in c.iter(f"{_NS}t")))
            elif v is not None:
                vals.append(v.text)
            else:
                vals.append("")
        rows.append(vals)
    return rows


def dgbas_series(rows: list, col: int, label: str) -> dict:
    """Pull {year: float} from a DGBAS 'Principal Figures' sheet, whose first column is the period."""
    out = {}
    for r in rows:
        if not r:
            continue
        head = str(r[0]).strip()
        if re.fullmatch(r"\d{4}", head) and col < len(r):
            cell = str(r[col]).strip()
            if cell:
                try:
                    out[int(head)] = float(cell)
                except ValueError:
                    pass
    if not out:
        die(f"DGBAS: no yearly rows found for {label} in column {col}")
    return out


def assert_col(rows, col, must_contain, label):
    for r in rows:
        if r and str(r[0]).strip() == "Period":
            got = str(r[col]) if col < len(r) else ""
            if must_contain.lower() not in got.lower():
                die(f"DGBAS {label}: column {col} header is {got!r}, expected to contain {must_contain!r}")
            return
    die(f"DGBAS {label}: no 'Period' header row")


def wb_code(iso2: str):
    """ISO alpha-2 -> the code the World Bank files key on, and how it was arrived at."""
    if iso2 == "XK":
        return KOSOVO_WB_CODE, "resolution"
    c = pycountry.countries.get(alpha_2=iso2)
    return (c.alpha_3, "lookup") if c else (None, None)


# ── SERIES ASSEMBLY — PURE, AND TESTED ────────────────────────────────────────────────────────

def series_with_nulls(region_code: str, cpi_src: dict, fx_src: dict, years: list):
    """Lay a source series over the full year span, emitting null plus a reason for every gap.

    ⚠️ A MISSING YEAR MUST BECOME AN EXPLICIT null WITH A STATED REASON, NEVER A CARRIED-FORWARD
    VALUE AND NEVER A SHORTER SERIES. Carrying a rate forward invents an observation the publisher
    did not make; a short series lets a consumer read the wrong year off the end without noticing.
    Russia is the live case - the World Bank has no 2025 official exchange rate for it - and this
    path must already be right on the day the vintage advances to a year that contains such a gap.

    Returns (cpi, fx, nulls) where cpi/fx are {str(year): float|None} and nulls is a list of
    (region_code, field, year, reason) tuples.
    """
    cpi, fx, nulls = {}, {}, []
    for y in years:
        k = str(y)
        cpi[k] = cpi_src.get(y)
        fx[k] = fx_src.get(y)
        if cpi[k] is None:
            nulls.append((region_code, "cpi", y, CPI_NULL_REASON))
        if fx[k] is None:
            nulls.append((region_code, "fx", y, FX_NULL_REASON))
    return cpi, fx, nulls


def normalise_fx(iso2: str, fx_src: dict, vintage: int):
    """Put an FX series on ONE denomination: the currency in force at the vintage year.

    A World Bank FX row carries whatever currency was legal tender each year, so a series spanning a
    changeover mixes units. Values in years BEFORE the effective year are divided by the official
    conversion rate, turning old-currency-per-USD into new-currency-per-USD. Values from the
    effective year onward are already in the new currency and are untouched.

    Returns (series, provenance). provenance is None when nothing was converted.
    """
    entry = REDENOMINATIONS.get(iso2)
    if entry is None:
        return dict(fx_src), None
    old_cur, new_cur, effective, rate, corroboration = entry

    # A break at or after the vintage year has not happened inside the window: the whole series is
    # still in the OLD currency, which is already one denomination. Nothing to do. Bulgaria at
    # vintage 2024 is this case.
    if effective > vintage:
        return dict(fx_src), None

    converted = {y: v for y, v in fx_src.items() if y < effective}
    if not converted:
        return dict(fx_src), None      # break precedes every year we hold; already uniform

    out = {y: (v / rate if y < effective else v) for y, v in fx_src.items()}
    return out, {
        "original_currency": old_cur,
        "normalised_currency": new_cur,
        "break_year": effective,
        "rate_applied": rate,
        "rate_direction": f"{rate} {old_cur} per 1 {new_cur}; pre-break values divided by it",
        "years_converted": sorted(converted),
        "corroboration": corroboration,
        "rate_source": (
            "Official irrevocable euro conversion rate fixed by the Council of the European Union. "
            "The regulation itself was not read from this machine and is deliberately not cited; "
            "the corroboration field records the check that WAS performed."
        ),
    }


def check_fx_continuity(series_by_iso: dict, years: list):
    """Flag any year-on-year FX move larger than FX_JUMP_FACTOR that nobody has accounted for.

    ⚠️ WHAT THIS TEST IS. After normalisation no series should change denomination inside the
    window. A redenomination shows up as a single enormous step - Croatia's raw kuna-to-euro break
    is a 0.129x step, where ordinary annual FX movement is a few tens of per cent. So: flag every
    step outside a 3x band, and require each flag to be ACCOUNTED FOR, either by a REDENOMINATIONS
    entry that should have removed it or by an explicit REVIEWED_DISCONTINUITIES classification.
    Anything unaccounted aborts.

    ⚠️ WHAT IT CAN CATCH. A redenomination whose factor exceeds 3x - which is most of them: the
    euro conversions at 7.53450 (HRK), 15.6466 (EEK), 239.640 (SIT) and the common "drop three
    zeros" reforms all clear it comfortably. And, more usefully, a NEW break appearing when the
    vintage advances or the base year moves, because it arrives unaccounted and stops the run.

    ⚠️ WHAT IT CANNOT CATCH, AND THIS IS THE PART THAT MATTERS.
      * A REDENOMINATION AT A FACTOR NEAR 1. Bulgaria's 1.95583, Latvia's 0.702804, Malta's
        0.429300 and Cyprus's 0.585274 are all well inside the 3x band and would produce NO FLAG
        AT ALL. Bulgaria's 2026 entry is the next one due and this test is blind to it. The
        REDENOMINATIONS table is the defence there; this check is a backstop, not the primary one.
      * THE DIFFERENCE BETWEEN A REDENOMINATION AND A DEVALUATION. Both are large, permanent,
        discontinuous jumps and the series cannot tell them apart - which is why every flag needs a
        human classification rather than a rule. Seven of the eight flags on the current data are
        genuine devaluations (Argentina, Lebanon x2, Libya, Sudan, Zimbabwe x2).
      * A break entirely outside the window, which leaves no in-window step to see.
    """
    unaccounted = []
    for iso2, series in series_by_iso.items():
        have = [y for y in years if y in series and series[y] > 0]
        for prev, nxt in zip(have, have[1:]):
            ratio = series[nxt] / series[prev]
            if ratio > FX_JUMP_FACTOR or ratio < 1.0 / FX_JUMP_FACTOR:
                if (iso2, prev, nxt) in REVIEWED_DISCONTINUITIES:
                    continue
                unaccounted.append((iso2, prev, nxt, series[prev], series[nxt], ratio))
    if unaccounted:
        lines = "\n".join(
            f"         {i} {p}->{n}: {a:.6g} -> {b:.6g}  ({r:.4g}x)"
            for i, p, n, a, b, r in unaccounted
        )
        die(
            "FX continuity check: unaccounted discontinuity after normalisation.\n"
            f"       A year-on-year move beyond {FX_JUMP_FACTOR}x is either a currency "
            "redenomination the series does not mark,\n"
            "       or a genuine devaluation. THE DATA CANNOT TELL THEM APART - classify each by "
            "hand:\n"
            "         a redenomination -> add a REDENOMINATIONS row, with a corroborated rate\n"
            "         a devaluation    -> add a REVIEWED_DISCONTINUITIES row saying so\n"
            f"{lines}"
        )


def currency_for(iso2: str, as_of: date) -> str:
    """ISO 4217 from CLDR, as of the END of the series window.

    ⚠️ DATED ON PURPOSE. Asking for "the" currency returns today's, and two of the 44 have changed
    inside living memory of this dataset: Croatia adopted the euro in 2023, and Bulgaria adopts it
    in 2026. An undated lookup would label Bulgaria's 2019-END lev series 'EUR' the moment the CLDR
    data rolls over, silently relabelling a series that is denominated in lev.
    """
    got = get_territory_currencies(iso2, start_date=as_of, end_date=as_of)
    if not got:
        die(f"no ISO 4217 currency derivable for {iso2} as of {as_of}")
    return got[0]


# ── MAIN ──────────────────────────────────────────────────────────────────────────────────────

def main() -> None:
    cpi_wb = read_wb(CPI_CSV)
    fx_wb = read_wb(FX_CSV)
    gdp_wb = read_wb(GDP_CSV)
    wb_updated = read_wb_updated(CPI_CSV)

    tw_fx_rows = read_xlsx_rows(TW_FXGDP)
    tw_cpi_rows = read_xlsx_rows(TW_CPI)
    # Column positions are asserted by header text rather than assumed, so a re-download that moves
    # a column aborts instead of silently reading the wrong series.
    assert_col(tw_fx_rows, 2, "ExchangeRate", "FX")
    assert_col(tw_fx_rows, 5, "U.S.$", "GDP")
    assert_col(tw_cpi_rows, 1, "GeneralIndex", "CPI")

    tw_fx = dgbas_series(tw_fx_rows, 2, "Taiwan FX")
    tw_gdp = {y: v * 1e6 for y, v in dgbas_series(tw_fx_rows, 5, "Taiwan GDP").items()}
    tw_cpi = dgbas_series(tw_cpi_rows, 1, "Taiwan CPI")

    mapping = json.loads(COUNTRY_REGIONS.read_text(encoding="utf-8"))["mapping"]
    reference = json.loads(REFERENCE_49.read_text(encoding="utf-8"))
    regions_49 = sorted({f["region"] for f in reference["factors"]})

    def series_for(iso2: str, table: dict):
        if iso2 == "TW":
            return None
        code, _ = wb_code(iso2)
        if code is None:
            return None
        entry = table.get(code)
        return entry["values"] if entry else None

    def cpi_of(iso2):
        return tw_cpi if iso2 == "TW" else (series_for(iso2, cpi_wb) or {})

    def fx_raw(iso2):
        return tw_fx if iso2 == "TW" else (series_for(iso2, fx_wb) or {})

    # FX normalisation needs the vintage year, which is derived below from CPI coverage. CPI needs
    # no normalisation - it is an index, and a redenomination does not break an index - so the end
    # year can be settled first and the FX series normalised against it immediately afterwards.
    normalised_fx = {}
    fx_provenance = {}

    def fx_of(iso2):
        return normalised_fx.get(iso2, {})

    # ── END YEAR — DERIVED ────────────────────────────────────────────────────────────────────
    # Latest year with CPI for at least END_YEAR_MIN_COVERAGE of the 212. Counted AFTER the two
    # resolutions this file makes (Taiwan from DGBAS, Kosovo as XKX), because those are rows the
    # artefact will actually carry; counting them absent would understate what is being built.
    all_years = sorted({y for e in cpi_wb.values() for y in e["values"]} | set(tw_cpi))
    coverage = {}
    for y in all_years:
        n = sum(1 for r in mapping if y in cpi_of(r["iso2"]))
        coverage[y] = (n, n / len(mapping))

    qualifying = [y for y in all_years if coverage[y][1] >= END_YEAR_MIN_COVERAGE]
    if not qualifying:
        die(f"no year reaches {END_YEAR_MIN_COVERAGE:.0%} CPI coverage of the {len(mapping)} countries")
    end_year = max(qualifying)
    years = list(range(BASE_YEAR, end_year + 1))
    currency_as_of = date(end_year, 7, 1)

    # ── NORMALISE EVERY FX SERIES — ALL 212, NOT JUST THE 44 NAMED REGIONS ───────────────────
    # The composites are GDP-weighted over the 212 countries, so a redenominated bucket MEMBER
    # would corrupt that bucket's fx_ratio exactly as Croatia corrupts its own region's. Both the
    # normalisation and the continuity check therefore run over all 212, not over the 44.
    for rec in mapping:
        iso2 = rec["iso2"]
        normalised_fx[iso2], prov = normalise_fx(iso2, fx_raw(iso2), end_year)
        if prov is not None:
            fx_provenance[iso2] = prov

    # ⚠️ THIS CHECK CANNOT CATCH THE NEXT REDENOMINATION THAT IS ACTUALLY DUE.
    # It flags year-on-year FX moves beyond FX_JUMP_FACTOR (3x). A conversion rate INSIDE that band
    # produces no flag at all, and BULGARIA'S 2026 EURO ENTRY AT 1.95583 BGN PER EUR IS EXACTLY
    # THAT CASE - a 1.96x step is ordinary exchange-rate movement as far as this test can tell.
    # Latvia's 0.702804, Malta's 0.429300 and Cyprus's 0.585274 are equally invisible to it.
    # THE REDENOMINATIONS TABLE IS THE DEFENCE FOR THOSE, NOT THIS CHECK. The table is why Bulgaria
    # is already handled; the check is a backstop for large breaks nobody tabulated, and for new
    # ones appearing when the vintage advances. Do not read a clean run as "no redenominations".
    check_fx_continuity(normalised_fx, years)

    # ── GUARDS ───────────────────────────────────────────────────────────────────────────────
    by_iso = {}
    for r in mapping:
        if r["iso2"] in by_iso:
            die(f"{r['iso2']} appears twice in countryRegions.json")
        by_iso[r["iso2"]] = r

    named_codes = sorted({r["region_code"] for r in mapping if r["region_code"] not in BUCKETS})
    for code in named_codes + BUCKETS:
        if code not in regions_49:
            die(f"region code {code!r} is not one of the 49 in {REFERENCE_49.name}")

    nulls = []
    euro_members = []
    regions = {}

    # ── NAMED REGIONS ────────────────────────────────────────────────────────────────────────
    for code in named_codes:
        rec = by_iso.get(code)
        name = rec["country_name"] if rec else code
        is_tw = code == "TW"
        cpi_src, fx_src = cpi_of(code), fx_of(code)

        if BASE_YEAR not in cpi_src:
            die(f"named region {code} ({name}) has no CPI for {BASE_YEAR}; cannot form a ratio")

        cpi, fx, region_nulls = series_with_nulls(code, cpi_src, fx_src, years)
        nulls.extend(region_nulls)

        cur = currency_for(code, currency_as_of)
        if cur == "EUR":
            euro_members.append(code)

        _, how = wb_code(code)
        regions[code] = {
            "kind": "country",
            "iso2": code,
            "country_name": name,
            "currency": cur,
            "cpi_base_year": TW_CPI_BASE_YEAR if is_tw else WB_CPI_BASE_YEAR,
            "cpi": cpi,
            "fx_lcu_per_usd": fx,
            "source": "DGBAS" if is_tw else "World Bank WDI",
            "source_code": "TW (DGBAS national series)" if is_tw else wb_code(code)[0],
            "code_resolution": "national-source" if is_tw else how,
            # One denomination across the whole window, always stated. When nothing was converted
            # the two currencies are equal and fx_redenomination is null - which is a positive
            # record that the series was checked, not a silence.
            "fx_original_currency": fx_provenance[code]["original_currency"] if code in fx_provenance else cur,
            "fx_normalised_currency": cur,
            "fx_redenomination": fx_provenance.get(code),
        }

    if set(euro_members) != EXPECTED_EURO:
        die(
            "euro-area membership assertion failed.\n"
            f"       resolved to EUR but not expected: {sorted(set(euro_members) - EXPECTED_EURO)}\n"
            f"       expected EUR but did not resolve: {sorted(EXPECTED_EURO - set(euro_members))}"
        )

    def gdp_for(iso2: str):
        """2025 GDP in current USD, falling back to 2024. Returns (value, year_used)."""
        if iso2 == "TW":
            src = tw_gdp
        else:
            code, _ = wb_code(iso2)
            e = gdp_wb.get(code) if code else None
            src = e["values"] if e else {}
        for y in (2025, 2024):
            if y in src:
                return src[y], y
        return None, None

    # ── COMPOSITES ───────────────────────────────────────────────────────────────────────────
    for b in BUCKETS:
        members = [r for r in mapping if r["region_code"] == b]
        rows, excluded_no_cpi, unmeasured_no_gdp = [], [], []

        for m in members:
            iso2 = m["iso2"]
            cpi_s, fx_s = cpi_of(iso2), fx_of(iso2)
            g, gy = gdp_for(iso2)
            has_cpi = BASE_YEAR in cpi_s and end_year in cpi_s
            has_fx = BASE_YEAR in fx_s and end_year in fx_s

            # ⚠️ GDP-MISSING TAKES PRECEDENCE, AND THE ORDER OF THESE TWO BRANCHES IS THE WHOLE
            # POINT OF THE SPLIT. A member with no GDP cannot be weighted and is absent from the
            # coverage denominator, so it belongs in unmeasured_no_gdp whatever its CPI does -
            # putting it in excluded_no_cpi would imply the percentage had accounted for it.
            if g is None:
                why = "no GDP for 2025 or 2024"
                if not has_cpi:
                    miss = [str(y) for y in (BASE_YEAR, end_year) if y not in cpi_s]
                    why += f" (also no CPI for {'+'.join(miss)})"
                unmeasured_no_gdp.append({
                    "iso2": iso2, "country_name": m["country_name"],
                    "gdp_usd": None, "gdp_year": None, "reason": why,
                })
                continue

            if not has_cpi:
                miss = [str(y) for y in (BASE_YEAR, end_year) if y not in cpi_s]
                excluded_no_cpi.append({
                    "iso2": iso2, "country_name": m["country_name"],
                    "gdp_usd": g, "gdp_year": gy,
                    "reason": f"no CPI for {'+'.join(miss)}",
                })
                continue

            rows.append({
                "iso2": iso2, "name": m["country_name"], "gdp": g, "gdp_year": gy,
                "cpi_ratio": cpi_s[end_year] / cpi_s[BASE_YEAR],
                "fx_ratio": (fx_s[end_year] / fx_s[BASE_YEAR]) if has_fx else None,
            })

        if not rows:
            die(f"bucket {b} has no member with both GDP and CPI; cannot form a composite")

        # Denominator counts only MEASURABLE GDP - the weighted members plus those excluded for
        # CPI. Members with no GDP are in neither side; see GDP_COVERAGE_NOTE.
        gdp_used = sum(r["gdp"] for r in rows)
        gdp_measurable = gdp_used + sum(e["gdp_usd"] for e in excluded_no_cpi)

        if len(members) != len(rows) + len(excluded_no_cpi) + len(unmeasured_no_gdp):
            die(f"bucket {b}: member counts do not reconcile")

        # WEIGHTS OVER RATIOS. See the module docstring - levels are not averageable here.
        weights = [r["gdp"] / gdp_used for r in rows]
        if abs(sum(weights) - 1.0) > 1e-9:
            die(f"bucket {b} weights sum to {sum(weights)!r}, not 1 within 1e-9")

        cpi_ratio = sum(w * r["cpi_ratio"] for w, r in zip(weights, rows))
        fx_rows = [(w, r) for w, r in zip(weights, rows) if r["fx_ratio"] is not None]
        fx_weight_total = sum(w for w, _ in fx_rows)
        fx_ratio = (sum(w * r["fx_ratio"] for w, r in fx_rows) / fx_weight_total) if fx_rows else None
        if fx_ratio is None:
            nulls.append((b, "fx_ratio", end_year, "no member has FX for both years"))

        rec = {
            "kind": "row_composite",
            "members_total": len(members),
            "members_weighted": len(rows),
            "members_excluded_no_cpi": len(excluded_no_cpi),
            "members_unmeasured": len(unmeasured_no_gdp),
            "gdp_coverage_pct": round(gdp_used / gdp_measurable * 100, 1) if gdp_measurable else 0.0,
            "gdp_coverage_pct_note": GDP_COVERAGE_NOTE,
            "gdp_used_usd": gdp_used,
            "gdp_measurable_usd": gdp_measurable,
            "weight_basis": "GDP in current USD, 2025 where published, else 2024; per-member year recorded below",
            "cpi_ratio": cpi_ratio,
            "fx_ratio": fx_ratio,
            "fx_ratio_weight_share": round(fx_weight_total, 6) if fx_rows else 0.0,
            "ratio_definition": (
                f"CPI({end_year})/CPI({BASE_YEAR}) and FX({end_year})/FX({BASE_YEAR}), GDP-weighted "
                f"across members. RATIOS are weighted, never levels."
            ),
            "members": [{"iso2": r["iso2"], "country_name": r["name"], "gdp_usd": r["gdp"],
                         "gdp_year": r["gdp_year"], "weight": w,
                         "cpi_ratio": r["cpi_ratio"], "fx_ratio": r["fx_ratio"]}
                        for w, r in zip(weights, rows)],
            "excluded_no_cpi": excluded_no_cpi,
            "unmeasured_no_gdp": unmeasured_no_gdp,
        }
        if b == "WL":
            rec["bias_note"] = WL_BIAS_NOTE
        regions[b] = rec

    missing_49 = [c for c in regions_49 if c not in regions]
    if missing_49:
        die(f"no record produced for {len(missing_49)} of the 49 regions: {missing_49}")

    # ── WRITE ────────────────────────────────────────────────────────────────────────────────
    payload_rows = json.dumps({"regions": regions}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    digest = hashlib.sha256(payload_rows.encode("utf-8")).hexdigest()

    payload = {
        "metadata": {
            "data_vintage": end_year,
            "base_year": BASE_YEAR,
            "generated_on": date.today().isoformat(),
            "generated_from": [CPI_CSV.name, FX_CSV.name, GDP_CSV.name, TW_FXGDP.name, TW_CPI.name],
            "generated_by": "scripts/generate-price-indices.py",
            "pycountry_version": pycountry.__version__,
            "babel_version": babel.__version__,
            "data_vintage_rule": (
                f"The latest year with CPI for at least {END_YEAR_MIN_COVERAGE:.0%} of the "
                f"{len(mapping)} countries in countryRegions.json. Derived, never hardcoded."
            ),
            "data_vintage_coverage": {
                str(y): {"countries_with_cpi": coverage[y][0], "pct": round(coverage[y][1] * 100, 1)}
                for y in sorted(coverage) if y >= end_year - 1
            },
            "scope_note": (
                "SERIES ONLY. This file carries CPI and FX series and GDP-weighted composites of "
                "their RATIOS. It applies no adjustment to any emission factor, performs no "
                "currency conversion, and rebases nothing. A consumer that deflates or converts "
                "must do so itself and say that it did."
            ),
            "ratio_note": (
                "COMPOSITES WEIGHT RATIOS, NOT LEVELS. CPI levels sit on different base years "
                "(World Bank 2010=100; Taiwan DGBAS 2021=100) and FX levels are denominated in a "
                "different currency per country, so neither is averageable across members. A ratio "
                "of two years of one series is dimensionless and base-independent, and is the only "
                "form these composites average."
            ),
            "coverage_note": GDP_COVERAGE_NOTE,
            "licence": ARTEFACT_LICENCE,
            "sources": {
                "world_bank_cpi": {
                    "indicator": "FP.CPI.TOTL",
                    "name": "Consumer price index (2010 = 100)",
                    "publisher": "World Bank, World Development Indicators",
                    "source_organization": SOURCE_ORG_IMF_IFS,
                    "file": CPI_CSV.name,
                    "last_updated": wb_updated,
                    "url": "https://data.worldbank.org/indicator/FP.CPI.TOTL",
                    "licence": WB_LICENCE,
                    "licence_url": WB_LICENCE_URL,
                    "licence_basis": WB_LICENCE_BASIS,
                },
                "world_bank_fx": {
                    "indicator": "PA.NUS.FCRF",
                    "name": "Official exchange rate (LCU per US$, period average)",
                    "publisher": "World Bank, World Development Indicators",
                    "source_organization": SOURCE_ORG_IMF_IFS,
                    "file": FX_CSV.name,
                    "last_updated": read_wb_updated(FX_CSV),
                    "url": "https://data.worldbank.org/indicator/PA.NUS.FCRF",
                    "licence": WB_LICENCE,
                    "licence_url": WB_LICENCE_URL,
                    "licence_basis": WB_LICENCE_BASIS,
                },
                "world_bank_gdp": {
                    "indicator": "NY.GDP.MKTP.CD",
                    "name": "GDP (current US$)",
                    "publisher": "World Bank, World Development Indicators",
                    "source_organization": SOURCE_ORG_GDP,
                    "file": GDP_CSV.name,
                    "last_updated": read_wb_updated(GDP_CSV),
                    "url": "https://data.worldbank.org/indicator/NY.GDP.MKTP.CD",
                    "role": "composite weights only - never a series in this file",
                    "licence": WB_LICENCE,
                    "licence_url": WB_LICENCE_URL,
                    "licence_basis": WB_LICENCE_BASIS,
                },
                "dgbas_taiwan": {
                    "publisher": "Directorate-General of Budget, Accounting and Statistics (DGBAS), Executive Yuan, Republic of China (Taiwan)",
                    "series": [
                        "Principal Figures (2008SNA): Exchange Rate (N.T.$ per U.S.$), GDP (Million U.S.$, at Current Prices)",
                        "Consumer Price Indices, General Index, base period 2021 = 100",
                    ],
                    "files": [TW_FXGDP.name, TW_CPI.name],
                    "reason": (
                        "The World Bank publishes no Taiwan row in any of the three WDI files used "
                        "here, so Taiwan's series come from its national statistical office. Its CPI "
                        "base year is 2021, not 2010 - which is why every composite weights ratios "
                        "rather than levels."
                    ),
                    "licence": DGBAS_LICENCE,
                    "licence_exclusions": DGBAS_LICENCE_EXCLUSIONS,
                },
            },
            "resolutions": {
                "XK": f"Kosovo has no ISO 3166-1 alpha-3. The World Bank publishes it as {KOSOVO_WB_CODE}. Accepted as a deliberate resolution, not a lookup.",
                "TW": "Taiwan is absent from the World Bank files; series taken from DGBAS national statistics.",
            },
            "euro_area_members": sorted(euro_members),
            "currency_as_of": currency_as_of.isoformat(),
            "fx_normalisation_note": (
                "EVERY FX SERIES IS ON ONE DENOMINATION: the currency in force at the vintage year. "
                "The World Bank publishes 'local currency units per US$' where the local currency "
                "unit is whatever was legal tender that year, so a series spanning a changeover "
                "mixes denominations with nothing marking the break, and a ratio across it measures "
                "the redenomination rather than a price movement. Pre-break values are divided by "
                "the official conversion rate; see each region's fx_redenomination, null where "
                "nothing was converted. Normalisation is applied to all 212 countries, not only the "
                "44 named regions, because a redenominated bucket member would corrupt a "
                "composite's fx_ratio."
            ),
            "fx_redenominations_applied": {
                k: {"from": v["original_currency"], "to": v["normalised_currency"],
                    "break_year": v["break_year"], "rate": v["rate_applied"],
                    "years_converted": v["years_converted"]}
                for k, v in sorted(fx_provenance.items())
            },
            "fx_redenominations_known_inert": {
                k: f"{v[0]} -> {v[1]} in {v[2]} at {v[3]}; outside the {BASE_YEAR}..{end_year} window, nothing converted"
                for k, v in sorted(REDENOMINATIONS.items()) if k not in fx_provenance
            },
            "fx_redenominations_omitted": OMITTED_REDENOMINATIONS,
            "fx_continuity_check": (
                f"Every year-on-year FX move beyond {FX_JUMP_FACTOR}x must be accounted for, either "
                "by a redenomination entry or by an explicit review classifying it as a genuine "
                "currency movement; anything unaccounted aborts the run. IT CANNOT CATCH A "
                "REDENOMINATION AT A FACTOR NEAR 1 - Bulgaria's 2026 entry at 1.95583 would raise no "
                "flag - so the redenomination table, not this check, is the primary defence. Nor can "
                "it distinguish a redenomination from a devaluation; that classification is made by "
                "hand and recorded."
            ),
            "fx_discontinuities_reviewed": {
                f"{k[0]} {k[1]}->{k[2]}": v for k, v in sorted(REVIEWED_DISCONTINUITIES.items())
            },
            "fingerprint_sha256": digest,
        },
        "regions": regions,
    }

    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # ── PRINT ────────────────────────────────────────────────────────────────────────────────
    print(f"wrote {OUT.relative_to(ROOT)}")
    print()
    print(f"END YEAR (data_vintage): {end_year}")
    print(f"  rule: latest year with CPI for >= {END_YEAR_MIN_COVERAGE:.0%} of {len(mapping)} countries")
    for y in (end_year, end_year + 1):
        if y in coverage:
            n, pct = coverage[y]
            print(f"  {y}: {n}/{len(mapping)} = {pct*100:.1f}%  {'MEETS' if pct >= END_YEAR_MIN_COVERAGE else 'FAILS'}")
        else:
            print(f"  {y}: no CPI data at all")
    print(f"  series span: {BASE_YEAR}..{end_year}")
    print()
    print("FX DENOMINATION")
    if fx_provenance:
        for k, v in sorted(fx_provenance.items()):
            print(f"  converted {k}: {v['original_currency']} -> {v['normalised_currency']} at "
                  f"{v['rate_applied']} (break {v['break_year']}), years "
                  f"{v['years_converted'][0]}..{v['years_converted'][-1]}")
    else:
        print("  nothing converted - no tabulated break falls inside the window")
    inert = [k for k in REDENOMINATIONS if k not in fx_provenance]
    print(f"  inert at vintage {end_year}: {', '.join(sorted(inert))}")
    print(f"  omitted (rate not corroborated): {', '.join(sorted(OMITTED_REDENOMINATIONS))}")
    print(f"  continuity check: {len(REVIEWED_DISCONTINUITIES)} jumps beyond {FX_JUMP_FACTOR}x "
          f"reviewed and classified as genuine currency movements; 0 unaccounted")
    print()
    print(f"NAMED REGIONS: {len(named_codes)}   COMPOSITES: {len(BUCKETS)}   TOTAL: {len(regions)} of 49")
    print(f"euro-area members resolved to EUR ({len(euro_members)}): {', '.join(sorted(euro_members))}")
    print()
    print("COMPOSITE COVERAGE  (gdp_coverage_pct is a share of MEASURABLE GDP, not of the bucket)")
    for b in BUCKETS:
        r = regions[b]
        fx_txt = f"{r['fx_ratio']:.4f}" if r["fx_ratio"] is not None else "None"
        print(f"  {b}: {r['gdp_coverage_pct']:>5.1f}% of measurable GDP  |  weighted {r['members_weighted']}"
              f"  no-CPI {r['members_excluded_no_cpi']}  unmeasured {r['members_unmeasured']}"
              f"  of {r['members_total']}  |  cpi_ratio {r['cpi_ratio']:.4f}  fx_ratio {fx_txt}")
        for e in sorted(r["excluded_no_cpi"], key=lambda e: -e["gdp_usd"])[:5]:
            print(f"        no CPI     : {e['country_name']:<26} ${e['gdp_usd']/1e9:>9,.1f}bn   {e['reason']}")
        if r["members_excluded_no_cpi"] > 5:
            print(f"        ... and {r['members_excluded_no_cpi'] - 5} more with GDP but no CPI")
        for e in r["unmeasured_no_gdp"]:
            print(f"        UNMEASURED : {e['country_name']:<26} {'—':>11}    {e['reason']}")
    print()
    print(f"NULLS: {len(nulls)}")
    for region, field, y, why in nulls:
        print(f"  {region} {field} {y}: {why}")
    if not nulls:
        print("  none — no region has a gap inside 2019..%d" % end_year)
    print()
    print(f"payload sha256: {digest}")


if __name__ == "__main__":
    main()
