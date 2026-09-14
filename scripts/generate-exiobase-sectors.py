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
import sys
from datetime import date

REQUIRED_PYMRIO = "0.6.3"
OUT = pathlib.Path(__file__).resolve().parent.parent / "lib" / "emissionFactors" / "exiobaseSectors.json"

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
        "scope_note": (
            "Classification only. This file carries NO emission factors. Industry and product code "
            "spaces are parallel but not identical (163 against 200); a code is meaningless without "
            "knowing which table it came from. See lib/emissionFactors/spend.ts SpendFactorType."
        ),
    },
    "industries": industries,
    "products": products,
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

# The fingerprint the test pins. Metadata is excluded because generated_on changes every run; the
# rows are what must not move.
import hashlib
rows = json.dumps({"industries": industries, "products": products}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
digest = hashlib.sha256(rows.encode("utf-8")).hexdigest()

print(f"wrote {OUT.relative_to(pathlib.Path(__file__).resolve().parent.parent)}")
print(f"  industries: {len(industries)}   products: {len(products)}")
print(f"  rows sha256: {digest}")
print(f"  -> pin this in lib/emissionFactors/exiobaseSectors.test.ts if it has changed")
