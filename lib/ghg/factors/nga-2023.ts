// lib/ghg/factors/nga-2023.ts
//
// T3d (reporting year 2024): DCCEEW National Greenhouse Accounts Factors 2023, Scope 2 electricity by state (Table 1),
// the national Residual Mix Factor (Table 2a in this edition) and stationary combustion (Tables 5 and 8), transcribed from
// ~/themisiq-sources/nga/national-greenhouse-account-factors-2023.pdf, page by page. Pages cited are the PRINTED page
// numbers, which in this edition are one less than the PDF page (the cover is unnumbered). Same keys as the held 2025 values
// in lib/ghg/engine.ts (GRID_EF.AU_*, RESIDUAL_AU, EF_AU), kg CO2-e per unit, the gases combined by NGA on AR5.
//
// ⚠️ THE PER-UNIT COMBUSTION FIGURES ARE A PRODUCT OF TWO PRINTED NUMBERS, NOT A PRINTED FIGURE. The 2025 edition's
// workbook prints NGA's own per-unit column (energy content x combined factor); 2023 is held as a PDF only, which prints
// the energy content and the per-GJ factor on the row and not their product. Each value carries that derivation, both
// inputs are on the cited row, and every product equals the 2024 and 2025 figures. natural_gas_gj is NGA's own per-GJ figure.
// Grid mapping as GRID_EF: ACT shares the NSW row, WA is SWIS, NT is DKIS, AU_AVG is "National" (Table 1 notes,
// p. 9 in 2024: "Data are for financial years ending in June."; the 2023 edition prints no such note).

import type { CitedValue } from './types'

export const NGA_2023 = {
  edition: 'DCCEEW NGA 2023',
  citation: 'DCCEEW NGA 2023 (AR5)',
  sourceFile: 'nga/national-greenhouse-account-factors-2023.pdf',
  correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)",
  grid: {
  AU_NSW: {
    value: 0.68,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity: Location based approach",
      row: "New South Wales and Australian Capital Territory",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "7",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    }
  },
  AU_VIC: {
    value: 0.79,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity: Location based approach",
      row: "Victoria",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "7",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    }
  },
  AU_QLD: {
    value: 0.73,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity: Location based approach",
      row: "Queensland",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "7",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    }
  },
  AU_SA: {
    value: 0.25,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity: Location based approach",
      row: "South Australia",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "7",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    }
  },
  AU_WA: {
    value: 0.53,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity: Location based approach",
      row: "Western Australia - South West Interconnected System (SWIS)",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "7",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    }
  },
  AU_TAS: {
    value: 0.12,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity: Location based approach",
      row: "Tasmania",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "8",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    }
  },
  AU_NT: {
    value: 0.54,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity: Location based approach",
      row: "Northern territory - Darwin Katherine Interconnected System (DKIS)",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "8",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    }
  },
  AU_AVG: {
    value: 0.65,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity: Location based approach",
      row: "National",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "8",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    }
  }
} as Record<string, CitedValue>,
  residual: {
  value: 0.81,
  unit: "kg CO2-e/kWh",
  cite: {
    document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
    table: "Table 2a Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity: market-based factors",
    row: "National",
    column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
    page: "8",
    correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
  }
} as CitedValue,
  combustion: {
  natural_gas_m3: {
    value: 2.025129,
    unit: "kg CO2-e/m3",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 5 Direct (Scope 1) emission factors for the consumption of gaseous fuels including liquefied natural gas",
      row: "Natural gas distributed in a pipeline",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "16",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    },
    derivation: "0.0393 x 51.53 = 2.025129 kg CO2-e/m3 (computed here; the 2023 PDF does not print a per-unit combined figure): energy content x combined Scope 1 factor, both printed on the row; the 2023 PDF prints no per-unit figure (the 2025 workbook prints the same product)"
  },
  natural_gas_gj: {
    value: 51.53,
    unit: "kg CO2-e/GJ",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 5 Direct (Scope 1) emission factors for the consumption of gaseous fuels including liquefied natural gas",
      row: "Natural gas distributed in a pipeline",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "16",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    }
  },
  diesel_litre: {
    value: 2.70972,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Diesel oil",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "20",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    },
    derivation: "38.6 x 70.20 = 2709.72 kg CO2-e/kL; / 1,000 = 2.70972 kg CO2-e/L (computed here; the 2023 PDF does not print a per-unit combined figure): energy content x combined Scope 1 factor, both printed on the row; the 2023 PDF prints no per-unit figure (the 2025 workbook prints the same product)"
  },
  propane_litre: {
    value: 1.55742,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Liquefied petroleum gas (LPG)",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "21",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    },
    derivation: "25.7 x 60.60 = 1557.42 kg CO2-e/kL; / 1,000 = 1.55742 kg CO2-e/L (computed here; the 2023 PDF does not print a per-unit combined figure): energy content x combined Scope 1 factor, both printed on the row; the 2023 PDF prints no per-unit figure (the 2025 workbook prints the same product)"
  },
  fuel_oil_distillate_litre: {
    value: 2.600929,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Heating oil",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "20",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    },
    derivation: "37.3 x 69.73 = 2600.929 kg CO2-e/kL; / 1,000 = 2.600929 kg CO2-e/L (computed here; the 2023 PDF does not print a per-unit combined figure): energy content x combined Scope 1 factor, both printed on the row; the 2023 PDF prints no per-unit figure (the 2025 workbook prints the same product)"
  },
  fuel_oil_residual_litre: {
    value: 2.931448,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2023) National Greenhouse Accounts Factors 2023 (national-greenhouse-account-factors-2023.pdf; \"August 2023\", cover)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Fuel oil",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "20",
      correction: "the August 2023 publication (no correction recorded; section 1.2: the factors replace those of the 2022 workbook)"
    },
    derivation: "39.7 x 73.84 = 2931.448 kg CO2-e/kL; / 1,000 = 2.931448 kg CO2-e/L (computed here; the 2023 PDF does not print a per-unit combined figure): energy content x combined Scope 1 factor, both printed on the row; the 2023 PDF prints no per-unit figure (the 2025 workbook prints the same product)"
  }
} as Record<string, CitedValue>,
} as const
