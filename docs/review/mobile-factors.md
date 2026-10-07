# Mobile (vehicle) combustion factors: research record (FI9 diffs 1 and 1b)

**Status.** Record and transcription only, 7 Oct 2026. Nothing in the engine reads these values yet. FI9 diff 2 adds
the fleet split by vehicle type (ruling R16); diff 3 wires pricing. Diff 1b (sections 7 to 10 below) settled the three
cases diff 1 left blocked and recorded the R16 refinement; **nothing is blocked now**, and no case uses the IPCC
fallback.

**Sources.** Only files in `~/themisiq-sources`, each named where it is quoted:

| Publisher | File | Edition |
|---|---|---|
| US EPA | `epa/ghg-emission-factors-hub-2025.pdf` and `.xlsx` | Hub 2025, "Last Modified: 15 January 2025" |
| ECCC | `eccc/2025NIR%20-%20Part%202.pdf`; `eccc/En84-294-2025-eng.pdf` | NIR 2025 (1990 to 2023), Part 2; Emission factors and reference values v3.0 (October 2025) |
| DEFRA/DESNZ | `defra/ghg-conversion-factors-2026-full-set.xlsx` | 2026, full set v1 |
| DCCEEW | `nga/national-greenhouse-account-factors-2025.pdf` and `.xlsx` | NGA Factors 2025 |
| MfE | `mfe/NZ_emission_factors_2026_v2.xlsx` | 2026 v2 (release 2026.2, published 2026-05-29) |
| IPCC (EU) | `ipcc/V2_3_Ch3_Mobile_Combustion.pdf` | 2006 Guidelines, Vol. 2 Ch. 3 |
| DCCEEW (law) | `nga/F2026C00720.pdf` | NGER (Measurement) Determination 2008, Compilation No. 21, "Compilation date: 1 July 2026", "Authorised Version F2026C00720 registered 29/07/2026" |
| MfE (guide) | `mfe/Measuring-emissions_Detailed-guide_2024_ME1829.pdf` | "Measuring emissions: A guide for organisations: 2024 detailed guide" (ME1829) |
| EU MRR, JEC | as recorded in [eu-fuel-properties.md](eu-fuel-properties.md) | Reg. (EU) 2018/2066 Annex VI; JEC WTT v5 |

**Data files.** One per publisher in `lib/emissionFactors/mobile/` (`epa2025.ts`, `eccc2025.ts`, `defra2026.ts`,
`nga2025.ts`, `mfe2026.ts`, `ipcc2006.ts`), with a shared shape in `types.ts`, the R16 selection in `select.ts`
(`selectMobileRow`, diff 1b), and every value and every selection rule tested in `mobile.test.ts`. Why a new folder and not `lib/ghg/mobile.ts`: that file mixes two publishers in
one module with its own shape, and cites an ECCC edition the local sources do not hold (see "lib/ghg/mobile.ts
checked" below). Per-publisher files keyed by edition are the shape FI6 set (`ngaScope3_2025.ts`) and the shape T3c
re-keys.

**R16, as applied here.** Types: Light (cars, vans, utes), Heavy (trucks, buses), Non-road (forklifts, plant,
machinery). "The publisher's row with the highest combined CH4 and N2O within that type" is read as the highest
**CO2-e** of the two gases, because that is what reaches the total: a row printed in CO2-e is summed as printed, and a
row printed in gas mass is weighted by GWP. Ties go to the first row in the publisher's order. The GWP set is **AR5,
fixed** (R16 as refined, section 10), which settles the one pick that moved with it (US heavy petrol: 1997 at AR5,
1998 at AR4).

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

## 7. Australia: the NGER (Measurement) Determination (diff 1b)

Source: `nga/F2026C00720.pdf`, "National Greenhouse and Energy Reporting (Measurement) Determination 2008 ...
Compilation No. 21, Compilation date: 1 July 2026, Includes amendments: F2024L00823 and F2026L00855" (cover).

**a. Stationary and transport energy purposes.** Section 2.41(2), p. 78 (liquid fuels; section 2.20(2), p. 58, for gaseous
fuels uses the same words):

> stationary energy purposes means purposes for which fuel is combusted that do not involve transport energy purposes.
> transport energy purposes includes purposes for which fuel is combusted that consist of any of the following:
> (a) transport by vehicles registered for road use; (b) rail transport; (c) waterborne transport; (d) air transport.

Section 2.41(1), p. 78, sends each to its table: "(a) for stationary energy purposes—Part 3 of Schedule 1; and (b) for
transport energy purposes—Division 4.1 of Schedule 1." Schedule 1 Part 3 is "Fuel combustion—liquid fuels and certain
petroleum-based products for stationary energy purposes" (p. 405); Part 4 is "Fuel combustion—fuels for transport
energy purposes" (pp. 407 to 410). No definition of either term was found in Chapter 1.

**b. Off-road machinery and site vehicles.** The Determination does not name forklifts, mining or construction plant
or agricultural machinery. By the definition above, fuel burned in equipment **not registered for road use** is in none
of (a) to (d), so it is stationary energy, and takes Part 3 (NGA Table 8). A site vehicle that **is** registered for
road use is transport (a), so it is Light or Heavy. ⚑ The definition reads "includes", so the list in (a) to (d) is not
stated to be closed; no other transport purpose is named anywhere in the document. R16's exception applies (the
publisher states which factor applies), so **Australian non-road prices from NGA Table 8**, cited to both:

| Fuel | NGA 2025 Table 8 (p. 23) | Determination Sch. 1 Part 3 (p. 405) | EC (GJ/kL) | CO2 | CH4 | N2O (kg CO2-e/GJ) |
|---|---|---|---|---|---|---|
| petrol | "Automotive gasoline/petrol (other than for use as fuel in an aircraft)", cells B9 to E9 | item 35 "Gasoline (other than for use as fuel in an aircraft)" | 34.2 | 67.4 | 0.2 | 0.2 |
| diesel | "Diesel oil", cells B14 to E14 | item 40 "Diesel oil" | 38.6 | 69.9 | 0.1 | 0.2 |

**c. Petrol in heavy vehicles.** Division 4.3 ("liquid fuels for transport energy purposes for certain trucks", pp. 409
to 410) is **diesel only** (items 68 to 70B: diesel oil, renewable diesel, co-processed diesel). But petrol in a heavy
vehicle is still transport, and Division 4.1 (p. 407) gives the transport factor for any vehicle: item 53 "Gasoline
(other than for use as fuel in an aircraft)", 34.2 GJ/kL, CO2 67.4, CH4 0.6, N2O 1.6. Division 4.2 (p. 409), item 64,
same fuel, CH4 0.02, N2O 0.2, applies by section 2.48(2)(a), p. 87: "for combustion of fuel by vehicles manufactured
after 2004". Neither is limited to light vehicles. **Australian heavy petrol prices from these two items** (no model
year: item 53, the higher; a model year after 2004: item 64).

**d. Do the Determination's values match NGA 2025?**
- Part 3 items 35 and 40 equal NGA Table 8's two rows used here. Division 4.1 items 53 and 54 equal NGA Table 9's
  pre-2004 note (p. 28). Division 4.2 items 64 and 65 equal Table 9's "Cars and light commercial vehicles" rows.
  Division 4.3 items 69, 69AA and 70 (Euro IV, III, I: 0.07/0.4, 0.1/0.4, 0.2/0.4) equal Table 9's heavy diesel rows.
