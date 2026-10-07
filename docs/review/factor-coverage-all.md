# Factor coverage: UK, Canada, New Zealand and the EU

Read-only audit of the working tree at HEAD `3e37755` (branch `derived-figures`), 2 Oct 2026. No code was changed.
It follows the Australian audit, [au-factor-coverage.md](au-factor-coverage.md); the AU findings are not
repeated here except in the cross-country summary (section 1).

Paths: `engine.ts` = `lib/ghg/engine.ts`; `uc.ts` = `lib/unitConversions.ts`; `page.tsx` =
`app/dashboard/ghg/page.tsx`; `ProposalEdits.tsx` = `app/dashboard/ghg/_components/ProposalEdits.tsx` (the AU
audit omits the directory); `proposalEdits.ts` = `lib/ghg/proposalEdits.ts`; `cat3*.ts` are in `lib/scope3/`;
`defraEnergy*` are in `lib/emissionFactors/`.

Column key: **S1** Scope 1 combustion; **S2-loc** Scope 2 location-based; **S2-mkt** Scope 2 market-based
(residual mix); **Cat 3** Scope 3 Category 3 (WTT = well-to-tank; T&D = transmission and distribution losses).

Unverified items are marked ⚑. No factor value was checked against a publisher's source document; "consistent"
means only that the arithmetic inside the code agrees with itself.

---

## 1. Summary across countries

### 1.1 The F-01 pattern: a missing key priced at the US EPA value under the local citation

`pickEF` (engine.ts:2526-2559) reads the country table and, when a key is absent, takes the US `EF` value:
`EF_UK[key] ?? EF[key]` (2528), `EF_EU` (2531), `EF_AU` (2535), `EF_NZ[use class][key]` (2539-2540), `EF_CA`
(2547). The row's citation and vintage still come from the location's country (`combustionSource` 2645-2649,
`COMBUSTION_EDITION` 889-893). Because US factors carry a CH4/N2O split, `factorCells` (3722-3733) stamps the row
with the live GWP set, not "as published". No derivation note is added. The bill path reaches these keys because
it has no country check: page.tsx:1081 (`convertToCanonical`), ProposalEdits.tsx:64 (`convertibleUnits`),
proposalEdits.ts:52 (`editUnit`), with `deriveLocations` writing the unit at engine.ts:3594.

| Bill unit reaching the location | UK (cited DEFRA 2026) | CA (cited ECCC v3.0) | NZ (cited MfE 2026 v2) | EU (cited EU MRR / IPCC 2006) | AU (cited DCCEEW NGA 2025) |
|---|---|---|---|---|---|
| Gas mcf | **US EPA** | own (ECCC, provincial CO2) | **US EPA** | own (EF_EU) | **US EPA** |
| Gas ccf (to mcf) | **US EPA** | own | **US EPA** | own | **US EPA** |
| Gas therms | **US EPA** | **US EPA** | **US EPA** | **US EPA** | **US EPA** |
| Gas MMBtu, GJ, MJ (to MMBtu) | **US EPA** | **US EPA** | **US EPA** | **US EPA** | own (T10a) |
| Propane litres | own | own | **US EPA** | own | own |
| Propane gallons | own | own | **US EPA** | own | **US EPA** |
| Propane kg bill (to litres, US density) | own factor, US density | own factor, US density | **US EPA factor, US density** | own factor, US density | own factor, US density |
| Propane lbs bill (to gallons, US density) | own factor, US density | own factor, US density | **US EPA factor, US density** | own factor, US density | **US EPA factor, US density** |
| Diesel / petrol gallons | own | own | **US EPA** | own | **US EPA** |

### 1.2 Inputs accepted but unpriceable, and how each fails

