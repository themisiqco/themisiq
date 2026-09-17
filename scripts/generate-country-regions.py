#!/usr/bin/env python3
"""
Generate lib/emissionFactors/countryRegions.json - which of EXIOBASE 3's 49 regions a country's
spend should be priced against.

WHY THIS EXISTS
---------------
EXIOBASE 3 resolves 44 countries individually and sweeps everything else into five rest-of-world
buckets: WA, WL, WE, WF, WM. A customer tells us their supplier is in Vietnam; the factor files are
keyed on regions, and Vietnam is not one. Without this mapping the resolver can only return null,
which is what lib/emissionFactors/spend.ts has been doing on purpose - see the warning on
SpendFactorQuery.fallback_regions, which refuses to invent the geography rather than guess it.

THIS FILE IS THAT GEOGRAPHY, AND IT IS SOMEONE ELSE'S, NOT OURS. The bucket membership is published:
Bjelle et al. built a 214-country extension of EXIOBASE 3 and had to state which country sits in
which of the 49 regions to do it. That statement is Additional file 2 of the paper. We read it; we
do not author it. If the mapping is ever wrong, it is wrong in the published source and the fix is a
citation, not an edit.

WHY THIS IS A GENERATOR AND NOT A HAND-MAINTAINED FILE
------------------------------------------------------
212 rows of two-letter codes nobody on this team can check by eye, and the failure mode is silent:
a country mapped to the wrong bucket produces a factor that is present, plausible and wrong, which
is worse than one that is missing. The JSON is a build artefact of a published dataset; this script
is the only thing that should ever write it.

REQUIRES openpyxl and pycountry, neither of which is a project dependency and neither of which may
be added to package.json - they are Python packages used once, offline, to produce a checked-in
artefact. Install them in a throwaway virtualenv:

    python3 -m venv /tmp/exio-venv
    /tmp/exio-venv/bin/pip install openpyxl pycountry
    /tmp/exio-venv/bin/python scripts/generate-country-regions.py

NO NETWORK ACCESS. The input is a file in the repo and pycountry ships its ISO 3166-1 table inside
the package. Nothing is fetched.

⚠️ pycountry's ISO TABLE IS ITSELF A MOVING DATASET, which is why its version is recorded in the
output metadata. Countries get renamed (Turkey -> Turkiye, Swaziland -> Eswatini, Macedonia ->
North Macedonia) and pycountry follows; a name that resolves today may stop resolving tomorrow. That
is handled the only way it can be: a name that does not resolve and is not in COUNTRY_OVERRIDE is an
abort, never a skip, so a rename surfaces as a failed run rather than as a country quietly missing
from the mapping.

PROVENANCE RECORDED IN THE OUTPUT
---------------------------------
The metadata block carries the citation, both DOIs (the article and the additional file), the
licence and the licence URL. That is not bookkeeping: the source is CC BY 4.0 and attribution is
required wherever a derived figure is shown - the same obligation the exio3 factors carry, from a
different source and under a different licence. See lib/emissionFactors/spend.ts.

WHAT IS TAKEN IS THE BRIDGE, NOT THE DATA. The paper builds EXIOBASE 3rx, a 214-country extension
of EXIOBASE 3, and in doing so states which of the 49 regions each country sits in. That statement
is all this reads. No 3rx table, multiplier or estimate enters the repo; factors still come from
the published EXIOBASE 3 archives. The paper flags 3rx as experimental with high uncertainty for
individual small economies - a caveat that attaches to its ESTIMATED FACTORS, not to a
classification of which region a country is in. See bridge_only_note in the output.
"""

import hashlib
import json
import pathlib
import sys
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
INPUT = ROOT / "data" / "reference" / "exiobase3rx-concordance-MOESM2.xlsx"
OUT = ROOT / "lib" / "emissionFactors" / "countryRegions.json"
# The authority for WHICH 49 codes exist. Read rather than hardcoded, so this script cannot drift
# from the factor files it exists to serve: if the factors are ever regenerated on a different
# EXIOBASE release with a different region set, this aborts instead of producing a mapping that
# points at regions no factor is held for.
REFERENCE = ROOT / "lib" / "emissionFactors" / "exiobaseFactors2019ixi.json"