- **Difference 1: Euro V and VI.** Division 4.3 also prints item 68 "Diesel oil, Euro VI or higher" and item 68AA
  "Diesel oil, Euro V", both CH4 0.01, N2O 0.8 (pp. 409 to 410). NGA 2025 Table 9 has no Euro V or VI row; its top row
  is "Diesel oil - Euro iv or higher" (0.07, 0.4). At 0.81 combined, the Euro V/VI rows are above NGA's highest (Euro i,
  0.6). The endnotes list Schedule 1 as amended by, among others, F2025L00671 and F2026L00855, without saying which item
  each changed, so which amendment added these rows is not found in local sources. NGA 2025 says (p. 7) it "coincides
  with the release of the NGER (Measurement) Amendment (2025 Update) Determination 2025"; this compilation is later.
  ⚑ Not transcribed: the file is NGA 2025, and the Euro V/VI rows belong to a later edition (T3c).
- **Difference 2: the 2004 boundary.** NGA's note says "manufactured prior to 2004"; the Determination says Division 4.2
  is for vehicles "manufactured after 2004". For a 2004 vehicle the two disagree. The data follow each document for the
  rows it prints: light rows (NGA's) switch at 2004, heavy petrol rows (the Determination's) after 2004.

## 8. New Zealand: MfE's 2024 detailed guide (diff 1b)

Source: `mfe/Measuring-emissions_Detailed-guide_2024_ME1829.pdf`, "Measuring emissions: A guide for organisations:
2024 detailed guide". PDF page numbers equal the printed ones.

**a. Machinery and off-road equipment.** The guide names no machinery or off-road class. It divides fuel by end use:
- Section 3, p. 26: "Fuel can be categorised by its end-use, that is, either stationary combustion or transport."
- Section 3.2, p. 26: "Stationary combustion fuels are burnt in a fixed unit or asset, such as a boiler."
- Section 3.3, p. 29: "Transport fuels are used in an engine to move a vehicle. Table 4 lists the emission factors."

Equipment that moves under its own engine (a forklift, a loader, a tractor) is "an engine to move a vehicle", not "a
fixed unit or asset", so **New Zealand non-road takes the Transport Fuel rows**. ⚑ This rests on the guide's definition,
not on a sentence naming machinery; a fixed engine (a generator, a pump) is stationary combustion and is not fleet fuel.

**b. One row for every vehicle type?** Not stated in those words. Table 4 "Transport fuel emission factors" (p. 29) has
columns for fuel type and unit only, no vehicle; section 3.3.1 (p. 29) says to "multiply this by the appropriate
emission factor from the table", by fuel; the worked example (p. 30) prices "15 petrol vehicles" from Regular petrol
alone. The per-vehicle tables the guide does print (Tables 46 to 57, sections 7 and 8) are per kilometre, for use when
"you do not have information on fuel use" (section 3.3.2, p. 30).

**c. Row note.** Each MfE row carries both: the 2024 guide as the classification source (the section and page above)
and the 2026 v2 workbook as the factor source (`mfe2026.ts`, `cite.basis`). The guide's own Table 4 values are the 2024
edition (Diesel 2.68 total, 2.64 CO2) and are not used.

## 9. The fallback: IPCC where a publisher has nothing (R16, diff 1b)

