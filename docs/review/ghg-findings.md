# GHG module: confirmed findings

Read-only review of the working tree on 1 Oct 2026. Each item below was checked directly against the source
on that date; line numbers are for that working tree. No app code, config or migrations were changed. Wider
context and the full register are in [ghg-register.md](ghg-register.md).

---

## F-01. Missing factor keys silently fall back to US EPA values

**Status: FIXED** (recorded 7 Oct 2026, FI8) on the `factor-integrity` branch. `pickEF` reads only the location's
own table; a key it does not hold is priced through an exact conversion to a unit that table does hold, or is an
unpriced line with an export-blocking issue. No `?? EF` remains. Commits, oldest first (`git log 06a0809..1b40725`):
58bb697 and 5fb2190 (FI1), 796df43, 51a9014, a4bf4f4 and bc094eb (FI2), 198415d (FI5), efe25a7 and ff9e961
(FI3), a6dc519 (FI4), 18fce56 and 8b8af7b (FI7, FI7b), 1b40725 (FI10); 0f8c605 (RM1) and 1417dde (location row)
are on the same range but unrelated. The cross-publisher test in lib/ghg/engine.test.ts fails on the old code.
The text below is the finding as recorded on 1 Oct 2026; its line numbers are for that tree.

**What the code does.** For every non-US combustion table, `pickEF` reads the country table and, when the key
is absent, takes the US table's value with `??`:

```
lib/ghg/engine.ts:2420  return efOr((EF_UK as any)[key] ?? (EF as any)[key], String(key), ctry)
lib/ghg/engine.ts:2423  return efOr((EF_EU as any)[key] ?? (EF as any)[key], String(key), ctry)
lib/ghg/engine.ts:2427  return efOr((EF_AU as any)[key] ?? (EF as any)[key], String(key), ctry)
lib/ghg/engine.ts:2431  const nzTable = (EF_NZ as any)[loc.nz_use_class ?? 'commercial']
lib/ghg/engine.ts:2432  return efOr(nzTable?.[key] ?? (EF as any)[key], String(key), ctry)
lib/ghg/engine.ts:2439  const ef = efOr((EF_CA as any)[key] ?? (EF as any)[key], String(key), ctry)
```

`EF` is the US EPA table (engine.ts:107-198). The row's citation still comes from the location's own
jurisdiction through `combustionSource` (engine.ts:2535-2543), so a US EPA figure is cited to DEFRA, the EU
MRR, DCCEEW, MfE or ECCC.

**Known missing keys.** `EF_AU` has no `fuel_oil_gallon` (comment at engine.ts:648). Which other missing keys
the unit pickers can reach was not traced.

## F-02. The flat spend table still prices Supplier Portal Category 1 purchases

**What the code does.** The campaign Cat 1 route gap-fills each supplier without an allocated figure from its
recorded spend:

```
app/api/campaigns/[id]/scope3-cat1/route.ts:185  const ef = EMISSION_FACTORS.spend['Other'] ?? DEFAULT_SPEND_EF // documented conservative default
app/api/campaigns/[id]/scope3-cat1/route.ts:186  const valueMt = (spend * ef) / 1000 // kg -> mt
```

The sector key is always `'Other'`, so every supplier is priced at the same factor.
`EMISSION_FACTORS.spend['Other']` is `0.50` (lib/emissionFactors.ts:14) and `DEFAULT_SPEND_EF` is `0.5`
(lib/emissionFactors.ts:41).

**Provenance.** None is recorded for either. The provenance record holds `source: null, year: null,
region: null` (lib/emissionFactors.ts:53-57), and the file states "What is recorded about where the values in
EMISSION_FACTORS came from: nothing" (lib/emissionFactors.ts:44). The route's comment calls it a "documented
conservative default"; no documentation was found.

**What the customer sees.** "Use X mt as Cat 1" sets `has_supplier_data` and `supplier_emissions`
(app/dashboard/scope3/page.tsx:1623-1624). From then on the figure is labelled:
- **Confidence:** "Primary data" (page.tsx:2379).
- **Basis:** "Supplier-specific … no emission factor was applied" (page.tsx:2460-2461).
- **CSV:** "Entered as a figure; no spend-based estimate was made" (page.tsx:2775-2777).

All three apply even when the total includes lines priced at 0.5 kg/USD.

**Can X in "Use X mt" be a flat-factor value? Yes.** The button label is:

```
app/dashboard/scope3/page.tsx:3606  <button onClick={() => useCatOneFigure(catOneResult.total_mt)} …>
app/dashboard/scope3/page.tsx:3607    Use {catOneResult.total_mt.toFixed(2)} mt as Cat 1 →
```

`total_mt` is computed by the route as supplier-specific lines plus spend-based lines:

```
app/api/campaigns/[id]/scope3-cat1/route.ts:230-235  supplierSpecificMt = Σ lines with method 'supplier-specific'
                                                        spendBasedMt       = Σ lines with method 'spend-based'
app/api/campaigns/[id]/scope3-cat1/route.ts:236     const totalMt = supplierSpecificMt + spendBasedMt
app/api/campaigns/[id]/scope3-cat1/route.ts:251     total_mt: Number(totalMt.toFixed(3)),
```

Every spend-based line is priced at the flat factor (route.ts:185-186). So X is:
- the flat-factor estimate alone, when no supplier reported a figure;
- the supplier-reported figures alone, when every supplier reported one;
- otherwise the sum of both.

