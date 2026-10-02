# Australian factor coverage: GHG wizard and Scope 3 Category 3

Read-only audit at HEAD `3e37755` (T10a committed), branch `derived-figures`, 2 Oct 2026. No code was changed.
Every file:line below is at that commit. Paths: `engine.ts` is `lib/ghg/engine.ts`, `unitConversions.ts` is
`lib/unitConversions.ts`, `page.tsx` is `app/dashboard/ghg/page.tsx`, `cat3*.ts` are in `lib/scope3/`.

Column key used throughout: **S1** Scope 1 combustion; **S2-loc** Scope 2 location-based; **S2-mkt** Scope 2
market-based (residual mix); **Cat 3** Scope 3 Category 3 (WTT = upstream well-to-tank; T&D = transmission and
distribution losses).

---

## 1. Summary

### 1.1 Gaps that leave an AU inventory UNPRICED today

| # | Gap | Effect | Where |
|---|---|---|---|
| U1 | Gas billed in **kWh**. `kwh` is a tier-1 gas unit, so a bill in kWh is stored as `natural_gas_unit 'kwh'`. Neither `EF_AU` nor US `EF` has `natural_gas_kwh`. | `MissingEmissionFactorError`; the **whole location** is excluded from every total (not priced at zero), and Cat 3 skips it as `location_excluded`. | unitConversions.ts:29; engine.ts:2483-2513, 2533-2535, 2811-2815 |
| U2 | **Purchased steam** (GJ). `STEAM_EF.AU` is kind `'unpublished'`; no US fallback. | Unpriced unless the customer enters a supplier factor. Without one: `no_published_factor`, export blocked by `findSteamFactorGaps`; Cat 3 skips it as `scope2_not_priced`. | engine.ts:2373-2377, 2428-2447, 4388-4406; page.tsx:2392-2396 |
| U3 | **Unrecognised bill units** (e.g. `ft3`, which the extraction prompt itself lists). | Tier 3: no figure, `needs_manual_review`. | app/api/concierge/extract/route.ts:33; unitConversions.ts (normalizeUnit) |
| U4 | **Propane in kg as a stored unit** (reachable only from stored data; not offered for AU). | No `propane_kg` in `EF_AU` or `EF`, so the location is refused. A kg *bill* is instead converted to litres (see W2). | engine.ts:2533-2535 |

### 1.2 Gaps that leave an AU inventory WRONGLY priced today

| # | Gap | Effect | Where |
|---|---|---|---|
| W1 | **US EPA factors under a DCCEEW citation.** `pickEF` falls back from `EF_AU` to US `EF` for any missing key. Bill-path units are not checked against country, so mcf, therms, ccf, gallons and lbs reach an AU location. | Priced at the US EPA value, cited "DCCEEW NGA Factors 2025 (AR5)", vintage "DCCEEW NGA 2025". Affects gas mcf/therms/ccf, propane gallons/lbs, diesel gallons (stationary and fleet), petrol gallons, legacy `fuel_oil_gallon`. | engine.ts:2533-2535, 2647, 892, 3594; page.tsx:1081; ProposalEdits.tsx:64 |
| W2 | **US propane density** feeding an NGA factor. Propane kg converts to litres via `PROPANE_LB_PER_GAL = 4.24`, commented "VERIFY PROVENANCE" (EIA / NPGA), then `EF_AU.propane_litre` prices it. | An NGA factor applied to a volume derived from a US density, undisclosed as such. | unitConversions.ts:48-52, 146-150; engine.ts:660 |
| W3 | **Category 3 priced from DEFRA 2026 (UK)** for every AU line: fuel WTT, electricity generation WTT, T&D loss, T&D WTT, steam WTT and distribution. AU has no own T&D line; NGA's Scope 3 electricity figure is not seeded. | Disclosed: every line carries the `uk_stand_in` flag and copy. Not an AU factor. | cat3Energy.ts:248-256, 317; cat3Copy.ts:124-128, 207-211; engine.ts:1116, 2765 |
| W4 | **NGA 2025 used for every reporting year.** Only NGA 2025 is held. `GRID_EF.AU_*` and `RESIDUAL_AU` move to the held 2025 key with a note; `EF_AU` has no year key at all, so no note. | Under the section 8.2 ruling, December 2024, June 2025 and September 2025 year ends need NGA 2024 (section 2). Today they are priced with 2025. | engine.ts:979-981, 1123, 892, 1155-1161 |
| W5 | **Country switch relabels units without converting.** `unitsForCountryChange` keeps a held unit only if the new country offers it, otherwise takes the first option. US to AU with 1,000 gallons gives 1,000 litres. | Number unchanged, unit changed. Same class as the open CLAUDE.md defect "Unit switch relabels without converting". | engine.ts:2183, 2004-2014 |

