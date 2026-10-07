# EU fuel properties, propane by mass, and Canada gas heat content: research record (FI3, FI4)

Prepared 7 Oct 2026 on branch `factor-integrity` at the FI5 commit (198415d); round 2 the same day records
Lisa's rulings R6 to R11 (see "Decisions" and design-derived-figures.md section 10) and adds Canada's National
Inventory Report. This is a record only. Nothing in the engine changes because of it. FI3's second diff and FI4
take their values from here. A point still marked ⚑ is open.

## How to read this

- **Sources.** Every value is quoted from a document in Lisa's source folder, `~/themisiq-sources`, with its
  table, row and page. Where the folder does not hold the document a value would need, the record says
  "not found in local sources" and names the document under "Still to download". No value comes from memory
  or the web.
- **Page numbers.** For a PDF, the page is the number printed on the page. The MRR consolidated text is
  numbered by its own running footer, which ends in the page number ("02018R2066, EN, 27.05.2025, 007.001, N", punctuation simplified). For a workbook, the
  sheet, row and column are given instead.
- **Rulings applied** (design-derived-figures.md section 10, 7 Oct 2026):
  - R2, the order of sources for a density or energy content: (1) the factor publisher's own value; (2) a
    cited official or standards source stating a single value, for example the EU JRC; (3) a default value.
    A value chosen by ThemisIQ never qualifies, nor does another country's emission factor.
  - R3, gross/net calorific ratio: the publisher's own ratio first, otherwise a cited general rule. Never
    applied to coal or biomass.
- **Source update from Lisa, 7 Oct 2026.** The GHG Protocol stationary combustion tool is no longer available
  and is not in the folder. So:
  - R2 step 3 (defaults) is read from IPCC 2006 Vol. 2 Ch. 1 and Ch. 2;
  - R3's general rule is cited from IPCC 2006 Vol. 2 Ch. 1, section 1.4.1.2.
  The GHG Protocol tool's values are not used anywhere below.

## Documents used

| Document | Path | What it was used for |
|---|---|---|
| Commission Implementing Regulation (EU) 2018/2066 (MRR), consolidated text 27.05.2025 | `~/themisiq-sources/eu/CELEX_02018R2066-20250527_EN_TXT.pdf` | Annex VI Table 1; Article 3(68); Article 53; Annex IIa section 2.2 |
| IPCC 2006 Guidelines, Vol. 2 Energy, Ch. 1 Introduction | `~/themisiq-sources/ipcc/V2_1_Ch1_Introduction.pdf` | Table 1.1 definitions, section 1.4.1.2, Box 1.1, Table 1.2 NCVs, Table 1.4 CO2 factors |
| IPCC 2006 Guidelines, Vol. 2 Energy, Ch. 2 Stationary Combustion | `~/themisiq-sources/ipcc/V2_2_Ch2_Stationary_Combustion.pdf` | Tables 2.2 and 2.3; the gross/net notes under Tables 2.6, 2.7 and 2.8 |
| JEC Well-to-Tank report v5 (JRC119036, EUR 30269 EN, 2020) | `~/themisiq-sources/jrc/JRC119036_01.pdf` | Table 37 (natural gas), the Nm³ definition |
| JEC Well-to-Tank report v5: Annexes (JRC119036, EUR 30269 EN, 2020) | `~/themisiq-sources/jrc/JRC119036_02.pdf` | Appendix 2 sections 3.1 and 4.1 (fuel properties) |
| ECCC, Emission Factors and Reference Values, v3.0, October 2025 (En84-294-2025) | `~/themisiq-sources/eccc/En84-294-2025-eng.pdf` | Tables 1.1 to 1.3 and 3.3; NIR footnotes |
| ECCC, National Inventory Report 1990–2023, Part 2 (2025 edition, Cat. No. En81-4/4E-PDF) | `~/themisiq-sources/eccc/2025NIR%20-%20Part%202.pdf` | Annex 4 Table A4–2; Annex 6 section A6.1 and Tables A6.1–1, A6.1–5 |
| ECCC, National Inventory Report 1990–2023, Part 1 (2025 edition) | `~/themisiq-sources/eccc/2025%20NIR%20-%20Part%201.pdf` | Chapter 3 footnote 6 (HHV and LHV synonyms) |
| US EPA GHG Emission Factors Hub 2025 (last modified 15 Jan 2025) | `~/themisiq-sources/epa/ghg-emission-factors-hub-2025.pdf` | Table 1 propane rows |
| DESNZ/DEFRA GHG conversion factors 2026, full set | `~/themisiq-sources/defra/ghg-conversion-factors-2026-full-set.xlsx` | "Fuel properties" sheet |
| DESNZ/DEFRA GHG conversion factors 2026, flat format (revised) | `~/themisiq-sources/defra/ghg-conversion-factors-2026-flat-format-revised.xlsx` | Propane and LPG per tonne |
| DCCEEW National Greenhouse Accounts Factors 2025 | `~/themisiq-sources/nga/national-greenhouse-account-factors-2025.pdf` | Table 8, LPG |
| MfE emission factors 2026 v2 workbook | `~/themisiq-sources/mfe/NZ_emission_factors_2026_v2.xlsx` | LPG rows |

