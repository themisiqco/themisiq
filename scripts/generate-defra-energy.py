#!/usr/bin/env python3
"""
Extract the DEFRA/DESNZ 2026 upstream energy conversion factors into
lib/emissionFactors/defraEnergy2026.json.

    python3 scripts/generate-defra-energy.py

INPUT: data/reference/defra-desnz-ghg-conversion-factors-2026-full-set-v1.xlsx — the same committed
       workbook scripts/generate-defra-waste.py and scripts/generate-defra-travel.py read ("UK
       Government GHG Conversion Factors for Company Reporting", 2026, Full set, Version 1).

READ BY lib/emissionFactors/defraEnergy.ts. Nothing prices from it yet: this artefact is Task 1 of the
Category 3 build (~/themisiq-sources/findings/cat3-design.md), generated before any calculation reads it.

WHAT IT HOLDS, AND ONLY THIS: the rows Category 3 needs.
  WTT- fuels                    natural gas (kWh Gross CV, cubic metres), propane (tonnes, litres),
                                diesel, petrol, distillate fuel oil and residual fuel oil (litres)
  WTT- UK electricity           generation WTT, and the WTT of the T&D loss
  Transmission and distribution T&D- UK electricity, and the district heat & steam distribution loss
  WTT- heat and steam           district heat and steam WTT, and the WTT of its distribution loss
  Conversions                   therm to kWh, cubic foot to m3, US gallon to litre, kg to tonne

⚠️ EVERY ROW HERE IS UPSTREAM ONLY, EXCLUDING COMBUSTION, and the sheets say so themselves: each
sheet's A8 description and its Scope cell (B6 = "Scope 3") are recorded in the metadata, and
lib/emissionFactors/defraEnergy.test.ts fails if a sheet stops saying it. The Scope 3 Standard (p. 70)
requires it: "companies should use life cycle emission factors that exclude emissions from combustion".

⚠️ NO DATA ROW NUMBERS ARE HARDCODED. Each table is FOUND by its column-header row; labels are carried
down the way the sheet prints them; every wanted (label, unit) pair is named in a closed dictionary
below, and a missing pair, an unknown unit or an empty value cell aborts rather than being read. The
guidance cells are found by the opening words of their text, and the cell each was found in is recorded,
so a moved paragraph is still quoted and the move is visible in the artefact.

⚠️ AN EMPTY VALUE CELL IS NEVER ZERO. Every row this generator asks for is expected to carry a value;
an empty one aborts, naming the sheet and cell.

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
from decimal import Decimal

ROOT = pathlib.Path(__file__).resolve().parent.parent
INPUT = ROOT / "data" / "reference" / "defra-desnz-ghg-conversion-factors-2026-full-set-v1.xlsx"
OUT = ROOT / "lib" / "emissionFactors" / "defraEnergy2026.json"

PUBLISHERS = "DEFRA/DESNZ"
TITLE = "GHG Conversion Factors for Company Reporting"
TITLE_AS_PUBLISHED = "UK Government GHG Conversion Factors for Company Reporting"
YEAR = 2026
CITATION = f"UK {PUBLISHERS} ({YEAR}) {TITLE}"
EDITION = f"DEFRA {YEAR}"

FUELS_SHEET = "WTT- fuels"
ELEC_SHEET = "WTT- UK electricity"
TD_SHEET = "Transmission and distribution"
HEAT_SHEET = "WTT- heat and steam"
CONV_SHEET = "Conversions"
OVERSEAS_SHEET = "Overseas electricity"
SCOPE2_HEAT_SHEET = "Heat and steam"

# The four sheets whose own description and Scope cell are recorded and guarded.
UPSTREAM_SHEETS = [FUELS_SHEET, ELEC_SHEET, TD_SHEET, HEAT_SHEET]

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


def col_letter(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def cell(row: int, col: int) -> str:
    return f"{col_letter(col)}{row}"


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
    """{row_number: {col_index: text}} for every row present; whitespace-only cells treated as empty."""
    if name not in sheets:
        die(f"sheet {name!r} not found; sheets are: {list(sheets)}")
    out = {}
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
        out[int(row.get("r"))] = cells
    return out


def labelled_value(rows: dict, sheet: str, label: str) -> str:
    """The cell immediately right of a label cell such as 'Version:', found by text, not position."""
    found = [cells[c + 1] for _, cells in rows.items() for c, v in cells.items()
             if v.strip() == label and (c + 1) in cells]
    if len(set(found)) != 1:
        die(f"expected exactly one value beside {label!r} in {sheet!r}, found {found}")
    return found[0].strip()


def check_frame(rows: dict, sheet: str) -> dict:
    """Every sheet states its own title, scope, year, version and factor set. Read them, do not assume."""
    if rows.get(1, {}).get(0) != TITLE_AS_PUBLISHED:
        die(f"{sheet!r} row 1 is not {TITLE_AS_PUBLISHED!r}: {rows.get(1)}")
    year = labelled_value(rows, sheet, "Year:")
    if year != str(YEAR):
        die(f"{sheet!r} Year cell reads {year!r}; this generator is for {YEAR}")
    return {
        "scope": labelled_value(rows, sheet, "Scope:"),
        "version": labelled_value(rows, sheet, "Version:"),
        "factor_set": labelled_value(rows, sheet, "Factor set:"),
        "year": year,
    }


def find_headers(rows: dict, sheet: str, labels: list, expected: int) -> list:
    """Row numbers whose cells read exactly `labels`, left to right from one column, and nothing else."""
    hits = []
    for n, cells in sorted(rows.items()):
        starts = [c for c, v in cells.items() if v.strip() == labels[0]]
        for start in starts:
            if all(cells.get(start + i, "").strip() == lab for i, lab in enumerate(labels)):
                extra = {c: v for c, v in cells.items() if not (start <= c < start + len(labels))}
                if extra:
                    die(f"{sheet!r} row {n}: header row carries unexpected cells {extra}")
                hits.append((n, start))
    if len(hits) != expected:
        die(f"{sheet!r}: expected {expected} header row(s) reading {labels}, found {len(hits)}: "
            f"{[cell(n, c) for n, c in hits]}")
    return hits


def data_rows(rows: dict, sheet: str, header_row: int, start_col: int, width: int) -> list:
    """Rows under a header, until the block ends: label columns carried down, value column required."""
    out = []
    carried = {}
    n = header_row + 1
    while n in rows or (n + 1) in rows:
        cells = rows.get(n, {})
        used = {c: v for c, v in cells.items() if start_col <= c < start_col + width}
        if not used:
            break                      # a blank row ends the block
        if set(cells) - set(used):
            break                      # a row reaching outside the block is the next table or its prose
        for c in range(start_col, start_col + width - 1):
            if c in used:
                carried[c] = (used[c].strip(), n)
        out.append((n, dict(carried), used))
        n += 1
    if not out:
        die(f"{sheet!r}: no data rows under the header at row {header_row}")
    return out


def as_float(sheet: str, ref: str, raw) -> float:
    if raw is None or str(raw).strip() == "":
        die(f"{sheet!r} {ref}: value cell is empty. An empty cell is not a zero; nothing was written.")
    try:
        return float(raw)
    except ValueError:
        die(f"{sheet!r} {ref}: value {raw!r} is not a number")


def quote(rows: dict, sheet: str, opening: str) -> dict:
    """A guidance paragraph found by its opening words, with the cell it was found in."""
    hits = [(n, c, v) for n, cells in rows.items() for c, v in cells.items()
            if v.strip().lstrip("●• ").startswith(opening)]
    if len(hits) != 1:
        die(f"{sheet!r}: expected exactly one paragraph opening {opening!r}, found {len(hits)} "
            f"({[cell(n, c) for n, c, _ in hits]})")
    n, c, v = hits[0]
    return {"sheet": sheet, "cell": cell(n, c), "text": v.strip()}


# ── READ ───────────────────────────────────────────────────────────────────────────────────────────

z, shared, sheets = open_workbook(INPUT)
sheet_rows = {name: read_sheet(z, shared, sheets, name) for name in
              UPSTREAM_SHEETS + [CONV_SHEET, OVERSEAS_SHEET, SCOPE2_HEAT_SHEET, "Introduction"]}

intro = sheet_rows["Introduction"]
ar5 = quote(intro, "Introduction", "The GWPs used in the calculation of CO2e")

frames = {}
for name in UPSTREAM_SHEETS:
    frames[name] = check_frame(sheet_rows[name], name)
    if frames[name]["scope"] != "Scope 3":
        die(f"{name!r} declares Scope {frames[name]['scope']!r}, not 'Scope 3'; Category 3 may not read it")

versions = {f["version"] for f in frames.values()}
factor_sets = {f["factor_set"] for f in frames.values()}
if len(versions) != 1 or len(factor_sets) != 1:
    die(f"the four sheets disagree about version {versions} or factor set {factor_sets}")

# ── WTT- fuels ─────────────────────────────────────────────────────────────────────────────────────
# Three blocks (gaseous, liquid, solid), each headed Activity | Fuel | Unit | kg CO2e. Only the pairs
# named here are taken, and every one must be found exactly once.
WANTED_FUELS = [
    ("natural_gas_kwh_gross_cv", "Natural gas", "kWh (Gross CV)"),
    ("natural_gas_cubic_metres", "Natural gas", "cubic metres"),
    ("propane_tonnes", "Propane", "tonnes"),
    ("propane_litres", "Propane", "litres"),
    ("diesel_average_biofuel_blend_litres", "Diesel (average biofuel blend)", "litres"),
    ("petrol_average_biofuel_blend_litres", "Petrol (average biofuel blend)", "litres"),
    ("fuel_oil_distillate_litres", "Processed fuel oils - distillate oil", "litres"),
    ("fuel_oil_residual_litres", "Processed fuel oils - residual oil", "litres"),
]

fuel_rows = []
for header_row, start in find_headers(sheet_rows[FUELS_SHEET], FUELS_SHEET,
                                      ["Activity", "Fuel", "Unit", "kg CO2e"], expected=3):
    for n, carried, used in data_rows(sheet_rows[FUELS_SHEET], FUELS_SHEET, header_row, start, 4):
        if (start + 2) not in used:
            die(f"{FUELS_SHEET!r} row {n}: no Unit cell under the header at row {header_row}")
        activity, activity_row = carried.get(start, ("", n))
        fuel, fuel_row = carried.get(start + 1, ("", n))
        fuel_rows.append({
            "activity": activity, "activity_cell": cell(activity_row, start),
            "fuel": fuel, "fuel_cell": cell(fuel_row, start + 1),
            "unit": used[start + 2].strip(), "unit_cell": cell(n, start + 2),
            "value_cell": cell(n, start + 3), "raw": used.get(start + 3), "row": n,
        })

fuels = []
for key, fuel, unit in WANTED_FUELS:
    hits = [r for r in fuel_rows if r["fuel"] == fuel and r["unit"] == unit]
    if len(hits) != 1:
        die(f"{FUELS_SHEET!r}: expected exactly one {fuel!r} row in {unit!r}, found {len(hits)}")
    r = hits[0]
    fuels.append({
        "key": key,
        "activity": r["activity"],
        "fuel": r["fuel"],
        "unit": r["unit"],
        "kg_co2e": as_float(FUELS_SHEET, r["value_cell"], r["raw"]),
        "sheet": FUELS_SHEET,
        "row": r["row"],
        "cells": {"activity": r["activity_cell"], "fuel": r["fuel_cell"],
                  "unit": r["unit_cell"], "kg_co2e": r["value_cell"]},
        # This sheet publishes one combined CO2e figure per row and no gas split.
        "gases": None,
    })

# ── WTT- UK electricity: generation, and the WTT of the T&D loss ───────────────────────────────────
ELEC_HEADER = ["Activity", "Country", "Unit", "Year", "kg CO2e"]
WANTED_ELEC = [
    ("electricity_generation_wtt", "WTT- UK electricity (generation)"),
    ("electricity_td_wtt", "WTT- UK electricity (T&D)"),
]
elec_rows = []
for header_row, start in find_headers(sheet_rows[ELEC_SHEET], ELEC_SHEET, ELEC_HEADER, expected=2):
    for n, carried, used in data_rows(sheet_rows[ELEC_SHEET], ELEC_SHEET, header_row, start, 5):
        elec_rows.append((n, start, carried, used))

# ── Transmission and distribution: the electricity T&D loss, and the heat/steam distribution loss ──
TD_HEADER = ["Activity", "Type", "Unit", "Year", "kg CO2e",
             "kg CO2e of CO2 per unit", "kg CO2e of CH4 per unit", "kg CO2e of N2O per unit"]
WANTED_TD = [
    ("electricity_td_loss", "T&D- UK electricity"),
    ("district_heat_steam_distribution_loss", "Distribution - district heat & steam"),
]
td_rows = []
for header_row, start in find_headers(sheet_rows[TD_SHEET], TD_SHEET, TD_HEADER, expected=2):
    for n, carried, used in data_rows(sheet_rows[TD_SHEET], TD_SHEET, header_row, start, 8):
        td_rows.append((n, start, carried, used))

# ── WTT- heat and steam: district heat and steam, and the WTT of its distribution loss ────────────
HEAT_HEADER = ["Activity", "Type", "Unit", "Year", "kg CO2e"]
WANTED_HEAT = [
    ("district_heat_steam_wtt", "WTT- heat and steam", "District heat and steam"),
    ("district_heat_steam_distribution_wtt", "WTT- district heat & steam distribution", "5% loss"),
]
heat_rows = []
for header_row, start in find_headers(sheet_rows[HEAT_SHEET], HEAT_SHEET, HEAT_HEADER, expected=2):
    for n, carried, used in data_rows(sheet_rows[HEAT_SHEET], HEAT_SHEET, header_row, start, 5):
        heat_rows.append((n, start, carried, used))


def one_row(rows, sheet, activity, type_or_country=None):
    hits = []
    for n, start, carried, used in rows:
        act = carried.get(start, ("", n))[0]
        second = used.get(start + 1, carried.get(start + 1, ("", n))[0]).strip()
        if act == activity and (type_or_country is None or second == type_or_country):
            hits.append((n, start, carried, used, second))
    if len(hits) != 1:
        die(f"{sheet!r}: expected exactly one {activity!r} row"
            f"{'' if type_or_country is None else f' of type {type_or_country!r}'}, found {len(hits)}")
    return hits[0]


def energy_record(key, sheet, activity, second_label, rows, with_gases, second_field):
    n, start, carried, used, second = one_row(rows, sheet, activity, second_label)
    unit_cell, year_cell, val_cell = cell(n, start + 2), cell(n, start + 3), cell(n, start + 4)
    if (start + 2) not in used or (start + 3) not in used:
        die(f"{sheet!r} row {n}: Unit or Year cell is empty")
    unit = used[start + 2].strip()
    if unit != "kWh":
        die(f"{sheet!r} {unit_cell}: unit reads {unit!r}, not 'kWh'")
    year = used[start + 3].strip()
    if year != str(YEAR):
        die(f"{sheet!r} {year_cell}: year reads {year!r}, not {YEAR}")
    rec = {
        "key": key,
        "activity": activity,
        second_field: second,
        "unit": unit,
        "year": int(year),
        "kg_co2e": as_float(sheet, val_cell, used.get(start + 4)),
        "sheet": sheet,
        "row": n,
        "cells": {"activity": cell(carried.get(start, ("", n))[1], start),
                  second_field: cell(n, start + 1), "unit": unit_cell,
                  "year": year_cell, "kg_co2e": val_cell},
        "gases": None,
    }
    if with_gases:
        gas_cells = {g: cell(n, start + 5 + i) for i, g in enumerate(("co2", "ch4", "n2o"))}
        rec["gases"] = {g: as_float(sheet, gas_cells[g], used.get(start + 5 + i))
                        for i, g in enumerate(("co2", "ch4", "n2o"))}
        rec["cells"].update({f"gases_{g}": ref for g, ref in gas_cells.items()})
    return rec


electricity = [
    energy_record("electricity_generation_wtt", ELEC_SHEET, "WTT- UK electricity (generation)",
                  "Electricity: UK", elec_rows, False, "country"),
    energy_record("electricity_td_loss", TD_SHEET, "T&D- UK electricity",
                  "Electricity: UK", td_rows, True, "type"),
    energy_record("electricity_td_wtt", ELEC_SHEET, "WTT- UK electricity (T&D)",
                  "Electricity: UK", elec_rows, False, "country"),
]
heat_and_steam = [
    energy_record("district_heat_steam_wtt", HEAT_SHEET, "WTT- heat and steam",
                  "District heat and steam", heat_rows, False, "type"),
    energy_record("district_heat_steam_distribution_loss", TD_SHEET, "Distribution - district heat & steam",
                  "5% loss", td_rows, True, "type"),
    energy_record("district_heat_steam_distribution_wtt", HEAT_SHEET, "WTT- district heat & steam distribution",
                  "5% loss", heat_rows, False, "type"),
]

# ── Conversions ───────────────────────────────────────────────────────────────────────────────────
# Each value is the cell where a row label meets a column header, both found by text.
WANTED_CONVERSIONS = [
    ("therm_to_kwh", "Therm", "kWh", "1 therm in kWh"),
    ("cubic_foot_to_cubic_metre", "Cubic feet, cu ft", "m3", "1 cubic foot in cubic metres"),
    ("us_gallon_to_litre", "US gallon", "L", "1 US gallon in litres"),
    ("kilogram_to_tonne", "Kilogram, kg", "tonne", "1 kilogram in tonnes"),
]
conv_rows = sheet_rows[CONV_SHEET]
conversions = []
for key, row_label, col_label, description in WANTED_CONVERSIONS:
    # ⚠️ THE COLUMN HEADER IS FOUND FIRST, AND THE ROW LABEL ONLY BELOW AND LEFT OF IT. The same words
    # appear twice on this sheet: 'US gallon' is a row label in column B AND a column header in G, and
    # reading either one first would find two matches and abort on a sheet that has not changed.
    pairs = []
    for hn, hcells in conv_rows.items():
        for hc, hv in hcells.items():
            if hv.strip() != col_label:
                continue
            labels = [(n, c) for n, cells in conv_rows.items() if n > hn
                      for c, v in cells.items() if c < hc and v.strip() == row_label]
            for n, c in labels:
                pairs.append((hn, hc, n, c))
    if len(pairs) != 1:
        die(f"{CONV_SHEET!r}: expected exactly one {row_label!r} row under a {col_label!r} column, "
            f"found {len(pairs)}: {[(cell(a, b), cell(x, y)) for a, b, x, y in pairs]}")
    hn, hc, n, label_col = pairs[0]
    conversions.append({
        "key": key,
        "description": description,
        "from": row_label,
        "to": col_label,
        "factor": as_float(CONV_SHEET, cell(n, hc), conv_rows[n].get(hc)),
        "sheet": CONV_SHEET,
        "row": n,
        "cells": {"from": cell(n, label_col), "to": cell(hn, hc), "factor": cell(n, hc)},
    })

# ── The sheets' own words ──────────────────────────────────────────────────────────────────────────
DESCRIPTION_OPENINGS = {
    FUELS_SHEET: "Well-to-tank (WTT) fuels conversion factors",
    ELEC_SHEET: "Well-to-tank (WTT) conversion factors for UK electricity",
    TD_SHEET: "Transmission and distribution (T&D) factors",
    HEAT_SHEET: "Well-to-tank (WTT) heat and steam conversion factors",
}
descriptions = {name: quote(sheet_rows[name], name, opening)
                for name, opening in DESCRIPTION_OPENINGS.items()}

guidance = {
    "gwp_basis": ar5,
    "cv_basis_match_scope1": quote(sheet_rows[FUELS_SHEET], FUELS_SHEET,
                                   "Organisations should select the same type of conversion factors"),
    "cv_gross_typical": quote(sheet_rows[FUELS_SHEET], FUELS_SHEET, "Gross CV /net CV basis"),
    "overseas_td_withdrawn": quote(sheet_rows[TD_SHEET], TD_SHEET,
                                   "Transmission and distribution losses are no longer published"),
    "overseas_factors_withdrawn": quote(sheet_rows[OVERSEAS_SHEET], OVERSEAS_SHEET,
                                        "We no longer provide overseas CO2 emission factors"),
    "overseas_td_at_iea": quote(sheet_rows[OVERSEAS_SHEET], OVERSEAS_SHEET,
                                "Further, the IEA now also publishes data for transmission"),
    "overseas_wtt_withdrawn": quote(sheet_rows[ELEC_SHEET], ELEC_SHEET,
                                    "We no longer provide WTT data for overseas electricity"),
    "electricity_separate_lines": quote(sheet_rows[ELEC_SHEET], ELEC_SHEET,
                                        "The kWh energy is multiplied by the WTT factor"),
    "heat_distribution_to_scope3": quote(sheet_rows[SCOPE2_HEAT_SHEET], SCOPE2_HEAT_SHEET,
                                         "It should be noted that to calculate the distribution impact"),
}

# ── THE PUBLISHED GAS SPLITS DO NOT SUM TO THE PUBLISHED TOTAL ────────────────────────────────────
# A FINDING, RECORDED AND NOT CORRECTED. On both rows that carry a split, CO2 + CH4 + N2O comes to one
# hundred-thousandth more than the kg CO2e column beside it: DEFRA publishes each column rounded to five
# decimal places, and rounded parts need not add to a rounded whole. The TOTAL is the figure to price
# with, and the reader exposes it; the split is carried for disclosure. Nothing here is adjusted, and no
# total is derived from a split.
gas_split_rounding = {}
for rec in electricity + heat_and_steam:
    if not rec["gases"]:
        continue
    total = Decimal(repr(rec["kg_co2e"]))
    parts = sum(Decimal(repr(rec["gases"][g])) for g in ("co2", "ch4", "n2o"))
    places = total.as_tuple().exponent
    parts_q, total_q = parts.quantize(Decimal(1).scaleb(places)), total.quantize(Decimal(1).scaleb(places))
    gas_split_rounding[rec["key"]] = {
        "published_total": float(total_q),
        "split_sum": float(parts_q),
        "difference": float(parts_q - total_q),
        "difference_pct": float(((parts_q - total_q) / total_q * 100).quantize(Decimal("0.0001"))),
        "cells": {"total": rec["cells"]["kg_co2e"],
                  "split": f"{rec['cells']['gases_co2']}:{rec['cells']['gases_n2o']}"},
        "sheet": rec["sheet"],
    }

records = {"fuels": fuels, "electricity": electricity, "heat_and_steam": heat_and_steam,
           "conversions": conversions}
# ⚠️ CANONICALISED THE WAY JavaScript SERIALISES, so the test can recompute this digest without a
# Python interpreter. JSON.stringify writes 0.00007 where Python's repr writes 7e-05, and two of the
# gas-split values are that small, so hashing json.dumps output would have pinned a string only Python
# can produce and the guard could never check it.

def js_number(x: float) -> str:
    """A float as JSON.stringify would write it: shortest round-trip, exponent only outside 1e-7..1e21."""
    if x != x or x in (float("inf"), float("-inf")):
        die(f"non-finite value {x!r} cannot be serialised")
    if x == int(x) and abs(x) < 1e21:
        return str(int(x))
    text = repr(x)
    if "e" not in text and "E" not in text:
        return text
    d = Decimal(text)
    if -7 < d.adjusted() < 21:
        return format(d, "f")
    die(f"value {x!r} falls outside the range this canonicaliser was written for")


def canonical(value) -> str:
    if isinstance(value, dict):
        return "{" + ",".join(f"{json.dumps(k, ensure_ascii=False)}:{canonical(value[k])}"
                              for k in sorted(value)) + "}"
    if isinstance(value, list):
        return "[" + ",".join(canonical(v) for v in value) + "]"
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return js_number(float(value))
    return json.dumps(value, ensure_ascii=False)


payload_rows = canonical(records)
digest = hashlib.sha256(payload_rows.encode("utf-8")).hexdigest()

metadata = {
    "source": CITATION,
    "title_as_published": TITLE_AS_PUBLISHED,
    "edition": EDITION,
    "factor_set": factor_sets.pop(),
    "file_version": versions.pop(),
    "year": YEAR,
    "sheets": UPSTREAM_SHEETS + [CONV_SHEET],
    "scope": "Scope 3",
    "scope_cells": {name: {"cell": "B6", "text": frames[name]["scope"]} for name in UPSTREAM_SHEETS},
    "sheet_descriptions": descriptions,
    "gwp_basis": "AR5",
    "gwp_basis_note": (
        "Stated by the workbook's Introduction sheet (guidance.gwp_basis): the CO2e figures use IPCC "
        "Fifth Assessment Report (AR5) 100-year GWPs. Category 3 discloses this on its line, because "
        "the inventory it is derived from may be on another basis."
    ),
    "upstream_only_note": (
        "Every row here is a well-to-tank or transmission-and-distribution row, excluding combustion, "
        "which is what Category 3 requires: the Scope 3 Standard, p. 70, says life cycle factors used "
        "for this category must exclude combustion because combustion is already in Scope 1 or Scope 2. "
        "sheet_descriptions holds each sheet's own statement of that, with its cell."
    ),
    "cv_basis_note": (
        "The natural gas row taken here is kWh (Gross CV), not Net CV, because the Scope 1 side of a "
        "therms or mmBtu figure is priced from the EPA's higher heating value factors, and the sheet "
        "asks for the same basis on both sides (guidance.cv_basis_match_scope1, guidance.cv_gross_typical). "
        "That EPA HHV and DEFRA Gross CV are interchangeable is NOT STATED by either publisher; the "
        "conversion is disclosed on the Category 3 row rather than assumed away."
    ),
    "overseas_note": (
        "DEFRA publishes no overseas electricity, overseas T&D or overseas WTT factor and points to the "
        "IEA (guidance.overseas_td_withdrawn, overseas_factors_withdrawn, overseas_td_at_iea, "
        "overseas_wtt_withdrawn). A non-UK row priced from this artefact is a UK stand-in and says so."
    ),
    "separate_lines_note": (
        "Generation WTT, the T&D loss and the WTT of that loss are three separate reported items, as the "
        "sheet directs (guidance.electricity_separate_lines); the same for district heat and steam "
        "(guidance.heat_distribution_to_scope3)."
    ),
    "natural_gas_mass_note": (
        "A FINDING, RECORDED AND NOT CORRECTED. The 'WTT- fuels' natural gas per-tonne row does not "
        "reconcile with its own volume and energy rows through the workbook's Fuel properties sheet: "
        "tonnes over cubic metres implies 1,257.17 m3/tonne against Fuel properties G31's 1,237.54, "
        "+1.59%; tonnes over kWh (Gross CV) implies 50.43 GJ/tonne against E31's 49.521, +1.83%. The "
        "rows this artefact holds agree with each other (cubic metres over kWh Gross CV is 11.142 "
        "kWh/m3 against 11.116 from Fuel properties, +0.24%), and the per-tonne row is not taken. "
        "Nothing here is adjusted to close the gap: the figures are as published."
    ),
    "gas_split_rounding": gas_split_rounding,
    "gas_split_rounding_note": (
        "A FINDING, RECORDED AND NOT CORRECTED. On both rows that carry one, DEFRA's published CO2, CH4 "
        "and N2O columns sum to slightly more than the kg CO2e column beside them: T&D- UK electricity "
        "0.01300 against 0.01299 (+0.0770%), and Distribution - district heat & steam 0.00946 against "
        "0.00945 (+0.1058%). Each column is published rounded to five decimal places, and rounded parts "
        "need not add to a rounded whole. THE PUBLISHED TOTAL IS THE FIGURE TO PRICE WITH; the split is "
        "carried for disclosure only. lib/emissionFactors/defraEnergy.test.ts asserts that the reader "
        "exposes the total and derives nothing from the split."
    ),
    "empty_cell_note": (
        "An empty value cell aborts the generator. Every row named here is expected to carry a value, "
        "and an empty one is an absence, never a zero."
    ),
    "licence": "Open Government Licence v3.0 (OGL v3.0)",
    "licence_url": "http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    "attribution_required": "Contains public sector information licensed under the Open Government Licence v3.0.",
    "guidance": guidance,
    "counts": {k: len(v) for k, v in records.items()},
    "generated_on": date.today().isoformat(),
    "generated_from": INPUT.name,
    "generated_from_sha256": hashlib.sha256(INPUT.read_bytes()).hexdigest(),
    "generated_by": "scripts/generate-defra-energy.py",
    # Its own fingerprint: the travel and commuting artefacts have theirs, and none of the three moves
    # when another is regenerated.
    "energy_fingerprint_sha256": digest,
}

payload = {"metadata": metadata, **records}
OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

print(f"Wrote {OUT.relative_to(ROOT)}")
for group, items in records.items():
    print(f"  {group}: {len(items)}")
print(f"  energy_fingerprint_sha256: {digest}")