| Input | UK | CA | NZ | EU | Failure mode |
|---|---|---|---|---|---|
| Gas m³ (bill tier 1) | **unpriced** | priced | **unpriced** | priced | Whole location excluded from every total (`efMiss` 2468, `MissingEmissionFactorError` 2483-2513, `unpriceableReason` 2811-2815), export blocked (`factorGapLocations`, page.tsx:1380); Cat 3 `location_excluded` |
| Gas kWh (bill tier 1) | priced | **unpriced** | priced | **unpriced** (the normal EU billing unit) | As above |
| Propane stored as kg | **unpriced** | **unpriced** | priced (wizard unit) | **unpriced** | As above; reachable from stored data only |
| Purchased steam, no supplier figure | priced (DEFRA) | **unpriced** (`unpublished`) | **unpriced** (`unpublished`) | **unpriced** (`not_searched`) | Contributes 0; `no_published_factor` row; `findSteamFactorGaps` blocks export (engine.ts:4388-4406); Cat 3 `scope2_not_priced`. Location stays in totals |
| Unrecognised bill unit (ft³; EU also MWh gas, Nm³, Sm³) | tier 3 | tier 3 | tier 3 | tier 3 | `needs_manual_review`, no figure (uc.ts:176-196) |
| Unknown refrigerant type (stored data) | **silent 0** | **silent 0** | **silent 0** | **silent 0** | `REFRIGERANT_GWP[...]?.[gwp] ?? 0` (engine.ts:2735), no issue |
| Country not supported (EEA non-EU: NO, IS, LI, CH; others) | n/a | n/a | n/a | **excluded, not blocking** | `country_not_supported`, `refusalIsFixable` false (engine.ts:1404), so excluded and stated but export not blocked (page.tsx:1376-1380). Deliberate, per the comment at page.tsx:1370-1375 |
| NZ Cat 3 3c with T&D opt-in off | n/a | n/a | line withheld | n/a | `no_nz_td_figure` (cat3Energy.ts:323-326) |
| CA blank province | n/a | electricity omitted; gas at Ontario CO2 | n/a | n/a | Electricity rows omitted, `gridReady` blocks (page.tsx:1334-1338); gas silently uses `EF_CA.natural_gas_m3` 1.921, "Ontario fallback" (engine.ts:242-245, 2550-2556) |

### 1.3 Other cross-country findings

- **Country change relabels units without converting** (`unitsForCountryChange`, engine.ts:2173-2186, called at
  page.tsx:968). A held unit the new country does not offer becomes `opts[0]`, number unchanged. Examples: US→GB
  gas mcf becomes kWh, gallons become litres, steam MMBtu becomes kWh (about 293x); US→CA therms becomes m³; US→NZ
  propane gallons become kg; NZ→CA or NZ→EU propane kg becomes litres. Same class as the CLAUDE.md open defect
  "Unit switch relabels without converting".
- **A stale `residual_region` survives a country change.** The country handler resets units and `grid_region`
  only (page.tsx:960-975). `residualRegionFor` returns `loc.residual_region` first, whatever the country
  (engine.ts:1192-1193). The only writer is the US eGRID residual select (page.tsx:2338), which is not shown for
  other countries, so the value is invisible once the country changes. A US location with a subregion chosen and
  then switched to GB, NZ, AU or an EU country gets its market-based Scope 2 from the US Green-e residual, cited
  `residual_us` (engine.ts:1239-1263). ⚑ Traced in code, not run.
- **US propane density** `PROPANE_LB_PER_GAL = 4.24`, commented "VERIFY PROVENANCE" (EIA / NPGA) (uc.ts:48-52),
  converts every propane kg and lbs bill (uc.ts:142-150), for every country.
- **Market-based Scope 2 with no residual table** (UK, CA, NZ): `residualRegionFor` returns `''`;
  `getResidualFactor('')` falls to the US branch and returns `applicable: false` (engine.ts:1265-1266); the
  market-based figure equals the location factor, cited correctly to the grid publisher, with the US-worded note
  "No published residual mix for this subregion".
- **Category 3** is priced from DEFRA 2026 (UK, AR5) for every non-UK line, flagged `uk_stand_in`
  (cat3Energy.ts:243-256; cat3Copy.ts:124-128, 207-211). The only own-country Cat 3 line outside the UK is NZ's
  opt-in T&D loss (cat3Energy.ts:317-338). When the Scope 1 row was priced by US EPA (1.1), the stand-in sentence
  names the local publisher as the Scope 1 source (`publisherOf(ef_source)`, cat3Inputs.ts:377), and
  `CAT3_EPA_HHV_SENTENCE` (cat3Copy.ts:148-152, fired at 424, 442) calls a therms or MMBtu figure "a US entry"
  on a non-US site.

---

## 2. United Kingdom (GB)

**Routing.** `UK` canonicalises to `GB` (engine.ts:1349-1355); `efRouting` maps GB to the UK tables (1423).
Grid region `'UK'` is set on country change (`gridRegionForCountry`, 1490-1497; page.tsx:971-974).

### 2.1 Unpriced or wrongly priced