`useCatOneFigure` writes X into `supplier_emissions` and sets `has_supplier_data` whatever its mix
(page.tsx:1619-1625).

**What the panel shows before the button.** A count line, "{N} primary · {N} spend-based · {N} uncovered"
(page.tsx:3541), and a per-supplier badge showing each line's method (page.tsx:3545-3547). After the button is
used, the labels in F-02 above apply to the whole figure.

## F-03. Australian residual-mix rows are stamped AR6

**What the code does.** The market-based Scope 2 workings row sets:

```
lib/ghg/engine.ts:3266  gwp_basis: res.applicable && res.source !== EF_SOURCES.residual_eu ? gwpVersion : GWP_AS_PUBLISHED
```

Only the EU residual source is exempted. For an AU location `res.source` is `EF_SOURCES.residual_au`, so the
row is stamped `gwpVersion` (AR6 on every saved inventory: app/dashboard/ghg/page.tsx:1428, 1654).

`RESIDUAL_AU` (engine.ts:1094) is DCCEEW's single published CO2e figure: "DCCEEW National Greenhouse Accounts
Factors 2025, Table 2 — national Residual Mix Factor, 0.81 kg CO₂-e/kWh" (engine.ts:805). No AR6 re-basing is
applied to it. The same file's own rule for a factor it did not combine is `GWP_AS_PUBLISHED`
(engine.ts:882-892).

## F-04. The public methodology page describes a fallback and a GWP choice that do not exist

**What the page says** (app/methodology/page.tsx:67):
- "Locations outside the US, Canada, UK, and EU fall back to US EPA combustion factors."
- "UK combustion figures are reported on that basis rather than the user-selected AR4/AR5 set."

**What the code does.**
- **No US EPA fallback for other countries.** The country router returns a supported jurisdiction only for
  GB, the 27 EU members, AU, NZ, CA and US (engine.ts:1394-1399, EU list at 1279). An empty country is refused
  as `country_not_set` (1400). Other countries are refused, and the location is excluded from totals.
- **No GWP selection.** `EF_SOURCES.gwp_ar6` reads "IPCC AR6 (2021) — the GWP set for every framework …
  There is no setting to change it." (engine.ts:815). The wizard saves `gwp_version: 'AR6'`
  (app/dashboard/ghg/page.tsx:1638).

**The same fallback is repeated on the module page.** "…with US EPA combustion factors elsewhere"
(app/climate-ghg/page.tsx:158). FAQ: "Everywhere else uses US EPA combustion factors, and the workings row
says so" (app/climate-ghg/page.tsx:303).

**Omitted factor sources.** The methodology page's factor lists name the US, CA, UK and EU only. AU (DCCEEW)
and NZ (MfE) combustion and electricity factors are priced (engine.ts:770-771, 801-802) but not listed. The
AU residual mix (engine.ts:805) is not in the Scope 2 paragraph (methodology:71).

## F-05. The US combustion citation names 2024; the values were read from the 2025 workbook

**What the code says.**

```
lib/ghg/engine.ts:755  combustion: 'US EPA (2024) Emission Factors for Greenhouse Gas Inventories',
lib/ghg/engine.ts:859  COMBUSTION_EDITION.US: 'US EPA 2024'
```

The code's own header contradicts it:

```
lib/ghg/engine.ts:65  // ⚠️ EDITION UNVERIFIED. EF_SOURCES.combustion cites "US EPA (2024)"; the workbook these values were
lib/ghg/engine.ts:66  // read from is the 2025 edition, last modified 15 January 2025. Nobody has checked whether the two
lib/ghg/engine.ts:67  // editions differ, so the citation may name the wrong year
```

The US steam factor, from the same Hub, already cites 2025: "US EPA (2025) GHG Emission Factors Hub, Table 7"
(engine.ts:779; edition "US EPA 2025 Table 7", engine.ts:878).

**Where the 2024 citation reaches customers.**
- The methodology page: "US locations use US EPA (2024) factors" (app/methodology/page.tsx:67).
- The workings "Factor source" and "Factor vintage" columns (app/dashboard/ghg/page.tsx:2706-2707).
- The verifier page (app/verify/[token]/page.tsx:1162).
- The assurance PDF (lib/assurancePdf.ts:227, 247).
- The CSV (app/dashboard/ghg/page.tsx:3147).

## F-06. The comparability disclosure has no factor-edition observation, and the export does not carry `FACTOR_EDITION_DISCLOSURE`

**Status: CLOSED** (recorded 8 Oct 2026, T3c diff 4, docs/review/patches/t3c-4.patch, on the `factor-years` branch).
A `factor_edition` observation names, for every dataset both years used whose edition changed, the prior and current
edition and what that change alone does to this year's figures by scope, or why that could not be calculated
(lib/ghg/factorEditionComparison.ts, lib/ghg/comparability.ts). The prior year is compared on the editions that
priced it: its own window, its frozen class (b) choices and the day it was last saved. The lines and
`FACTOR_EDITION_DISCLOSURE` print on the export screen, in the CSV/XLSX ("Comparability with {prior year}"), on the
verifier page and in the assurance PDF. The platform's comparison is stored in its own column,
`ghg_inventories.factor_edition_comparison` (20261008_ghg_factor_edition_comparison.sql, projected by
20261009_get_verifier_inventory_factor_edition_comparison.sql), so the verifier page and the PDF show an edition change
even when the comparability question is unanswered. The FAQ at app/climate-ghg/page.tsx was corrected (CG-23).
The text below is the finding as recorded on 1 Oct 2026; its line numbers are for that tree.