Where a publisher gives no mobile or off-road factor and no instruction, CH4 and N2O come from IPCC 2006 Vol. 2 Ch. 3
(Table 3.2.2 road, Table 3.3.1 off-road) and CO2 from the country's own fuel factor. Row note: "IPCC 2006 default for
CH4 and N2O; {publisher} publishes no {road|off-road} factor for {fuel}." Litres reach TJ with the publisher's own
energy content where it prints one (NGA Table 9 or 8; MfE prints none per litre for these fuels, so FI3's route), and
otherwise as FI3 does (MRR NCV with the JEC density).

**After sections 7 and 8, no case uses it**: AU heavy petrol, AU non-road and NZ non-road are each settled from the
publisher's own documents. `select.ts` implements it and `mobile.test.ts` exercises it on a publisher with its rows
removed. **Nothing is blocked**; no case was found where even the fallback could not compute.

## 10. R16 as refined (Lisa, 7 Oct 2026)

**Road (Light, Heavy).** An optional typical model year per vehicle type. Given, the publisher's row for that year;
not given, the highest row in CO2-e on AR5 (fixed), labelled. What each publisher ties to a year:

| Publisher | Rows tied to model years | Not tied (a year reaching none of them takes the highest row) |
|---|---|---|
| US EPA | Every Table 3 and Table 4 row, by its "Model Year" label ("≤1980", "1984-1993", "2005"). Light has a car row and a truck row for most years; the higher is used | Years after 2022: Table 3 ends at 2022 and Table 4 at "2007-2022" ⚑ |
| ECCC | NIR 2025 Part 2, Annex 3.1, p. 25: "Tier 2 and Tier 3 regulatory standards, approximately representing model years 2004 and onwards"; "heavy-duty gasoline vehicles, heavy-duty diesel vehicles and motorcycles have advanced emission controls starting with the 1996 model year"; "Emission factors for vehicles without emission controls and/or moderate controls are used for 1995 and older model years"; and Table A6.1–15's note "Advanced control diesel emission factors are used for Tier 2 diesel vehicle populations". So: light Tier 2 and Tier 3, and light diesel Advanced Control, from 2004; heavy diesel Advanced Control from 1996; diesel Uncontrolled and Moderate Control to 1995 | Light gasoline Tier 1, Tier 0, Oxidation Catalyst and Non-catalytic Controlled; light 1996 to 2003; every heavy gasoline row (the passage's "advanced" and "moderate" are not HDGV row labels) |
| NGA | Light: the p. 28 note, before 2004; Table 9, from 2004. Heavy petrol: Determination Division 4.1 to 2004, Division 4.2 after (s 2.48(2)(a)) | Heavy diesel: split by Euro standard, not year |
| IPCC | Light petrol "Low Mileage Light Duty Vehicle Vintage 1995 or Later": from 1995 (Light only, since it names light duty) | Uncontrolled and Oxidation Catalyst; diesel (one row) |
| DEFRA, MfE | (one row per fuel) | |

**Non-road.** The customer chooses the equipment type; the highest row applies only within it, where the publisher
splits further.

| Equipment type | US EPA Table 5 | IPCC Table 3.3.1 | ECCC, DEFRA, NGA, MfE |
|---|---|---|---|
| Industrial and commercial (including forklifts) | Industrial/Commercial Equipment | Industry | No sector split: the same rows for every type |
| Construction and mining | Construction/Mining Equipment | Industry (no construction sector) | as above |
| Agriculture | Agricultural Equipment | Agriculture | as above |
| Forestry | Logging Equipment | Forestry (2-stroke only; 4-stroke blank) | as above |
| Lawn and garden | Lawn and Garden Equipment | Household | as above |

EPA's Airport, Railroad and Recreational Equipment rows map to no R16 equipment type and are not selected.

**Rows selected, non-road** (CH4, N2O in each publisher's unit; engine or row "not given", so the highest within the
type):

| Equipment type | US diesel (g/gal) | US petrol (g/gal) | EU diesel (kg/TJ) | EU petrol (kg/TJ) |
|---|---|---|---|---|
| Industrial and commercial | Diesel 0.43, 0.62 | 4-stroke 2.81, 1.57 | Industry 4.15, 28.6 | 2-Stroke Industry 130, 0.4 |
| Construction and mining | Diesel Equipment 1.01, 0.94 | 4-stroke 2.86, 1.48 | Industry 4.15, 28.6 | 2-Stroke Industry 130, 0.4 |
| Agriculture | Diesel Equipment 1.26, 1.07 | 4-stroke 1.93, 1.2 | Agriculture 4.15, 28.6 | 2-Stroke Agriculture 140, 0.4 |
| Forestry | Diesel 0.49, 1.26 | 4-stroke 3.22, 2.05 | Forestry 4.15, 28.6 | 2-Stroke Forestry 170, 0.4 |
| Lawn and garden | Diesel 0.67, 0.49 | 4-stroke 3.02, 1.5 | Household 4.15, 28.6 | 2-Stroke Household 180, 0.4 |