SHEET = "Countries"
EXPECTED_ROWS = 214
EXPECTED_REGION_COLUMNS = 49

# ── LICENCE AND ATTRIBUTION ───────────────────────────────────────────────────────────────────
#
# CC BY 4.0 REQUIRES ATTRIBUTION, which is why the citation, both DOIs and the licence URL are all
# carried into the output rather than just the licence name. A consumer of countryRegions.json who
# shows a figure derived from it needs enough to credit the source without coming back here.
#
# Verified 15 Sep 2026 against the published article PDF, which licenses the article and its
# material under CC BY 4.0 except where a credit line indicates otherwise. Additional file 2 carries
# no such credit line.
LICENCE = "CC BY 4.0 (Creative Commons Attribution 4.0 International)"
LICENCE_URL = "http://creativecommons.org/licenses/by/4.0/"
ARTICLE_DOI = "10.1186/s40008-020-0182-y"
FILE_DOI = "10.6084/m9.figshare.11854137"
CITATION = (
    "Bjelle EL, Többen J, Stadler K, Kastner T, Theurl MC, Erb K-H, Olsen K-S, Wiebe KS, "
    "Wood R (2020). Adding country resolution to EXIOBASE: impacts on land use embodied in trade. "
    "Journal of Economic Structures 9:14."
)

# ── THE FIVE BUCKETS ──────────────────────────────────────────────────────────────────────────
# The workbook names the rest-of-world columns in words; the factor files key them by code. This is
# the join between the two vocabularies and there is nothing to derive - the five pairs are stated.
REGION_OVERRIDE = {
    "RoW Asia and Pacific": "WA",
    "RoW America": "WL",
    "RoW Europe": "WE",
    "RoW Africa": "WF",
    "RoW Middle East": "WM",
}

# ── COUNTRY NAME OVERRIDES ────────────────────────────────────────────────────────────────────
#
# The seventeen row names that pycountry.countries.lookup() cannot resolve. EVERY ENTRY IS A
# DECISION SOMEONE MADE, which is why each carries its reason: the table is the audit trail, and a
# reader who disagrees with one needs to see what it was for. Two of the seventeen are not simple
# spelling fixes and are marked as such.
#
# Two of these names are also COLUMN names (Russia, Turkey), so this table serves both axes.
DROP = object()  # a sentinel, not a code: the row is excluded from the mapping entirely
COUNTRY_OVERRIDE = {
    "Cote d'Ivoire": "CI",                      # spelling
    "Curacao": "CW",                            # spelling
    "Sint Maarten": "SX",                       # Dutch part
    "St. Kitts and Nevis": "KN",                # abbreviation
    "St. Lucia": "LC",                          # abbreviation
    "St. Vincent and the Grenadines": "VC",     # abbreviation
    "Micronesia, Fed. Sts.": "FM",              # abbreviation
    "Russia": "RU",                             # short form
    "Turkey": "TR",                             # pre-2022 name, now Turkiye
    "Swaziland": "SZ",                          # renamed Eswatini 2018
    "Macedonia": "MK",                          # renamed North Macedonia 2019
    "Palestine": "PS",                          # ISO: State of Palestine
    "Congo Republic": "CG",
    "DR Congo": "CD",
    "Zanzibar": "TZ",                           # not an ISO country; part of
                                                # Tanzania. Verified both rows
                                                # sit in WF, so collapsing
                                                # changes no factor.
    "Kosovo": "XK",                             # NO official ISO 3166-1
                                                # assignment exists. XK is
                                                # user-assigned and in de facto
                                                # wide use. Verified Kosovo sits
                                                # in WE alongside Serbia,
                                                # Albania, North Macedonia and
                                                # Montenegro.
    "Netherlands Antilles": DROP,               # dissolved 2010. Its successors
                                                # Curacao, Sint Maarten and Aruba
                                                # appear separately in the same
                                                # sheet and all sit in WL, so the
                                                # row is redundant.
}