### 1.3 Which of these T3c / T3d cover

| Gap | T3c (edition selection, no substitution) | T3d (load editions) |
|---|---|---|
| W4 NGA 2025 used for 2024 years | **Covered.** Edition keys on `EF_AU`, `GRID_EF.AU_*`, `RESIDUAL_AU`; the missing NGA 2024 edition becomes an unpriced line with an `edition_missing` export-blocking issue instead of being priced with 2025. Note: this turns W4 into an *unpriced* gap until T3d. | **Covered.** Loads NGA 2023 and 2024 (and 2026 if published), factor-year-selection.md section 8.4. |
| U1 gas kWh | Not covered | Not covered |
| U2 steam | Not covered (NGA publishes no steam factor) | Not covered |
| U3 unrecognised units | Not covered | Not covered |
| U4 propane kg stored | Not covered | Not covered |
| W1 US EPA fallback under DCCEEW citation | Not covered. T3c adds edition keys to `EF` and `EF_AU` but does not remove the `EF_AU ?? EF` fallback. | Not covered |
| W2 US propane density | Not covered | Not covered |
| W3 Cat 3 from DEFRA UK; no AU T&D | Not covered. T3d's scope is section 8.4, which lists NGA as "grid, residual mix, combustion" only. | Not covered |
| W5 country switch relabel | Not covered | Not covered |

---

## 2. NGA editions held, and the edition each year end needs

**Held: NGA 2025 only.**
- `EF_AU`: a single unkeyed table, labelled `COMBUSTION_EDITION` `'DCCEEW NGA 2025'` (engine.ts:892).
- `GRID_EF.AU_*`: `{ 2025: ... }` only (engine.ts:979-981).
- `RESIDUAL_AU`: `{ 2025: 0.81 }` (engine.ts:1123).
- No NGA 2023, 2024 or 2026 values or keys exist anywhere in `lib/` or `app/`.

**Rule** (factor-year-selection.md section 8.2, confirmed in design-derived-figures.md section 10, T3c: NGA):
NGA is class (a). Edition N covers activity from 1 Jul N to 30 Jun N+1; the edition is chosen by the majority of
days in the reporting window.

| Reporting year ends | Window | Days by NGA edition | Edition required | Held? | Today |
|---|---|---|---|---|---|
| December 2024 | 1 Jan to 31 Dec 2024 | 2023: 182; 2024: 184 | **NGA 2024** | No | Priced with 2025 |
| June 2025 | 1 Jul 2024 to 30 Jun 2025 | 2024: 365 | **NGA 2024** | No | Priced with 2025 |
| September 2025 | 1 Oct 2024 to 30 Sep 2025 | 2024: 273; 2025: 92 | **NGA 2024** | No | Priced with 2025 |
| December 2025 | 1 Jan to 31 Dec 2025 | 2024: 181; 2025: 184 | **NGA 2025** | Yes | Priced with 2025 (correct) |

These agree with the NGA rows of factor-year-selection.md section 8.4. Section 8.2 records the edition-to-activity-year
mapping as the author's reading of the NGA 2025 document (section 1 with Appendix 7); section 10 records it as
confirmed.

---

## 3. Routing rules that apply to every AU row

- **AU is a supported country:** `efRouting` returns `ok('AU')` (engine.ts:1425).
- **Fallback:** `pickEF` AU branch, engine.ts:2533-2535:
  `return efOr((EF_AU as any)[key] ?? (EF as any)[key], String(key), ctry)`. A key missing from `EF_AU` but
  present in US `EF` is priced at the US value. The row still cites `combustion_au` "DCCEEW NGA Factors 2025
  (AR5)" (combustionSource engine.ts:2647) and vintage `'DCCEEW NGA 2025'` (engine.ts:892). Because US factors
  carry a CH4/N2O split, `factorCells` (engine.ts:3723-3730) stamps the row with the live GWP set (AR6), not
  "as published".