**What the comparability module observes.** `ObservationKind` is `magnitude_scope1`, `magnitude_scope2`,
`exclusion`, `locations`, `fuels`, `jurisdictions`, `boundary`, `structure_unchanged`
(lib/ghg/comparability.ts:103-111). A search of comparability.ts for "edition" returns nothing.

**Where `FACTOR_EDITION_DISCLOSURE` is used.** It is defined at lib/ghg/factorEditions.ts:444. Its only
consumer in app/ or lib/ is the trends page: imported at app/dashboard/ghg/trends/page.tsx:21 and read at :226.
That page is a dashboard screen, not an export.

**Which year-on-year disclosure is exported.**
- **Verifier page: comparability record only.** The record saved on the inventory
  (`comparability_disclosure`) is rendered on the verifier page (app/verify/[token]/page.tsx:153, 765-843). It
  does not include `FACTOR_EDITION_DISCLOSURE` or any edition comparison. The verifier page shows a separate
  "Emission Factor Editions" table (app/verify/[token]/page.tsx:859-929). That table lists the editions for
  this inventory only, not a comparison with the prior year.
- **CSV: prior-year figures only.** The framework CSV (`generateExport`, app/dashboard/ghg/page.tsx:3101-3215)
  carries the manually entered prior-year Scope 1 and Scope 2 figures (page.tsx:3133-3134). It carries neither
  the comparability record nor `FACTOR_EDITION_DISCLOSURE`.
- **Assurance PDF: neither.** lib/assurancePdf.ts contains no reference to comparability or to factor editions.

**Copy affected.** The FAQ answer "the comparison carries its own disclosure … including which factor
editions were applied" (app/climate-ghg/page.tsx:305) describes something the exported disclosure does not
contain.

## F-07. Concierge extract route: error strings reach the customer, and the raw model text is returned on a parse failure

**How the client shows a route error.** When the route answers without usable fields, the client renders the
route's `error` verbatim:

```
app/dashboard/ghg/page.tsx:1108  ? `We couldn’t read this one: ${json.error} Type the figure into the box above, or try uploading again.`
```

**Error strings the route can return** (app/api/concierge/extract/route.ts):

| Line | Status | `error` text |
|---|---|---|
| 116 | (plan read failure) | "We couldn’t confirm your plan just now. Please try again in a moment." |
| 122 | (no Concierge) | "Reading figures off a document is part of the concierge add-on. Your upload is still kept as evidence — type the figure into the box above." |
| 130 | (config) | "Extraction is not configured: ANTHROPIC_API_KEY is missing on the server." |
| 148 | 404 | `Could not read uploaded file from storage: ${dlErr?.message ?? 'not found'}` (raw storage message) |
| 161 | 400 | "document (base64) is required" |
| 164 | 400 | "No supported fuelTypes requested" |
| 173 | (media type) | `Unsupported mediaType "${mediaType}". Use application/pdf or one of: …` |
| 226 | (upstream) | "Extraction service error", with the upstream `status` in the body |
| 246 | (length) | "The document was too long to read in full." |
| 272 | 502 | "Could not parse extraction result", with `raw: rawText` in the body |
| 291 | 401 | `error.message` from the auth layer |
| 294 | 500 | "Extraction failed" |

The text at line 122 contains an em dash, which reaches the customer through page.tsx:1108.

**Raw model text on a parse failure.** When `JSON.parse` fails, the route:

```
app/api/concierge/extract/route.ts:270  console.error('Extraction parse error:', parseErr, '\nRaw model text:', rawText)
app/api/concierge/extract/route.ts:271  return NextResponse.json(
app/api/concierge/extract/route.ts:272    { error: 'Could not parse extraction result', raw: rawText },
```

- **Server log.** The full model output is written to the server log. It may contain figures and quotes read
  from the customer's document.
- **Response body.** The same text goes in the 502 body.
- **Client display.** The client reads only `json.error`; no use of `json.raw` was found in
  app/dashboard/ghg/page.tsx. The raw text is therefore present in the network response to the customer's
  browser but not rendered on the page.

## F-08. What the year keys in `GRID_EF` represent

**In code, the key is matched to the inventory's reporting year.** Every caller passes
`inventory.reporting_year`: totals (app/dashboard/ghg/page.tsx:1428), the saved workings (1654), the step 4
workings (2666) and the on-screen factor (2020). In `buildWorkings` (lib/ghg/engine.ts:3028) and
`calcLocation` (2585) that year is the `year` argument. `getGridFactor(region, year)` uses `table[year]` when
that key exists, and otherwise the latest key at or below the year, or the earliest key if none is lower
(engine.ts:1120-1135). The key that was used is written to the workings row as `factor_vintage:
String(gf.usedYear)` (engine.ts:3241-3245) and into `factor_editions` (lib/ghg/factorEditions.ts:288, 323).

**What the keys correspond to in the source data is not uniform across jurisdictions**, going by the comments
in the table (engine.ts:894-956):