`~/themisiq-sources/jrc/JRC119036_01 copy.pdf` is byte-identical to `JRC119036_01.pdf` and was not read separately.

---

## A. EU (FI3)

### What the two factor publishers print

**MRR Annex VI, section 1, Table 1** (pages 167 and 168), "Fuel emission factors related to net calorific value
(NCV) and net calorific values per mass of fuel". The columns are "Emission factor (t CO2/TJ)" and "Net
calorific value (TJ/Gg)", and every row used here gives its source as "IPCC 2006 GL".

| MRR row (exact) | t CO2/TJ | TJ/Gg (NCV) | Page |
|---|---|---|---|
| Natural gas | 56,1 | 48,0 | 168 |
| Gas/Diesel oil | 74,1 | 43,0 | 167 |
| Motor gasoline | 69,3 | 44,3 | 167 |
| Liquefied petroleum gases | 63,1 | 47,3 | 167 |
| Residual fuel oil | 77,4 | 40,4 | 167 |

What Table 1 does and does not contain:

- **The basis is net.** The table title reads "related to net calorific value (NCV)".
- **CO2 only.** It has no CH4 or N2O column; those come from IPCC below.
- **No heating-oil row.** Distillate heating oil falls under "Gas/Diesel oil" by the IPCC definition below.
- **No density, no volumetric energy content and no gross/net factor** for any fuel in Annex VI.

Elsewhere in the MRR:

- **Article 3(68)** (page 13) defines a "unit conversion factor" as one that "comprises all relevant factors such
  as the density, the net calorific value or (for gases) the conversion from gross calorific value to net
  calorific value, as applicable". It names these quantities but gives no values.
- **Annex IIa, section 2.2** (page 123): Tier 1 for the unit conversion factor is "the standard factors listed in
  section 1 of Annex VI", and Annex VI holds NCVs per mass only.
- **The only density value** in the regulation is the aviation one: "a standard value of 0,8 kg per litre"
  (Article 53, page 58), for aviation fuel. It does not apply to any fuel below.

**IPCC 2006 Vol. 2:**

- **Ch. 1, Table 1.2** (page 1.18), "Default net calorific values (NCVs) and lower and upper limits of the 95%
  confidence intervals", TJ/Gg. Default (lower, upper):
  - Natural Gas 48.0 (46.5, 50.4);
  - Gas/Diesel Oil 43.0 (41.4, 43.3);
  - Motor Gasoline 44.3 (42.5, 44.8);
  - Liquefied Petroleum Gases 47.3 (44.8, 52.2);
  - Residual Fuel Oil 40.4 (39.8, 41.7).

  These are the NCVs MRR Table 1 reproduces.
- **Ch. 1, Table 1.4** (pages 1.23 and 1.24), "Default CO2 emission factors for combustion", effective factor in
  kg/TJ:
  - Motor Gasoline 69 300;
  - Gas/Diesel Oil 74 100;
  - Residual Fuel Oil 77 400;
  - Liquefied Petroleum Gases 63 100;
  - Natural Gas 56 100 (page 1.24).

  These match MRR.
- **Ch. 2, Tables 2.2 and 2.3:**
  - Table 2.2 (page 2.16), "Default emission factors for stationary combustion in the energy industries";
  - Table 2.3 (page 2.18), the same for manufacturing industries and construction.

  Both are in kg per TJ "on a Net Calorific Basis" and give the same defaults for these fuels:

  | Fuel | CO2 | CH4 | N2O |
  |---|---|---|---|
  | Motor Gasoline, Gas/Diesel Oil, Residual Fuel Oil | as Table 1.4 | 3 | 0.6 |
  | Liquefied Petroleum Gases | 63 100 | 1 | 0.1 |
  | Natural Gas | 56 100 | 1 | 0.1 |
- **Ch. 1, Table 1.1 (definitions, page 1.12):**
  - Gas/Diesel Oil: "Several grades are available depending on uses: diesel oil for diesel compression ignition
    (cars, trucks, marine, etc.), light heating oil for industrial and commercial uses, and other gas oil".
  - Residual Fuel Oil: "the density is always more than 0.90 kg/l". This is a one-sided bound, not a value.
  - Liquefied Petroleum Gases: "comprising propane (C3H8) and butane (C4H10) or a combination of the two".
- **No density or volumetric energy content.** Neither chapter publishes one as a single value for any of these
  fuels.

### The density and energy-content search, by R2 step