- **A key missing from both tables** is refused: `efMiss` (engine.ts:2468), `assertPriceable` /
  `MissingEmissionFactorError` (engine.ts:2483-2513), `unpriceableReason` (engine.ts:2811-2815). The whole
  location is excluded from every total. Nothing on this path is priced at zero.
- **Bill path has no country check.** Extraction calls `convertToCanonical` without a country (page.tsx:1081);
  the "Unit on the bill" control offers `convertibleUnits(fuelType)` without a country (ProposalEdits.tsx:64);
  `deriveLocations` writes the converted unit to the location (engine.ts:3594). So bill-path units reach an AU
  location even where the wizard's unit list for AU does not offer them.
- `convertibleUnits('natural_gas')`: mcf, therms, mmbtu, m3, kwh, ccf, gj, mj (`SELECTOR_UNITS`
  unitConversions.ts:27-33 plus tier-2 conversions).

---

## 4. Per-input table (AU location)

"Wizard" = offered in the AU unit selector. "Bill path" = reachable only from an extracted bill or the
proposal unit editor.

### 4.1 Natural gas

| Input | Offered | S1 factor and citation | Conversion and source | Cat 3 |
|---|---|---|---|---|
| m³ | Wizard (ngUnitOptions AU, engine.ts:2047); bill tier 1 | `EF_AU.natural_gas_m3` 2.025 kg CO2e/m³ (engine.ts:649). Comment: 0.0393 GJ/m³ × 51.53 kg CO2e/GJ, "NGA Table 4, ex-Table 39 energy content". Derivation note `AU_DERIVATION.natural_gas_m3` (engine.ts:619) | None | DEFRA `natural_gas_cubic_metres` 0.3366 (WTT fuels, D39), uk_stand_in (cat3Energy.ts:191) |
| MMBtu | Wizard (engine.ts:2047); bill tier 1 | `EF_AU.natural_gas_mmbtu` 54.367 (engine.ts:653): 51.53 kg CO2e/GJ × 1.05505585262 GJ/MMBtu. Derivation note (engine.ts:617-636) | None | MMBtu × GJ_PER_MMBTU × KWH_PER_GJ ("definitional"), then DEFRA `natural_gas_kwh_gross_cv` 0.03021 (D41) (cat3Energy.ts:194), uk_stand_in |
| GJ | Bill path only | As MMBtu | GJ ÷ 1.05505585262 to MMBtu, cited "(IEA)" (unitConversions.ts:119-122) | As MMBtu |
| MJ | Bill path only | As MMBtu | MJ ÷ 1000 then ÷ GJ_PER_MMBTU (unitConversions.ts:124-128) | As MMBtu |
| kWh | Bill path, tier 1 (unitConversions.ts:29) | **None.** No `natural_gas_kwh` in `EF_AU` or `EF`. Location excluded (U1) | None (stored as kWh) | None: location excluded |
| mcf, therms | Bill path, tier 1 | **US EPA** `EF.natural_gas_mcf` 54.43956, `EF.natural_gas_therms` 5.306 (engine.ts:108-109), cited DCCEEW (W1) | None | mcf via DEFRA ft³ to m³ (cat3Energy.ts:192); therms via DEFRA therm to kWh (cat3Energy.ts:193); uk_stand_in |
| ccf | Bill path | **US EPA** mcf, as above (W1) | ccf × 0.1 to mcf (unitConversions.ts:115-118) | As mcf |

### 4.2 Electricity