| # | Gap | Where |
|---|---|---|
| U1 | Gas in **m³** (bill tier 1): no `natural_gas_m3` in `EF_UK` or `EF`; whole location excluded | uc.ts:29; engine.ts:2528 |
| U2 | Propane stored as kg: whole location excluded | engine.ts:2310-2311 |
| W1 | Gas **mcf, ccf, therms, MMBtu, GJ, MJ** priced at US EPA (`EF.natural_gas_mcf` 54.43956, `natural_gas_therms` 5.306, `natural_gas_mmbtu` 53.06; engine.ts:108-110), cited "UK DEFRA/DESNZ (2026)" (engine.ts:786, 2646; defraPublication.ts:61-64), vintage 'DEFRA 2026' (890) | engine.ts:2528 |
| W2 | Propane kg and lbs bills converted at the US density, then priced with DEFRA factors | uc.ts:48-52, 142-150 |
| W3 | Stale `residual_region` after a US→GB switch prices market-based at Green-e | section 1.3 |
| W4 | No UK residual mix: market-based = location factor, note says "subregion" | engine.ts:1192-1197, 1265-1266 |

### 2.2 Inputs

| Input | Offered | S1 / S2 factor and citation | Conversion | Cat 3 (DEFRA 2026, no stand-in for GB) |
|---|---|---|---|---|
| Gas kWh | Wizard only unit (`ngUnitOptions`, engine.ts:2044); bill tier 1 | `EF_UK.natural_gas_kwh` 0.18231, gross CV (engine.ts:327) | none | `natural_gas_kwh_gross_cv` 0.03021 (D41) (cat3Energy.ts:190) |
| Gas m³ | Bill tier 1 | **none** (U1) | | not reached |
| Gas mcf, therms, MMBtu | Bill tier 1 | **US EPA** (W1) | none | mcf: DEFRA ft³→m³, then D39 0.3366; therms: 29.3071 kWh/therm (D30), then D41; MMBtu: definitional to kWh, then D41 |
| Gas ccf, GJ, MJ | Bill tier 2 | **US EPA** via mcf / MMBtu (W1) | ccf ×0.1 (uc.ts:115-118); GJ ÷1.05505585262 (uc.ts:119-122, exact, commented "(IEA)" at uc.ts:40); MJ ÷1000 first (124-128) | as mcf / MMBtu |
| Electricity kWh (MWh, GJ by bill) | Wizard (page.tsx:2277-2279); national | `GRID_EF.UK` {2025: 0.177, 2026: 0.13096} (engine.ts:963), DEFRA "UK electricity", citation `defraCitation()` with no year (828); comments flag the 2025 value as unchecked against the 2026 restatement (958-962). Nearest-year with a note (1149-1164) | MWh ×1000; GJ ×1000/3.6 (uc.ts:131-139), exact | generation WTT 0.03682 (E19), T&D loss 0.01299 (E22), T&D WTT 0.00359 (E24) (cat3Energy.ts:230-234) |
| Renewable kWh | ESRS / GRI only (page.tsx:2544); `renewable_cert` not read | Covered at 0, uncovered at location factor (W4) | | market row skipped |
| Propane litres | Wizard (engine.ts:2104-2105) | `EF_UK.propane_litre` 1.54358 (330) | none | `propane_litres` 0.1817 (D51) |
| Propane gallons | Bill tier 1 | `EF_UK.propane_gallon` 5.843086 (331), DEFRA × 3.785411784; no US fallback | exact | DEFRA gal→L (C40 3.7854118034…), then D51 |
| Propane lbs / kg | Bill tier 2 | `EF_UK` gallon / litre key | **US density** 4.24 lb/gal (W2) | as gallons / litres |
| Diesel (stationary, fleet) litres / gallons | Wizard litres (2062-2063); gallons by bill | `EF_UK.diesel_litre` / `diesel_mobile_litre` 2.58354 (333, 335); gallon keys 9.779763 (334, 336) | exact | `diesel_average_biofuel_blend_litres` 0.61101 (D71) |
| Petrol litres / gallons | Wizard litres; gallons by bill | `EF_UK.gasoline_litre` 2.075 (370), `gasoline_gallon` 7.854729 (371) | exact | `petrol_average_biofuel_blend_litres` 0.58094 (D95) |
| Heating oil (distillate), residual fuel oil, litres | Wizard; documents not read | `EF_UK.fuel_oil_distillate_litre` 2.75541 (359), `fuel_oil_residual_litre` 3.17492 (360), via `fuelOilPricing` (2294-2303) | none | D107 0.9465; D103 1.10125 |
| Refrigerants, kg | Wizard (page.tsx:2269) | `REFRIGERANT_GWP` (engine.ts:57-63), jurisdiction-neutral; unknown type `?? 0` (2735) | | not a Cat 3 input |
| Steam / district heat, kWh or GJ | Wizard (engine.ts:2087-2090); documents not read | `STEAM_EF.UK` published, `EF_UK.steam_kwh` 0.17529 (393, 2363); edition 'DEFRA 2026' (906-909); supplier figure outranks it (2428-2440) | GJ ×277.78, MMBtu via GJ (2249-2266), exact | heat WTT 0.03341 (E20), distribution loss 0.00945 (E27), distribution WTT 0.00176 (E25) |
| Biogenic CO2, typed t | ESRS / GRI (page.tsx:2558) | none; reported separately (2768) | | n/a |

