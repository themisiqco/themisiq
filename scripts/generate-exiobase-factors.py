#!/usr/bin/env python3
"""
Extract spend-based GHG factors from an EXIOBASE 3 archive, industry-by-industry or
product-by-product.

    python3 scripts/generate-exiobase-factors.py /path/to/IOT_2019_ixi.zip
    python3 scripts/generate-exiobase-factors.py /path/to/IOT_2019_pxp.zip

Writes lib/emissionFactors/exiobaseFactors<year><system>.json: one factor per (region, sector),
49 x 163 = 7,987 for ixi and 49 x 200 = 9,800 for pxp, and prints a row fingerprint for the test.

ONE SCRIPT FOR BOTH SYSTEMS, NOT TWO. The archives differ in exactly three constants - the sector
count, the column count, and the name of the file carrying the codes - and are identical in every
other respect that matters here: the same 126-row impacts extension, the same AR5 aggregate at row
103 with the same label, the same unit, the same three-line header, the same 49 regions in the same
order, the same M.EUR denominator. Two near-identical 300-line scripts would drift, and the drift
would be inside a factor extraction.

STANDARD LIBRARY ONLY. No pandas, and pandas must not be installed to run this. The archive is
read from INSIDE the zip - nothing is unpacked - and the one matrix row that is needed is reached
by streaming past the others, so peak memory is a few tens of MB against a 764 MB archive.

WHICH ROW, AND WHY NOT THE OTHER SIX
------------------------------------
impacts/M.txt row 103, 'GHG emissions AR5 (GWP100) | GWP100 (IPCC, 2010)'.

The file holds seven GWP100-family aggregates. Rows 4 and 46 are both labelled
'GHG emissions (GWP100)' and both characterise on GWP100 (IPCC, 2007) - that is AR4. Our engine
routes AR4/AR5/AR6 per framework and applies AR6 by default (see EF_SOURCES.gwp_ar6 in
lib/ghg/engine.ts), so an AR4 aggregate is two generations behind what the inventory it would sit
beside is priced on. v3.8.2 publishes no AR6 aggregate at all. AR5 is the closest available; the
gap is DISCLOSED in the metadata block, not closed by re-characterising anything ourselves.

WHY NOT satellite/M.txt
-----------------------
It has no aggregate row - 22 individual gas rows and nothing that sums them. Combining them would
make the characterisation OURS rather than the publisher's, and three details make that worse than
it sounds: 'HFC - air' and 'PFC - air' arrive already in kg CO2-eq and would be double-counted by
any GWP multiplication; 'CO2 - waste - biogenic' is a separate row from 'CO2 - waste - fossil', so
a naive sum folds biogenic carbon into a fossil total; and the remaining rows are in kg while the
impacts file's gas rows are in Gg. None of that is visible from the row labels.

EVERY CHECK BELOW ABORTS. NONE WARNS.
-------------------------------------
A warning on a factor extraction is a number that reaches a customer with a note nobody read. The
unit check in particular: rows 38-45 of the same file are in Gg, three orders of magnitude from the
kg rows, and ONLY unit.txt distinguishes them. It is read by ROW POSITION, never by label.
"""

import hashlib
import json
import pathlib
import re
import sys
import zipfile
from datetime import date

# ── What we are extracting. Changing any of these is changing the dataset. ──────────────────────
ROW_NUMBER      = 103                     # 1-based among DATA rows of impacts/M.txt
ROW_LABEL       = 'GHG emissions AR5 (GWP100) | GWP100 (IPCC, 2010)'
EXPECTED_REGION = 49

# Per system. Everything not in here is shared; see the module docstring.
SYSTEMS = {
    # `nouns` is also the METADATA KEY NAME, deliberately: the ixi payload predates this script
    # being generalised and must keep emitting 'industries' / 'industries_with_bound', so that
    # re-running it reproduces the file already in the repo byte for byte. pxp emits 'products'.
    'ixi': {'sectors': 163, 'cols': 7987, 'join_file': 'industries.txt', 'code_prefix': 'i',
            'factor_type': 'industry', 'repo_key': 'industries', 'nouns': 'industries'},
    'pxp': {'sectors': 200, 'cols': 9800, 'join_file': 'products.txt',  'code_prefix': 'p',
            'factor_type': 'product',  'repo_key': 'products',   'nouns': 'products'},
}
# Accepted spellings of "kg CO2 equivalent". impacts/unit.txt uses two for the same quantity
# ('kg CO2 eq.' and 'kg CO2-Equivalents'); Gg and Gg CO2-eq must NOT match.
UNIT_OK = re.compile(r'^kg\s*CO2[\s\-]*(eq\.?|Equivalents?)$', re.I)

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'lib' / 'emissionFactors'
SECTORS_JSON = ROOT / 'lib' / 'emissionFactors' / 'exiobaseSectors.json'