- **Step 1, the factor publisher (MRR, IPCC 2006).** Neither publishes a density (kg/L) or a volumetric energy
  content (MJ/m³) for any fuel here. Not found.
- **Step 2, an EU official source stating a single value.**
  - **The JEC Well-to-Tank report v5** (JRC, 2020) publishes single values:
    - **Annexes, Appendix 2, section 4.1 "Standard properties of fuels"** (Annexes page 9), Liquids:

      | Column | Density | LHV |
      |---|---|---|
      | Gasoline | 743 kg/m³ | 43.2 MJ/kg |
      | Diesel | 832 kg/m³ | 43.1 MJ/kg |
      | HFO | 970 kg/m³ | 40.5 MJ/kg |

      Its Gases block has LPG only "at gaseous state (before compression/liquefaction)" (LHV 46.0 MJ/kg,
      29.18 kWh/Nm³). There is no liquid LPG density and no heating-oil column.
    - **For natural gas it gives three figures:**
      - Main report **Table 37** "Notional composition of NG distributed in the EU (Current)" (page 140),
        column "Notional EU-mix (Current)": "Density (kg/Nm3) 0.782", "LHV (MJ/Nm3) 36.4", "LHV (GJ/t) 46.59";
      - Annexes section 4.1 (page 9), column "NG EU mix, Piped, 2016": "kWh/Nm³ 10.02" (= 36.07 MJ/Nm³ at
        3.6 MJ/kWh) and "LHV MJ/kg 46.3";
      - Annexes section 3.1 (page 7): "1 Nm³ of EU-mix NG ~ 0.78 kg ~ 36 MJ". This one is approximate by its
        own "~".
    - **The Nm³ basis:** main report, notes under the natural gas table (page 141): "Nm³ is gas at 0°C =
      273.15 K and 0.1013 MPa".
    - **Its status:** the report's front matter (both volumes) says "The scientific output expressed does not
      imply a policy position of the European Commission."
  - **The Commission's MRR guidance documents** are not found in local sources (see "Still to download").
- **Step 3, defaults (IPCC 2006 Vol. 2 Ch. 1 and Ch. 2, under Lisa's source update).** IPCC publishes NCVs per
  mass (Table 1.2) and factors per TJ (Tables 1.4, 2.2, 2.3), but no density and no volumetric energy content. So
  step 3 supplies nothing for a volume unit.

### Gross/net for natural gas (R3)

- **No EU source publishes one.** MRR Annex VI has none. JEC publishes lower heating values only; it gives no
  higher (gross) heating value for natural gas. The ratio is therefore not found in the EU sources.
- **The general rule, from IPCC 2006 Vol. 2 Ch. 1, section 1.4.1.2 "Conversion of energy units" (page 1.16),
  verbatim:** "These Guidelines use net calorific values (NCVs) … Some statistical offices use gross calorific
  values (GCV). The difference between NCV and GCV is the latent heat of vaporisation of the water produced
  during combustion of the fuel. As a consequence for coal and oil, the NCV is about 5 percent less than the GCV
  For most forms of natural and manufactured gas, the NCV is about 10 percent less."
  - The same section names its own reference for the conversion: "please consult the IEA's Energy Statistics
    Manual (OECD/IEA, 2004)". That manual is not in the folder.
  - Box 1.1 (page 1.17) gives an ISO formula needing hydrogen, moisture and oxygen content, which a bill does
    not carry.
- **Ch. 2 states the same figures as a rule.** The notes under Table 2.6 (page 2.25), Table 2.7 (page 2.26) and
  Table 2.8 (page 2.27) say the values "were converted to net calorific value by assuming that net calorific
  values were 5 per cent lower than gross calorific values for coal and oil, and 10 per cent lower for natural
  gas. These percentage adjustments are the OECD/IEA assumptions on how to convert from gross to net calorific
  values."
- **Ruled 7 Oct 2026 (R7):** NCV = GCV × 0.90 for natural gas where the publisher gives no ratio, cited to IPCC
  2006 Vol. 2 Ch. 1 section 1.4.1.2 (page 1.16) and the notes under Ch. 2 Tables 2.6 to 2.8 (pages 2.25 to 2.27).
  This replaces the GHG Protocol tool citation in R3 for gas.
  - **Liquids: 0.95, cited.** The same section states the oil figure in the sentence quoted above: "for coal and
    oil, the NCV is about 5 percent less than the GCV", and the Ch. 2 notes repeat it: "5 per cent lower than
    gross calorific values for coal and oil". So oil (the liquid fuels) takes 0.95 with the same IPCC citation.
  - **Solids: citation to confirm.** IPCC states 5 per cent for coal, and R3 never applies a ratio to coal or
    biomass. For any other solid fuel IPCC states no ratio, so 0.95 is not cited.
- **Not for the EU.** DEFRA's own figures (Fuel properties sheet, row 31 Natural Gas: Net CV 44.695 and Gross CV
  49.521 GJ/tonne, a ratio of 0.9025) are the UK publisher's, and R3's "publisher's own" means MRR/IPCC here.