UI: page.tsx:2359 labels a non-GJ steam unit "MMBtu", so a UK location in kWh shows "MMBtu"; an unset
`purchased_steam_unit` is read as `'mmbtu'` (engine.ts:2250, 3973).

### 2.3 Editions held (UK)

- Combustion `EF_UK`: DEFRA 2026 only, no year key (engine.ts:296-301, 887-894).
- Steam: DEFRA 2026 only (906-909).
- Grid: 2025 and 2026 (963).
- Cat 3: DEFRA 2026 (defraEnergy2026.json:3-8), used for every year.
- Required but not held, per factor-year-selection.md section 8.4: grid 2023 and 2024; combustion and steam 2023,
  2024 and 2025.

---

## 3. Canada (CA)

**Routing.** `efRouting` returns `ok('CA')` (engine.ts:1427). Province sets `grid_region` directly
(page.tsx:961). `EF_CA` (engine.ts:241-272) holds every gallon key, so only two keys fall back to the US.
A provincial natural-gas CO2 override applies to `natural_gas_mcf` and `natural_gas_m3` from
`EF_CA_NG_CO2_M3` (281-284) keyed by `grid_region || province` (2550-2556); it is not disclosed on the row.

### 3.1 Unpriced or wrongly priced

| # | Gap | Where |
|---|---|---|
| U1 | Gas in **kWh** (bill tier 1): no `natural_gas_kwh` in `EF_CA` or `EF`; whole location excluded | uc.ts:29; engine.ts:2547 |
| U2 | Steam without supplier figure (`STEAM_EF.CA` `'unpublished'`, 2364-2372) | section 1.2 |
| U3 | Propane stored as kg: whole location excluded | engine.ts:2310-2311 |
| W1 | Gas **therms** and **MMBtu** (and GJ, MJ via MMBtu) at US EPA (engine.ts:109-110), cited "ECCC (2025) Emission factors and reference values v3.0" (785, 2645), vintage 'ECCC 2025 v3.0' (889) | engine.ts:2547 |
| W2 | Propane kg and lbs at the US density into ECCC factors | uc.ts:142-150 |
| W3 | Blank province: gas CO2 at the Ontario value, silent on the row | engine.ts:242-245, 2550-2556 |
| W4 | Fleet diesel and petrol use stationary factors; ECCC's NIR mobile factors are transcribed in `lib/ghg/mobile.ts` but nothing imports that file | engine.ts:249-250, 268-271; mobile.ts:3-9 |
| W5 | Grid keys 2024 / 2025 / 2026 are applicability sets, not data years (flag C2) | engine.ts:924-937 |
| W6 | Stale `residual_region` after a US→CA switch: the code path is the same (section 1.3) ⚑ not run | engine.ts:1193 |

### 3.2 Inputs

