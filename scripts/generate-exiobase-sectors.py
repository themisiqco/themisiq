#!/usr/bin/env python3
"""
Generate lib/emissionFactors/exiobaseSectors.json from pymrio's bundled EXIOBASE 3 classification.

WHY THIS IS A GENERATOR AND NOT A HAND-MAINTAINED FILE
------------------------------------------------------
363 rows of codes nobody on this team can check by eye. A hand-maintained copy would drift from the
published classification silently, and the drift would show up as a factor lookup missing for a
sector a customer had selected. The JSON is a build artefact of a published dataset; this script is
the only thing that should ever write it, and exiobaseSectors.test.ts fails if it is edited by hand.

REQUIRES pymrio 0.6.3 (the version this file was written against and the version recorded in the
generated metadata). pymrio is NOT a project dependency and must NOT be added to package.json - it
is a Python package used once, offline, to produce a checked-in artefact. Install it in a throwaway
virtualenv:

    python3 -m venv /tmp/exio-venv
    /tmp/exio-venv/bin/pip install 'pymrio==0.6.3'
    /tmp/exio-venv/bin/python scripts/generate-exiobase-sectors.py

The classification ships INSIDE the pymrio package (mrio_models/exio3_ixi/sectors.tsv and
mrio_models/exio3_pxp/sectors.tsv). Nothing is downloaded and the 49 GB EXIOBASE data archives are
never touched: this reads the sector LISTS only, no emission factors of any kind.

PROVENANCE RECORDED IN THE OUTPUT
---------------------------------
The metadata block names EXIOBASE 3 v3.8.2, its Zenodo DOI and its CC BY-SA 4.0 licence. The licence
is not bookkeeping: ShareAlike attaches obligations to anything we publish that adapts this, and
attribution is required wherever a derived figure is shown. See lib/emissionFactors/spend.ts.
"""

import json
import pathlib
import re
import sys
from datetime import date

REQUIRED_PYMRIO = "0.6.3"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "lib" / "emissionFactors" / "exiobaseSectors.json"
# ── THE DISPLAY GROUPS ARE READ FROM THE MIGRATION, NOT RE-DERIVED HERE ────────────────────────
# supabase/migrations/20260914_exiobase_sectors.sql seeds both the 20 headings and the per-industry
# assignment. Re-deriving the same assignment in Python would put two independent copies of a
# judgement call in the repo, and the day they diverge a dropdown would group an industry one way
# while the database grouped it another - with nothing failing, because each side would be
# internally consistent. Parsing the migration makes the SQL the single source and this file a
# projection of it. If the parse below stops matching, that is the migration's format changing and
# it must be looked at, which is why every step of it aborts rather than skipping a row.
MIGRATION = ROOT / "supabase" / "migrations" / "20260914_exiobase_sectors.sql"

try:
    import pymrio
    import pandas as pd
except ImportError:
    sys.exit(
        "pymrio is not importable. This script is not run by the build and pymrio is not a project\n"
        "dependency. See the module docstring for the throwaway-virtualenv invocation."
    )

if pymrio.__version__ != REQUIRED_PYMRIO:
    # Not a warning. The column names below are read positionally by name from a file that ships
    # inside the package, so a different pymrio may ship a different sectors.tsv, and a silent column
    # rename would produce a JSON full of nulls that looks structurally fine.
    sys.exit(
        f"pymrio {pymrio.__version__} found, {REQUIRED_PYMRIO} required.\n"
        f"Pin it, or verify the sectors.tsv columns yourself and update REQUIRED_PYMRIO."
    )

root = pathlib.Path(pymrio.__file__).parent / "mrio_models"

INDUSTRY_COLUMNS = {
    "ExioNumber": "exio_number",
    "ExioName": "exio_name",
    "ExioCode": "exio_code",
    "ExioLabel": "exio_label",
    "ISICCode": "isic_code",
    "ISICName": "isic_name",
    "ConsumptionCategories": "consumption_category",
}
PRODUCT_COLUMNS = {
    "ExioNumber": "exio_number",
    "ExioName": "exio_name",
    "ExioCode": "exio_code",
    "ExioLabel": "exio_label",
    "ConsumptionCategories": "consumption_category",
    "Type": "type",
}


def sql_literals(row: str) -> list:
    """Split one SQL VALUES row into its literals. Handles '' escaping inside quoted strings."""
    out, i, n = [], 0, len(row)
    while i < n:
        while i < n and row[i] in " \t":
            i += 1
        if i >= n:
            break
        if row[i] == "'":
            i += 1
            buf = []
            while i < n:
                if row[i] == "'" and i + 1 < n and row[i + 1] == "'":
                    buf.append("'")
                    i += 2
                elif row[i] == "'":
                    i += 1
                    break
                else:
                    buf.append(row[i])
                    i += 1
            out.append("".join(buf))
        else:
            j = i
            while j < n and row[j] != ",":
                j += 1
            tok = row[i:j].strip()
            out.append(None if tok == "null" else tok)
            i = j
        while i < n and row[i] in " \t":
            i += 1
        if i < n and row[i] == ",":
            i += 1
    return out