# XK is the one code in the output that ISO 3166-1 does not assign. Named here so the validity
# check below can pass it deliberately rather than by having no check at all.
ALLOWED_NON_ISO = {"XK"}


def die(msg: str) -> None:
    sys.exit(f"ABORT: {msg}")


try:
    import openpyxl
    import pycountry
except ImportError:
    die(
        "openpyxl and/or pycountry are not importable. This script is not run by the build and\n"
        "       neither is a project dependency. See the module docstring for the throwaway-venv\n"
        "       invocation."
    )

if not INPUT.exists():
    die(
        f"input not found: {INPUT.relative_to(ROOT)}\n"
        f"       This is Additional file 2 of the paper named in the module docstring,\n"
        f"       DOI {FILE_DOI}. Place it at that path and re-run."
    )

# ── READ AND CHECK THE SHAPE BEFORE DOING ANYTHING ────────────────────────────────────────────
#
# Every check below aborts. A concordance that is the wrong shape is not a concordance with a few
# problems in it - it is a different file, or the same file after an edit nobody recorded, and
# proceeding would map countries to regions using whatever happened to be in the cells.
wb = openpyxl.load_workbook(INPUT, read_only=True, data_only=True)
if SHEET not in wb.sheetnames:
    die(f"no sheet named {SHEET!r} in {INPUT.name}. Sheets present: {wb.sheetnames}")

grid = [list(r) for r in wb[SHEET].iter_rows(values_only=True)]
if not grid:
    die(f"sheet {SHEET!r} is empty")

header, body = grid[0], grid[1:]
column_names = list(header[1:])

if len(body) != EXPECTED_ROWS:
    die(f"{len(body)} country rows, expected {EXPECTED_ROWS}. Is this the right workbook?")
if len(column_names) != EXPECTED_REGION_COLUMNS:
    die(f"{len(column_names)} region columns, expected {EXPECTED_REGION_COLUMNS}")

# Every row sums to exactly 1: each country belongs to exactly one region. A row summing to 0 is a
# country assigned nowhere; a row summing to 2 is one assigned twice. Both are unusable and neither
# is visible downstream, because the code below takes the first hit it finds and a wrong answer
# looks exactly like a right one.
for row in body:
    total = sum(v or 0 for v in row[1:])
    if total != 1:
        die(f"row {row[0]!r} sums to {total}, expected exactly 1")

# ── RESOLVE THE 49 COLUMN NAMES TO REGION CODES ───────────────────────────────────────────────
def resolve_region(name: str) -> str:
    if name in REGION_OVERRIDE:
        return REGION_OVERRIDE[name]
    if name in COUNTRY_OVERRIDE and COUNTRY_OVERRIDE[name] is not DROP:
        return COUNTRY_OVERRIDE[name]
    try:
        return pycountry.countries.lookup(name).alpha_2
    except LookupError:
        die(
            f"region column {name!r} does not resolve to an ISO 3166-1 alpha-2 code and is not in\n"
            f"       REGION_OVERRIDE or COUNTRY_OVERRIDE. Add it deliberately, with a reason."
        )


region_codes = [resolve_region(c) for c in column_names]

reference = json.loads(REFERENCE.read_text(encoding="utf-8"))
reference_regions = sorted({f["region"] for f in reference["factors"]})
if sorted(set(region_codes)) != reference_regions:
    resolved = set(region_codes)
    expected = set(reference_regions)
    die(
        f"resolved region codes do not match {REFERENCE.name}.\n"
        f"       missing from this workbook: {sorted(expected - resolved)}\n"
        f"       not in the factor files:    {sorted(resolved - expected)}"
    )

# ── RESOLVE THE 214 ROW NAMES TO ISO 3166-1 ALPHA-2 ───────────────────────────────────────────
mapping: list[dict] = []
by_iso: dict[str, dict] = {}
dropped: list[str] = []
collapsed: list[tuple[str, str]] = []

