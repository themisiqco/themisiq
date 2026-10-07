# Mobile (vehicle) combustion factors: research record (FI9 diff 1)

**Status.** Record and transcription only, 7 Oct 2026. Nothing in the engine reads these values yet. FI9 diff 2 adds
the fleet split by vehicle type (ruling R16); diff 3 wires pricing.

**Sources.** Only files in `~/themisiq-sources`, each named where it is quoted:

| Publisher | File | Edition |
|---|---|---|
| US EPA | `epa/ghg-emission-factors-hub-2025.pdf` and `.xlsx` | Hub 2025, "Last Modified: 15 January 2025" |
| ECCC | `eccc/2025NIR%20-%20Part%202.pdf`; `eccc/En84-294-2025-eng.pdf` | NIR 2025 (1990 to 2023), Part 2; Emission factors and reference values v3.0 (October 2025) |
| DEFRA/DESNZ | `defra/ghg-conversion-factors-2026-full-set.xlsx` | 2026, full set v1 |
| DCCEEW | `nga/national-greenhouse-account-factors-2025.pdf` and `.xlsx` | NGA Factors 2025 |
| MfE | `mfe/NZ_emission_factors_2026_v2.xlsx` | 2026 v2 (release 2026.2, published 2026-05-29) |
| IPCC (EU) | `ipcc/V2_3_Ch3_Mobile_Combustion.pdf` | 2006 Guidelines, Vol. 2 Ch. 3 |
| EU MRR, JEC | as recorded in [eu-fuel-properties.md](eu-fuel-properties.md) | Reg. (EU) 2018/2066 Annex VI; JEC WTT v5 |

**Data files.** One per publisher in `lib/emissionFactors/mobile/` (`epa2025.ts`, `eccc2025.ts`, `defra2026.ts`,
`nga2025.ts`, `mfe2026.ts`, `ipcc2006.ts`), with a shared shape and the R16 selection helper in `types.ts`, and every
value spot-tested in `mobile.test.ts`. Why a new folder and not `lib/ghg/mobile.ts`: that file mixes two publishers in
one module with its own shape, and cites an ECCC edition the local sources do not hold (see "lib/ghg/mobile.ts
checked" below). Per-publisher files keyed by edition are the shape FI6 set (`ngaScope3_2025.ts`) and the shape T3c
re-keys.

**R16, as applied here.** Types: Light (cars, vans, utes), Heavy (trucks, buses), Non-road (forklifts, plant,
machinery). "The publisher's row with the highest combined CH4 and N2O within that type" is read as the highest
**CO2-e** of the two gases, because that is what reaches the total: a row printed in CO2-e is summed as printed, and a
row printed in gas mass is weighted by GWP. Ties go to the first row in the publisher's order. ⚑ One pick (US heavy
petrol) changes with the GWP set; see Decisions.

---

## 1. US EPA (GHG Emission Factors Hub 2025)

**1. CO2.** Table 2 "Mobile Combustion CO2" (p. 2), column "kg CO2 per unit": Diesel Fuel **10.21** kg CO2/gallon
(cell D107), Motor Gasoline **8.78** kg CO2/gallon (D112). The same as the stationary figures the engine already holds
(`EF.diesel_gallon` 10.21, `EF.gasoline_gallon` 8.78, from Table 1). Table 2 source: "Federal Register EPA; 40 CFR Part
98; e-CFR ... Table C-1".

**2. CH4 and N2O.**
- On road, **per vehicle-mile**, by vehicle type and model year: Table 3 "Mobile Combustion CH4 and N2O for On-Road
  Gasoline Vehicles" (p. 2), columns "CH4 Factor (g CH4 / vehicle-mile)" and "N2O Factor (g N2O / vehicle-mile)";
  Table 4 "... for On-Road Diesel and Alternative Fuel Vehicles" (p. 3), same units.
- Off road, **per gallon**, by equipment and engine: Table 5 "Mobile Combustion CH4 and N2O for Non-Road Vehicles"
  (p. 3), columns "CH4 Factor (g CH4 / gallon)" and "N2O Factor (g N2O / gallon)".
