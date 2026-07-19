# CBAM benchmark values — IR (EU) 2025/2620, Annex point 5.3 (raw extraction)

Companion to **`cbam-2620-benchmarks-raw.csv`**. That file is a verbatim, unparsed capture of the CBAM benchmark table. This file records where it came from, what the indicators mean, and what will bite whoever writes the parser.

## Provenance

| Field | Value |
|---|---|
| **Instrument** | Commission Implementing Regulation (EU) 2025/2620 of 16 December 2025 |
| **Subject** | Rules for the calculation of the free allocation adjustment to the number of CBAM certificates to be surrendered |
| **Publication** | Official Journal of the European Union, L series, 22.12.2025 |
| **CELEX** | 32025R2620 |
| **Source location** | Annex (single, unnumbered), point **5.3 "CBAM benchmark values"** |
| **Retrieval method** | EUR-Lex HTML endpoint, `legal-content/EN/TXT/HTML/?uri=CELEX:32025R2620` — HTTP 200, 958 151 bytes. No Cellar fallback required. |
| **Extraction date** | 2026-07-18 |
| **Extraction method** | HTML table parse, cell text only. No normalisation, no value parsing. |

## CSV shape

Columns 1–4 carry the source's own headers. **Category is carried as a fifth column, populated on every row** — the source expresses it as unnumbered banner rows (`Cement`, `Hydrogen`, `Fertilisers`, `Iron & Steel`, `Aluminium`) interleaved in the table, which would be lossy as marker rows in a CSV.

| CSV column | Source header |
|---|---|
| `cn_code` | `CN code` |
| `cn_description` | `CN Description` |
| `column_a_bm_star_raw` | `Column A` `BMg* [tCO 2 e/t]` |
| `column_b_bm_raw` | `Column B` `BMg [tCO 2 e/t]` |
| `category` | *(banner rows, denormalised onto each row)* |

**570 data rows**, broken down: Cement 6, Hydrogen 1, Fertilisers 27, **Iron & Steel 478**, Aluminium 58.

> **Row-count note.** The raw HTML yields 587 non-empty rows. That figure is **not** the data row count: it comprises 1 header row, 5 category banner rows, 11 indicator-legend rows, and **570 data rows**. Only the 570 are in the CSV; the 11 legend rows are reproduced below instead.

**Units:** t CO₂e per tonne of good, per the source headers.

**Decimal separator is the source's comma** — `0,086`, not `0.086`. Not converted. Any cell containing a comma is CSV-quoted, so the decimals do not break the parse. Convert at seed time, consistent with the other CBAM reference tables.

**The `CO 2` spacing artefact is preserved as-is.** The OJ uses a typographic subscript; the text extraction renders it `CO 2` with a space. Not normalised.

## §5.3 indicator legend (verbatim)

> Where more than one benchmark value is given for a specific CN code, the meaning of the indicators is as follows:
>
> **(1)** Value is to be used for production years 2026-27
> **(2)** Value is to be used for production years 2028-30
> **(A)** grey clinker / cement
> **(B)** white clinker / cement
> **(C)** Carbon Steel based on BF/BOF
> **(D)** Carbon Steel based on DRI/EAF
> **(E)** Carbon Steel based on Scrap/EAF
> **(F)** Low alloy Steel based on BF/BOF
> **(G)** Low alloy Steel based on DRI/EAF
> **(H)** Low alloy Steel based on scrap/EAF
> **(J)** High alloy Steel (based on EAF)
> **(K)** primary Aluminium
> **(L)** secondary Aluminium

**There is no indicator (I).** The sequence runs (H) → (J). Presumably deliberate, to avoid confusion between capital I and the numeral 1, but **the source does not say so**. Do not assume an (I) row is missing from the extraction — it does not exist in the OJ text.

## Ambiguities — flagged, unresolved

Recorded as flags. None has been resolved in the CSV, and none should be resolved silently in a parser.