for row in body:
    name = row[0]
    hits = [code for code, v in zip(region_codes, row[1:]) if v]
    # The row-sum check above already guarantees exactly one hit; this is belt and braces, because
    # the cost of being wrong here is a country in the wrong bucket.
    if len(hits) != 1:
        die(f"row {name!r} matched {len(hits)} regions after resolution, expected exactly 1")
    region_code = hits[0]

    if name in COUNTRY_OVERRIDE:
        iso2 = COUNTRY_OVERRIDE[name]
        if iso2 is DROP:
            dropped.append(name)
            continue
        basis = "manual-resolution"
    else:
        try:
            iso2 = pycountry.countries.lookup(name).alpha_2
        except LookupError:
            die(
                f"country row {name!r} does not resolve to an ISO 3166-1 alpha-2 code and is not\n"
                f"       in COUNTRY_OVERRIDE. Add it deliberately, with a reason - do not skip it."
            )
        basis = "published"

    if iso2 not in ALLOWED_NON_ISO and pycountry.countries.get(alpha_2=iso2) is None:
        die(f"{name!r} resolved to {iso2!r}, which is not an ISO 3166-1 alpha-2 code")

    # ── THE COLLAPSE ──────────────────────────────────────────────────────────────────────────
    # Zanzibar and Tanzania are two rows in the source and one country in ISO 3166-1, so TZ is
    # reached twice. That is expected and is allowed ONLY while both rows agree on the region: if
    # they ever disagree, collapsing them would silently discard one published assignment, so this
    # aborts instead. Any OTHER duplicate is not anticipated and aborts the same way.
    if iso2 in by_iso:
        first = by_iso[iso2]
        if first["region_code"] != region_code:
            die(
                f"{iso2} is claimed twice with different regions: "
                f"{first['country_name']!r} -> {first['region_code']}, {name!r} -> {region_code}.\n"
                f"       Collapsing would discard one of them. Resolve this by hand."
            )
        collapsed.append((name, iso2))
        continue

    record = {
        "iso2": iso2,
        "country_name": name,
        "region_code": region_code,
        "basis": basis,
    }
    by_iso[iso2] = record
    mapping.append(record)

if len(by_iso) != len(mapping):
    die("internal: duplicate ISO code reached the mapping")