### Mass units

MRR Annex VI Table 1 prints the factor per TJ and the NCV per Gg in the same row, for every fuel above. So
kg and tonnes qualify for all five EU fuel rows, and for heating oil through the Gas/Diesel oil row. Mass × NCV ×
factor then uses one cited table. CH4 and N2O come from IPCC Table 2.2/2.3 per TJ, on the same NCV (IPCC Table
1.2, which is the source MRR names).

### Per fuel

1. **Natural gas**
   - **What is printed:** MRR 56,1 t CO2/TJ and 48,0 TJ/Gg on a net basis; IPCC the same, plus CH4 1 and
     N2O 0.1 kg/TJ.
   - **Volume: blocked (R6).** No step 1 value. JEC Table 37 gives 36.4 MJ/Nm³ (LHV, Nm³ at 0 °C and
     0.1013 MPa) for the notional EU mix, and it is the figure to cite if one is ever cited, not Annexes 4.1's
     36.07 or Annexes 3.1's "~ 36". It is not applied to a billed m³: billing reference conditions differ by
     country and are not printed on every bill. The wizard asks EU sites for kWh, which EU gas bills show.
   - **The current 36 MJ/m³ (2.0196 kg CO2/m³):** printed by no local source. It is removed (R6).
   - **Gross/net:** NCV = GCV × 0.90 (R7), so a gas bill in kWh (gross) prices on MRR's net factor.
   - **Mass:** qualifies.
2. **Diesel / gas oil**
   - **What is printed:** MRR "Gas/Diesel oil" 74,1 and 43,0; IPCC CH4 3 and N2O 0.6.
   - **Density:** no step 1 value. At step 2, JEC "Diesel" 832 kg/m³ (Annexes 4.1, page 9).
   - **The current 0.844 kg/L:** not printed by any local source.
   - **Mass:** qualifies.
3. **Petrol**
   - **What is printed:** MRR "Motor gasoline" 69,3 and 44,3.
   - **Density:** no step 1 value. At step 2, JEC "Gasoline" 743 kg/m³ (Annexes 4.1, page 9).
   - **The current 0.745 kg/L:** not printed by any local source.
   - **Mass:** qualifies.
4. **LPG**
   - **What is printed:** MRR "Liquefied petroleum gases" 63,1 and 47,3; IPCC CH4 1 and N2O 0.1.
   - **Density:** no step 1 value. JEC gives LPG only in its gaseous state, with no liquid density. Step 3
     (IPCC) has none either.
   - **The current 0.510 kg/L:** not found in local sources.
   - **Litres are therefore blocked.** Mass qualifies.