| Region | Keys | What the comment says the source is | What the key therefore is |
|---|---|---|---|
| CA provinces | 2024, 2025, 2026 | One edition: "ECCC 'Emission factors and reference values' v3.0 (Oct 2025), NIR 1990-2023 consumption intensities" (895) | **Not the ECCC edition**: all three keys come from the single v3.0 edition. Not a NIR data year either: the comment says the data is NIR 1990-2023, and 2024-2026 are later than that. The repo does not record which year label ECCC attaches to each value. In use, the key is the reporting year it applies to. |
| UK | 2025, 2026 | Two DEFRA workbooks: "2025 keeps the figure the 2025 workbook published and 2026 takes the 2026 one" (924-933) | The DEFRA edition year, used as the reporting year. |
| US states, US_AVG | 2023 | "EPA eGRID2023 state output rates" (909) | The eGRID data year (eGRID2023). |
| EU members, EU_AVG | 2023 | "EEA … (2023)" (935) | Not stated whether this is the publication year or the data year. |
| AU states, AU_AVG | 2025 | "DCCEEW … NGA Factors 2025 … Single vintage" (945-946) | The NGA edition year. |
| NZ | 2023, 2024, 2025 | One edition: "MfE 'Measuring Emissions' 2026 (v2) … year-keyed like the Canadian provinces" (953-954) | Data years within one edition. The MfE edition itself is 2026. |

**Consequence for Canada.** A Canadian grid row records `factor_vintage` as the reporting-year key ("2024",
"2025" or "2026"), while the edition that published every one of those values is "ECCC (2025) … v3.0"
(engine.ts:792). The engine's own comment says `factor_vintage` is "THE EDITION LABEL, NOT THE REPORTING
YEAR" for combustion rows, and that grid rows differ "because GRID_EF IS year-keyed" (engine.ts:3125-3130). For
Canada the key is a reporting-year applicability key, not an edition.

### F-08 (addition): what `factor_vintage` stores, and what a verifier sees

**Display.** The workings "Factor vintage" cell renders `r.factor_vintage || 'Not applicable'`
(lib/ghg/workingsCells.ts:133, `NOT_APPLICABLE` at :42). It is used on the dashboard (app/dashboard/ghg/page.tsx:500,
2707 and the declaration and exclusion rows) and on the verifier page workings table, column "Factor vintage"
(app/verify/[token]/page.tsx:994, 1162). The verifier page also has an "Emission Factor Editions" table built
from `factor_editions` (lib/ghg/factorEditions.ts:223-326), rendering each entry's `edition`
(app/verify/[token]/page.tsx:935).

**What each row type stores in `factor_vintage`, and what the editions table records:**

| Jurisdiction | Combustion row `factor_vintage` (COMBUSTION_EDITION, engine.ts:858-865) | Location-based grid row `factor_vintage` | Market-based residual row `factor_vintage` | Steam row `factor_vintage` (STEAM_EDITION, engine.ts:877-880) | Editions table: combustion / electricity / steam |
|---|---|---|---|---|---|
| US | "US EPA 2024" | `String(usedYear)`: "2023" (the only key) | `Green-e ${y + 2} [${y} data] + eGRID2023 Rev2`, e.g. "Green-e 2025 [2023 data] + eGRID2023 Rev2" (engine.ts:1231-1232); with no residual mix, the grid row's "2023" (3264) | "US EPA 2025 Table 7"; unset if supplier-priced (3321) | "US EPA 2024" / "2023" / "US EPA 2025 Table 7" |
| CA | "ECCC 2025 v3.0" | "2024", "2025" or "2026": the reporting-year key | No residual mix, so the grid row's year (3264) | Unset (no published factor) | "ECCC 2025 v3.0" / the key year(s), e.g. "2025" / none |
| UK | "DEFRA 2026" | "2025" or "2026" | No residual mix for UK, so the grid row's year | "DEFRA 2026" | "DEFRA 2026" / "2025" or "2026" / "DEFRA 2026" |
| EU | "IPCC 2006" | "2023" | `AIB ${y}`, e.g. "AIB 2024" (engine.ts:1185); Austria: grid fallback year | Unset | "IPCC 2006" / "2023" / none |
| AU | "DCCEEW NGA 2025" | "2025" | `DCCEEW ${y} RMF (FY basis, 3-yr avg)`, e.g. "DCCEEW 2025 RMF (FY basis, 3-yr avg)" (engine.ts:1206) | Unset | "DCCEEW NGA 2025" / "2025" / none |
| NZ | "MfE 2026 v2" | "2023", "2024" or "2025": the data-year key used | No residual mix, so the grid row's year | Unset | "MfE 2026 v2" / the year(s) used / none |
| NZ T&D (Scope 3 Cat 3) | n/a | `MfE ${ty}`, e.g. "MfE 2025" (engine.ts:1000; row 3271) | n/a | n/a | not recorded |

Electricity editions are the grid years used, comma-joined across locations: `[...years].join(', ')`
(factorEditions.ts:322-323). They record no publisher edition. The electricity `source` beside them is the
jurisdiction citation (`CITATIONS[j].electricity`, factorEditions.ts:322).

Rows that show "Not applicable" in the vintage cell:
- refrigerant rows;
- supplier-priced steam;
- declaration, exclusion and coverage-resolution rows.