| Input | Offered | S2-loc | S2-mkt | Cat 3 |
|---|---|---|---|---|
| kWh | Wizard (page.tsx:2281). State select (page.tsx:2021-2027) maps to `AU_*` via `detectGridRegion` (engine.ts:1472-1477); ACT uses AU_NSW. A blank state leaves the region unresolved and the electricity rows are omitted (engine.ts:1475-1477, 2741) | `GRID_EF` AU_NSW 0.64, AU_VIC 0.78, AU_QLD 0.67, AU_SA 0.22, AU_WA 0.50, AU_TAS 0.20, AU_NT 0.56 kg CO2e/kWh, `{2025}` only (engine.ts:979-981). Cited "NGA Factors 2025, Table 1 Scope 2 (kg CO2e/kWh, AR5 basis). Single vintage." Other years move to 2025 with a note (getGridFactor engine.ts:1155-1161) | `RESIDUAL_AU` 0.81, national, `{2025}` only (engine.ts:1123); `residualRegionFor` returns 'AU' (engine.ts:1195); getResidualFactor AU branch (engine.ts:1227-1237). Source: "DCCEEW National Greenhouse Accounts Factors 2025, Table 2 ... FINANCIAL-YEAR basis ... 3-year average" (engine.ts:834). No state split; no residual selector in the AU wizard | DEFRA UK: generation WTT 0.03682 (E19), T&D loss 0.01299 (E22), T&D WTT 0.00359 (E24); uk_stand_in. **No AU T&D line** (NZ only: engine.ts:2765, cat3Energy.ts:317). NGA Scope 3 0.11 "DELIBERATELY NOT SEEDED" (engine.ts:1116) |
| MWh, GJ | Bill path | As kWh | As kWh | As kWh |
| Renewable kWh (RECs, PPAs) | Typed field `renewable_electricity_kwh` (page.tsx:2544), shown only when ESRS or GRI is selected. `renewable_cert` documents are not read (conciergeDocTypes.ts:72-74) | n/a | Covered kWh at 0; uncovered kWh at `RESIDUAL_AU` 0.81 (engine.ts:2755-2758) | Market-based row skipped, `market_based_row_not_used` (cat3Inputs.ts) |

Electricity conversions: MWh × 1000; GJ × 1000 / 3.6 (unitConversions.ts:131-139).

### 4.3 Liquid fuels and LPG

| Input | Offered | S1 factor and citation | Conversion and source | Cat 3 |
|---|---|---|---|---|
| Propane / LPG, litres | Wizard (propaneUnitOptions AU, engine.ts:2104) | `EF_AU.propane_litre` 1.557 (engine.ts:660): "LPG (NGA Table 4): 25.7 GJ/kL × 60.6 kg CO2e/GJ" | None | DEFRA `propane_litres` 0.1817 (D51), uk_stand_in |
| Propane, kg | Bill path | `EF_AU.propane_litre` on the converted litres | kg to litres via **US density** `PROPANE_LB_PER_GAL = 4.24`, "VERIFY PROVENANCE" (EIA / NPGA) (unitConversions.ts:48-52, 146-150) (W2) | As litres |
| Propane, gallons / lbs | Bill path | **US EPA** `EF.propane_gallon` 5.72117 (engine.ts:138), cited DCCEEW (W1) | lbs ÷ 4.24 to gallons (unitConversions.ts:142-145) | DEFRA US gallon to litre, then `propane_litres`; uk_stand_in |
| Stationary diesel, litres | Wizard (liquidUnitOptions AU, engine.ts:2062) | `EF_AU.diesel_litre` 2.710 (engine.ts:655): 38.6 GJ/kL × 70.2 kg CO2e/GJ (NGA Table 4 / Table 1) | None | DEFRA `diesel_average_biofuel_blend_litres` 0.61101 (D71), uk_stand_in |
| Fleet diesel, litres | Wizard (page.tsx:2247) | `EF_AU.diesel_mobile_litre` 2.710 (engine.ts:656), same derivation | None | Same DEFRA row (cat3Energy.ts:205) |
| Petrol, litres | Wizard (page.tsx:2237, labelled "Gasoline") | `EF_AU.gasoline_litre` 2.319 (engine.ts:658): 34.2 GJ/kL × 67.8 kg CO2e/GJ | None | DEFRA `petrol_average_biofuel_blend_litres` 0.58094 (D95), uk_stand_in |
| Diesel / petrol, gallons | Bill path (fuel_diesel, fleet_fuel) | **US EPA** `EF.diesel_gallon` 10.20648 (engine.ts:144), `EF.gasoline_gallon` 8.7775 (engine.ts:166), `EF.diesel_mobile_gallon` 10.20648 (engine.ts:168), cited DCCEEW (W1) | None | Gallon to litre, then the DEFRA rows; uk_stand_in |
| Heating oil (distillate), litres | Wizard (page.tsx:2202). `fuel_oil` documents not read | `EF_AU.fuel_oil_distillate_litre` 2.600929 (engine.ts:675): 37.3 GJ/kL × 69.73 kg CO2e/GJ (NGA 2025 Table 8), via `fuelOilPricing` (engine.ts:2294-2303) | None | DEFRA `fuel_oil_distillate_litres` 0.9465 (D107), uk_stand_in |
| Heavy fuel oil (residual), litres | Wizard (page.tsx:2218) | `EF_AU.fuel_oil_residual_litre` 2.931448 (engine.ts:676): 39.7 GJ/kL × 73.84 kg CO2e/GJ (Table 8) | None | DEFRA `fuel_oil_residual_litres` 1.10125 (D103), uk_stand_in |
| Fuel oil, gallons | Not offered for AU; stored data only | `EF_AU` gallon keys 9.845587 / 11.096738 (engine.ts:665, 667), litre factor × 3.785411784. Legacy `fuel_oil_gallon` falls to **US EPA** `EF.fuel_oil_gallon` (engine.ts:146) (W1) | 3.785411784 L/gal | Gallon to litre, then DEFRA; uk_stand_in |