5. **Residual fuel oil**
   - **What is printed:** MRR 77,4 and 40,4.
   - **Density:** no step 1 value (IPCC's "> 0.90 kg/l" is a bound). At step 2, JEC "HFO" 970 kg/m³
     (Annexes 4.1, page 9).
   - **The current 0.990 kg/L:** not printed by any local source.
   - **Mass:** qualifies.
6. **Distillate (heating) oil**
   - **What is printed:** MRR "Gas/Diesel oil", which IPCC Table 1.1 defines to include "light heating oil for
     industrial and commercial uses".
   - **Density:** no source prints a heating-oil density. JEC has no heating-oil column; its only mention is a
     pathway-matrix footnote, "(6) Heating oil / Diesel" (main report, page 17), which is not a property
     statement.
   - **Ruled (R8):** the diesel density (832 kg/m³) is not used for heating oil. Litres stay blocked until a
     source publishes a heating-oil density.
   - **Mass:** qualifies.

**Mixing sources (R10: allowed, with every document named on the row).** The derivations below pair a JEC
density with the MRR/IPCC NCV. JEC's own LHVs differ from
the MRR/IPCC NCVs:

| Fuel | JEC LHV (MJ/kg) | MRR/IPCC NCV (TJ/Gg) |
|---|---|---|
| Diesel | 43.1 | 43.0 |
| Gasoline | 43.2 | 44.3 |
| HFO | 40.5 | 40.4 |

R2 asks only for the density, so the NCV stays the publisher's, and the row note names both documents.

### Result table, EU

The effect is against the per-litre or per-m³ CO2 value the engine holds today (`EF_EU`). Each derived value is
the factor × the NCV × the density, from the quoted figures.

| Fuel | Unit | Step used | Value | Source quote | Priced or blocked |
|---|---|---|---|---|---|
| Natural gas | m³ | none (R6) | (JEC Table 37, 36.4 MJ/Nm³ at 0 °C, not applied to a billed m³) | JEC WTT v5, Table 37, "LHV (MJ/Nm3) 36.4", Notional EU-mix (Current), page 140 | Blocked. Today's 2.0196 kg CO2/m³ is removed |
| Natural gas | kWh, GJ, MJ (gross, as billed) | R7 | NCV = GCV × 0.90 | IPCC 2006 Vol. 2 Ch. 1 section 1.4.1.2, page 1.16: "the NCV is about 10 percent less"; Ch. 2 note under Table 2.6, page 2.25: "10 per cent lower for natural gas" | Priced: 56.1 t CO2/TJ net × 0.90 = 50.49 kg CO2 per GJ gross |
| Natural gas | kg, t | MRR mass basis | 56,1 t CO2/TJ; 48,0 TJ/Gg | MRR Annex VI Table 1, row "Natural gas", page 168 | Priced |
| Diesel / gas oil | litres | R2 step 2 (R9, R10) | 832 kg/m³ | JEC WTT v5 Annexes, section 4.1, Liquids, "Diesel", "Density kg/m³ 832", page 9 | Priced: 74.1 × 43.0 × 0.832 / 1000 = 2.65100 kg CO2/L (today 2.68924, −1.42%) |
| Diesel / gas oil | kg, t | MRR mass basis | 74,1 t CO2/TJ; 43,0 TJ/Gg | MRR Annex VI Table 1, row "Gas/Diesel oil", page 167 | Priced |
| Petrol | litres | R2 step 2 (R9, R10) | 743 kg/m³ | JEC WTT v5 Annexes, section 4.1, Liquids, "Gasoline", "Density kg/m³ 743", page 9 | Priced: 69.3 × 44.3 × 0.743 / 1000 = 2.28100 kg CO2/L (today 2.28714, −0.27%) |
| Petrol | kg, t | MRR mass basis | 69,3 t CO2/TJ; 44,3 TJ/Gg | MRR Annex VI Table 1, row "Motor gasoline", page 167 | Priced |
| LPG | litres | none | not found in local sources | none | Blocked |
| LPG | kg, t | MRR mass basis | 63,1 t CO2/TJ; 47,3 TJ/Gg | MRR Annex VI Table 1, row "Liquefied petroleum gases", page 167 | Priced: 2.98463 kg CO2/kg |
| Residual fuel oil | litres | R2 step 2 (R9, R10) | 970 kg/m³ | JEC WTT v5 Annexes, section 4.1, Liquids, "HFO", "Density kg/m³ 970", page 9 | Priced: 77.4 × 40.4 × 0.970 / 1000 = 3.03315 kg CO2/L (today 3.09569, −2.02%) |
| Residual fuel oil | kg, t | MRR mass basis | 77,4 t CO2/TJ; 40,4 TJ/Gg | MRR Annex VI Table 1, row "Residual fuel oil", page 167 | Priced |
| Heating oil | litres | none (R8) | not found in local sources (the diesel density is not used) | none | Blocked |
| Heating oil | kg, t | MRR mass basis | 74,1 t CO2/TJ; 43,0 TJ/Gg | MRR Annex VI Table 1, row "Gas/Diesel oil", page 167 | Priced |

CH4 and N2O on every EU row: IPCC 2006 Vol. 2 Ch. 2, Table 2.2 (page 2.16) and Table 2.3 (page 2.18), in kg/TJ
on the same NCV.

### Result table, Canada (from section C)

| Fuel | Unit | Step used | Value | Source quote | Priced or blocked |
|---|---|---|---|---|---|
| Natural gas | m³ | published per m³ | provincial g CO2/m³ | ECCC v3.0 Table 1.3, e.g. "Ontario 1 921" (Marketable), page 4 | Priced, as today (province required) |
| Natural gas | therms, MMBtu, GJ | R2 step 1, if ruled | 38.59 TJ/GL GCV (national, 2023) | NIR 1990–2023 Part 2, Table A4–2, row "Natural Gas", "Energy Content, GCV … 38.59 TJ/GL", page 236 | Priced (ruled R12, 7 Oct 2026): GJ / 0.03859 × the province's per-m³ factor; Ontario 49.780 kg CO2 per GJ gross |
| Propane | kg | none | not found in local sources | none | Blocked |

---

## B. Propane (FI4)

**FI4 done (7 Oct 2026, ruling R13), commit a6dc519.** Propane by mass now prices only on the per-mass
factors below (DEFRA per tonne, MRR mass basis, MfE per kg); US, CA and AU propane in kg is unpriced; the 4.24 lb/gal
density is removed.

| Publisher | Per-mass factor | Propane or LPG density | Quote |
|---|---|---|---|
| US EPA (Hub 2025) | None. Table 1 prints Propane per gallon (0.091 mmBtu/gal; 5.72 kg CO2/gal) and "Propane Gas" per scf (0.002516 mmBtu/scf; 0.15463 kg CO2/scf), page 1 | Not found in local sources | Table 1, rows "Propane" and "Propane Gas", page 1 |
| ECCC (v3.0, and NIR 1990–2023) | None. Per litre only, in both | Not found in local sources (the NIR prints none; see C) | v3.0 Table 3.3, "Propane - All Other Uses 1 515" g CO2/L (CH4 0.024, N2O 0.108), page 8; the same values in NIR Part 2, Table A6.1–5, page 244 |
| DEFRA/DESNZ 2026 | **Yes.** Propane, tonnes, 2,997.63233 kg CO2e (factor ID 1_100_1007_15_1); LPG, tonnes, 2,939.36095 kg CO2e (ID 1_100_1003_15_1) | **Yes.** Propane 514.933 kg/m³ (1,942 litres/tonne); LPG 529.749 kg/m³ | Flat file, sheet "Factors by Category", rows 119 and 55; full set, sheet "Fuel properties", rows 37 and 29, column F "Density kg/m3" |
| DCCEEW NGA 2025 | None. LPG per kL only | Not found in local sources | Table 8, "Liquefied petroleum gas (LPG) 25.7 GJ/kL … 60.60" kg CO2-e/GJ combined, page 22 |
| MfE 2026 v2 | **Yes.** LPG per kg: Commercial 2.97164, Industrial 2.96632 kg CO2e/kg | Not found in local sources (Transport LPG is per litre, 1.61825 kg CO2e/L, row 1449) | Sheet "data", rows 1347 and 1387, column J (GHG_TOTAL_KGCO2_e) |
| EU (MRR, IPCC) | **Yes, by mass basis:** 63,1 t CO2/TJ × 47,3 TJ/Gg | Not found in local sources | MRR Annex VI Table 1, row "Liquefied petroleum gases", page 167. IPCC Table 1.1 defines LPG as "propane (C3H8) and butane (C4H10) or a combination of the two" (page 1.12) |

What follows for FI4:
- **UK:** a propane quantity in kg prices on DEFRA's per-tonne factor, through the exact kg-to-tonne
  conversion. No density is needed, though DEFRA does print one.
- **NZ:** kg prices on MfE's per-kg factor. Litres stay unpriced: MfE prints no LPG density.
- **EU:** kg prices from MRR (mass basis). Litres stay blocked (no density; see A above).
- **US, CA, AU:** kg is blocked until a density or per-mass factor from that publisher or an official source is
  found. For Canada this now includes the NIR 1990–2023 (section C), which prints none.
- **The 4.24 lb/gal** (`PROPANE_LB_PER_GAL`, lib/unitConversions.ts, attributed to "EIA / NPGA" and marked
  "VERIFY PROVENANCE"): it is not stated in any local source, and the EPA Hub prints no propane density. It
  stays removed under FI4 unless an official source stating it is downloaded (see below).

---

## C. Canada (FI3 list, from FI2)

### What ECCC's factor document prints

ECCC "Emission Factors and Reference Values", v3.0, October 2025 (En84-294-2025) publishes **no** natural gas
heat content:
- **Tables 1.1 to 1.3:** natural gas CO2 in "g CO2/m3 natural gas" by province (for example Table 1.3, 2026,
  page 4: Ontario Marketable 1 921).
- **Tables 2.1 to 2.3:** CH4 and N2O in g/m³.
- **No energy-basis values:** the document has no GJ/m³, heat content, HHV or calorific value anywhere.

**Which NIR edition it cites.** Table 1.3 (the 2026 set) footnotes read "ECCC. (2025). NIR 1990-2023, Part 2,
Table A6.1-1, 'CO2 Emission Factors for Marketable Natural Gas'" and "… Table A6.1-2, 'CO2 Emission Factors for
Non-Marketable Natural Gas'" (page 4). That is the edition in the folder (Part 2 front page: "National Inventory
Report 1990 – 2023 … Part 2 … 2025"). The earlier sets cite earlier editions: Table 1.2 (2025) cites "ECCC.
(2024). NIR 1990-2022" and Table 1.1 (2023 and 2024) cites "ECCC. (2023). NIR 1990-2021" (page 3). The 2026
provincial values match NIR Table A6.1–1's 2023 row (for example Ontario 1 921 g/m³ in both; NIR Part 2,
page 242).