| Input | Offered | S1 / S2 factor and citation | Conversion | Cat 3 (all `uk_stand_in`) |
|---|---|---|---|---|
| Gas m³ | Wizard (`ngUnitOptions` CA, engine.ts:2043); bill tier 1 | `EF_CA.natural_gas_m3` 1.921 / 0.000037 / 0.000035 (245), CO2 overridden by province: BC 1.966, AB 1.962, SK 1.920, MB 1.915, ON 1.921, QC 1.926, Atlantic 1.919, territories 1.966 (281-284) | none | DEFRA D39 0.3366 |
| Gas mcf | Wizard; bill tier 1 | `EF_CA.natural_gas_mcf` 54.396611 (244), provincial CO2 × `M3_PER_MCF` | `M3_PER_MCF` = 1000/35.3147 (285), a rounded definitional constant (about 1e-7 relative) | DEFRA ft³→m³, then D39 |
| Gas ccf | Bill tier 2 | as mcf | ×0.1, exact | as mcf |
| Gas therms, MMBtu, GJ, MJ | Bill | **US EPA** (W1) | GJ, MJ to MMBtu, exact | DEFRA via kWh, D41; EPA HHV sentence fires |
| Gas kWh | Bill tier 1 | **none** (U1) | | `location_excluded` |
| Electricity kWh (MWh, GJ by bill) | Wizard; province select (page.tsx:2008-2019, 2306-2310) | `GRID_EF` by province, 2024 / 2025 / 2026 keys (engine.ts:925-937), cited `electricity_ca` ECCC v3.0 (821). PE values identical to NB in every year ⚑ unexplained. Nearest-year with a note (1149-1164). Blank province: rows omitted, `gridReady` blocks | exact | DEFRA E19, E22, E24 |
| Market-based | | No CA residual; market = location factor, "subregion" note (1265-1266) | | skipped |
| Propane litres | Wizard (2104-2105) | `EF_CA.propane_litre` 1.515 / 0.000024 / 0.000108 (247), "All Other Uses" | none | D51 |
| Propane gallons, lbs, kg | Bill | `EF_CA.propane_gallon` 5.734896 (248), ECCC litre × 3.78541 | lbs, kg via **US density** (W2) | DEFRA gal→L, D51 |
| Stationary diesel litres / gallons | Wizard litres; gallons by bill | `EF_CA.diesel_litre` 2.681 (250), "Refineries and Others"; `diesel_gallon` 10.148684 (251) | exact | D71 |
| Fleet diesel | Wizard (page.tsx:2247) | `EF_CA.diesel_mobile_litre` = stationary values (270-271) (W4) | | D71 |
| Petrol litres / gallons | Wizard litres | `EF_CA.gasoline_litre` 2.307 (268), `gasoline_gallon` 8.732941 (269) | exact | D95 |
| Heating oil, residual fuel oil, litres | Wizard | `EF_CA.fuel_oil_distillate_litre` 2.753 (265), `fuel_oil_residual_litre` 3.156 (266), v3.0 Table 4.3, Industrial | none | D107, D103 |
| Refrigerants | Wizard | as UK; unknown type `?? 0` | | n/a |
| Steam, GJ only | Wizard (2095) | `STEAM_EF.CA` `'unpublished'` (2364-2372); supplier figure only (U2) | GJ ×277.78 | supplier figure only: DEFRA heat lines |
| Biogenic CO2 | ESRS / GRI | none; separate | | n/a |

### 3.3 Editions held (CA)

- Combustion `EF_CA`: ECCC v3.0 (Oct 2025), unkeyed; the comment claims values are identical across the
  2023/24, 2025 and 2026 applicability sets (engine.ts:226-228) ⚑ unverified. factor-year-selection.md records
  that v4.0 (Sept 2026) is published.
- Provincial gas CO2: unkeyed; "year-stable" (276-277) ⚑ unverified.
- Grid: 2024, 2025, 2026 applicability keys (924-937); T3c/T3d re-key by NIR data year (ruling C2).
- Mobile (NIR 2026): transcribed, not wired (mobile.ts:72).
- Residual mix: none. Cat 3: DEFRA 2026.

---

## 4. New Zealand (NZ)

**Routing.** `efRouting` returns `ok('NZ')` (engine.ts:1426); grid region `'NZ'` on country change. `EF_NZ`
(701-730) is keyed by use class (`nz_use_class`, default commercial). The use class appears on no workings
row, citation or `factor_editions` entry (694-699).

### 4.1 Unpriced or wrongly priced

| # | Gap | Where |
|---|---|---|
| U1 | Gas in **m³** (bill tier 1): no `natural_gas_m3` in `EF_NZ` or `EF`; whole location excluded | uc.ts:29; engine.ts:2540 |
| U2 | Steam without supplier figure (`STEAM_EF.NZ` `'unpublished'`, 2378-2387) | section 1.2 |
| U3 | Cat 3 3c with T&D opt-in off: line withheld | cat3Energy.ts:323-326 |
| W1 | Gas **mcf, ccf, therms, MMBtu, GJ, MJ**; propane **litres, gallons**; diesel and petrol **gallons**: all at US EPA (engine.ts:108-110, 138, 143, 144, 166, 168), cited "NZ MfE Measuring Emissions 2026 v2 (as-published basis — factors stored verbatim, no AR re-basing)" (800, 2648), vintage 'MfE 2026 v2' (893). The citation's "no AR re-basing" is contradicted by the AR6 stamp on these rows | engine.ts:2540 |
| W2 | **Propane kg bill**: `SELECTOR_UNITS.propane` is gallons and litres (uc.ts:30), so a kg bill converts to litres at the US density and is stored as litres; `EF_NZ` has no `propane_litre`, so it is priced at US `EF.propane_litre` 1.51137 (engine.ts:143). MfE's own `propane_kg` 2.97164 / 2.96632 (706, 721), the wizard's only unit, is never used for a bill | uc.ts:30, 146-150 |
| W3 | Fleet diesel uses the stationary value, stated as deliberate (705, 720); petrol uses Transport Regular Petrol for both use classes (686-688) | engine.ts:705, 720 |
| W4 | No NZ residual: market = location factor, "subregion" note | engine.ts:1265-1266 |
| W5 | Stale `residual_region` after a US→NZ switch (section 1.3) ⚑ not run | |