CA every type: diesel ≥ 19kW Tier 4 (0.073, 0.227 g/L), petrol 2-stroke (10.56, 0.013 g/L). UK, AU and NZ: the one
row per fuel in the summary.

**Ranking.** CO2-e on AR5 (CH4 28, N2O 265), fixed.

**Row notes** (`select.ts`, as rendered): "Model year not given, so the highest published row for light vehicles is
used."; "Typical model year 2015: US EPA ties 2 rows to it, so the highest of them is used."; "Typical model year 2010:
DCCEEW National Greenhouse Accounts Factors, manufactured 2004 or later."; "US EPA ties no row to model year 2024, so
the highest published row for light vehicles is used."; "Euro standard not given, so the highest published row for
heavy vehicles is used."; "Environment and Climate Change Canada does not split non-road equipment by type. Engine
power and emission tier not given, so the highest published row for non-road construction and mining equipment is
used."; "UK DEFRA/DESNZ prints one non-road row for diesel, not split by equipment type."

---

## Summary

CO2, CH4 and N2O in each publisher's own unit, with no model year given. "Highest row" means R16's rule chose among
several published rows. Non-road shows the Industrial and commercial pick; every equipment type is in section 10.

| Country | Type | Fuel | CO2 | CH4 | N2O | Unit | Source | Highest row? | Priced or blocked |
|---|---|---|---|---|---|---|---|---|---|
| US | Light | petrol | 8.78 kg/gal | 0.0813 | 0.1035 | g/vehicle-mile | EPA Hub 2025 T2, T3 | Yes (LDT 1987-1993) | Priced (CO2); CH4, N2O with miles |
| US | Light | diesel | 10.21 kg/gal | 0.029 | 0.0214 | g/vehicle-mile | EPA Hub 2025 T2, T4 | Yes (LDT 2007-2022) | Priced (CO2); CH4, N2O with miles |
| US | Heavy | petrol | 8.78 kg/gal | 0.0924 | 0.1726 | g/vehicle-mile | EPA Hub 2025 T2, T3 | Yes (1997; ⚑ AR4 1998) | Priced (CO2); CH4, N2O with miles |
| US | Heavy | diesel | 10.21 kg/gal | 0.0095 | 0.0431 | g/vehicle-mile | EPA Hub 2025 T2, T4 | Yes (2007-2022) | Priced (CO2); CH4, N2O with miles |
| US | Non-road | petrol | 8.78 kg/gal | 2.81 | 1.57 | g/gallon | EPA Hub 2025 T2, T5 | Yes (Industrial/Commercial, 4 stroke) | Priced |
| US | Non-road | diesel | 10.21 kg/gal | 0.43 | 0.62 | g/gallon | EPA Hub 2025 T2, T5 | No (Industrial/Commercial, one row) | Priced |
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
| AU | Heavy | petrol | 67.4 | 0.6 | 1.6 | kg CO2-e/GJ | NGER Determination Sch. 1 Div 4.1 item 53 | Yes (to 2004; item 64 after) | Priced |
| AU | Heavy | diesel | 69.9 | 0.2 | 0.4 | kg CO2-e/GJ | NGA 2025 T9 | Yes (Euro i) | Priced |
| AU | Non-road | petrol | 67.4 | 0.2 | 0.2 | kg CO2-e/GJ | NGA 2025 T8 (stationary, s 2.41(2)) | No (one row) | Priced |
| AU | Non-road | diesel | 69.9 | 0.1 | 0.2 | kg CO2-e/GJ | NGA 2025 T8 (stationary, s 2.41(2)) | No (one row) | Priced |
| NZ | Light, Heavy | petrol | 2.2619 | 0.0302118 | 0.0693172 | kg CO2-e/L | MfE 2026 v2 Transport Fuel | No (one row) | Priced |
| NZ | Light, Heavy | diesel | 2.63045 | 0.00394905 | 0.0373749 | kg CO2-e/L | MfE 2026 v2 Transport Fuel | No (one row) | Priced |
| NZ | Non-road | petrol | 2.2619 | 0.0302118 | 0.0693172 | kg CO2-e/L | MfE 2026 v2 Transport Fuel (guide 2024 s 3.3) | No (one row) | Priced |
| NZ | Non-road | diesel | 2.63045 | 0.00394905 | 0.0373749 | kg CO2-e/L | MfE 2026 v2 Transport Fuel (guide 2024 s 3.3) | No (one row) | Priced |
| EU | Light, Heavy | petrol | 69 300 | 25 | 8.0 | kg/TJ | IPCC 2006 T3.2.1, T3.2.2 | Yes (Oxidation Catalyst) | Priced |
| EU | Light, Heavy | diesel | 74 100 | 3.9 | 3.9 | kg/TJ | IPCC 2006 T3.2.1, T3.2.2 | No (one row) | Priced |
| EU | Non-road | petrol | 69 300 | 130 | 0.4 | kg/TJ | IPCC 2006 T3.3.1 | Yes (2-Stroke, Industry) | Priced |
| EU | Non-road | diesel | 74 100 | 4.15 | 28.6 | kg/TJ | IPCC 2006 T3.3.1 | No (Industry, one row) | Priced |