### 4.4 Other streams

| Input | Offered | Factor | Cat 3 |
|---|---|---|---|
| Refrigerants (R-410A, R-22, R-134a, R-404A, R-507), kg | Wizard (page.tsx:2269-2271); the ammonia option prices nothing | Jurisdiction-neutral `REFRIGERANT_GWP` (engine.ts:57-63; blends marked "CONFIRM before assurance"); kg × GWP (engine.ts:2735-2736), cited `EF_SOURCES.gwp_ar6` (engine.ts:3897). An unknown type gives `?? 0` | Not a Category 3 input (`refrigerants_not_in_category`, cat3Inputs.ts:317; cat3Energy.ts:298) |
| Purchased steam, GJ only | Wizard (steamUnitOptions default, engine.ts:2093-2095). Steam documents not read | `STEAM_EF.AU` kind `'unpublished'` (engine.ts:2373-2377): "NGA Factors 2025, all 27 sheets ... scoped explicitly to 'purchased or acquired electricity'". No US fallback (engine.ts:2318-2330). `STEAM_EDITION` has no AU entry (engine.ts:906-909). Priced only from a supplier figure (`steamPricing` engine.ts:2428-2447); otherwise U2 | No supplier figure: skipped, `scope2_not_priced` (cat3Inputs.ts:298). With one: DEFRA heat lines 0.03341 (E20), 0.00945 (E27), 0.00176 (E25), GJ × 277.78 to kWh; uk_stand_in |
| Biogenic CO2, tonnes (typed) | page.tsx:2558, ESRS / GRI only; biomass documents not read | No factor: typed tonnes reported separately (engine.ts:2768). No biomass fuel input exists | Not a Category 3 stream |

**Not offered for any country:** coal, kerosene and biomass fuel quantities. None has an input in page.tsx
or a factor key in engine.ts; the only matches are comments (engine.ts:89, 684).

---

## 5. Lists

### 5.1 Offered in the UI (or bill path) but cannot be priced, AU

1. Gas in kWh (U1).
2. Purchased steam without a supplier figure (U2). The UI says so and blocks export.
3. Unrecognised bill units such as `ft3` (U3).
4. Propane with stored unit `kg` (U4), stored data only.

### 5.2 Priced with another country's factor, AU

- **US EPA, cited as DCCEEW NGA 2025 (W1):** gas mcf, therms, ccf; propane gallons, lbs; diesel gallons
  (stationary and fleet); petrol gallons; legacy `fuel_oil_gallon`.
- **US conversion constant into an NGA factor (W2):** propane kg to litres at 4.24 lb/gal.
- **DEFRA 2026 UK, disclosed as `uk_stand_in` (W3):** every Category 3 line.

---

## 6. Stale comments found (no action taken)

- engine.ts:677-678: "nothing reads the two keys above yet". `fuelOilPricing` (engine.ts:2297) reads them.
- lib/scope3/defraEnergy.ts:5: "NOTHING PRICES FROM IT YET". cat3Energy.ts prices from it.
- lib/scope3/cat3Inputs.ts header: "efJurisdiction ends `return 'US'`". It now returns null for unsupported
  countries (engine.ts:1459-1462).