def percentile(sorted_vals, p):
    """Linear interpolation between closest ranks - the numpy 'linear' default, written out because
    numpy is not a dependency here. Input MUST already be sorted and MUST exclude zeros."""
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * (p / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def intensity_percentiles(factors, cfg):
    """The percentile-position metadata for one factor file. DESCRIPTIVE ONLY: not one value is
    changed by anything here, and the fingerprint is computed over the rows, not this block.

    ⚠️ RENAMED FROM reliability_bounds ON 17 SEP 2026, AND THE CALCULATION DID NOT CHANGE. What
    these bounds measure is POSITION: where a factor's value sits among other factors. "Reliability"
    is a defined term in the GHG Protocol's data quality indicators, where it describes how data was
    acquired and verified, and customers report under that meaning; a percentile position says
    nothing about it. `per_industry` also became `per_sector`, because the product file carried the
    industry word for product sectors.

    ⚠️ EVERY NUMBER IN THE PROSE BELOW IS COMPUTED. It used to be typed in, and the product file
    shipped the INDUSTRY file's counts - "1,108 of 7,987", "seven industries", "834 of 6,795" - all
    false for products. A statistic in a note is data and is generated like data.

    EXIOBASE intensities have a seven-order-of-magnitude tail: an industry with negligible output
    in a region produces an intensity that explodes. Other users clip it - Ignite Procurement
    publishes a p3/p97 truncation with zero-filling. That is documented and defensible, and we do
    NOT do it: the source note says the values are stored exactly as published, and clipping would
    make that false. We compute the percentiles and DISCLOSE positions against them instead.

    ZEROS ARE EXCLUDED, because a zero is an ABSENT factor rather than a factor of zero."""
    nouns = cfg['nouns']
    noun = cfg['factor_type']
    regions = len({f['region'] for f in factors})

    nonzero = sorted(f['value'] for f in factors if f['value'] != 0)
    global_lo = percentile(nonzero, 3)
    global_hi = percentile(nonzero, 97)

    # Per sector, across its regions. Catches a value unremarkable across the file but at an end of
    # its own sector, which the global bound cannot see.
    per_sector = {}
    for f in factors:
        if f['value'] != 0:
            per_sector.setdefault(f['exio_code'], []).append(f['value'])
    LOCAL_MIN_N = 20      # see min_nonzero_regions_reason
    local_bounds = {}
    for code, vals in per_sector.items():
        if len(vals) >= LOCAL_MIN_N:
            v = sorted(vals)
            local_bounds[code] = {
                'p5': percentile(v, 5),
                'p95': percentile(v, 95),
                'n_nonzero_regions': len(v),
            }
    no_local = sorted(c for c in per_sector if c not in local_bounds)
    all_zero = sorted({f['exio_code'] for f in factors} - set(per_sector))

    # ── statistics for the notes, from the same values ──────────────────────────────────────────
    n_all, n_nonzero = len(factors), len(nonzero)
    outside = below = above = 0
    glob_only = local_only = 0
    carrying_both = 0
    for f in factors:
        v = f['value']
        if v == 0:
            continue
        b = local_bounds.get(f['exio_code'])
        g_out = v < global_lo or v > global_hi
        l_out = b is not None and (v < b['p5'] or v > b['p95'])
        if g_out or l_out:
            outside += 1
            if v < global_lo or (b is not None and v < b['p5']):
                below += 1
            else:
                above += 1
        if b is not None:
            carrying_both += 1
            glob_only += g_out and not l_out
            local_only += l_out and not g_out
    disagree = glob_only + local_only
    spans = sorted(b['p95'] / b['p5'] for b in local_bounds.values())
    median_span = spans[len(spans) // 2] if len(spans) % 2 else (spans[len(spans) // 2 - 1] + spans[len(spans) // 2]) / 2

    # The rank-test arithmetic: with `regions` values, p5 sits at index (regions-1)*0.05.
    k = (regions - 1) * 0.05
    edge = int(k) + 1                       # values strictly below p5 in a sector with distinct values
    full = [code for code, b in local_bounds.items() if b['n_nonzero_regions'] == regions]
    full_counts = set()
    for code in full:
        vals = per_sector[code]
        b = local_bounds[code]
        full_counts.add((sum(v < b['p5'] for v in vals), sum(v > b['p95'] for v in vals)))
    if full_counts == {(edge, edge)}:
        full_sentence = (f"every one of the {len(full)} {nouns} with a non-zero factor in all {regions} "
                         f"regions has exactly {edge} regions below its p5 and {edge} above its p95")
    else:
        full_sentence = (f"the {len(full)} {nouns} with a non-zero factor in all {regions} regions have "
                         f"these (below, above) counts: {sorted(full_counts)}")

    return {
        'what_this_measures': (
            'POSITION: where a factor\'s value sits among other non-zero factors - across the whole file '
            '(3rd and 97th percentiles) and among its own sector\'s regions (5th and 95th). It is not a '
            'measure of reliability, confidence or data quality. Those are defined terms: in the GHG '
            'Protocol\'s data quality indicators, reliability describes how data was acquired and '
            'verified, and a percentile position says nothing about that. These keys were named '
            'reliability_bounds until 17 Sep 2026; the calculation is unchanged.'
        ),
        'method': (
            'Descriptive bounds computed from the extracted values. NO VALUE IS MODIFIED BY '
            'THEM: they are reported alongside a factor so a consumer can disclose where it '
            'sits, never used to clip, winsorise or replace one. The bound is OURS; the value is '
            'the publisher\'s.'
        ),
        'rank_test_note': (
            f'THE PER-SECTOR BOUND IS A RANK TEST, NOT AN OUTLIER TEST. With {regions} regions the 5th '
            f'percentile falls between the {ordinal(edge)} and {ordinal(edge + 1)} lowest values and the '
            f'95th between the {ordinal(edge)} and {ordinal(edge + 1)} highest, so a fully populated '
            f'sector places its lowest {edge} and highest {edge} regions outside the bound whatever '
            f'their values are: in this file {full_sentence}. Being outside it means the region ranks '
            f'at one end of its sector, not that its value is unusual. Across this file {outside:,} of '
            f'{n_nonzero:,} non-zero factors ({100 * outside / n_nonzero:.1f}%) sit outside at least one '
            f'of the two bounds: {below:,} below and {above:,} above.'
        ),
        'zeros_excluded': True,
        'zeros_excluded_reason': (
            'A zero is an ABSENT factor, not a factor of zero. The plainest case in either '
            'archive is the very first cell of x.txt: Austria, paddy rice, output 0. '
            'Austria grows no rice, so there is no Austrian paddy-rice intensity to '
            'publish - and a consumer reading that cell as "0 kg CO2e per euro" would '
            'report a purchase of Austrian rice as emissions-free rather than as unpriceable. '
            'EXIOBASE is built from national supply-use tables and a cell is empty where a '
            f'country or sector has insufficient economic data. {n_all - n_nonzero:,} of {n_all:,} '
            f'cells in this file are zero and they are structured, not scattered: {len(all_zero)} '
            f'{nouns if len(all_zero) != 1 else noun} {"are" if len(all_zero) != 1 else "is"} zero in all '
            f'{regions} regions. Including them would drag both percentiles toward a number that '
            'describes missing data rather than emissions intensity.'
        ),
        'values_modified': False,
        'global': {
            'percentiles': [3, 97],
            'lower': global_lo,
            'upper': global_hi,
            'n_nonzero': n_nonzero,
            'n_below': sum(1 for v in nonzero if v < global_lo),
            'n_above': sum(1 for v in nonzero if v > global_hi),
        },
        'per_sector': {
            'percentiles': [5, 95],
            'min_nonzero_regions': LOCAL_MIN_N,
            'min_nonzero_regions_reason': (
                f'Below {LOCAL_MIN_N} of {regions} regions a 5th/95th percentile is interpolated '
                'across so few points that the bound describes the sample rather than the sector. '
                f'{len(no_local)} {nouns if len(no_local) != 1 else noun} fall under the threshold and '
                f'carry no per-sector bound; they are listed in {nouns}_without_local_bound and must be '
                'treated as NOT ASSESSED, never as in range.'
            ),
            f"{nouns}_with_bound": len(local_bounds),
            f"{nouns}_without_local_bound": no_local,
            f"{nouns}_zero_in_every_region": all_zero,
            'bounds': local_bounds,
        },
        'disagreement_note': (
            f'The two bounds disagree on {100 * disagree / carrying_both:.1f}% of the factors that carry '
            f'both ({disagree:,} of {carrying_both:,}): {glob_only:,} are outside the global bound but '
            f'inside their own sector\'s range, and {local_only:,} the reverse. They are not '
            f'substitutes. The global bound is wide - a {global_hi / global_lo:.0f}x span - because it '
            f'pools sectors whose medians differ by orders of magnitude; the median sector\'s own span '
            f'is {median_span:.0f}x.'
        ),
    }


def die(msg):
    sys.exit(f"ABORT: {msg}")


def main(archive: pathlib.Path):
    if not archive.is_file():
        die(f"{archive} is not a file")

    z = zipfile.ZipFile(archive)
    names = set(z.namelist())
    root = system = None
    for n in names:
        m = re.match(r'^(IOT_(\d{4})_(ixi|pxp))/impacts/M\.txt$', n)
        if m:
            root, data_year, system = m.group(1), int(m.group(2)), m.group(3)
            break
    if root is None:
        die("no <IOT_YYYY_ixi|pxp>/impacts/M.txt in the archive - is this an EXIOBASE IOT zip?")

    cfg = SYSTEMS[system]
    EXPECTED_COLS   = cfg['cols']
    EXPECTED_SECTOR = cfg['sectors']
    OUT = OUT_DIR / f'exiobaseFactors{data_year}{system}.json'

    m_txt  = f'{root}/impacts/M.txt'
    u_txt  = f'{root}/impacts/unit.txt'
    i_txt  = f"{root}/{cfg['join_file']}"
    for n in (u_txt, i_txt):
        if n not in names:
            die(f"{n} missing from the archive")

    # ── CHECK 1: the unit, by ROW POSITION, never by label ─────────────────────────────────────
    unit_lines = z.read(u_txt).decode('utf-8', 'replace').splitlines()
    if not unit_lines or not unit_lines[0].startswith('impact'):
        die(f"{u_txt} does not start with an 'impact' header: {unit_lines[0][:60]!r}")
    unit_rows = unit_lines[1:]
    if len(unit_rows) < ROW_NUMBER:
        die(f"{u_txt} has {len(unit_rows)} rows, need at least {ROW_NUMBER}")
    entry = unit_rows[ROW_NUMBER - 1]
    if '\t' not in entry:
        die(f"{u_txt} row {ROW_NUMBER} has no tab: {entry[:80]!r}")
    unit_label, unit = entry.rsplit('\t', 1)
    unit = unit.strip()
    if unit_label.strip() != ROW_LABEL:
        die(f"{u_txt} row {ROW_NUMBER} is {unit_label.strip()!r}, expected {ROW_LABEL!r}. "
            f"The row order moved; do not proceed on position alone.")
    if not UNIT_OK.match(unit):
        die(f"{u_txt} row {ROW_NUMBER} unit is {unit!r}, not a kg CO2 equivalent. "
            f"Rows 38-45 of this same file are in Gg - three orders of magnitude out.")

    # ── CHECK 4a: the code list, by POSITION ───────────────────────────────────────────────────
    ind_lines = z.read(i_txt).decode('utf-8', 'replace').splitlines()
    if not ind_lines[0].startswith('Number\tName\tCodeNr\tCodeTxt'):
        die(f"{i_txt} header changed: {ind_lines[0][:80]!r}")
    codes = []
    for ln in ind_lines[1:]:
        if not ln.strip():
            continue
        parts = ln.split('\t')
        if len(parts) < 3:
            die(f"{i_txt} row has fewer than 3 fields: {ln[:80]!r}")
        codes.append(parts[2])            # CodeNr, e.g. 'i01.a'
    # COUNT AND PREFIX, BOTH, AND THIS IS NOT BELT-AND-BRACES.
    # The pxp archive ships BOTH products.txt (200 rows) and industries.txt (163 rows), at byte
    # sizes identical to the ixi archive's copies - 10,859 and 9,867 in each. Reading the wrong one
    # is a one-word mistake that yields 163 well-formed 'i'-prefixed codes to index 9,800 columns:
    # every factor would carry an industry code, the modulo would wrap at the wrong period, and
    # nothing about the values, the shape or the field names would look wrong. The prefix test is
    # what makes that loud instead of silent.
    if len(codes) != EXPECTED_SECTOR:
        die(f"{i_txt} has {len(codes)} {cfg['nouns']}, expected {EXPECTED_SECTOR}. This archive is "
            f"'{system}'; check the join file is not the other one - both ship in both archives at "
            f"identical sizes.")
    wrong = [c for c in codes if not c.startswith(cfg['code_prefix'])]
    if wrong:
        die(f"{i_txt} yields {len(wrong)} code(s) not prefixed '{cfg['code_prefix']}' "
            f"(e.g. {wrong[:3]}). A '{system}' archive must be joined on {cfg['join_file']}.")

    # Positional, NOT by name: BOTH join files quote their row 19 - industries.txt has
    # "Fishing, operating of fish hatcheries..." and products.txt has "Fish and other fishing
    # products..." - where the M.txt header does not, so a name join trips on exactly one row of
    # 163 or 200. The artefact sits at the same position in both archives.
    repo = json.loads(SECTORS_JSON.read_text(encoding='utf-8'))
    repo_codes = [r['exio_code'] for r in repo[cfg['repo_key']]]
    if codes != repo_codes:
        first = next((i for i, (a, b) in enumerate(zip(codes, repo_codes)) if a != b), None)
        die(f"{cfg['join_file']} CodeNr does not match exiobaseSectors.json exio_code "
            f"(first difference at position {None if first is None else first + 1}). "
            f"The archive and the repo disagree on the classification.")

    # ── Stream M.txt: headers, then past every row until ROW_NUMBER ────────────────────────────
    with z.open(m_txt) as fh:
        # Decoding by hand rather than TextIOWrapper so the buffer size is explicit and one line
        # is the largest thing held.
        import io
        t = io.TextIOWrapper(fh, encoding='utf-8', newline='')

        h_region = t.readline().rstrip('\r\n').split('\t')
        h_sector = t.readline().rstrip('\r\n').split('\t')

        # ── CHECK 2: three lines before the data, whatever file_parameters.json says ───────────
        line3 = t.readline().rstrip('\r\n')
        f3 = line3.split('\t')
        if len(f3) != EXPECTED_COLS + 1 or f3[0].strip() == '' or any(x != '' for x in f3[1:]):
            die(f"line 3 of {m_txt} is not an index-name row "
                f"(got {len(f3)} fields, first {f3[0]!r}, "
                f"{sum(1 for x in f3[1:] if x != '')} non-empty after it). "
                f"file_parameters.json says nr_header 2 and it is wrong; this check is what "
                f"protects against reading a data row as a header.")
        index_name = f3[0].strip()

        # ── CHECK 3a: header widths ───────────────────────────────────────────────────────────
        for nm, h in (('region', h_region), ('sector', h_sector)):
            if len(h) != EXPECTED_COLS + 1:
                die(f"{m_txt} {nm} header has {len(h)} fields, expected {EXPECTED_COLS + 1}")
        regions_flat = h_region[1:]
        sectors_flat = h_sector[1:]

        # ── CHECK 4b: 49 regions x 163 sectors, same sector order in every block ──────────────
        seen = []
        for r in regions_flat:
            if r not in seen:
                seen.append(r)
        if len(seen) != EXPECTED_REGION:
            die(f"{len(seen)} distinct regions, expected {EXPECTED_REGION}: {seen}")
        if len(seen) * EXPECTED_SECTOR != EXPECTED_COLS:
            die(f"{len(seen)} x {EXPECTED_SECTOR} != {EXPECTED_COLS}")
        block0 = sectors_flat[:EXPECTED_SECTOR]
        for bi in range(len(seen)):
            blk = sectors_flat[bi * EXPECTED_SECTOR:(bi + 1) * EXPECTED_SECTOR]
            if blk != block0:
                bad = next(i for i, (a, b) in enumerate(zip(blk, block0)) if a != b)
                die(f"sector order differs in region block {bi + 1} ({seen[bi]}) "
                    f"at position {bad + 1}: {blk[bad]!r} vs {block0[bad]!r}")
            if regions_flat[bi * EXPECTED_SECTOR:(bi + 1) * EXPECTED_SECTOR] != [seen[bi]] * EXPECTED_SECTOR:
                die(f"region block {bi + 1} ({seen[bi]}) is not contiguous")

        # ── Walk to the row. One line held at a time. ─────────────────────────────────────────
        target = None
        n = 0
        for line in t:
            line = line.rstrip('\r\n')
            if not line:
                continue
            n += 1
            if n == ROW_NUMBER:
                target = line
                break
        if target is None:
            die(f"{m_txt} has only {n} data rows, need row {ROW_NUMBER}")

    # ── CHECK 3b: the row is the one we asked for, with the right width ───────────────────────
    fields = target.split('\t')
    label, values = fields[0], fields[1:]
    if label != ROW_LABEL:
        die(f"{m_txt} data row {ROW_NUMBER} is labelled {label!r}, expected {ROW_LABEL!r}. "
            f"Rows 4 and 46 are the AR4 (IPCC 2007) aggregates - do not silently take one.")
    if len(values) != EXPECTED_COLS:
        die(f"row {ROW_NUMBER} has {len(values)} values, expected {EXPECTED_COLS}")

    # ── Build the factors ────────────────────────────────────────────────────────────────────
    factors = []
    for i, raw in enumerate(values):
        try:
            v = float(raw)
        except ValueError:
            die(f"column {i + 1} value {raw!r} is not a number")
        factors.append({
            'region':    regions_flat[i],
            'exio_code': codes[i % EXPECTED_SECTOR],
            'value':     v,
            'unit':      unit,
        })
    if len(factors) != EXPECTED_COLS:
        die(f"built {len(factors)} factors, expected {EXPECTED_COLS}")

    payload = {
        'metadata': {
            'source': 'EXIOBASE 3',
            'version': '3.8.2',
            'publisher': 'EXIOBASE consortium',
            'doi': '10.5281/zenodo.5589597',
            'url': 'https://zenodo.org/records/5589597',
            'licence': 'CC BY-SA 4.0',
            'archive': archive.name,
            'data_year': data_year,
            'factor_type': cfg['factor_type'],
            'price_basis': 'basic',
            'currency': 'EUR',
            'price_year': data_year,
            'gwp_set': 'AR5 (GWP100), IPCC 2010, as published by EXIOBASE',
            'source_member': f'{root}/impacts/M.txt',
            'source_row_number': ROW_NUMBER,
            'source_row_label': ROW_LABEL,
            'source_row_index_name': index_name,
            'unit': unit,
            'unit_source': f'{root}/impacts/unit.txt row {ROW_NUMBER}, read by position',
            'regions': len(seen),
            cfg['nouns']: EXPECTED_SECTOR,
            'generated_on': date.today().isoformat(),
            'generated_by': 'scripts/generate-exiobase-factors.py',
            'gwp_note': (
                'AR5, not AR6, and that is a GAP RATHER THAN A CHOICE. EXIOBASE 3 v3.8.2 publishes '
                'no AR6 aggregate. Rows 4 and 46 of the same file are GWP100 on IPCC 2007, which is '
                'AR4; row 103 is the only AR5 aggregate and is the closest available to the AR6 our '
                'engine applies by default. Anything computed from these factors is characterised on '
                'AR5 and must say so beside the figure, not only here.'
            ),
            'price_basis_note': (
                'Basic prices. Customer spend is a PURCHASER-price figure off an invoice or an AP '
                'ledger, and the two are not interchangeable: the difference is trade margins, '
                'transport margins and taxes less subsidies on products. See PriceBasis in '
                'lib/emissionFactors/spend.ts.'
            ),
            'denominator_note': (
                'THE UNIT FIELD IS THE NUMERATOR ONLY, AND THE DENOMINATOR IS M.EUR, NOT EUR. '
                'impacts/unit.txt records "kg CO2 eq." and says nothing about what it is per. The '
                'archive root unit.txt reports M.EUR for all 7,987 region-sector pairs and x.txt '
                'gives industry output in the same unit, so an M-matrix multiplier is kg CO2 eq. per '
                'MILLION EUR of output. The median value here is about 790,000, which is 0.79 kg per '
                'EUR - squarely in the range of the spend factors already in lib/emissionFactors.ts - '
                'and reads as nonsense if the denominator is taken as one euro. Nothing is divided '
                'here: the values are stored exactly as published, and any consumer must apply the '
                '1e6 itself and say that it did.'
            ),
            'margin_note': (
                'NO BASIC-TO-PURCHASER CONVERSION IS POSSIBLE FROM THIS ARCHIVE. It contains no trade '
                'margin and no transport margin data of any kind - no member is named for them, and '
                'the root unit.txt reports a single valuation (M.EUR) across all 7,987 region-sector '
                'pairs. The only related rows are in the satellite extension: "Taxes less subsidies '
                'on products purchased: Total" and "Other net taxes on production", both M.EUR. That '
                'is the tax component of the wedge and neither of the two larger ones.'
            ),
            'intensity_percentiles': intensity_percentiles(factors, cfg),
            'join_file_note': (
                'Joined on {jf} column 3 (CodeNr), by POSITION. Both archives ship BOTH '
                'products.txt and industries.txt at identical byte sizes, so reading the wrong one '
                'yields well-formed codes of the wrong kind and the wrong count; the generator '
                'asserts both the count and the code prefix and aborts rather than warning.'
            ).format(jf=cfg['join_file']),
            'version_note': (
                'metadata.json inside the archive reads "version": "v3.81" while its folder name is '
                'exio382_ntnu and the Zenodo record is labelled 3.8.2. The version recorded above is '
                'the Zenodo one. The discrepancy is the publisher\'s and is reported, not resolved.'
            ),
        },
        'factors': factors,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    # ⚠️ NOT json.dumps. THE FINGERPRINT MUST BE LANGUAGE-NEUTRAL, because the test that checks it
    # runs in JavaScript. Python serialises a float 0.0 as '0.0' and JavaScript as '0', and this
    # file holds 1,108 zeros, so a JSON-text digest disagrees across the two languages for reasons
    # that have nothing to do with the data. A fixed-width exponential format is identical in both
    # for every IEEE754 double.
    canonical = '\n'.join(
        f"{f['region']}|{f['exio_code']}|{f['unit']}|{f['value']:.12e}" for f in factors)
    digest = hashlib.sha256(canonical.encode('utf-8')).hexdigest()

    vals = [f['value'] for f in factors]
    nz = [v for v in vals if v != 0]
    # relative_to RAISES when OUT is outside ROOT, and that is not a hypothetical: a verification
    # run points OUT_DIR at a scratch directory precisely so the repo file is not overwritten, and
    # this line used to crash AFTER the file had been written correctly - losing the fingerprint
    # print, which is the one output such a run exists to produce.
    try:
        shown = OUT.relative_to(ROOT)
    except ValueError:
        shown = OUT
    print(f"wrote {shown}  ({OUT.stat().st_size:,} bytes)")
    print(f"  row {ROW_NUMBER}: {ROW_LABEL}")
    print(f"  unit (from unit.txt by position): {unit}")
    print(f"  {len(factors):,} factors = {len(seen)} regions x {EXPECTED_SECTOR} {cfg['nouns']}")
    print(f"  zeros {sum(1 for v in vals if v == 0):,}   negatives {sum(1 for v in vals if v < 0):,}")
    if nz:
        print(f"  non-zero min {min(nz):.6g}   max {max(vals):.6g}")
    print(f"  factors sha256: {digest}")
    print(f"  -> pin this in lib/emissionFactors/{OUT.stem}.test.ts")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__.strip().splitlines()[2].strip())
    main(pathlib.Path(sys.argv[1]).expanduser().resolve())