def read_display_groups() -> tuple:
    """The 20 headings in seed order, and the exio_code -> heading assignment, from the migration."""
    if not MIGRATION.is_file():
        sys.exit(f"{MIGRATION} is missing. The display groups are seeded there and read from there; "
                 f"this script does not re-derive them.")
    sql = MIGRATION.read_text(encoding="utf-8")

    groups = []
    for m in re.finditer(r"^  \((\d+), '((?:[^']|'')*)', (\d+)\)", sql, re.M):
        groups.append({"id": int(m.group(1)),
                       "heading": m.group(2).replace("''", "'"),
                       "member_count": int(m.group(3))})
    if len(groups) != 20:
        sys.exit(f"expected 20 display groups in {MIGRATION.name}, parsed {len(groups)}")
    if [g["id"] for g in groups] != list(range(1, 21)):
        sys.exit(f"display group ids are not 1..20 in seed order: {[g['id'] for g in groups]}")

    assignment = {}
    for line in sql.splitlines():
        if not line.startswith("  ('industry',"):
            continue
        cols = sql_literals(line.strip().rstrip(",").lstrip("(").rstrip(")"))
        if len(cols) != 10:
            sys.exit(f"industry seed row has {len(cols)} columns, expected 10: {line[:90]}")
        code, group = cols[1], cols[8]
        if group is None:
            sys.exit(f"industry {code} has a null display_group in the migration")
        assignment[code] = group
    if len(assignment) != 163:
        sys.exit(f"expected 163 industry seed rows in {MIGRATION.name}, parsed {len(assignment)}")

    headings = {g["heading"] for g in groups}
    stray = sorted({v for v in assignment.values()} - headings)
    if stray:
        sys.exit(f"industries assigned to headings not in sector_display_groups: {stray}")
    for g in groups:
        actual = sum(1 for v in assignment.values() if v == g["heading"])
        if actual != g["member_count"]:
            sys.exit(f"group {g['heading']!r} seeds member_count {g['member_count']} "
                     f"but {actual} industries are assigned to it")
    return groups, assignment


def read(model: str, columns: dict) -> list:
    df = pd.read_csv(root / model / "sectors.tsv", sep="\t")
    missing = [c for c in columns if c not in df.columns]
    if missing:
        sys.exit(f"{model}/sectors.tsv is missing expected columns: {missing}. Do not edit the JSON by hand; fix this script.")
    if df.isna().any().any():
        sys.exit(f"{model}/sectors.tsv contains nulls. The generated file must not carry them; investigate before regenerating.")
    df = df[list(columns)].rename(columns=columns)
    return df.to_dict(orient="records")


industries = read("exio3_ixi", INDUSTRY_COLUMNS)
products = read("exio3_pxp", PRODUCT_COLUMNS)

groups, assignment = read_display_groups()
missing = [r["exio_code"] for r in industries if r["exio_code"] not in assignment]
if missing:
    sys.exit(f"{len(missing)} industries have no display_group in the migration: {missing[:5]}")
for r in industries:
    r["display_group"] = assignment[r["exio_code"]]
# Products get none. They have no grouped UI, and the database column is null on all 200; emitting
# an empty string or a placeholder here would make "no group" indistinguishable from "a group whose
# name happens to be blank".

if len(industries) != 163:
    sys.exit(f"expected 163 industries, got {len(industries)}")
if len(products) != 200:
    sys.exit(f"expected 200 products, got {len(products)}")

payload = {
    "metadata": {
        "source": "EXIOBASE 3",
        "version": "3.8.2",
        "publisher": "EXIOBASE consortium",
        "published": "2021-10-21",
        "doi": "10.5281/zenodo.5589597",
        "url": "https://zenodo.org/records/5589597",
        "licence": "CC BY-SA 4.0",
        "generated_on": date.today().isoformat(),
        "generated_from": f"pymrio {pymrio.__version__} bundled classification (mrio_models/exio3_*/sectors.tsv)",
        "generated_by": "scripts/generate-exiobase-sectors.py",
        "isic_note": (
            "The isic_code and isic_name fields are ISIC Rev. 3.1 style section labels, not Rev. 4: "
            "'Electricity, gas and water supply' is one section E under Rev. 3.1 and is split across "
            "D and E under Rev. 4. That is consistent with the v3.8.2 readme, which states 'The "
            "database is under the NACE1 classification scheme' (NACE Rev. 1.1). They are SECTION "
            "level only - 12 distinct codes across 163 industries, three of them pre-aggregated "
            "multi-section buckets (ISIC_G_H, ISIC_J_K, ISIC_M_N_O) - so this is a grouping, not a "
            "crosswalk, and it cannot resolve an ISIC code back to an EXIOBASE industry."
        ),
        "display_group_note": (
            "The `groups` array and each industry's `display_group` are OURS, not EXIOBASE's. They "
            "are presentation only: headings that make a 163-item dropdown navigable, assigned by "
            "reading what the EXIOBASE name strings say. They are not a classification, they are "
            "not derived from ISIC or NACE, and no emission figure is computed from them. The "
            "published classification is isic_code / isic_name. Both the headings and the "
            "assignment are READ FROM supabase/migrations/20260914_exiobase_sectors.sql so the file "
            "and the database cannot disagree; they are not re-derived here. Products carry no "
            "display_group - the database column is null on all 200."
        ),
        "scope_note": (
            "Classification only. This file carries NO emission factors. Industry and product code "
            "spaces are parallel but not identical (163 against 200); a code is meaningless without "
            "knowing which table it came from. See lib/emissionFactors/spend.ts SpendFactorType."
        ),
    },
    "groups": groups,
    "industries": industries,
    "products": products,
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

# The fingerprint the test pins. Metadata is excluded because generated_on changes every run; the
# rows are what must not move.
import hashlib
rows = json.dumps({"groups": groups, "industries": industries, "products": products}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
digest = hashlib.sha256(rows.encode("utf-8")).hexdigest()

print(f"wrote {OUT.relative_to(pathlib.Path(__file__).resolve().parent.parent)}")
print(f"  industries: {len(industries)}   products: {len(products)}   groups: {len(groups)}")
print(f"  rows sha256: {digest}")
print(f"  -> pin this in lib/emissionFactors/exiobaseSectors.test.ts if it has changed")