### 4.2 Inputs

| Input | Offered | S1 / S2 factor and citation | Conversion | Cat 3 |
|---|---|---|---|---|
| Gas kWh | Wizard only unit (engine.ts:2045); bill tier 1 | `EF_NZ.natural_gas_kwh` 0.19543 commercial (703), 0.195067 industrial (718). Gross or net CV basis not recorded ⚑ | none | DEFRA D41 (gross CV), uk_stand_in |
| Gas m³ | Bill tier 1 | **none** (U1) | | `location_excluded` |
| Gas mcf, therms, MMBtu, ccf, GJ, MJ | Bill | **US EPA** (W1) | exact to mcf / MMBtu | DEFRA, uk_stand_in |
| Electricity kWh (MWh, GJ by bill) | Wizard; national | `GRID_EF.NZ` {2023: 0.0766, 2024: 0.0994, 2025: 0.0787} (982-984), cited "NZ MfE Measuring Emissions 2026 v2" (831). Wizard banner hard-codes "NZ MfE 2026" (page.tsx:2303) | exact | generation WTT DEFRA E19, uk_stand_in; **T&D loss** MfE `NZ_TD_LOSS` {2025: 0.00596} (990) via `s3_td`, opt-in (`nz_td_losses`, page.tsx:2330), tagged `nz_mfe_3c` (cat3Energy.ts:317-337); T&D WTT DEFRA E24, uk_stand_in. MfE's Scope 3 electricity table not transcribed (engine.ts:1042-1043) |
| LPG kg | Wizard only unit (2103) | `EF_NZ.propane_kg` via `propaneEfKey` (2310-2312) | none | DEFRA kg→t, `propane_tonnes` 352.67018 (D50) |
| LPG kg bill, litres, gallons, lbs | Bill | **US EPA** (W1, W2) | kg, lbs via **US density** | DEFRA D51 |
| Diesel (stationary, fleet) litres | Wizard (page.tsx:2174, 2247) | `EF_NZ.diesel_litre` / `diesel_mobile_litre` 2.6759 / 2.66873 (704-705, 719-720) | none | D71 |
| Petrol litres | Wizard | `EF_NZ.gasoline_litre` 2.36143 (707, 722) | none | D95 |
| Diesel / petrol gallons | Bill | **US EPA** (W1) | | DEFRA |
| Heating oil, residual fuel oil, litres | Wizard | `EF_NZ.fuel_oil_distillate_litre` 2.97088 / 2.96335, `fuel_oil_residual_litre` 3.05359 / 3.04601 (714-715, 727-728), "MfE Catalogue 2026 Table 3.2"; gallon keys are MfE × 3.785411784 | exact | D107, D103 |
| Refrigerants | Wizard | as UK; unknown `?? 0` | | n/a |
| Steam, GJ only | Wizard | **none** (U2) | | supplier figure only |
| Biogenic CO2 | ESRS / GRI | none; separate | | n/a |

`s3_td` in `calcLocation` (engine.ts:2765) is not gated on a resolved grid region, while its workings row is
(3902). ⚑ Whether an NZ location with an unresolved region is reachable was not checked.

### 4.3 Editions held (NZ)

- Combustion `EF_NZ`: MfE 2026 v2 only, unkeyed (701-730, 893). factor-year-selection.md section 8.4: 2023, 2024,
  2025 to load.
- Grid: 2023, 2024, 2025 (982-984). T&D: 2025 only (990); MfE publishes the series back to 2010 (1016-1017).
- Steam, residual: none. Cat 3: DEFRA 2026 except the T&D loss line.

---

## 5. European Union

**Routing.** `EU_COUNTRIES` (engine.ts:1308): AT BE BG HR CY CZ DK EE FI FR DE EL HU IE IT LV LT LU MT NL PL PT
RO SK SI ES SE; GR canonicalises to EL (1349-1355). `efRouting` returns `ok('EU')` (1424). Combustion is `EF_EU`
(503-550): IPCC 2006 Vol. 2 Tier 1 / EU MRR Annex VI Table 1 mass-basis factors, converted to per-volume
factors with densities and an energy content that, the code itself records, **neither cited source publishes**
(396-502, 569-588). Citation `combustion_eu` (798), edition 'IPCC 2006' (891). Grid region `EU_<cc>` on country
change (1495); all 27 members and `EU_AVG` have an EEA row (966-973). Residual: `RESIDUAL_EU` from AIB
(1057-1068).

