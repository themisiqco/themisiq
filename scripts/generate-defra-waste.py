#!/usr/bin/env python3
"""
Extract the DEFRA/DESNZ 2026 waste-disposal conversion factors into
lib/emissionFactors/defraWaste2026.json.

    python3 scripts/generate-defra-waste.py

INPUT: data/reference/defra-desnz-ghg-conversion-factors-2026-full-set-v1.xlsx
       ("UK Government GHG Conversion Factors for Company Reporting", 2026, Full set, Version 1),
       copied byte-identically from the file downloaded from the publisher.

⚠️ THIS IS THE FIRST DEFRA/DESNZ SOURCE FILE IN THE REPOSITORY, AND THE FIRST DEFRA FACTORS GENERATED
RATHER THAN TYPED. Every DEFRA value in lib/ghg/engine.ts — EF_UK, GRID_EF.UK, the district-heat
factor — was transcribed by hand from the publication, with its provenance in comments, and no
workbook was ever committed. These waste factors are read from the workbook itself, so every value
here can be re-derived from a file in the repo and checked against its fingerprint.

READ BY lib/emissionFactors/defraWaste.ts, which the Scope 3 Cat 5 panel prices from (since 17 Sep 2026).
The page quotes lifecycle_guidance, scope_guidance and the Re-use FAQ from this artefact verbatim, so
those fields are part of what a customer reads, not only notes.

⚠️ THE UNIT IS THE REASON FOR MOST OF THE ASSERTIONS BELOW. The Scope 3 calculator's former waste
factors were 1,000 times too small for the unit their comments declared (0.467 "kg CO2e per tonne" for
landfill, where this sheet publishes hundreds). So this script refuses to emit anything unless every
data row's Unit cell reads 'tonnes' and every value column's header reads 'kg CO2e': the published
unit is kg CO2e per tonne, and it is asserted from the cells rather than assumed.

⚠️ NO ROW NUMBERS ARE HARDCODED. The sheet is seven blocks, each announced by a header row naming the
treatment routes and followed by a column-header row (Activity | Waste type | Unit | kg CO2e ...). The
blocks are FOUND by those two rows. A re-download whose rows have shifted is read correctly; one whose
layout has changed — a route renamed, a unit changed, a cell outside the known columns — aborts rather
than reading the wrong cells.

⚠️ NOT openpyxl. Cells are read by their A1 reference from the sheet XML, and sheets are found by NAME
through workbook.xml and its relationships. The existing reader in generate-price-indices.py appends
cells in document order and drops their column references, which is harmless for its dense
two-column inputs and wrong for this sparse matrix: an empty route would shift every value after it
one column to the left, under the wrong route.

Standard library only.
"""