### What the NIR prints (Part 2, 2025 edition)

- **Annex 6, Table A6.1–1 "CO2 Emission Factors for Marketable Natural Gas"** (page 242) is in g/m³ by province
  and year, with no heat content column. The text above it (section A6.1.1.1, page 241) says "the emission
  factors and energy content values of marketable natural gas were updated for the years 2005 to 2023 (Table
  A6.1–1)". Only the emission factors are printed, though. The energy content values come from a report the
  reference list describes as "ECCC. 2021. New Marketable Natural Gas Emission Factors and Energy Content Values
  1999 to 2019. Unpublished internal report." So **a provincial heat content for marketable gas is not found in
  local sources, and is not published.**
- **Annex 4, Table A4–2 "Reference Approach Energy Contents and Emission Factors for Canada"** (page 236) prints
  one national value. Row "Natural Gas" (Gaseous, Primary Fuels):
  - Energy Content, GCV, 2023: **38.59 TJ/GL**;
  - Reference: "4", which the table's notes give as "Statistics Canada (n.d.), #57-003 (2023 data)";
  - Comment: "Country-specific weighted emission factor based on proportion of marketable and non-marketable
    natural gas".
  - **The basis is gross.** The column is headed "Energy Content, GCV", and the notes read "GCV = gross calorific
    value". Section A4.2 (page 235) says "Canada use HHVs/GCVs to report the energy content of fuels".
  - **The unit:** 38.59 TJ/GL. A GL is 10^6 m³, so this is 38.59 MJ/m³ = 0.03859 GJ/m³.
  - **It is national, not provincial,** and it is a Reference Approach figure, a national cross-check of fuel
    supply, rather than the sectoral method that produces Table A6.1–1.
  - **The reference conditions for the m³ are not stated** for this value. The NIR states "standard conditions
    (101.325 kPa and 15°C)" only in its flaring and venting equations (Annex 3, Equation A3.2–8, page 49), which
    are not tied to Table A4–2.
  - **The source is unclear.** Section A4.2 says natural gas is one of the fuels where "weighted factors,
    calculated yearly, account for the quantity and variation of energy content at the point of consumption"
    rather than RESD values, while the table's reference column points to Statistics Canada #57-003. The two do
    not say the same thing about where 38.59 comes from.