### 5.1 Unpriced or wrongly priced

| # | Gap | Where |
|---|---|---|
| U1 | Gas in **kWh**, the normal EU billing unit (bill tier 1): no `natural_gas_kwh` in `EF_EU` or `EF`; whole location excluded. The wizard offers m³ only (2048) but the bill unit editor offers kWh | uc.ts:29; engine.ts:2531 |
| U2 | Steam without supplier figure. `STEAM_EF.EU` is `'not_searched'`, not `'unpublished'` (2388-2396) | section 1.2 |
| U3 | Gas bills in MWh (aliased at uc.ts:62 but no `natural_gas:mwh` rule), Nm³, Sm³, ft³: tier 3 | uc.ts:176-196 |
| U4 | Propane stored as kg: whole location excluded | |
| U5 | NO, IS, LI, CH and other unsupported countries: excluded and stated, export not blocked (deliberate) | engine.ts:1404, 1435-1436; page.tsx:1370-1380 |
| W1 | Gas **therms, MMBtu, GJ, MJ** at US EPA (engine.ts:109-110, HHV basis), cited "EU MRR Reg. (EU) 2018/2066, Annex VI Table 1 — IPCC (2006)" (798, 2649), vintage 'IPCC 2006' | engine.ts:2531 |
| W2 | Propane kg bill: US density 4.24 lb/gal (0.508 kg/L) into `EF_EU.propane_litre` 1.52216, which was itself derived at 0.510 kg/L (431, 573-576) | uc.ts:146-150 |
| W3 | **Uncited physical properties inside `EF_EU`:** gas 36 MJ/m³ (569-572); densities diesel 0.844, petrol 0.745, LPG 0.510, residual fuel oil 0.990 kg/L (424-431, 573-588). Every EU per-litre and per-m³ key depends on one | engine.ts:416-437, 503-550 |
| W4 | One EEA vintage (2023) and one AIB vintage (2024) for every year | engine.ts:966-973, 1057-1068 |
| W5 | Stale `residual_region` after a US→EU switch: market-based at Green-e instead of AIB (section 1.3) ⚑ not run | engine.ts:1193 |
| W6 | Fleet diesel uses stationary CH4 / N2O | engine.ts:513 |

### 5.2 Inputs

| Input | Offered | S1 / S2 factor and citation | Conversion and property | Cat 3 (all `uk_stand_in`) |
|---|---|---|---|---|
| Gas m³ | Wizard (2048); bill tier 1 | `EF_EU.natural_gas_m3` 2.0196 / 0.000036 / 0.0000036 (505) = 56,100 kg/TJ × 36 MJ/m³ | 36 MJ/m³ uncited (W3) | D39 0.3366 |
| Gas mcf, ccf | Bill | `EF_EU.natural_gas_mcf` 57.188649 (506) = m³ × `M3_PER_MCF`; derivation note aliased to the m³ note (604) | ccf ×0.1, exact | DEFRA ft³→m³, D39 |
| Gas therms, MMBtu, GJ, MJ | Bill | **US EPA** (W1) | exact to MMBtu | DEFRA D41 (gross CV) |
| Gas kWh | Bill tier 1 | **none** (U1) | | `location_excluded` |
| Electricity kWh (MWh, GJ by bill) | Wizard; region from country | EEA 2023 by member state (966-973), cited `electricity_eu` "EEA (2023) Greenhouse gas emission intensity of electricity generation" (829); wizard banner hard-codes "EEA 2023" (page.tsx:2302-2303) | exact | DEFRA E19, E22, E24 |
| Market-based | | AIB 2024 for 26 members (1057-1068); AT `null` (full disclosure), so location factor with a note (1215-1217) | | skipped |
| Renewable kWh | ESRS / GRI | covered at 0, uncovered at residual (2755-2758) | | skipped |
| Propane litres | Wizard (2104); bill | `EF_EU.propane_litre` 1.52216 (508) | 0.510 kg/L uncited (W3) | D51 |
| Propane gallons, lbs, kg | Bill | `EF_EU.propane_gallon` 5.762 (509), own key | lbs, kg via **US density** (W2) | DEFRA gal→L, D51 |
| Diesel (stationary, fleet) litres / gallons | Wizard litres; gallons by bill | `EF_EU.diesel_litre` / `diesel_mobile_litre` 2.68924 (511, 513); gallon keys 10.179876 (512, 514), own keys | 0.844 kg/L uncited (W3) | D71 |
| Petrol litres / gallons | Wizard litres | `EF_EU.gasoline_litre` 2.28714 (548), `gasoline_gallon` 8.657763 (549) | 0.745 kg/L uncited (W3) | D95 |
| Heating oil litres | Wizard | `EF_EU.fuel_oil_distillate_litre` 2.68924 (540), = diesel by IPCC Table 1.1 | 0.844 kg/L | D107 |
| Residual fuel oil litres | Wizard | `EF_EU.fuel_oil_residual_litre` 3.09569 (546) | 0.990 kg/L, "one-sided bound" | D103 |
| Fuel oil gallons (stored only) | | grade gallon keys (522, 533); `EF_EU.fuel_oil_gallon` (516) is residual while US `EF.fuel_oil_gallon` (146) is distillate; no path builds that legacy key | exact | DEFRA |
| Refrigerants | Wizard | as UK; unknown `?? 0` | | n/a |
| Steam, GJ only | Wizard | **none** (U2) | GJ ×277.78 | supplier figure only |
| Biogenic CO2 | ESRS / GRI | none; separate | | n/a |