import hashlib
import json
import pathlib
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ── THE EDITION (T3e, 8 Oct 2026) ──────────────────────────────────────────────────────────────────
# One script for every edition the registry holds:
#     python3 scripts/generate-defra-waste.py                       # 2026, from data/reference/ (as before)
#     python3 scripts/generate-defra-waste.py --year 2025 --input ~/themisiq-sources/defra/<file>.xlsx
# Output: lib/emissionFactors/defraWaste<YEAR>.json unless --out says otherwise. For 2026 a missing prose quote
# still aborts; for an older edition it is recorded as null (the edition prints none), never borrowed.
def _arg(name: str, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 >= len(sys.argv):
            sys.stderr.write(f"{name} needs a value\n"); sys.exit(2)
        return sys.argv[i + 1]
    return default


YEAR = int(_arg("--year", "2026"))
INPUT = pathlib.Path(_arg("--input", str(ROOT / "data" / "reference" / "defra-desnz-ghg-conversion-factors-2026-full-set-v1.xlsx"))).expanduser()
OUT = pathlib.Path(_arg("--out", str(ROOT / "lib" / "emissionFactors" / f"defraWaste{YEAR}.json"))).expanduser()
STRICT = YEAR == 2026

SHEET = "Waste disposal"
# The routes in the sheet's column order, under the names the app keys them by (2026's).
ROUTES = ["Re-use", "Open-loop", "Closed-loop", "Combustion", "Composting", "Landfill", "Anaerobic digestion"]
# ⚠️ A ROUTE PUBLISHED UNDER ANOTHER NAME (Lisa's ruling, 8 Oct 2026). DEFRA 2025 heads the column "Incineration
# with energy recovery" where 2023, 2024 and 2026 head it "Combustion", and defines it in the same words
# (Waste disposal A12). It is read as the Combustion route, and each record keeps the name as published
# (route_as_published), with the sheet's definition recorded in metadata.route_renames. 2025 also prints no
# Re-use column. Columns are found by their header label, never by position.
ROUTE_PUBLISHED_AS = {"Incineration with energy recovery": "Combustion"}
EXPECTED_BLOCKS = 7
EXPECTED_UNIT = "tonnes"
EXPECTED_VALUE_HEADER = "kg CO2e"

# ── THE CITATION — MUST MATCH lib/ghg/engine.ts ─────────────────────────────────────────────────
# defraCitation(2026) builds "UK DEFRA/DESNZ (2026) GHG Conversion Factors for Company Reporting" and
# COMBUSTION_EDITION.UK / STEAM_EDITION.UK are 'DEFRA 2026'. Python cannot import the TypeScript, so
# lib/emissionFactors/defraWaste2026.test.ts asserts these strings equal the engine's.
PUBLISHERS = "DEFRA/DESNZ"
TITLE = "GHG Conversion Factors for Company Reporting"
TITLE_AS_PUBLISHED = "UK Government GHG Conversion Factors for Company Reporting"
CITATION = f"UK {PUBLISHERS} ({YEAR}) {TITLE}"
EDITION = f"DEFRA {YEAR}"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def die(msg: str) -> None:
    sys.stderr.write(f"\nABORT: {msg}\n\nNothing was written.\n")
    sys.exit(1)


# ── XLSX, BY CELL REFERENCE ────────────────────────────────────────────────────────────────────────

def col_index(ref: str) -> int:
    m = re.match(r"([A-Z]+)\d+$", ref)
    if not m:
        die(f"unreadable cell reference {ref!r}")
    n = 0
    for ch in m.group(1):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def open_workbook(path: pathlib.Path):
    if not path.exists():
        die(f"input not found: {path}")
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(f"{NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    workbook = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    targets = {r.get("Id"): r.get("Target") for r in rels}
    sheets = {}
    for s in workbook.find(f"{NS}sheets"):
        target = targets[s.get(f"{RNS}id")].lstrip("/")
        sheets[s.get("name")] = target if target.startswith("xl/") else f"xl/{target}"
    return z, shared, sheets


def read_sheet(z, shared, sheets, name: str) -> list:
    """[(row_number, {col_index: text})] for every row present, whitespace-only cells treated as empty."""
    if name not in sheets:
        die(f"sheet {name!r} not found; sheets are: {list(sheets)}")
    rows = []
    for row in ET.fromstring(z.read(sheets[name])).iter(f"{NS}row"):
        cells = {}
        for c in row.findall(f"{NS}c"):
            t, v = c.get("t"), c.find(f"{NS}v")
            if t == "s" and v is not None:
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter(f"{NS}t"))
            elif v is not None:
                val = v.text
            else:
                val = None
            if val is not None and val.strip() != "":
                cells[col_index(c.get("r"))] = val
        rows.append((int(row.get("r")), cells))
    return rows


def labelled_value(rows, label: str) -> str:
    """The cell immediately right of a label cell such as 'Version:', found by text, not position."""
    found = [cells[c + 1] for _, cells in rows for c, v in cells.items() if v.strip() == label and (c + 1) in cells]
    if len(set(found)) != 1:
        die(f"expected exactly one value beside {label!r} in {SHEET!r}, found {found}")
    return found[0].strip()


# ── READ ───────────────────────────────────────────────────────────────────────────────────────────

z, shared, sheets = open_workbook(INPUT)

intro = read_sheet(z, shared, sheets, "Introduction")
if not intro or intro[0][1].get(0) != TITLE_AS_PUBLISHED:
    die(f"Introduction row 1 is not {TITLE_AS_PUBLISHED!r}: {intro[0] if intro else None}")
if not any("Fifth Assessment Report (AR5)" in v for _, cells in intro for v in cells.values()):
    die("the Introduction sheet no longer states the AR5 GWP basis; gwp_basis cannot be recorded as AR5")

rows = read_sheet(z, shared, sheets, SHEET)
if rows[0][1].get(0) != TITLE_AS_PUBLISHED:
    die(f"{SHEET!r} row 1 is not {TITLE_AS_PUBLISHED!r}")

sheet_version = labelled_value(rows, "Version:")
sheet_year = labelled_value(rows, "Year:")
factor_set = labelled_value(rows, "Factor set:")
scope = labelled_value(rows, "Scope:")
if sheet_year != str(YEAR):
    die(f"{SHEET!r} Year cell reads {sheet_year!r}; this generator is for {YEAR}")

by_number = {n: cells for n, cells in rows}
ordered = [n for n, _ in rows]


def route_name(v: str):
    """The app's name for a route header cell (a published name mapped through ROUTE_PUBLISHED_AS), or None."""
    t = v.strip()
    t = ROUTE_PUBLISHED_AS.get(t, t)
    return t if t in ROUTES else None


def route_columns(cells: dict):
    """If this row is a route header, [(column, route, name as published)] in column order; else None.

    Found by LABEL. Every cell of the row must be a route; the routes must sit in contiguous columns and in ROUTES
    order. For 2026 the full sequence is still required, as before."""
    named = sorted((c, route_name(v), v.strip()) for c, v in cells.items() if route_name(v))
    if len(named) < 2:
        return None
    extra = {c: v for c, v in cells.items() if not route_name(v)}
    if extra:
        die(f"route header row carries unexpected cells {extra}")
    cols = [c for c, _, _ in named]
    order = [r for _, r, _ in named]
    if cols != list(range(cols[0], cols[0] + len(cols))) or order != [r for r in ROUTES if r in order] or len(set(order)) != len(order):
        die(f"a row names routes {order} in columns {cols}: not contiguous, or not in the order {ROUTES}; the layout has changed")
    if STRICT and order != ROUTES:
        die(f"a row names routes {order} but not the expected sequence {ROUTES}; the layout has changed")
    return named


def col_letter(i: int) -> str:
    s, i = "", i + 1
    while i:
        i, rem = divmod(i - 1, 26)
        s = chr(65 + rem) + s
    return s


renamed = {}
header_routes = set()
blocks = []
records = []
no_route_materials = []
consumed_rows = set()

for i, n in enumerate(ordered):
    cols = route_columns(by_number[n])
    if cols is None:
        continue

    # The column-header row must be the very next row.
    h = n + 1
    header = by_number.get(h)
    if header is None:
        die(f"route header at row {n} is not followed by a column-header row")
    act_cols = [c for c, v in header.items() if v.strip() == "Activity"]
    if len(act_cols) != 1:
        die(f"row {h}: expected one 'Activity' header, found {act_cols}")
    a = act_cols[0]
    if header.get(a + 1, "").strip() != "Waste type" or header.get(a + 2, "").strip() != "Unit":
        die(f"row {h}: expected Activity | Waste type | Unit, found {[header.get(a + k) for k in range(3)]}")
    route_cols = cols
    cols = [c for c, _, _ in route_cols]
    if cols[0] != a + 3:
        die(f"row {h}: the first route column ({cols[0]}) is not immediately right of Unit ({a + 2})")
    for c, route, _ in route_cols:
        got = header.get(c, "").strip()
        if got != EXPECTED_VALUE_HEADER:
            die(f"row {h}: the value header under {route!r} reads {got!r}, not {EXPECTED_VALUE_HEADER!r}")
    header_routes.update(route for _, route, _ in route_cols)
    for c, route, published in route_cols:
        if published != route:
            renamed.setdefault(published, {"as": route, "header_cells": []})["header_cells"].append(f"{col_letter(c)}{n}")
    allowed_header = {a, a + 1, a + 2, *cols}
    stray = {c: v for c, v in header.items() if c not in allowed_header}
    if stray:
        die(f"row {h}: unexpected cells in the column-header row {stray}")

    # Data rows: consecutive row numbers after the header, each with a Waste type. The first gap or the
    # first row without a Waste type ends the block.
    activity = None
    materials = []
    r = h + 1
    while r in by_number and by_number[r].get(a + 1, "").strip():
        cells = by_number[r]
        stray = {c: v for c, v in cells.items() if c not in allowed_header}
        if stray:
            die(f"row {r}: cells outside Activity/Waste type/Unit/route columns {stray}")
        if cells.get(a, "").strip():
            if activity is not None:
                die(f"row {r}: a second Activity {cells[a]!r} inside block {activity!r}")
            activity = cells[a].strip()
        if activity is None:
            die(f"row {r}: data row before any Activity in its block")
        unit = cells.get(a + 2, "").strip()
        if unit != EXPECTED_UNIT:
            die(f"row {r} ({cells.get(a + 1)!r}): Unit reads {unit!r}, not {EXPECTED_UNIT!r}")

        waste_type = cells[a + 1].strip()
        routes_here = []
        for c, route, published in route_cols:
            raw = cells.get(c)
            if raw is None:
                continue   # ⚠️ AN EMPTY CELL IS AN ABSENT ROUTE, NOT ZERO. No record is written.
            try:
                value = float(raw)
            except ValueError:
                die(f"row {r} ({waste_type!r}, {route}): {raw!r} is not a number")
            records.append({
                "activity": activity,
                "waste_type": waste_type,
                "route": route,
                "unit": f"{EXPECTED_VALUE_HEADER} per tonne",
                "value": value,
                # T3e: the value's own cell, and the route's name as published where it differs from the app's.
                "cell": f"{col_letter(c)}{r}",
                **({"route_as_published": published} if published != route else {}),
            })
            routes_here.append(route)
        if not routes_here:
            no_route_materials.append(f"{activity} / {waste_type}")
        materials.append({"waste_type": waste_type, "routes": routes_here})
        consumed_rows.add(r)
        r += 1

    if activity is None:
        die(f"route header at row {n} has no data rows")
    blocks.append({"activity": activity, "materials": materials})

# The routes this edition prints a column for, in ROUTES order: all seven for 2026 (as before); no Re-use in 2025.
present_routes = [r for r in ROUTES if r in header_routes]
if len(blocks) != EXPECTED_BLOCKS:
    die(f"found {len(blocks)} blocks, expected {EXPECTED_BLOCKS}: {[b['activity'] for b in blocks]}")

# Any row outside a block that looks like a data row means a block was not recognised.
orphans = [n for n, cells in rows if n not in consumed_rows and any(v.strip() == EXPECTED_UNIT for v in cells.values())]
if orphans:
    die(f"rows carrying a '{EXPECTED_UNIT}' unit outside any recognised block: {orphans}")

seen = set()
for rec in records:
    key = (rec["activity"], rec["waste_type"], rec["route"])
    if key in seen:
        die(f"duplicate record {key}")
    seen.add(key)

reuse_values = [rec for rec in records if rec["route"] == "Re-use"]

# The workbook's own FAQ on Re-use, found by its question text.
faq_q = [n for n, cells in rows if any('"Re-use"' in v and v.strip().endswith("?") for v in cells.values())]
if not faq_q and not STRICT:
    faq_question = faq_answer = None   # this edition prints no Re-use FAQ (2023)
else:
    if len(faq_q) != 1:
        die(f"expected one FAQ question about \"Re-use\", found rows {faq_q}")
    faq_question = next(v for v in by_number[faq_q[0]].values()).strip()
    faq_answer_row = by_number.get(faq_q[0] + 1)
    if not faq_answer_row:
        die("the Re-use FAQ question has no answer row beneath it")
    faq_answer = next(v for v in faq_answer_row.values()).strip()

# The sheet's own guidance on what landfill and recycling factors include.
scope_guidance_cells = [(n, c, v.strip()) for n, cells in rows for c, v in cells.items() if v.strip().startswith("●  For landfill")]
scope_guidance = [t for _, _, t in scope_guidance_cells]
if len(scope_guidance) != 1:
    die(f"expected one landfill-scope guidance line, found {len(scope_guidance)}")

# ⚠️ AND ITS WARNING AGAINST COMPARING ROUTES. Landfill is gate to grave; combustion and recycling are
# transport to the facility only, so a panel listing both invites a comparison the publisher rules out.
# Captured verbatim so a surface can quote it rather than paraphrase it.
lifecycle_guidance = [v.strip() for _, cells in rows for v in cells.values()
                      if v.strip().startswith("●  These factors cannot be used to determine the relative lifecycle merit")]
if len(lifecycle_guidance) != 1:
    die(f"expected one lifecycle-merit guidance line, found {len(lifecycle_guidance)}")

# ── FINGERPRINT — same convention as countryRegions.json and exiobaseSectors.json ────────────────
# sha256 over the ROWS only, sorted and compactly separated. Metadata is excluded because
# generated_on changes every run, which is also what makes it safe to store the digest in metadata.
payload_rows = json.dumps({"factors": records}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
digest = hashlib.sha256(payload_rows.encode("utf-8")).hexdigest()
# T3e: the same digest over the values alone (cell and route_as_published removed), which is the convention the
# 2026 artefact was pinned under before cells were recorded. It shows a regenerated 2026 moved no value.
values_only = [{k: v for k, v in rec.items() if k not in ("cell", "route_as_published")} for rec in records]
values_digest = hashlib.sha256(json.dumps({"factors": values_only}, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
if renamed:
    sg_n, sg_c, _ = scope_guidance_cells[0]
    for v in renamed.values():
        v["definition_cell"] = f"{col_letter(sg_c)}{sg_n}"
        v["definition"] = scope_guidance[0]
input_digest = hashlib.sha256(INPUT.read_bytes()).hexdigest()

payload = {
    "metadata": {
        "source": CITATION,
        "title_as_published": TITLE_AS_PUBLISHED,
        "edition": EDITION,
        "factor_set": factor_set,
        "file_version": sheet_version,
        "year": sheet_year,
        "sheet": SHEET,
        "scope": scope,
        "gwp_basis": "AR5",
        "gwp_basis_note": (
            "Stated by the workbook's Introduction sheet: the CO2e figures use IPCC Fifth Assessment Report "
            "(AR5) 100-year GWPs. The values are combined CO2e as published and are not re-based."
        ),
        "unit": f"{EXPECTED_VALUE_HEADER} per tonne",
        "unit_note": (
            f"Asserted, not assumed: every data row's Unit cell reads '{EXPECTED_UNIT}' and every value column "
            f"header reads '{EXPECTED_VALUE_HEADER}'. The generator aborts on anything else."
        ),
        # ⚠️ THE LICENCE COMES FROM THE PUBLICATION PAGE, NOT THE WORKBOOK, so it cannot be asserted from a
        # cell and is recorded here by hand, with its basis. attribution_required is the wording OGL v3.0
        # prescribes where the Information Provider gives no attribution statement of its own: a required
        # string, to be shown verbatim wherever a figure from these factors is, never paraphrased.
        "licence": "Open Government Licence v3.0 (OGL v3.0)",
        "licence_url": "http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
        "licence_basis": (
            f"OGL v3.0 is the licence DESNZ states on the gov.uk page for each edition of these factors. For the {YEAR} "
            "edition that page was not read by this generator; the statement was verified for the 2026 page on 17 Sep "
            "2026. The workbook itself states no licence."
        ) if not STRICT else (
            "Stated on the publication page on gov.uk, verified 17 Sep 2026. The workbook itself states no "
            "licence; this comes from the page it is published on. The statement carries an 'except where "
            "otherwise stated' exception, and the workbook draws on external sources, so a particular value "
            "could sit outside it; nothing on the Waste disposal sheet is marked as such."
        ),
        "attribution_required": "Contains public sector information licensed under the Open Government Licence v3.0.",
        "licence_note": (
            "OGL v3.0 permits copying, publishing, adapting and commercial use, on condition of attribution. It "
            "is NOT share-alike, which distinguishes it from the CC BY-SA 4.0 EXIOBASE inputs in the same "
            "inventory. It is compatible with CC BY 4.0: complying with that licence automatically satisfies "
            "OGL. It grants no right to imply official status, or endorsement by the Information Provider. It "
            "excludes third-party rights the Information Provider is not authorised to license."
        ),
        "first_defra_source_file_note": (
            "The first DEFRA/DESNZ source file committed to this repository. Every DEFRA value in "
            "lib/ghg/engine.ts was transcribed by hand; these are generated from the workbook."
        ),
        "absent_route_note": (
            "AN EMPTY CELL IS AN ABSENT ROUTE, NOT A ROUTE WITH ZERO EMISSIONS, and no record is written for "
            "it. The matrix is sparse: not every material has a published factor for every treatment route. "
            "Reading an empty cell as 0 would report a material sent down an unpublished route as emissions-free "
            "rather than as unpriceable. The workbook distinguishes 'not available' (light-shaded empty cell) "
            "from 'invalid combination of criteria' (dark-shaded empty cell) by fill colour only; this "
            "generator does not read cell styles, so both are recorded as absent without that distinction."
        ),
        "reuse_note": (
            f"Re-use has {len(reuse_values)} published values in this sheet. The workbook's own FAQ: "
            f"{faq_question} {faq_answer}"
        ) if faq_question else (
            f"Re-use has {len(reuse_values)} published values in this sheet"
            + ("" if "Re-use" in present_routes else ", which prints no Re-use column")
            + ". This edition prints no FAQ on Re-use."
        ),
        "scope_guidance": scope_guidance[0],
        "lifecycle_guidance": lifecycle_guidance[0],
        "reuse_faq_question": faq_question,
        "reuse_faq_answer": faq_answer,
        "generated_on": date.today().isoformat(),
        "generated_from": INPUT.name,
        "generated_from_sha256": input_digest,
        "generated_by": "scripts/generate-defra-waste.py",
        "routes": present_routes,
        # T3e: a route DEFRA published under another name in this edition, read as the app's route, with the
        # header cells and the sheet's own definition (Lisa's ruling, 8 Oct 2026). Empty where none was renamed.
        "route_renames": [{"published": k, **v} for k, v in renamed.items()],
        "blocks": [
            {
                "activity": b["activity"],
                "materials": len(b["materials"]),
                "routes_present": [r for r in ROUTES if any(r in m["routes"] for m in b["materials"])],
            }
            for b in blocks
        ],
        "records": len(records),
        "materials_with_no_routes": no_route_materials,
        "fingerprint_sha256": digest,
        "values_fingerprint_sha256": values_digest,
    },
    "factors": records,
}

OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

# ── PRINT ──────────────────────────────────────────────────────────────────────────────────────────
print(f"wrote {OUT}  ({OUT.stat().st_size:,} bytes)")
print(f"  input {INPUT.name}  sha256 {input_digest}")
print(f"  {TITLE_AS_PUBLISHED} — {factor_set}, Version {sheet_version}, Year {sheet_year}, sheet {SHEET!r} ({scope})")
print(f"  citation: {CITATION}   edition: {EDITION}   gwp_basis: AR5")
print(f"\n  blocks: {len(blocks)}")
for b in blocks:
    present = [r for r in ROUTES if any(r in m["routes"] for m in b["materials"])]
    print(f"    {b['activity']:<18} {len(b['materials']):>2} materials   routes: {', '.join(present)}")
    for m in b["materials"]:
        print(f"        {m['waste_type']:<48} {', '.join(m['routes']) or '(none)'}")
print(f"\n  total records: {len(records)}")
print(f"  materials with no routes at all: {no_route_materials or 'none'}")
print(f"  Re-use values: {len(reuse_values)}")
print(f"  Re-use FAQ: {faq_question} / {faq_answer}")
cai = [rec for rec in records if rec["waste_type"] == "Commercial and industrial waste" and rec["route"] == "Landfill"]
if len(cai) != 1:
    die(f"expected one Commercial and industrial waste / Landfill record, found {len(cai)}")
print(f"  Commercial and industrial waste, Landfill: {cai[0]['value']} {cai[0]['unit']}")
print(f"\n  factors sha256: {digest}")
print(f"  values sha256:  {values_digest}")
print(f"  route renames: {renamed or 'none'}")