- **Propane:**
  - Table A6.1–5 "Emission Factors for Natural Gas Liquids" (page 244) prints propane in g/L only
    ("Residential 1 515 … All Other Uses 1 515"), the same values as v3.0.
  - Table A4–2 prints energy contents per volume, not mass: "Liquefied Petroleum Gases (LPG) 27.10 TJ/ML" and
    "Natural Gas Liquids 25.40 TJ/ML" (comment "Propane and butane from natural gas liquids").
  - No propane or LPG density (kg/L) and no propane factor per kg is printed anywhere in Part 2. Not found in
    local sources.

### The effect

- **Canadian gas in therms, MMBtu or GJ:** it **could** price under R2 step 1 on Table A4–2's 38.59 MJ/m³ (GCV).
  The value is the factor publisher's own, printed in the inventory its factors cite. But four things make it
  weaker than an ordinary step 1 value. Ruled 7 Oct 2026 (R12): used, with these four points recorded:
  1. it is one national value, while the factor it would divide into is provincial;
  2. it is a Reference Approach figure whose comment mentions weighting by marketable and non-marketable gas,
     and a customer buys marketable gas;
  3. the m³ reference conditions are not stated (the 7 Oct reference-conditions ruling is about m³ to ft³, and
     R6 refused the same step for the EU);
  4. the text and the table disagree about its source (ECCC weighting against Statistics Canada).

  Since R12, Canadian gas in GJ prices this way (FI3); therms and MMBtu convert to GJ exactly.

  The arithmetic if ruled, for Ontario 2026 (v3.0 Table 1.3, Marketable, 1 921 g CO2/m³), to 5 significant
  figures:
  - 1 GJ (gross) ÷ 0.03859 GJ/m³ = 25.913 m³;
  - 25.913 m³ × 1.921 kg CO2/m³ = **49.780 kg CO2 per GJ (gross)**;
  - per MMBtu (× 1.05505585262 GJ, exact) **52.520 kg CO2**; per therm (× 0.105505585262 GJ, exact)
    **5.2520 kg CO2**;
  - CH4 and N2O on the same m³ (v3.0, 0.037 and 0.035 g/m³): 0.00095880 and 0.00090697 kg per GJ.
- **Canadian propane in kg:** **stays blocked.** Neither v3.0 nor the NIR prints a propane density or a per-kg
  factor.

---

## Decisions

Every question from round 1, with Lisa's ruling (also recorded as R6 to R11 in design-derived-figures.md
section 10).

1. **Natural gas, which JEC figure:** Table 37's 36.4 MJ/Nm³ (main report, page 140), Annexes 4.1's 10.02
   kWh/Nm³ (= 36.07 MJ/Nm³, page 9), or none, given they disagree?
   **Ruled 7 Oct 2026 (R6):** if JEC is ever cited for gas it is Table 37's 36.4 MJ/Nm³ (LHV, EU mix, current),
   not 36.07 or "~ 36". It is not used now: see 2.