**What the assurance PDF shows.** The PDF prints no `factor_vintage` and no `factor_editions` (no "vintage" or
"edition" reference in lib/assurancePdf.ts except the residual table). It prints:
- **Combustion:** one "Combustion factors" row per distinct citation string (`combustionSourcesFor`,
  lib/assurancePdf.ts:227, 233), e.g. "US EPA (2024) Emission Factors for Greenhouse Gas Inventories" or "ECCC (2025)
  Emission factors and reference values v3.0".
- **Electricity:** one "Electricity factors" row per distinct `gridSource` citation (assurancePdf.ts:228, 234;
  engine.ts:2455-2463). These are the jurisdiction citations: "US EPA eGRID2023", "ECCC (2025) … v3.0", the
  undated DEFRA citation, "EEA (2023) …", "DCCEEW NGA Factors 2025", "NZ MfE Measuring Emissions 2026 v2". **No
  grid year is printed.** A UK inventory's PDF does not say whether 2025 or 2026 factors were applied, and a
  Canadian one does not show the key year.
- **Residual mix (ESRS or GRI only):** a per-location table "Residual factor source" and "Vintage / note"
  (assurancePdf.ts:278-284). Its rows are recomputed at export time from `getResidualFactor(…, 'AR6')`, not read
  from the stored `factor_vintage` (app/dashboard/ghg/page.tsx:3082-3091). The vintage column shows the residual
  vintage string above, or "Location-factor fallback" with the note.

---

## F-09. A bill wholly outside the inventory year is shown as "not counted" but is added in full to the annual figure

**Status: FIXED** (recorded 6 Oct 2026, T13). The annual figure is the fold of each bill's contribution, and a
bill wholly outside the year has reason `outside_year`, share 0 (`billContributions`, T1 d924f33; fold in
`applyResolutions`, T2 7c413d6). The page no longer writes a figure into the location: every reader derives it
(`deriveLocations`, T4 fac4bdd; saves raw, T7 cbbda08). The coverage strip forms its groups from the same
contributions (T8 62521bb). The text below describes the code before those commits. Regression tests: "T13 F-09,
F-10, F-11 regressions" in lib/ghg/engine.test.ts, and "what it says is not counted is not in the figure" in
app/dashboard/ghg/_components/CoverageStrip.test.tsx. T13 commit: `279ff9c`.

**Where the strip decides "not counted".** `analyzeCoverage` computes each bill's in-window days on the
half-open window. A bill with none is pushed to `outOfWindow`:

```
lib/ghg/engine.ts:1755-1758  const daysInYear = Math.max(0, dayCount(ovStart, ovEndExcl))
                             if (daysInYear <= 0) { outOfWindow.push({ label: fmtPeriod(p) }) }
```

The strip renders that list: "{n} bill(s) outside reporting year {year}, not counted: {labels}."
(app/dashboard/ghg/page.tsx:3526-3529).

**Where the annual figure includes it.**
- **Gather.** `applyResolutions` gathers every confirmed proposal with a value for the field. There is no
  date-window test (lib/ghg/engine.ts:2952-2968).
- **Value.** It sets `value = mixedUnits ? a.rawSum : straddledSum * extrFactor` (engine.ts:2991).
  `straddledSum` scales only proposals that straddle (engine.ts:2986-2988). A wholly out-of-window bill is not a
  straddle (`inWin > 0 && inWin < total` is false at engine.ts:2947), so its value passes through at factor 1.
- **Write to the location.** The value is written into the location's fuel field on every proposal
  confirmation (app/dashboard/ghg/page.tsx:1249-1255) and on every coverage resolution (page.tsx:1285-1289).
- **Totals and workings.** `calcLocation` reads those fields for totals (engine.ts:2585 onward), and
  `buildWorkings` calls the same `applyResolutions` (engine.ts:3191).
- **No gate catches it.** `findUnresolvedCoverage` raises gap, overlap and straddle only; `outOfWindow` raises
  no issue (engine.ts:1811-1813, 3436-3441), so the export gate does not stop it.

**Are straddling bills prorated by in-year days in the annual figure? Only if the customer chooses "Prorate by
days", and then not per bill.**
- **No resolution yet.** `straddleFactor` is 1 (engine.ts:2981-2985), so the full straddling bill is in the
  on-screen figure. Export is blocked until a straddle resolution exists (`findUnresolvedCoverage`,
  engine.ts:3440-3441; gate at page.tsx:1305-1306).
- **"Count in this year":** factor 1, the full bill.
- **"Count in next year":** factor 0, excluded.
- **"Prorate by days":** factor `daysInYear / totalDays`, taken from the **first** straddle in the strip
  (`cov.straddles[0]`, page.tsx:3579-3580). One resolution per location and fuel applies that single factor to
  every straddling bill of the fuel (engine.ts:2976, 2981-2988). Where two bills straddle, for example one at
  each end of the year, the second is scaled by the first bill's ratio.
- **Mixed units:** `rawSum` is used and no straddle scaling applies (engine.ts:2991). The value is not
  written, and the proposals are flagged for review (page.tsx:1252-1264).

## F-10. An overlapping month-only "Jan 2026" bill and a "Jan 1 – Feb 1 2026" bill are both summed

