#!/usr/bin/env python3
"""
Extract the DEFRA/DESNZ 2026 business travel conversion factors into
lib/emissionFactors/defraTravel2026.json.

    python3 scripts/generate-defra-travel.py

INPUT: data/reference/defra-desnz-ghg-conversion-factors-2026-full-set-v1.xlsx — the same committed
       workbook scripts/generate-defra-waste.py reads ("UK Government GHG Conversion Factors for Company
       Reporting", 2026, Full set, Version 1).

READ BY lib/emissionFactors/defraTravel.ts. Nothing prices from it yet: this artefact is task A of the
Cat 6 rebuild, generated before any calculation reads it.

SIX SHEETS, SIX TABLES:
  Business travel- air            every haul x class row, with RF and without RF, each as published
                                  (total kg CO2e, and the CO2 / CH4 / N2O components), per passenger.km
  WTT- business travel- air       the matching well-to-tank rows
  Haul definition                 ISO3 -> haul (Domestic / Short Haul / Long Haul) for every territory
  Hotel stay                      country -> kg CO2e per room per night; a country listed with an empty
                                  value cell is recorded with value null — ABSENT, not zero
  Business travel- land           the four Rail rows only
  WTT- pass vehs & travel- land   the four matching WTT- rail rows

Every record carries its sheet, its row and the cells its values were read from, so any figure can be
checked against the workbook by eye.

⚠️ NO DATA ROW NUMBERS ARE HARDCODED. Each table is FOUND by its column-header row (and, for the air
sheets, the With RF / Without RF row above it); labels are carried down the way the sheet prints them.
Every label is mapped through a closed dictionary below, and an unknown label, a changed unit or a
stray cell aborts rather than being read. The guidance cells are found by the opening words of their
text, and the cell each was found in is recorded, so a moved paragraph is still quoted and the move is
visible in the artefact.

⚠️ AN EMPTY VALUE CELL IS NEVER ZERO. On the air, WTT and rail sheets an empty value cell aborts (none
is expected). On the Hotel stay sheet it is expected — 16 of 55 countries publish no factor — and the
record carries value null.

⚠️ NOT openpyxl, for the reason given in generate-defra-waste.py: cells are read by A1 reference.

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
INPUT = ROOT / "data" / "reference" / "defra-desnz-ghg-conversion-factors-2026-full-set-v1.xlsx"
OUT = ROOT / "lib" / "emissionFactors" / "defraTravel2026.json"

AIR = "Business travel- air"
WTT_AIR = "WTT- business travel- air"
HAUL = "Haul definition"
HOTEL = "Hotel stay"
LAND = "Business travel- land"
WTT_LAND = "WTT- pass vehs & travel- land"

# ── CLOSED LABEL DICTIONARIES. Anything the sheet prints that is not here aborts the run. ────────
AIR_CATEGORY = {
    "Domestic, to/from UK": "domestic",
    "Short-haul, to/from UK": "short_haul",
    "Long-haul, to/from UK": "long_haul",
    "International, to/from non-UK": "international_non_uk",
}
CABIN_CLASS = {
    "Average passenger": "average_passenger",
    "Economy class": "economy",
    "Premium economy class": "premium_economy",
    "Business class": "business",
    "First class": "first",
}
# The Haul definition sheet's three hauls, and the air category a flight with a UK end takes from each.
HAUL_DEFINITION = {
    "Domestic": "domestic",
    "Short Haul": "short_haul",
    "Long Haul": "long_haul",
}
RAIL_TYPES = ["National rail", "International rail", "Light rail and tram", "London Underground"]

PASSENGER_KM = "passenger.km"
ROOM_NIGHT = "Room per night"
GAS_HEADERS = ["kg CO2e", "kg CO2e of CO2 per unit", "kg CO2e of CH4 per unit", "kg CO2e of N2O per unit"]

# ── THE CITATION — MUST MATCH lib/ghg/engine.ts (asserted by defraTravel2026.test.ts) ────────────
PUBLISHERS = "DEFRA/DESNZ"
TITLE = "GHG Conversion Factors for Company Reporting"
TITLE_AS_PUBLISHED = "UK Government GHG Conversion Factors for Company Reporting"
YEAR = 2026
CITATION = f"UK {PUBLISHERS} ({YEAR}) {TITLE}"
EDITION = f"DEFRA {YEAR}"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def die(msg: str) -> None:
    sys.stderr.write(f"\nABORT: {msg}\n\nNothing was written.\n")
    sys.exit(1)


# ── XLSX, BY CELL REFERENCE (as generate-defra-waste.py) ─────────────────────────────────────────

def col_index(ref: str) -> int:
    m = re.match(r"([A-Z]+)\d+$", ref)
    if not m:
        die(f"unreadable cell reference {ref!r}")
    n = 0
    for ch in m.group(1):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def col_letter(i: int) -> str:
    s, i = "", i + 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def cell(col: int, row: int) -> str:
    return f"{col_letter(col)}{row}"


def span(c0: int, c1: int, row: int) -> str:
    return f"{cell(c0, row)}:{cell(c1, row)}"


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


def read_sheet(z, shared, sheets, name: str) -> dict:
    """{row_number: {col_index: text}} for every row present, whitespace-only cells treated as empty."""
    if name not in sheets:
        die(f"sheet {name!r} not found; sheets are: {list(sheets)}")
    rows = {}
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
        rows[int(row.get("r"))] = cells
    return rows


def labelled_value(rows: dict, sheet: str, label: str) -> str:
    found = [cells[c + 1] for cells in rows.values() for c, v in cells.items() if v.strip() == label and (c + 1) in cells]
    if len(set(found)) != 1:
        die(f"expected exactly one value beside {label!r} in {sheet!r}, found {found}")
    return found[0].strip()


def number(raw, where: str) -> float:
    if raw is None:
        die(f"{where}: empty value cell (an empty cell is never read as zero)")
    try:
        return float(raw)
    except ValueError:
        die(f"{where}: {raw!r} is not a number")


def header_rows(rows: dict, sheet: str, labels: list) -> list:
    """Rows whose cells, from the first label onwards, begin with `labels` in consecutive columns."""
    out = []
    for n, cells in rows.items():
        for c, v in cells.items():
            if v.strip() == labels[0] and all(cells.get(c + i, "").strip() == lab for i, lab in enumerate(labels)):
                out.append((n, c))
    return out


# ── READ ───────────────────────────────────────────────────────────────────────────────────────────

z, shared, sheets = open_workbook(INPUT)

intro = read_sheet(z, shared, sheets, "Introduction")
if intro.get(1, {}).get(0) != TITLE_AS_PUBLISHED:
    die(f"Introduction row 1 is not {TITLE_AS_PUBLISHED!r}")
if not any("Fifth Assessment Report (AR5)" in v for cells in intro.values() for v in cells.values()):
    die("the Introduction sheet no longer states the AR5 GWP basis; gwp_basis cannot be recorded as AR5")

SHEETS = {}
sheet_meta = {}
for name in (AIR, WTT_AIR, HAUL, HOTEL, LAND, WTT_LAND):
    rows = read_sheet(z, shared, sheets, name)
    if rows.get(1, {}).get(0) != TITLE_AS_PUBLISHED:
        die(f"{name!r} row 1 is not {TITLE_AS_PUBLISHED!r}")
    if rows.get(2, {}).get(0, "").strip() != name:
        die(f"{name!r} row 2 does not name the sheet: {rows.get(2)}")
    SHEETS[name] = rows
    if name != HAUL:   # the Haul definition sheet has no Version/Year/Scope block
        meta = {k: labelled_value(rows, name, f"{k}:") for k in ("Version", "Year", "Scope", "Factor set")}
        if meta["Year"] != str(YEAR):
            die(f"{name!r} Year cell reads {meta['Year']!r}; this generator is for {YEAR}")
        sheet_meta[name] = meta

versions = {m["Version"] for m in sheet_meta.values()}
factor_sets = {m["Factor set"] for m in sheet_meta.values()}
scopes = {m["Scope"] for m in sheet_meta.values()}
if len(versions) != 1 or len(factor_sets) != 1 or scopes != {"Scope 3"}:
    die(f"sheets disagree on version/factor set, or are not all Scope 3: {sheet_meta}")


# ── AIR AND WTT AIR ────────────────────────────────────────────────────────────────────────────────

def read_air_table(sheet: str, value_headers: list, activity: str) -> list:
    rows = SHEETS[sheet]
    hdrs = header_rows(rows, sheet, ["Activity", "Haul", "Class", "Unit"])
    if len(hdrs) != 1:
        die(f"{sheet!r}: expected one Activity | Haul | Class | Unit header row, found {hdrs}")
    h, a = hdrs[0]
    header = rows[h]
    above = rows.get(h - 1, {})
    rf_cols = [c for c, v in above.items() if v.strip() == "With RF"]
    no_cols = [c for c, v in above.items() if v.strip() == "Without RF"]
    if len(rf_cols) != 1 or len(no_cols) != 1 or set(above) != {rf_cols[0], no_cols[0]}:
        die(f"{sheet!r} row {h - 1}: expected exactly 'With RF' and 'Without RF', found {above}")
    rf, no = rf_cols[0], no_cols[0]
    width = len(value_headers)
    if rf != a + 4 or no != rf + width:
        die(f"{sheet!r}: With RF at {col_letter(rf)}, Without RF at {col_letter(no)}; expected {col_letter(a + 4)} and {col_letter(a + 4 + width)}")
    for base, label in ((rf, "With RF"), (no, "Without RF")):
        got = [header.get(base + i, "").strip() for i in range(width)]
        if got != value_headers:
            die(f"{sheet!r} row {h} under {label}: headers {got}, expected {value_headers}")
    allowed = set(range(a, no + width))
    if set(header) - allowed:
        die(f"{sheet!r} row {h}: unexpected header cells {set(header) - allowed}")

    out, haul, haul_row, act = [], None, None, None
    r = h + 1
    while r in rows and rows[r].get(a + 2, "").strip():
        cells = rows[r]
        stray = set(cells) - allowed
        if stray:
            die(f"{sheet!r} row {r}: cells outside the table {stray}")
        if cells.get(a, "").strip():
            if act is not None:
                die(f"{sheet!r} row {r}: a second Activity {cells[a]!r}")
            act = cells[a].strip()
            if act != activity:
                die(f"{sheet!r} row {r}: Activity reads {act!r}, expected {activity!r}")
        if cells.get(a + 1, "").strip():
            haul = cells[a + 1].strip()
            haul_row = r
            if haul not in AIR_CATEGORY:
                die(f"{sheet!r} row {r}: unknown haul {haul!r}")
        if haul is None or act is None:
            die(f"{sheet!r} row {r}: data row before its Activity or Haul")
        cls = cells[a + 2].strip()
        if cls not in CABIN_CLASS:
            die(f"{sheet!r} row {r}: unknown class {cls!r}")
        unit = cells.get(a + 3, "").strip()
        if unit != PASSENGER_KM:
            die(f"{sheet!r} row {r}: Unit reads {unit!r}, not {PASSENGER_KM!r}")

        def block(base):
            vals = [number(cells.get(base + i), f"{sheet!r} {cell(base + i, r)}") for i in range(width)]
            return vals, span(base, base + width - 1, r) if width > 1 else cell(base, r)

        rf_vals, rf_ref = block(rf)
        no_vals, no_ref = block(no)
        out.append({
            "haul_as_published": haul, "class_as_published": cls,
            "category": AIR_CATEGORY[haul], "cabin_class": CABIN_CLASS[cls],
            "rf_vals": rf_vals, "no_vals": no_vals,
            "sheet": sheet, "row": r,
            "cells": {"haul": cell(a + 1, haul_row), "class": cell(a + 2, r), "unit": cell(a + 3, r),
                      "with_rf": rf_ref, "without_rf": no_ref},
        })
        r += 1
    if not out:
        die(f"{sheet!r}: no data rows under the header at row {h}")
    # Any other passenger.km row on the sheet means a second table was not recognised.
    stray_rows = [n for n, cells in rows.items() if n not in {x["row"] for x in out} and any(v.strip() == PASSENGER_KM for v in cells.values())]
    if stray_rows:
        die(f"{sheet!r}: passenger.km rows outside the table: {stray_rows}")
    return out


def gases(vals):
    return {"kg_co2e": vals[0], "co2": vals[1], "ch4": vals[2], "n2o": vals[3]}


air_raw = read_air_table(AIR, GAS_HEADERS, "Flights")
air = [{
    "category": x["category"], "cabin_class": x["cabin_class"],
    "haul_as_published": x["haul_as_published"], "class_as_published": x["class_as_published"],
    "unit": "kg CO2e per passenger.km",
    "with_rf": gases(x["rf_vals"]), "without_rf": gases(x["no_vals"]),
    "sheet": x["sheet"], "row": x["row"], "cells": x["cells"],
} for x in air_raw]

wtt_raw = read_air_table(WTT_AIR, ["kg CO2e"], "WTT- flights")
wtt_air = [{
    "category": x["category"], "cabin_class": x["cabin_class"],
    "haul_as_published": x["haul_as_published"], "class_as_published": x["class_as_published"],
    "unit": "kg CO2e per passenger.km",
    "with_rf": x["rf_vals"][0], "without_rf": x["no_vals"][0],
    "sheet": x["sheet"], "row": x["row"], "cells": x["cells"],
} for x in wtt_raw]

for name, recs in (("air", air), ("WTT air", wtt_air)):
    keys = [(r["category"], r["cabin_class"]) for r in recs]
    if len(keys) != len(set(keys)):
        die(f"duplicate {name} (category, class) rows")
if {(r["category"], r["cabin_class"]) for r in air} != {(r["category"], r["cabin_class"]) for r in wtt_air}:
    die("the WTT air rows do not match the air rows one for one")


# ── HAUL DEFINITION ────────────────────────────────────────────────────────────────────────────────

rows = SHEETS[HAUL]
hdrs = header_rows(rows, HAUL, ["Territory", "ISO3_Country_Code", "Haul"])
if len(hdrs) != 1:
    die(f"{HAUL!r}: expected one Territory | ISO3_Country_Code | Haul header, found {hdrs}")
h, a = hdrs[0]
hauls = []
for n in sorted(k for k in rows if k > h):
    cells = rows[n]
    if not cells:
        continue
    if set(cells) != {a, a + 1, a + 2}:
        die(f"{HAUL!r} row {n}: expected Territory, ISO3 and Haul, found {cells}")
    iso3, haul = cells[a + 1].strip(), cells[a + 2].strip()
    if not re.fullmatch(r"[A-Z]{3}", iso3):
        die(f"{HAUL!r} row {n}: ISO3 code {iso3!r} is not three capital letters")
    if haul not in HAUL_DEFINITION:
        die(f"{HAUL!r} row {n}: unknown haul {haul!r}")
    hauls.append({"territory": cells[a].strip(), "iso3": iso3, "haul": HAUL_DEFINITION[haul], "haul_as_published": haul,
                  "sheet": HAUL, "row": n, "cells": span(a, a + 2, n)})
iso_seen = [x["iso3"] for x in hauls]
dups = sorted({i for i in iso_seen if iso_seen.count(i) > 1})
if dups:
    die(f"{HAUL!r}: ISO3 codes listed more than once: {dups}")


# ── HOTEL STAY ─────────────────────────────────────────────────────────────────────────────────────

rows = SHEETS[HOTEL]
hdrs = header_rows(rows, HOTEL, ["Activity", "Country", "Unit", "kg CO2e"])
if not hdrs:
    die(f"{HOTEL!r}: no Activity | Country | Unit | kg CO2e header row")
hotels = []
for h, a in hdrs:
    r = h + 1
    while r in rows and rows[r].get(a + 1, "").strip():
        cells = rows[r]
        if set(cells) - {a, a + 1, a + 2, a + 3}:
            die(f"{HOTEL!r} row {r}: cells outside the table {cells}")
        if cells.get(a, "").strip() not in ("", "Hotel stay"):
            die(f"{HOTEL!r} row {r}: Activity reads {cells[a]!r}")
        if cells.get(a + 2, "").strip() != ROOM_NIGHT:
            die(f"{HOTEL!r} row {r}: Unit reads {cells.get(a + 2)!r}, not {ROOM_NIGHT!r}")
        raw = cells.get(a + 3)
        # ⚠️ EXPECTED EMPTY CELLS: the sheet lists countries it publishes no factor for. null, never 0.
        value = None if raw is None else number(raw, f"{HOTEL!r} {cell(a + 3, r)}")
        hotels.append({"country": cells[a + 1].strip(), "kg_co2e_per_room_night": value,
                       "sheet": HOTEL, "row": r, "cells": {"country": cell(a + 1, r), "value": cell(a + 3, r)}})
        r += 1
names = [x["country"] for x in hotels]
if len(names) != len(set(names)):
    die(f"{HOTEL!r}: a country is listed twice")
room_rows = {n for n, cells in rows.items() if any(v.strip() == ROOM_NIGHT for v in cells.values())}
if room_rows != {x["row"] for x in hotels}:
    die(f"{HOTEL!r}: '{ROOM_NIGHT}' rows outside the recognised tables: {sorted(room_rows - {x['row'] for x in hotels})}")


# ── RAIL AND WTT RAIL ──────────────────────────────────────────────────────────────────────────────

def read_rail(sheet: str, activity: str, value_headers: list) -> list:
    rows = SHEETS[sheet]
    hdrs = [(h, a) for h, a in header_rows(rows, sheet, ["Activity", "Type", "Unit"] + value_headers)
            if rows.get(h + 1, {}).get(a, "").strip() == activity]
    if len(hdrs) != 1:
        die(f"{sheet!r}: expected one table whose first Activity is {activity!r}, found {hdrs}")
    h, a = hdrs[0]
    width = len(value_headers)
    if set(rows[h]) != set(range(a, a + 3 + width)):
        die(f"{sheet!r} row {h}: the rail header row carries extra columns {rows[h]}")
    out = []
    r = h + 1
    while r in rows and rows[r].get(a + 1, "").strip():
        cells = rows[r]
        if set(cells) - set(range(a, a + 3 + width)):
            die(f"{sheet!r} row {r}: cells outside the table {cells}")
        if r > h + 1 and cells.get(a, "").strip():
            die(f"{sheet!r} row {r}: a second Activity {cells[a]!r}")
        if cells.get(a + 2, "").strip() != PASSENGER_KM:
            die(f"{sheet!r} row {r}: Unit reads {cells.get(a + 2)!r}, not {PASSENGER_KM!r}")
        vals = [number(cells.get(a + 3 + i), f"{sheet!r} {cell(a + 3 + i, r)}") for i in range(width)]
        out.append((cells[a + 1].strip(), vals, r, span(a + 3, a + 2 + width, r) if width > 1 else cell(a + 3, r), cell(a + 1, r)))
        r += 1
    types = [t for t, *_ in out]
    if types != RAIL_TYPES:
        die(f"{sheet!r}: rail types {types}, expected {RAIL_TYPES}")
    return out


rail = [{"type": t, "unit": "kg CO2e per passenger.km", **gases(v), "sheet": LAND, "row": r,
         "cells": {"type": tc, "values": ref}} for t, v, r, ref, tc in read_rail(LAND, "Rail", GAS_HEADERS)]
wtt_rail = [{"type": t, "unit": "kg CO2e per passenger.km", "kg_co2e": v[0], "sheet": WTT_LAND, "row": r,
             "cells": {"type": tc, "value": ref}} for t, v, r, ref, tc in read_rail(WTT_LAND, "WTT- rail", ["kg CO2e"])]


# ── GUIDANCE, QUOTED VERBATIM, FOUND BY ITS OPENING WORDS ───────────────────────────────────────────

def quote(sheet: str, opening: str) -> dict:
    found = [(n, c, v.strip()) for n, cells in SHEETS[sheet].items() for c, v in cells.items() if v.strip().startswith(opening)]
    if len(found) != 1:
        die(f"{sheet!r}: expected one cell opening {opening!r}, found {[(cell(c, n)) for n, c, _ in found]}")
    n, c, text = found[0]
    return {"sheet": sheet, "cell": cell(c, n), "text": text}


guidance = {
    # Radiative forcing: what it is, the publisher's recommendation, and the consistency warning.
    "rf_two_sets": quote(AIR, "●  Emissions from aviation have both direct"),
    "rf_should_include": quote(AIR, "●  Organisations should include the indirect effects"),
    "rf_comparable_reporting": quote(AIR, "●  Organisations should produce comparable reporting"),
    "rf_faq_which_set": quote(AIR, "Users should generally use the ‘including indirect effects"),
    "rf_faq_indirect_effects": quote(AIR, "Indirect effects refer to the contribution"),
    # Distance uplift.
    "distance_uplift": quote(AIR, "All the factors include the distance uplift"),
    # The international (non-UK) factors, and that every air factor is for direct (non-stop) flights.
    "international_and_non_stop": quote(AIR, "In the 2015 update, a brand new set of aviation factors"),
    "international_is_average": quote(AIR, "Please note - the international business travel factors are an average"),
    # Beyond the cells named for task A, kept because task B turns on them:
    "class_unknown_use_average": quote(AIR, "The company then multiplies the distance (km) travelled in each class"),
    "wtt_air_rf_identical": quote(WTT_AIR, "●  Factors are provided including/excluding the indirect effects"),
    "hotel_average_class": quote(HOTEL, "●  The conversion factors provided are for an average class of hotel"),
    "hotel_country_average": quote(HOTEL, "●  Unless otherwise stated, conversion factors provided are an average"),
    "hotel_per_room": quote(HOTEL, "●  The conversion factors are provided on a 'room per night' basis"),
    "hotel_source": quote(HOTEL, "The hotel stay conversion factors are taken from the Hotel Footprinting Tool"),
    "hotel_missing_country": quote(HOTEL, "The provision of conversion factors is limited by the availability"),
    "land_vehicle_vs_passenger_km": quote(LAND, "●  Users should be mindful of the difference between vehicle km"),
}


# ── WHEN EACH AIR SHEET WAS LAST UPDATED, FROM THE INDEX SHEET ─────────────────────────────────────
# The Index sheet's "Factors Updated Periodically" column says which publication last changed each sheet.
# The flight factors and the WTT flight factors come from different publications (2025 and 2023), and the
# two imply different fuel use per passenger-km, so a Cat 6 disclosure cites these two cells. Found by the
# sheet name in column A and the column's own header, not by row number.
index_rows = read_sheet(z, shared, sheets, "Index")
periodic = [(n, c) for n, cells in index_rows.items() for c, v in cells.items() if v.strip() == "Factors Updated Periodically"]
# One header per scope section; all in the same column, or the layout has changed.
if not periodic or len({c for _, c in periodic}) != 1:
    die(f"Index: expected every 'Factors Updated Periodically' header in one column, found {periodic}")
pcol = periodic[0][1]


def index_note(sheet_name: str) -> dict:
    found = [n for n, cells in index_rows.items() if cells.get(0, "").strip() == sheet_name]
    if len(found) != 1:
        die(f"Index: expected one row naming {sheet_name!r}, found {found}")
    text = index_rows[found[0]].get(pcol, "").strip()
    if not text.startswith("Factors last updated in "):
        die(f"Index {cell(pcol, found[0])}: {text!r} does not state when {sheet_name!r} was last updated")
    return {"sheet": "Index", "cell": cell(pcol, found[0]), "text": text}


guidance["index_air_last_updated"] = index_note(AIR)
guidance["index_wtt_air_last_updated"] = index_note(WTT_AIR)


# ── FINGERPRINT — rows only, as defraWaste2026.json ────────────────────────────────────────────────
# ⚠️ SERIALISED THE WAY JAVASCRIPT PRINTS NUMBERS, because the test recomputes the digest with
# JSON.stringify. Python's json writes 8e-05 and 35.0 where JavaScript writes 0.00008 and 35; the waste
# artefact holds neither kind of number, so json.dumps was enough there. Here the CH4 components run to
# 1e-05 and several hotel factors are whole numbers, so the digest is taken over js_json(), not json.dumps.
from decimal import Decimal


def js_number(v) -> str:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        die(f"js_number given {v!r}")
    if isinstance(v, int) or v.is_integer():
        return str(int(v))
    if not (1e-7 <= abs(v) < 1e21):
        die(f"{v!r} would print in exponent form in JavaScript; extend js_number before using it")
    return format(Decimal(repr(v)), "f")


def js_json(value) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return js_number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(js_json(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + js_json(value[k]) for k in sorted(value)) + "}"
    die(f"cannot serialise {type(value)}")


tables = {"air": air, "wtt_air": wtt_air, "haul_definition": hauls, "hotel_stay": hotels, "rail": rail, "wtt_rail": wtt_rail}
payload_rows = js_json(tables)
digest = hashlib.sha256(payload_rows.encode("utf-8")).hexdigest()
input_digest = hashlib.sha256(INPUT.read_bytes()).hexdigest()

haul_counts = {k: sum(1 for x in hauls if x["haul"] == k) for k in HAUL_DEFINITION.values()}
hotel_priced = [x["country"] for x in hotels if x["kg_co2e_per_room_night"] is not None]
hotel_absent = [x["country"] for x in hotels if x["kg_co2e_per_room_night"] is None]

payload = {
    "metadata": {
        "source": CITATION,
        "title_as_published": TITLE_AS_PUBLISHED,
        "edition": EDITION,
        "factor_set": factor_sets.pop(),
        "file_version": versions.pop(),
        "year": str(YEAR),
        "sheets": [AIR, WTT_AIR, HAUL, HOTEL, LAND, WTT_LAND],
        "scope": "Scope 3",
        "gwp_basis": "AR5",
        "gwp_basis_note": (
            "Stated by the workbook's Introduction sheet: the CO2e figures use IPCC Fifth Assessment Report "
            "(AR5) 100-year GWPs. The CO2, CH4 and N2O components are published already in kg CO2e (the "
            "sheet's headers read 'kg CO2e of CH4 per unit' and so on) and are stored as published, not re-based."
        ),
        "unit_note": (
            "Asserted, not assumed: every air, WTT air and rail row's Unit cell reads 'passenger.km', and every "
            "Hotel stay row's reads 'Room per night'. The generator aborts on anything else."
        ),
        "rf_note": (
            "Air rows carry both the 'With RF' and 'Without RF' column sets as published. The sheet puts the "
            "whole indirect effect on the CO2 component (guidance.rf_two_sets); CH4 and N2O are the same in both. "
            "The WTT air sheet publishes both columns with identical values (guidance.wtt_air_rf_identical)."
        ),
        "absent_hotel_note": (
            "A COUNTRY LISTED WITH AN EMPTY VALUE CELL HAS NO FACTOR, NOT A FACTOR OF ZERO. Its record carries "
            "kg_co2e_per_room_night: null. Reading it as 0 would report a hotel stay as emissions-free rather "
            "than as unpriceable. The sheet's own FAQ on missing countries is guidance.hotel_missing_country."
        ),
        "rail_scope_note": (
            "Only the four Rail rows of 'Business travel- land' and the four WTT- rail rows are read. The rail "
            "factors are UK figures; applied outside the UK they are a stand-in, which the calculation must say."
        ),
        "licence": "Open Government Licence v3.0 (OGL v3.0)",
        "licence_url": "http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
        "licence_basis": (
            "Stated on the 2026 publication page on gov.uk, as verified on 17 Sep 2026 for this same workbook "
            "(lib/ghg/defraPublication.ts); the page was not re-read for this artefact. The workbook itself states "
            "no licence. The statement carries an 'except where otherwise stated' exception. The Hotel stay sheet "
            "says its factors are taken from the Hotel Footprinting Tool (International Tourism Partnership and "
            "Greenview; guidance.hotel_source): third-party data, which the workbook marks with no different "
            "licence, but which OGL v3.0 does not cover to the extent the provider was not authorised to license it."
        ),
        "attribution_required": "Contains public sector information licensed under the Open Government Licence v3.0.",
        "guidance": guidance,
        "generated_on": date.today().isoformat(),
        "generated_from": INPUT.name,
        "generated_from_sha256": input_digest,
        "generated_by": "scripts/generate-defra-travel.py",
        "air_categories": list(AIR_CATEGORY.values()),
        "cabin_classes": list(CABIN_CLASS.values()),
        "counts": {
            "air": len(air), "wtt_air": len(wtt_air),
            "haul_territories": len(hauls), "haul_by_haul": haul_counts,
            "hotel_countries": len(hotels), "hotel_priced": len(hotel_priced), "hotel_absent": len(hotel_absent),
            "rail": len(rail), "wtt_rail": len(wtt_rail),
        },
        "hotel_countries_without_factor": hotel_absent,
        "fingerprint_sha256": digest,
    },
    **tables,
}

OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

# ── PRINT ──────────────────────────────────────────────────────────────────────────────────────────
print(f"wrote {OUT.relative_to(ROOT)}  ({OUT.stat().st_size:,} bytes)")
print(f"  input {INPUT.name}  sha256 {input_digest}")
print(f"  citation: {CITATION}   edition: {EDITION}   gwp_basis: AR5")
print(f"\n  air rows: {len(air)}   WTT air rows: {len(wtt_air)}")
for x in air:
    print(f"    {x['category']:<22} {x['cabin_class']:<18} with RF {x['with_rf']['kg_co2e']:<9} without {x['without_rf']['kg_co2e']:<9} {x['sheet']}!{x['cells']['with_rf']} / {x['cells']['without_rf']}")
print(f"\n  haul territories: {len(hauls)}  {haul_counts}")
print(f"  hotel countries: {len(hotels)}  priced {len(hotel_priced)}  absent {len(hotel_absent)}: {', '.join(hotel_absent)}")
print(f"  rail: {[(x['type'], x['kg_co2e']) for x in rail]}")
print(f"  WTT rail: {[(x['type'], x['kg_co2e']) for x in wtt_rail]}")
print("\n  guidance cells:")
for k, g in guidance.items():
    print(f"    {k:<30} {g['sheet']}!{g['cell']}")
print(f"\n  rows sha256: {digest}")