### 5.3 Editions held (EU)

- Combustion: EU MRR 2018/2066 Annex VI with IPCC 2006, static (ruled exempt from year selection as IPCC 2006
  defaults, section 10 of the design doc).
- EEA grid: 2023 only; whether 2023 is a data year or a publication year is not stated ⚑.
- AIB residual: 2024 data year only; AIB 2025 not held.
- `factor_editions` records combustion, electricity and steam only, with no residual-mix entry for any
  jurisdiction (factorEditions.ts:173-180, 314-327).

---

## 6. Stale or contradictory comments found (no action taken)

**Status (FI8, 7 Oct 2026):** none of the comments below remains in the tree. Each was rewritten in FI8 or had
already gone in FI1 to FI10; the line numbers below are for the tree this record was written against.

- engine.ts:193-196 and 2475-2477: steam "still applied to every country" by the US row. Steam now routes through
  `STEAM_EF` with no US fallback (2318-2397).
- engine.ts:203-204, 2020-2021, 2056-2057: CA gas "mcf/m3 only", "gallons is never offered". The bill path
  delivers therms, MMBtu and gallons to CA locations.
- engine.ts:230: "these eleven keys"; `EF_CA` holds 15.
- engine.ts:205 vs 243: the same CA gas CH4/N2O described as "Commercial/Industrial" and "Res/Comm/Institutional".
- engine.ts:2073-2077: UK steam kWh "not offered here"; it is (2090).
- engine.ts:2065-2066, 2208-2209: propane comments orphaned from `propaneUnitOptions` and `propaneEfKey`.
- engine.ts:2093-2095: "CA/EU/AU/NZ have no published factor at all"; EU is `not_searched`.
- engine.ts:2204-2207 (`pickEF` header): lists US, CA, GB, EU only, and says the fallback means "a location can
  never silently zero out"; predates `efMiss`.
- engine.ts:1312-1314, 1364-1366, 2542: "an unlisted country is 'US'"; `efJurisdiction` returns null (1459-1462).
- engine.ts:1036-1039, 1116-1119: "no Scope 3 Category 3 electricity line"; cat3Energy.ts prices one.
- engine.ts:2670-2671: "pricingReady already blocks ... while a refused location exists"; not for non-fixable
  refusals (page.tsx:1376-1380).
- engine.ts:3768-3769: EU fuel oil "converts litres→gallons"; EU litres now price directly (2297-2299).
- engine.ts:3899-3900: "NZ ... is always resolved"; only if `grid_region === 'NZ'`.
- page.tsx:1323-1325: unresolved regions "silently fall back to US_AVG"; pricing gates first (engine.ts:2741, 3901).
- uc.ts:40: `GJ_PER_MMBTU` labelled "(IEA)"; it is the exact International Table definition.
- cat3Copy.ts:134, 139-141, 418-424: therms and MMBtu "on the US path alone"; AU offers MMBtu and the bill path
  delivers both everywhere.
- cat3Inputs.ts:84-91 and other line references: `efJurisdiction` "ends `return 'US'`"; stale.
- defraEnergy.ts:4-6: "NOTHING PRICES FROM IT YET"; cat3Energy.ts prices from it.
- docs/review/factor-year-selection.md: engine.ts line references for EEA (937-944), `RESIDUAL_EU` (1028-1039),
  the UK grid (934) and `STEAM_EDITION` (877-880) are out of date (now 964-973, 1057-1068, 963, 906-909).