# ── FINGERPRINT ───────────────────────────────────────────────────────────────────────────────
# Same convention as exiobaseSectors.json: sha256 over the ROWS only, sorted and compactly
# separated, with metadata excluded because generated_on changes every run. Excluding metadata is
# also what makes it safe to store the digest INSIDE metadata - the hash does not cover itself.
payload_rows = json.dumps({"mapping": mapping}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
digest = hashlib.sha256(payload_rows.encode("utf-8")).hexdigest()

payload = {
    "metadata": {
        "source": CITATION,
        "publication": "Journal of Economic Structures 9:14 (2020)",
        "article_doi": ARTICLE_DOI,
        "additional_file_doi": FILE_DOI,
        "additional_file": "Additional file 2",
        "licence": LICENCE,
        "licence_url": LICENCE_URL,
        "attribution_note": (
            "CC BY 4.0 requires attribution. Anywhere a figure derived from this mapping is shown, "
            "credit the source above by citation and DOI. Verified 15 Sep 2026 against the "
            "published article PDF, which licenses the article and its material under CC BY 4.0 "
            "except where a credit line indicates otherwise; Additional file 2 carries no such "
            "credit line."
        ),
        "sheet": SHEET,
        "generated_on": date.today().isoformat(),
        "generated_from": INPUT.name,
        "generated_by": "scripts/generate-country-regions.py",
        "pycountry_version": pycountry.__version__,
        "source_rows": len(body),
        "regions": len(set(region_codes)),
        "countries": len(mapping),
        "dropped": dropped,
        "collapsed": [f"{n} -> {c}" for n, c in collapsed],
        "fingerprint_sha256": digest,
        "scope_note": (
            "Classification only. This file carries NO emission factors: it says which EXIOBASE "
            "region a country's spend is priced against, not what the price is. The regions are "
            "EXIOBASE 3's; the country-to-region assignment is the cited paper's; neither is ours."
        ),
        "bridge_only_note": (
            "WHAT IS TAKEN FROM THE PAPER IS THE BRIDGE, NOT THE DATA. The cited work builds "
            "EXIOBASE 3rx, a 214-country extension of EXIOBASE 3, and to do so it must state which "
            "of the 49 regions each country sits in. That statement - the region classification - "
            "is the only thing read here. NO EXIOBASE 3rx ESTIMATED DATA IS USED: no 3rx table, no "
            "3rx multiplier, no 3rx figure of any kind enters this repo, and factors continue to "
            "come from the published EXIOBASE 3 archives via "
            "scripts/generate-exiobase-factors.py. "
            "The distinction matters because the paper describes 3rx as experimental and flags "
            "high uncertainty for individual small economies. THAT CAVEAT ATTACHES TO 3rx's "
            "ESTIMATED FACTORS, NOT TO THIS BRIDGE: which region a country belongs to is a "
            "classification decision, not an estimate, and carries no uncertainty of that kind. "
            "Reporting the 3rx uncertainty against a figure priced from this mapping would "
            "describe a property the figure does not have. What DOES need saying beside such a "
            "figure is that 169 of the 212 countries resolve to a rest-of-world bucket, so the "
            "factor is a multi-economy average - see row_bucket_note."
        ),
        "row_bucket_note": (
            "Five of the 49 regions are rest-of-world buckets (WA, WL, WE, WF, WM) holding 169 of "
            "the 212 countries between them. A factor read through one of those is a bucket "
            "average across dozens of economies, not a national figure, and must be described that "
            "way wherever it is shown."
        ),
        "code_collision_note": (
            "WF IS BOTH THINGS AND THEY ARE NOT RELATED. As an EXIOBASE region code it means RoW "
            "Africa; as an ISO 3166-1 alpha-2 country code it means Wallis and Futuna. The two "
            "appear in adjacent fields of the same record, so never compare an iso2 against a "
            "region_code, and never let one default to the other. WA, WL, WE and WM are not ISO "
            "codes at all, so WF is the only collision."
        ),
    },
    "mapping": mapping,
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

# ── SUMMARY ───────────────────────────────────────────────────────────────────────────────────
counts: dict[str, int] = {}
for record in mapping:
    counts[record["region_code"]] = counts.get(record["region_code"], 0) + 1
basis_counts: dict[str, int] = {}
for record in mapping:
    basis_counts[record["basis"]] = basis_counts.get(record["basis"], 0) + 1

print(f"wrote {OUT.relative_to(ROOT)}")
print(f"  source rows: {len(body)}   countries written: {len(mapping)}   regions: {len(set(region_codes))}")
if dropped:
    print(f"  dropped: {', '.join(dropped)}")
for name, iso2 in collapsed:
    print(f"  collapsed: {name} -> {iso2} (already present, same region)")

print("\n  countries per region code:")
for code, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
    print(f"    {code}  {n}")

print("\n  by basis:")
for b, n in sorted(basis_counts.items()):
    print(f"    {b}  {n}")

# ── THE COVERAGE GAP, PRINTED RATHER THAN IMPLIED ─────────────────────────────────────────────
# A caller reading this mapping needs to know it is not every country. Printing the misses makes
# the gap a fact someone has seen, instead of something discovered later by a supplier in a
# territory that returns null.
all_iso = {c.alpha_2 for c in pycountry.countries}
absent = sorted(all_iso - set(by_iso))
print(f"\n  ISO 3166-1 alpha-2 codes with NO entry: {len(absent)} of {len(all_iso)}")
print("    " + ", ".join(absent))
print(
    "\n    These are mostly uninhabited territories, overseas dependencies and small islands that\n"
    "    the source does not resolve. A supplier in one of them has no region and must be handled\n"
    "    as unpriceable, not defaulted into a bucket."
)

print(f"\n  mapping sha256: {digest}")
print("  -> pin this in the migration's reference_data_fingerprints row if it has changed")