### 1. Column A vs Column B is a ~30× trap

Both columns are labelled "CBAM benchmark". They are **not interchangeable**, and they select on the data path used:

- **Column A (`BM*_g`)** feeds **Equation 2** — the *actual-data* path (Annex §3.1).
- **Column B (`BM_g`)** feeds **Equation 6** — the *default-values* path (Annex §4).

The divergence is large. For `7208 10 00`: Column A `0,044`, Column B `1,370 (C)` — a factor of ~31. Picking the wrong column silently produces a wrong free allocation adjustment, and therefore a wrong certificate count.

> Any downstream reference table must carry **both columns, distinctly named**. There must never be a single field called `benchmark`.

### 2. Compound cells have no delimiter convention

Multi-indicator cells pack several values into one string with **no separator other than whitespace**. Worst case in the table, `7205 21 00` Column B:

```
1,460 (F)(1) 0,659 (G)(1) 0,328 (H)(1) 0,852 (J)(1) 1,298 (F)(2) 0,647 (G)(2) 0,315 (H)(2) 0,820 (J)(2)
```

Eight values across four routes × two period bands, with stacked indicators `(F)(1)`. Others carry a single indicator class (`0,150 (C) 0,027 (D) 0,027 (E)`), or period-only (`2,390 (1) 2,295 (2)`), or none at all (`0,086`). **Any split is inference, not extraction** — which is why these cells are stored raw. Write the parser against the full set of observed shapes, not against a sample.

### 3. `Column A = 0,000` rows

Several rows carry a zero Column A alongside a non-zero Column B — e.g. `7205 10 00` (A `0,000`, B `1,288 (C) 0,424 (D) 0,027 (E)`), `7205 29 00`, and cement rows `2523 21 00`, `2523 29 00`, `2523 90 00`.

Whether this means "no free allocation on the actual-data path" or "no own process step at this CN code" **is not stated in the source**. Do not coerce these to null, and do not treat them as missing data — they are explicit zeros in the OJ.

### 4. Square brackets in the source text

Bracketed text appears in the OJ itself and has been preserved:

- Annex §3.3(2)(d) and §4(d): "the **[default]** production route specified for the country of origin"
- Annex §5.2.3: "'High alloy steel' means steel containing 8 % **[or more metallic alloying elements or where high surface quality and processability is required]**"

These may indicate unresolved drafting in the published text. They are **not** extraction artefacts and have not been normalised. Note §5.2.3 matters for indicator `(J)` selection, so the bracketed definition sits directly on a routing decision.

## Related rules not captured in the CSV

The CSV is the value table only. Selecting the right cell also requires:

- **§5.1** — on the default path, "the same production route shall be used as indicated in **Annex I to Commission Implementing Regulation (EU) 2025/2621** for the country of origin of that good or precursor." That third instrument is **not** extracted here.
- **§5.1** — "Where different alloy grades for steel are given in the table for the same CN code, **the highest benchmark value** given for the relevant production year is used."
- **§5.2.1 / §5.2.3** — cement and steel grade definitions governing indicator selection.
- **`CBAM_y` and `CSCF_y`** — both multiply the benchmark in every SEFA equation, and **neither value is tabulated in 2620**. They come from Article 10a(1a) of Directive 2003/87/EC and Article 14(6) of Delegated Regulation (EU) 2019/331 respectively, and are year-indexed.
- **Article 1(2)** — "The free allocation adjustment for electrical energy (CN code 2716 00 00) shall be zero."

## Known gap

**CN code `7224 10 00` does not exist in this table.** The 8-digit codes present under that heading are **`7224 10 10`** (Ingots and other primary forms, of tool steel) and **`7224 10 90`** (Steel, alloy, other than stainless, in ingots or other primary forms). This mirrors the "see below" heading problem already documented for `cbam_default_values` — a 6-digit or rounded heading must be resolved to its 8-digit child before lookup, and a lookup on `7224 10 00` will legitimately miss.