**Status: FIXED** (recorded 6 Oct 2026, T13). Overlap is compared on full bill periods, so two copies outside
the year still raise it, and it is resolved only as `same_bill` (one counted) or `different_meters`; a stored
`duplicate` is never accepted (`validateResolution`, T3 de782a6). "Confirm not a duplicate" is gone from the
strip (T8 62521bb). A month-only bill cannot be confirmed until the customer confirms its dates (`guardConfirm`
and `acceptanceProblem`, T9 616200c). Bills outside the year add 0 (T2 7c413d6), and the monthly split reads the
same contributions (T6 90ad99c). The text below describes the code before those commits. Regression test: "T13
F-09, F-10, F-11 regressions" in lib/ghg/engine.test.ts. T13 commit: `279ff9c`.

**Inputs and intervals.** "Jan 2026" is stored as 2026-01-01 to 2026-01-31 (month-only rule,
app/api/concierge/extract/route.ts:65), giving `[2026-01-01, 2026-02-01)`. "Jan 1 – Feb 1 2026" is stored
verbatim (route.ts:63), giving `[2026-01-01, 2026-02-01)` (`exclusiveEnd`, engine.ts:1711-1715). The two
intervals are identical.

**Why the overlap resolution did not change the figure.** Commit 7279a49 was not inspected: this review ran
no git commands. The answer below is from the current code. Of the three possibilities:

- **"The overlap check uses a key under which these two bills do not match": not true, if both were uploaded
  in the same slot.**
  - The export gate groups by `${d.document_type}|${p.fuelType}` (engine.ts:3419).
  - The strip groups by fuel within the docs of one upload slot (`docs={loc.source_docs.filter(d =>
    d.document_type === …)}`, e.g. page.tsx:2317; grouping at page.tsx:3500-3505).
  - Two electricity bills uploaded under "Upload electricity bills" share `utility_electricity|electricity`
    and match.
  - They would not match only if they were uploaded under different document types. For electricity there is
    one slot, so that does not arise.

- **"It detects the overlap but only gates export and does not change totals": TRUE, for a 2026 inventory.**
  - **Detected.** Both bills cover the same in-window days, so an overlap pair is raised (engine.ts:1784-1790)
    and `issues` includes 'overlap' (engine.ts:1812).
  - **Export gated.** `findUnresolvedCoverage` maps 'overlap' to the `duplicate` resolution (engine.ts:3406)
    and reports it until one exists (engine.ts:3436-3441). The export gate requires none to be unresolved
    (page.tsx:1305-1306).
  - **The only resolution changes nothing.** The strip offers one control: "Two bills cover the same period.
    Remove the duplicate above, or:" **Confirm not a duplicate** (page.tsx:3548-3560). It records the note
    "…accepted the figures as-is. No double-count adjustment applied." (page.tsx:3556).
  - **The value ignores it.** In `applyResolutions` the duplicate resolution changes no value. `value` uses
    only straddle and extrapolation (engine.ts:2991). A duplicate contributes only to `adjustment.basis` and
    `kind`, and only when it is the sole resolution (engine.ts:3006-3009). The basis text says so
    ("overlapping bills accepted as-is; no double-count adjustment applied", engine.ts:2888, 2903).
  - **Both quantities were already in the figure.** Each was written on confirmation (page.tsx:1249-1255),
    before any resolution existed.
  - **Removing the bill is the only path that removes it from the total.** The other choice in the prompt,
    "Remove the duplicate above", deletes the document; that is not a resolution.

- **"The traced path does not pass through it": true for a 2025 inventory.**
  - Both bills lie wholly outside `[2025-01-01, 2026-01-01)`. The overlap test clips each bill to the window
    before comparing (`Math.max(0, …)`, `Math.min(totalDaysInWin, …)`, engine.ts:1786-1787), so two
    out-of-window bills have empty ranges and no overlap is raised.
  - Both go to `outOfWindow` ("not counted") and raise no issue, so nothing gates export.
  - Both quantities are added in full to the 2025 annual figure (F-09).

**Monthly records.** Each bill produces its own slice, `period_month 2026-01-01`, `reporting_year 2026`, with the
full quantity (lib/ghg/monthlyEmissions.ts:236-253). The monthly module has no overlap handling, so January
2026 carries both.

## F-11. `periodConfidence` is saved but never read

**Status: FIXED** (recorded 6 Oct 2026, T13). Extraction maps it to `periodOrigin` ('high' to printed,
'medium' to billing_month, app/dashboard/ghg/page.tsx), and `periodOriginOf` reads it for proposals saved before
T9. `acceptanceProblem` refuses a billing_month proposal until its dates are confirmed, and `guardConfirm` applies
that to every patch the page makes (T9 616200c). 'low' still means null dates, which is undated, not counted and
export-blocking (T3 de782a6). The text below describes the code before those commits. Regression test: "T13
F-09, F-10, F-11 regressions" in lib/ghg/engine.test.ts. T13 commit: `279ff9c`.

**Written.**
- **The extraction prompt** sets it: "high" for printed dates, "medium" for a month-only period, "low" when no
  period is visible (app/api/concierge/extract/route.ts:63, 65, 66). It is part of the response type
  (route.ts:48) and the JSON schema the model must return (route.ts:77).
- **The client** copies it onto each proposal: `periodConfidence: f.periodConfidence ?? null`
  (app/dashboard/ghg/page.tsx:1073).
- **The engine** declares it on the proposal type (lib/ghg/engine.ts:1578).