2. **Natural gas reference conditions:** JEC's Nm³ is at 0 °C and 0.1013 MPa. Should a per-Nm³ energy content be
   applied to a billed m³ without adjustment, as the 7 Oct ruling does for m³ to ft³?
   **Ruled 7 Oct 2026 (R6):** no. A per-Nm³ energy content is never applied to a billed m³, because billing
   reference conditions differ by country and are not printed on every bill. EU gas in m³ is blocked; the wizard
   asks for kWh, which EU gas bills show. Today's 2.0196 kg CO2/m³ (36 MJ/m³) is printed by no source and is
   removed.
3. **R3 for EU gas:** accept the IPCC Ch. 2 note's "10 per cent lower for natural gas" (page 2.25), with section
   1.4.1.2 (page 1.16, "about 10 percent"), as the cited ratio?
   **Ruled 7 Oct 2026 (R7):** yes. Net = gross × 0.90 for natural gas where the publisher gives none, cited to
   IPCC 2006 Vol. 2 Ch. 1 section 1.4.1.2 (page 1.16) and the notes under Ch. 2 Tables 2.6 to 2.8 (pages 2.25 to
   2.27). Liquids take 0.95 on the same citation (section 1.4.1.2 states "for coal and oil, the NCV is about 5
   percent less than the GCV"). For solids other than coal the ratio is "citation to confirm". Never coal or
   biomass.
4. **Heating oil:** does IPCC's single Gas/Diesel Oil category let JEC's diesel density (832 kg/m³) stand for
   heating oil?
   **Ruled 7 Oct 2026 (R8):** no. Heating oil in kg and tonnes prices through MRR's Gas/Diesel oil row; litres stay
   blocked until a source publishes a heating-oil density.
5. **JEC's standing:** JEC states it "does not imply a policy position of the European Commission". Does a JRC
   science report satisfy R2 step 2?
   **Ruled 7 Oct 2026 (R9):** yes. The statement is about policy, not data.
6. **Mixed documents on one row:** a JEC density beside an MRR/IPCC NCV. Accept, with the row note naming both?
   **Ruled 7 Oct 2026 (R10):** yes. One factor row may combine documents; its note names every document used.
7. **UK natural gas in m³** (raised in the FI5 report, not in round 1).
   **Ruled 7 Oct 2026 (R11):** UK natural gas also offers m³, priced through DEFRA's own m³ factor (2.02633 kg
   CO2e/m³, factor ID 1_100_1004_1_1); kWh stays the default unit.
8. **Canadian gas heat content (new in round 2, section C):** may Table A4–2's national 38.59 MJ/m³ (GCV) price
   Canadian gas in therms, MMBtu or GJ against the provincial per-m³ factors?
   **Ruled 7 Oct 2026 (R12):** yes. A Canadian gas figure in GJ (gross, as billed) is converted to m³ at 38.59
   MJ/m³ and priced on the province's own per-m³ factor; the province is still required. The Climate Registry 2025
   and BC's 2024 Best Practices Methodology both use one national Statistics Canada heat content across provinces.
   Lisa has asked ECCC for provincial values (ges-ghg@ec.gc.ca) and will switch if they are published.

---

## Still to download

After the rulings, four documents are still needed. Each names the publisher's page and what the document would
need to show. The web addresses are as last known; please confirm each before downloading.

1. **European Commission, DG Climate Action: MRR guidance.** Guidance Document No. 1 (general guidance for
   installations), and the ETS2 guidance on calculation factors for commercial standard fuels (Article 75e).
   Page: EU ETS "Monitoring, reporting and verification" on climate.ec.europa.eu (last known; please confirm).
   - Needed only for a heating-oil density (R8): it would need to show a standard density (kg/L or t/m³), or an
     NCV per volume, for heating oil.
2. **US Energy Information Administration**, the document behind "EIA" in `PROPANE_LB_PER_GAL`. Page: EIA "Units
   and calculators" or the Monthly Energy Review appendices on eia.gov (last known; please confirm).
   - Would need to show: propane pounds per gallon (or kg/L) as a single stated value, with temperature. Without
     it, US propane in kg or lb stays blocked.
3. **DCCEEW: the National Greenhouse and Energy Reporting (Measurement) Determination 2008, Schedule 1.** Page:
   legislation.gov.au, linked from DCCEEW's NGER pages (last known; please confirm).
   - Would need to show: an LPG energy content per tonne, or an LPG density, so AU propane in kg could price
     under R2 step 1.
4. **MfE: Measuring Emissions detailed guide 2026.** Page: environment.govt.nz, "Measuring emissions" guidance
   (last known; please confirm).
   - Would need to show: an LPG density, so NZ propane in litres could price against the per-kg factor. Only if NZ
     litres are wanted.

No longer needed: the OECD/IEA Energy Statistics Manual (R7 cites IPCC) and the GHG Protocol stationary combustion
tool (no longer available; R7 cites IPCC). ECCC's NIR is now in the folder (section C).