Nothing is blocked, and nothing uses the IPCC fallback (section 9).

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

- (Settled in diff 1b: MfE's classification of machinery, section 8; the Determination on off-road equipment and heavy
  petrol, section 7.)
- Which amendment added the Determination's Euro V and VI diesel rows (section 7d): the amending instruments
  F2025L00671 and F2026L00855.
- Whether the Determination's transport list ("includes ... (a) to (d)") is meant to be closed: not stated in the
  compilation.
- Whether ECCC's 2026 NIR prints Table A6.1–15 on p. 541 with the same values (the citation in `lib/ghg/mobile.ts`):
  NIR 2026, Part 2. **Superseded (FI9 diff 4, 7 Oct 2026):** fleet lines are priced from the NIR 2025 transcription in
  `lib/emissionFactors/mobile/eccc2025.ts` (Table A6.1-15, p. 253), which is the edition that was checked; no fleet
  figure reads `mobile.ts`'s p. 541 citation, so the question no longer affects a number.

## ⚑ Decisions for Lisa

1. **"Highest combined CH4 and N2O" as CO2-e on AR5, fixed:** ruled 7 Oct 2026 (section 10).
2. (Settled with 1.)
3. **AU heavy petrol and AU non-road, NZ non-road** (settled in diff 1b, sections 7 and 8). Both rest on a definition
   rather than a sentence naming machinery: the Determination's "transport energy purposes includes ..." and MfE's
   "used in an engine to move a vehicle". Confirm that reading.
6. **US model years after 2022.** EPA's Tables 3 and 4 end at 2022, so a 2023 or later fleet reaches no tied row and
   takes the highest row (for light petrol, model year 1987-1993: 29.7 g CO2-e per mile, against 0.51 for a 2022 car and 0.54 for a 2022 light truck, about 55 to 58 times).
   R16 as worded gives that. The alternative is to use the latest published row for later years, said on the row.
7. **The NGER Euro V and VI rows** (section 7d) are in the 2026 compilation and not in NGA 2025; heavy diesel keeps
   NGA 2025's rows until T3c loads a later edition.
8. **The 2004 boundary** (section 7d): NGA "prior to 2004", the Determination "after 2004". Kept per document.
4. **IPCC road rows mapped to both Light and Heavy.** IPCC prints them by fuel with a representative vehicle (US car for
   petrol, European heavy truck for diesel). The alternative is to block EU Heavy petrol and EU Light diesel.
5. **US non-road scope.** Table 5's Ships and Boats, Locomotives and Aircraft are left out of Non-road; Recreational and
   Railroad Equipment are in. Confirm, since the R16 pick for non-road petrol (Logging, 4 stroke) is among them.