- Every table's note: "The factors represented in the table above represent combustion emissions only
  (tank-to-wheel) and do not represent upstream emissions or well-to-wheel emissions."

**3. Mapping to R16.**
- Light: Table 3 "Gasoline Passenger Cars" (rows 127 to 164) and "Gasoline Light-Duty Trucks (Vans, Pickup Trucks,
  SUVs)" (165 to 205); Table 4 diesel "Passenger Cars" (249 to 251) and "Light-Duty Trucks" (252 to 254).
- Heavy: Table 3 "Gasoline Heavy-Duty Vehicles" (206 to 238); Table 4 "Medium- and Heavy-Duty Vehicles", Diesel (255,
  256).
- Non-road: Table 5 equipment rows (297 to 328): Agricultural Equipment ("Includes equipment, such as tractors and
  combines, as well as fuel consumption from trucks that are used off-road in agriculture."), Construction/Mining
  Equipment ("Includes equipment, such as cranes, dumpers, and excavators, ..."), Lawn and Garden, Airport,
  Industrial/Commercial, Logging, Railroad and Recreational Equipment.
- Not mapped: Gasoline Motorcycles (Table 3, 239 to 241); Ships and Boats, Locomotives and Aircraft (Table 5,
  290 to 296); every alternative-fuel row of Table 4. None is an R16 type for diesel or petrol.

**4 and 8. R16 rows (AR5).**

| Type | Fuel | Row | CH4 | N2O | Unit |
|---|---|---|---|---|---|
| Light | petrol | Gasoline Light-Duty Trucks, model year 1987-1993 (E176, F176) | 0.0813 | 0.1035 | g/vehicle-mile |
| Light | diesel | Light-Duty Trucks, Diesel, 2007-2022 (F254, G254) | 0.029 | 0.0214 | g/vehicle-mile |
| Heavy | petrol | Gasoline Heavy-Duty Vehicles, 1997 (E213, F213) ⚑ | 0.0924 | 0.1726 | g/vehicle-mile |
| Heavy | diesel | Medium- and Heavy-Duty Vehicles, Diesel, 2007-2022 (F256, G256) | 0.0095 | 0.0431 | g/vehicle-mile |
| Non-road | petrol | Logging Equipment, Gasoline (4 stroke) (E321, F321) | 3.22 | 2.05 | g/gallon |
| Non-road | diesel | Airport Equipment, Diesel (E314, F314) | 1.98 | 1.21 | g/gallon |

⚑ Under AR4 the Heavy petrol pick is model year 1998 (E214, F214: 0.0655, 0.175); under AR5 and AR6 it is 1997. Every
other pick in this record is the same under AR4, AR5 and AR6 (`mobile.test.ts` checks it).

Under R16 the road CH4 and N2O need miles by vehicle type (asked, optional). Without miles, CO2 prices from Table 2 and
the road CH4 and N2O are shown as not counted, with a plain reason; the line is not blocked for that alone. Non-road
needs no miles: Table 5 is per gallon.

## 2. Canada (ECCC)

**Document check.** The local NIR is the **2025 edition**: "Environment and Climate Change Canada. 2025. National
Inventory Report 1990–2023". Table A6.1–15 "Emission Factors for Energy Mobile Combustion Sources" is on **p. 253** of
Part 2 (contents line: "Table A6.1–15 Emission Factors for Energy Mobile Combustion Sources ... 253").
ECCC's Emission factors and reference values v3.0 has **no mobile table**: its Tables 4.1 to 4.3 are "Emission factors
for refined petroleum products (g GHG/L fuel)" by stationary sector (for example "Diesel - Refineries and Others 2 681
0.078 0.022", "Motor Gasoline 2 307 0.100 0.02"), which is what `EF_CA` prices today.

**1. CO2.** Table A6.1–15, column "CO2", every diesel row **2 680.50** g/L and every gasoline row **2 307.3** g/L
(footnote a, "ECCC (2017b)"). Stationary (`EF_CA.diesel_litre` 2.681 kg/L, `gasoline_litre` 2.307) differs in the
rounding only.

**2. CH4 and N2O.** g/L fuel, by vehicle class and emission-control technology ("Tier 3", "Tier 2", ..., "Advanced
Control", "Three-way Catalyst", ...). Table note: "In the context of Transportation Modes, Tiers refer to increasingly
stringent emission standards, enabled through advancements in emission control technologies." "* Advanced control
diesel emission factors are used for Tier 2 diesel vehicle populations."

**3. Mapping.** Light: LDGVs, LDGTs, LDDVs, LDDTs. Heavy: HDGVs, HDDVs. Non-road: "Off-road Gasoline 2-stroke",
"4-stroke", "Off-road Diesel < 19kW", "≥ 19kW, Tier 1 - 3", "≥ 19kW, Tier 4". Not mapped: Motorcycles, Natural Gas
and Propane Vehicles, Off-road Lubricating Oil, Natural Gas and Propane, Railways, Marine, Aviation.

**4. R16 rows (AR5), g/L.**

| Type | Fuel | Row | CH4 | N2O |
|---|---|---|---|---|
| Light | petrol | LDGVs, Tier 0 | 0.32 | 0.66 |
| Light | diesel | LDDTs, Advanced Control | 0.068 | 0.22 |
| Heavy | petrol | HDGVs, Three-way Catalyst | 0.068 | 0.20 |
| Heavy | diesel | HDDVs, Advanced Control | 0.11 | 0.151 |
| Non-road | petrol | Off-road Gasoline 2-stroke | 10.56 | 0.013 |
| Non-road | diesel | Off-road Diesel ≥ 19kW, Tier 4 | 0.073 | 0.227 |

## 3. UK (DEFRA/DESNZ 2026)

**5. Do the fuel factors apply to transport?** Yes, and DEFRA says so; there is no separate fuel-based vehicle table.
- Passenger vehicles!A11: "For vehicles where an organisation has data in litres of fuel or kWh electricity consumed,
  the 'fuels' or 'electricity' conversion factors should be applied, which provide more accurate emissions results."
- Delivery vehicles!A11: "For delivery vehicles where an organisation has data in litres of fuel or kWh electricity
  used, the 'fuels' or 'electricity' conversion factors should be applied, which provide more accurate emissions
  results."
- Fuels!A8: "Fuels conversion factors should be used for primary fuel sources combusted at a site or in an asset owned
  or controlled by the reporting organisation." Fuels!A17's worked example: "Since it fills up its vehicles at a
  national chain of filling stations, it selects the average biofuel blend ..."
- The Passenger and Delivery vehicles sheets are per km or mile (for example Passenger vehicles!C26 "km").

This is R16's exception ("unless the publisher states, cited, that one factor covers both uses"). Non-road falls under
"an asset owned or controlled" (Fuels!A8); DEFRA names no non-road class.

**1 and 2.** Fuels sheet, kg CO2e per litre, split by gas:

| Row | Total (D) | CO2 (E) | CH4 (F) | N2O (G) |
|---|---|---|---|---|
| Diesel (average biofuel blend), litres, row 72 | 2.58354 | 2.55035 | 0.00029 | 0.0329 |
| Petrol (average biofuel blend), litres, row 96 | 2.075 | 2.06107 | 0.00806 | 0.00587 |

The same rows `EF_UK` already prices; the mobile CO2 is the stationary CO2. **3 and 4.** One row per fuel for all
three types; R16's "highest row" never applies.

## 4. Australia (NGA 2025)

**1. CO2.** Table 9 (pp. 26 to 27), kg CO2-e/GJ: Gasoline **67.4**, Diesel oil **69.9**, the same as Table 8's
stationary "Automotive gasoline/petrol" 67.4 and "Diesel oil" 69.9 (p. 23). Energy content 34.2 and 38.6 GJ/kL, also
the same. NGA p. 26: "While CO2 emissions are only dependant on the fuel type, CH4 and N2O emissions are dependent on
the type of engine technology used as well as the fuel type. Therefore, separate emission factors are provided in Table
9 to apply where fuels are used for general transport purposes as well as specific transport types."

**2. CH4 and N2O.** kg CO2-e/GJ (AR5, already CO2-e), split by transport type, Euro standard (heavy diesel) and
manufacture date (the note, p. 28): "* For vehicles manufactured prior to 2004, the following scope 1 emission factors
(in kg CO2-e/GJ) should be used instead of those presented in Table 9: Gasoline CH4 =0.6, N2O = 1.6, Diesel oil CH4
=0.1, N2O = 0.4, ..." The note is in the PDF; the workbook carries only the asterisks.

**3. Mapping.** Light: "Cars and light commercial vehicles". Heavy: "Heavy duty vehicles". **No heavy-duty gasoline
row, and no non-road row of any kind.** NGA says nothing about what to use instead: not found in local sources. The
NGER (Measurement) Determination 2008 would say whether off-road equipment is reported as transport or stationary
energy; it is not in `~/themisiq-sources`. Table 8 is titled "... for stationary energy purposes" (p. 22), so it is
not a cited statement that one factor covers vehicles.

**4. R16 rows.**

| Type | Fuel | Row | CH4 | N2O |
|---|---|---|---|---|
| Light | petrol | Cars and light commercial vehicles, Gasoline, pre-2004 (note, p. 28) | 0.6 | 1.6 |
| Light | diesel | Cars and light commercial vehicles, Diesel oil (E6, F6; 2004 or later) | 0.01 | 0.5 |
| Heavy | diesel | Heavy duty vehicles, Diesel oil - Euro i (E19, F19) | 0.2 | 0.4 |
| Heavy | petrol | none published | | |
| Non-road | either | none published | | |

Light diesel: the 2004-or-later row (0.51 combined) is above the pre-2004 note (0.5), so it is the one R16 selects.

## 5. New Zealand (MfE 2026 v2)

**6. Transport fuel rows.** Sheet "data", Section "Fuel", SubSection "Transport Fuel" (rows 1422 to 1461): Aviation
fuel - Kerosene (GJ and litre), Aviation gas (GJ and litre), **Diesel** (litre), Heavy Fuel Oil, LPG, Light Fuel Oil,
Premium Petrol and **Regular Petrol** (litre). **None is split by vehicle type.** The per-km vehicle sections ("Light
Passenger Vehicle", "Light Commercial Vehicles", "Heavy Goods Vehicles") are distance-based, not fuel-based.

**1 and 2.** kg CO2-e per litre (column J, GHG in column I):

| Row | CO2 | CH4 | N2O | Total |
|---|---|---|---|---|
| Transport Fuel, Diesel (1438 to 1441) | 2.63045 | 0.00394905 | 0.0373749 | 2.67177 |
| Transport Fuel, Regular Petrol (1458 to 1461) | 2.2619 | 0.0302118 | 0.0693172 | 2.36143 |

Mobile diesel CO2 (2.63045) **differs** from the stationary "Commercial Use / Diesel" CO2 (2.65984, row 1337), which
`EF_NZ.diesel_mobile_litre` carries today (total 2.6759, "stationary value reused for mobile (deliberate, for
consistency)"). Petrol already uses Transport Regular Petrol.

**3 and 4.** Light and Heavy take the one row; R16's "highest row" never applies. **Non-road: not found in local
sources.** The workbook names no off-road row and does not say whether "Transport Fuel" covers machinery; MfE's
"Measuring emissions: a guide for organisations" (2026) would say, and is not in `~/themisiq-sources`.

## 6. EU (IPCC 2006 Vol. 2 Ch. 3, with MRR and JEC)

**7. Tables.**
- Table 3.2.1 "Road transport default CO2 emission factors and uncertainty ranges" (p. 3.16), kg/TJ: Motor Gasoline
  **69 300**, Gas/ Diesel Oil **74 100** ("Source: Table 1.4 in the Introduction chapter of the Energy Volume").
  Numerically the MRR Annex VI Table 1 factors `EF_EU` already uses (69.3 and 74.1 t CO2/TJ).
- Table 3.2.2 "Road transport N2O and CH4 default emission factors and uncertainty ranges" (p. 3.21), kg/TJ:
  Uncontrolled 33 / 3.2; Oxidation Catalyst 25 / 8.0; Low Mileage Light Duty Vehicle Vintage 1995 or Later 3.8 / 5.7;
  Gas / Diesel Oil 3.9 / 3.9.
- Table 3.3.1 "Default emission factors for off-road mobile sources and machinery" (p. 3.36), kg/TJ: Diesel, every
  sector 74 100 / 4.15 / 28.6; Motor Gasoline 4-stroke Agriculture 80 / 2, Industry 50 / 2, Household 120 / 2
  (Forestry blank in the source); 2-Stroke Agriculture 140 / 0.4, Forestry 170 / 0.4, Industry 130 / 0.4, Household
  180 / 0.4. Note a: "Data provided in Table 3.3.1 are based on European off-road mobile sources and machinery."

**2 and 3. The split is by fuel and control, not by R16 type.** p. 3.17: "default fuel-based emission factors that do
not specify vehicle technology are highly uncertain." The gasoline rows are based on "a USA light duty gasoline vehicle
(car)" (notes b to d); "Diesel default value is based on the EEA (2005a) value for a European heavy duty diesel truck"
(note e). IPCC prints no heavy gasoline row and no light diesel row, so each road row is mapped to both Light and Heavy
(⚑ Decisions). Non-road maps to Table 3.3.1.

**Litres to TJ** (FI3, R10): diesel 43.0 TJ/Gg (MRR) x 832 kg/m³ (JEC) = 3.5776e-5 TJ/L; petrol 44.3 TJ/Gg x 743
kg/m³ = 3.29149e-5 TJ/L. Per litre, derived (not stored): diesel CO2 2.65100 kg/L (as `EF_EU` today), road CH4 and N2O
each 1.39526e-4 kg/L, off-road CH4 1.48470e-4 and N2O 1.02319e-3 kg/L; petrol CO2 2.28100 kg/L, oxidation catalyst CH4
8.22872e-4 and N2O 2.63319e-4 kg/L, 2-stroke household CH4 5.92468e-3 and N2O 1.31660e-5 kg/L.

**4. R16 rows (AR5), kg/TJ.**

| Type | Fuel | Row | CH4 | N2O |
|---|---|---|---|---|
| Light, Heavy | petrol | Motor Gasoline - Oxidation Catalyst | 25 | 8.0 |
| Light, Heavy | diesel | Gas / Diesel Oil (one row) | 3.9 | 3.9 |
| Non-road | petrol | Motor Gasoline 2-Stroke, Household | 180 | 0.4 |
| Non-road | diesel | Diesel, Agriculture (every sector equal) | 4.15 | 28.6 |

---

## Summary

CO2, CH4 and N2O in each publisher's own unit. "Highest row" means R16's rule chose among several published rows.

| Country | Type | Fuel | CO2 | CH4 | N2O | Unit | Source | Highest row? | Priced or blocked |
|---|---|---|---|---|---|---|---|---|---|
| US | Light | petrol | 8.78 kg/gal | 0.0813 | 0.1035 | g/vehicle-mile | EPA Hub 2025 T2, T3 | Yes (LDT 1987-1993) | Priced (CO2); CH4, N2O with miles |
| US | Light | diesel | 10.21 kg/gal | 0.029 | 0.0214 | g/vehicle-mile | EPA Hub 2025 T2, T4 | Yes (LDT 2007-2022) | Priced (CO2); CH4, N2O with miles |
| US | Heavy | petrol | 8.78 kg/gal | 0.0924 | 0.1726 | g/vehicle-mile | EPA Hub 2025 T2, T3 | Yes (1997; ⚑ AR4 1998) | Priced (CO2); CH4, N2O with miles |
| US | Heavy | diesel | 10.21 kg/gal | 0.0095 | 0.0431 | g/vehicle-mile | EPA Hub 2025 T2, T4 | Yes (2007-2022) | Priced (CO2); CH4, N2O with miles |
| US | Non-road | petrol | 8.78 kg/gal | 3.22 | 2.05 | g/gallon | EPA Hub 2025 T2, T5 | Yes (Logging, 4 stroke) | Priced |
| US | Non-road | diesel | 10.21 kg/gal | 1.98 | 1.21 | g/gallon | EPA Hub 2025 T2, T5 | Yes (Airport Equipment) | Priced |
| CA | Light | petrol | 2307.3 | 0.32 | 0.66 | g/L | NIR 2025 A6.1–15 | Yes (LDGV Tier 0) | Priced |
| CA | Light | diesel | 2680.50 | 0.068 | 0.22 | g/L | NIR 2025 A6.1–15 | Yes (LDDT Advanced) | Priced |
| CA | Heavy | petrol | 2307.3 | 0.068 | 0.20 | g/L | NIR 2025 A6.1–15 | Yes (HDGV Three-way) | Priced |
| CA | Heavy | diesel | 2680.50 | 0.11 | 0.151 | g/L | NIR 2025 A6.1–15 | Yes (HDDV Advanced) | Priced |
| CA | Non-road | petrol | 2307.3 | 10.56 | 0.013 | g/L | NIR 2025 A6.1–15 | Yes (2-stroke) | Priced |
| CA | Non-road | diesel | 2680.50 | 0.073 | 0.227 | g/L | NIR 2025 A6.1–15 | Yes (≥ 19kW Tier 4) | Priced |
| UK | All three | petrol | 2.06107 | 0.00806 | 0.00587 | kg CO2e/L | DEFRA 2026 Fuels row 96 | No (one row) | Priced |
| UK | All three | diesel | 2.55035 | 0.00029 | 0.0329 | kg CO2e/L | DEFRA 2026 Fuels row 72 | No (one row) | Priced |
| AU | Light | petrol | 67.4 | 0.6 | 1.6 | kg CO2-e/GJ | NGA 2025 T9, note p. 28 | Yes (pre-2004) | Priced |
| AU | Light | diesel | 69.9 | 0.01 | 0.5 | kg CO2-e/GJ | NGA 2025 T9 | Yes (2004 or later) | Priced |
| AU | Heavy | petrol | | | | | none published | | **Blocked** |
| AU | Heavy | diesel | 69.9 | 0.2 | 0.4 | kg CO2-e/GJ | NGA 2025 T9 | Yes (Euro i) | Priced |
| AU | Non-road | either | | | | | none published | | **Blocked** |
| NZ | Light, Heavy | petrol | 2.2619 | 0.0302118 | 0.0693172 | kg CO2-e/L | MfE 2026 v2 Transport Fuel | No (one row) | Priced |
| NZ | Light, Heavy | diesel | 2.63045 | 0.00394905 | 0.0373749 | kg CO2-e/L | MfE 2026 v2 Transport Fuel | No (one row) | Priced |
| NZ | Non-road | either | | | | | not found in local sources | | **Blocked** (pending MfE's guide) |
| EU | Light, Heavy | petrol | 69 300 | 25 | 8.0 | kg/TJ | IPCC 2006 T3.2.1, T3.2.2 | Yes (Oxidation Catalyst) | Priced |
| EU | Light, Heavy | diesel | 74 100 | 3.9 | 3.9 | kg/TJ | IPCC 2006 T3.2.1, T3.2.2 | No (one row) | Priced |
| EU | Non-road | petrol | 69 300 | 180 | 0.4 | kg/TJ | IPCC 2006 T3.3.1 | Yes (2-Stroke, Household) | Priced |
| EU | Non-road | diesel | 74 100 | 4.15 | 28.6 | kg/TJ | IPCC 2006 T3.3.1 | Yes (all sectors equal) | Priced |

## Magnitude check: diesel, CH4 + N2O as a share of the type's total (AR5 for gas-mass rows)

| Country | Light | Heavy | Non-road |
|---|---|---|---|
| US | not computable: CO2 per gallon, CH4 and N2O per mile (6.48 g CO2-e per mile at the R16 row) | not computable (11.69 g CO2-e per mile) | 3.55% (376.1 g CO2-e per gallon) |
| CA | 2.20% (60.2 g CO2-e/L) | 1.58% (43.1 g/L) | 2.27% (62.2 g/L) |
| UK | 1.28% | 1.28% | 1.28% |
| AU | 0.72% | 0.85% | blocked |
| NZ | 1.55% | 1.55% | blocked |
| EU | 1.52% | 1.52% | 9.41% |

How much the type choice matters, from the same tables: at the lowest published row the shares are CA Light 1.66%
(LDDV Uncontrolled), Heavy 0.89% (HDDV Uncontrolled), Non-road 0.29% (< 19kW); AU Heavy 0.67% (Euro iv). The largest
move is EU non-road: Table 3.3.1's diesel N2O (28.6 kg/TJ) is 7.3 times the road figure (3.9), so the same litres
carry about six times the non-CO2 share off road. For US road vehicles the spread between model years within one type
is far larger than any of these (Light diesel 0.28 to 6.48 g CO2-e per mile), but it cannot be stated as a share of the
total without a fuel economy, which the Hub does not give.

## lib/ghg/mobile.ts checked

- **Values: every one matches the local copies.** All 29 ECCC rows transcribed here equal `MOBILE_CA`; its other
  entries (motorcycles, propane vehicles, off-road lubricating oil and propane) also equal Table A6.1–15. Every
  `MOBILE_IPCC` value equals Tables 3.2.2 and 3.3.1, and `IPCC_CO2_KG_PER_TJ` equals Table 3.2.1.
- **Citation: does not match.** `mobile.ts` cites "National Inventory Report 1990–2024 ... (2026)", "p. 541", edition
  "NIR 2026 (1990-2024)". The local copy is NIR 2025 (1990 to 2023), and the table is on p. 253. Whether the 2026
  edition prints the same values on p. 541 is not found in local sources; the 2026 NIR Part 2 would show it. The new
  `eccc2025.ts` cites the edition that was checked.
- Not used by this record: `mobile.ts`'s `energyPerLitre` (a CO2-ratio bridge). FI3 and R10 now give a cited density
  and NCV for the EU, which is what the EU rows here use.

## Not found in local sources

- Whether MfE's "Transport Fuel" rows cover non-road machinery: MfE, "Measuring emissions: a guide for organisations"
  (2026).
- What NGA directs for off-road equipment, or for heavy-duty gasoline vehicles: the NGER (Measurement) Determination
  2008.
- Whether ECCC's 2026 NIR prints Table A6.1–15 on p. 541 with the same values (the citation in `lib/ghg/mobile.ts`):
  NIR 2026, Part 2.

## ⚑ Decisions for Lisa

1. **"Highest combined CH4 and N2O" read as highest CO2-e.** By mass the IPCC road petrol pick would be Uncontrolled
   (33 + 3.2) rather than Oxidation Catalyst (25 + 8.0); in CO2-e it is the Oxidation Catalyst row. Confirm CO2-e.
2. **Which GWP set ranks the rows.** Only US heavy petrol changes (AR4 1998, AR5 and AR6 1997). Options: the inventory's
   own GWP set, or AR5 fixed (the basis every publisher here prints its CO2-e on). Recommend AR5 fixed, so the row a
   site uses does not move when the reporting framework changes.
3. **AU heavy petrol and AU non-road, NZ non-road:** blocked under R16 as recorded, until the guides named above are
   added to the sources.
4. **IPCC road rows mapped to both Light and Heavy.** IPCC prints them by fuel with a representative vehicle (US car for
   petrol, European heavy truck for diesel). The alternative is to block EU Heavy petrol and EU Light diesel.
5. **US non-road scope.** Table 5's Ships and Boats, Locomotives and Aircraft are left out of Non-road; Recreational and
   Railroad Equipment are in. Confirm, since the R16 pick for non-road petrol (Logging, 4 stroke) is among them.