**Read.** A search of app/ and lib/ (tests excluded) finds no other occurrence. Nothing in coverage, proration,
`applyResolutions`, `buildWorkings`, the monthly split, the export gate, the dashboard, the verifier page, the
PDF or the CSV reads it. A month-only period ("medium") is therefore treated exactly like printed dates ("high").
A proposal with a "low" period has null dates. It is excluded from coverage and from the monthly split as
undated (engine.ts:3417 requires both dates; lib/ghg/monthlyEmissions.ts:196 skips a bill with "missing bill dates"). That exclusion comes from
the null dates, not from `periodConfidence`.


## F-12. Reporting-year labels: a bare year or "FY" that does not say which year is meant

**Context.** `reporting_year` is the calendar year in which the reporting year ENDS: `periodFromYearAndEnd` sets
the end to `new Date(reportingYear, m, 0)`, the last day of the year-end month in that year (lib/ghg/engine.ts:1659).
So reporting year 2025 with a March year end is 1 Apr 2024 to 31 Mar 2025. Patch T3a adds
`reportingYearLabel(window)` (December year end: "2024" / "reporting year 2024"; otherwise "the year ending 31 March
2025") and moves only the proration note onto it. Every other place below still prints the bare year. They are
listed here, unchanged, so we can decide which to move onto the helper.

**How to read the table.** Rendered text is given for (a) reporting year 2024, December year end, and (b) reporting
year 2025, March year end. "Ambiguous" means (b) does not tell the reader that the year ends in March 2025.
Line numbers are from HEAD de782a6 (T3 committed, T3a not applied), checked by printing each line.

**The year end is shown almost nowhere.** Only the wizard's reporting-year dropdown shows the period
(page.tsx:1802). The assurance PDF, both CSVs, the verifier page, Trends and Scope 3 print the bare year. Scope 3
does not know the year end at all.

### Being fixed by T3a
| file:line | Rendered (a) / (b) | Note |
|---|---|---|
| lib/ghg/engine.ts:3284 | "...12 of 31 days in FY2024, ×0.387" / "...in FY2025..." | Stored as `proration_note` in `workings`; shown on the verifier page as "Prorated by billing days: ..." (app/verify/[token]/page.tsx:1043). **Inventories saved before T3a keep "FY..." until re-saved.** |

### GHG engine notes (lib/ghg/engine.ts)
| file:line | Rendered (a) / (b) | Ambiguous |
|---|---|---|
| 1003-1004 | "MfE {ty} T&D loss factor applied to 2024 inventory (...)" / "...2025 inventory..." | Mildly. Workings note, verifier page, export. |
| 1133-1134 | "Grid factor for {best} applied to 2024 inventory (...)" / "...2025 inventory..." | Mildly. Workings row note, verifier page. |
| 1148-1149 | "{label} residual mix applied to 2024 inventory (...)" / "...2025 inventory..." | Mildly. Reaches the PDF residual table (page.tsx:3093), the CSV (page.tsx:3164) and the screen. |
| 1664 | `periodFromYearAndEnd().label`: "Jan 1, 2024 – Dec 31, 2024" / "Apr 1, 2024 – Mar 31, 2025" | No. Rendered only at page.tsx:1802. |

### GHG wizard, CSV and PDF inputs (app/dashboard/ghg/page.tsx)
| file:line | Rendered (a) / (b) | Ambiguous |
|---|---|---|
| 1666 | alert "You already have a 2024 inventory for ..." / "a 2025 inventory" | Yes |
| 1802 | dropdown "FY2024 · Jan 1, 2024 – Dec 31, 2024" / "FY2025 · Apr 1, 2024 – Mar 31, 2025" | "FY2025" alone is; the range beside it makes it clear |
| 1853, 1856 | "Prior year Scope 1 (2023) tCO₂e" / "(2024)" | Yes: means the year ending Mar 2024 |
| 2116, 2136, 2151, 2179, 2195, 2206, 2216, 2254, 2332 | "Total natural gas: 2024 (mcf)", likewise propane, diesel, heating oil, HFO, gasoline, fleet diesel, electricity, steam / "...: 2025 (...)" | **Yes, highest risk.** Reads as calendar 2025, beside the hint "Sum of all 12 monthly bills". |
| 2584 | review subtitle "...inventory for Acme, 2024." / "..., 2025." | Yes |
| 2634, 2638 | review tiles "Prior year Scope 1 (2023)" / "(2024)" | Yes |
| 2969 | export preview tile "Reporting year 2024" / "2025" | Yes |
| 3115 | framework **CSV** row "Reporting year,2024" / ",2025" | Yes. No year-end row anywhere in the CSV. |
| 3135-3136 | CDP **CSV** rows "Prior year Scope 1 (2023) tCO₂e" / "(2024)" | Yes |
| 3207 | CSV filename "ThemisIQ_{FW}_{company}_2024.csv" / "_2025.csv" | Yes (filename) |
| 3246 | inventory list "Reporting year 2024 · Updated ..." / "2025" | Yes |
| 3530 | coverage strip "1 bill outside reporting year 2024, not counted: ..." / "2025" | Yes. The bill labels after it are calendar "Mon YYYY" and are clear. |
| 3721 | audit diff "Reporting year: 2023 → 2024" | Low |

### GHG Trends (app/dashboard/ghg/trends/page.tsx, lib/ghg/series.ts)
`y.year` is `reporting_year` (series.ts:510, 555). Trends never loads `fiscal_year_end_month`.

| file:line | Rendered (a) / (b) | Ambiguous |
|---|---|---|
| trends 283 | "Baseline year 2024" / "2025" | Yes |
| trends 329-330 | "tCO₂e · Scope 1+2 · 2024" / "· 2025", and "{year} can't be shown..." | Yes |
| trends 337 | "vs 2024" / "vs 2025" | Yes |
| trends 360, 449 | chart x-axis ticks 2024 / 2025 | Yes. Plotted on the same axis as SBTi base and target years (lines 55-76), a different year basis. |
| trends 414 | delta callouts "2024" / "2025" | Yes |
| trends 465 | "Scope 3 not reported for: 2024" / "2025" | Yes |
| trends 501, 514 | monthly-detail select "2024"; "No monthly (utility-bill) data for 2024" | Yes; see related item 1 |
| series.ts 345, 348, 371, 373, 389 | "2024 isn't shown: ...", "2024 has a saved Scope 3...", "2024's Scope 3 figure...", "2024 covers ..." | Yes. Rendered at trends 400 and in the Scope 3 drift text. |

### Verifier page (app/verify/[token]/page.tsx)
| file:line | Rendered (a) / (b) | Ambiguous |
|---|---|---|
| 747 | header "Reporting year 2024 · {frameworks} · {boundary}" / "Reporting year 2025 ..." | **Yes.** The page does not show the year end. |
| 1043, 1046 | stored `proration_note` / `extrapolation_note` text | See "Being fixed by T3a" |
| 300 | audit label "Reporting year" with raw values | Low |

### Assurance PDF (lib/assurancePdf.ts)
lib/pdf/** has no year labels.

| file:line | Rendered (a) / (b) | Ambiguous |
|---|---|---|
| 117 | cover document ref "TIQ-GHG-2024-123456" / "TIQ-GHG-2025-..." | Low |
| 139 | cover "Reporting year 2024" / "2025" | **Yes.** No period or year end anywhere in the PDF. |
| 259 | methods table "Reporting year 2024" / "2025" | Yes |
| 283-284 | residual table rows carrying "...applied to 2024 inventory" (from page.tsx:3093) | Mildly |
| 386 | filename "ThemisIQ_Assurance_{company}_2024.pdf" / "_2025.pdf" | Yes (filename) |
| 70 | audit label "Reporting year" | Low |

### Scope 3 (app/dashboard/scope3/page.tsx, app/api/scope3/spend-factor/route.ts)
`reportingYear` is the linked GHG inventory's `reporting_year` (page.tsx:1521). The year end is never known here.

| file:line | Rendered (a) / (b) | Ambiguous |
|---|---|---|
| 2968 | **CSV** row "Reporting year,2024" / ",2025" | Yes |
| 3041 | CSV filename "{company}_Scope3_2024.csv" / "_2025.csv" | Yes (filename) |
| 3126 | "Linked to your Acme 2024 GHG inventory..." / "2025" | Yes |
| 3147 | reporting-year select option "2024" / "2025" | Yes |
| 4180 | summary "Acme · 2024 · GHG Protocol Scope 3 Standard" / "2025" | Yes |
| 4383 | summary tile "Reporting year 2024" / "2025" | Yes |
| 4473 | GHG link picker "Acme, 2024" / "Acme, 2025" | Yes |
| spend-factor/route.ts:710-712 | disclosure "The reporting year is 2024 but this edition's price data ends at {pv}... price changes between {pv} and 2024 are not reflected." Shown in Scope 3 workings and CSV. | Yes, and it treats the reporting year as a calendar price year |

lib/scope3/** has no reporting-year text; its `${...year}` strings (cat3Copy.ts:408, methodSummary.ts:161-269)
are DEFRA edition years.

### Related but distinct: reporting_year read as a calendar year
These are not labels, but they come from the same assumption and should be decided alongside it.

1. **Monthly slices are stamped with the calendar year, not the inventory year.**
   - lib/ghg/monthlyEmissions.ts:241 writes `reporting_year: s.year`, the calendar year of the month (:129).
   - lib/ghg/loadMonthly.ts:86 filters on it.
   - So Trends "Monthly detail" for (b), year 2025, shows Jan to Dec 2025, not Apr 2024 to Mar 2025.
   - The bars are labelled "Jan" to "Dec" with no year (loadMonthly.ts:44, 63).
   - This overlaps ruling Q2 (slices tagged with their source inventory; trends filter by inventory, T12).
2. **Factor years use reporting_year as a calendar year.**
   - `getGridFactor(region, reporting_year)` (engine.ts:1120); `factor_vintage: String(gf.usedYear)` (engine.ts:3560); the edition label at engine.ts:2526.
   - Residual mix does the same (engine.ts:1185, 1206, 1231).
   - For (b), the 2025 factor is applied to a window that is 75% in 2024. This is a methodology question, not a label question.
3. **SB 253 first-year banner.** page.tsx:2890-2909 sets `sb253FirstYear = year <= 2024`, reading `reporting_year` as a calendar year to decide which banner the customer sees.
4. **"FY" meaning something else (no change needed).**
   - engine.ts:1536 `deadline: 'FY2024 (large EU companies)'` is a regulatory deadline, rendered at page.tsx:1740 and 2976.
   - engine.ts:1206 "FY basis" is the Australian financial year.
   - app/api/ghg-bot/route.ts:133 is system-prompt text only.
