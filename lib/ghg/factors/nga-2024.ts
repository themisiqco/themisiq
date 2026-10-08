// lib/ghg/factors/nga-2024.ts
//
// T3d (reporting year 2025): DCCEEW National Greenhouse Accounts Factors 2024, Scope 2 electricity by state (Table 1),
// the national Residual Mix Factor (Table 2) and stationary combustion (Tables 5 and 8), transcribed from
// ~/themisiq-sources/nga/national-greenhouse-account-factors-2024.pdf, page by page. Same keys as the held 2025 values
// in lib/ghg/engine.ts (GRID_EF.AU_*, RESIDUAL_AU, EF_AU), kg CO2-e per unit, the gases combined by NGA on AR5.
//
// ⚠️ THE PER-UNIT COMBUSTION FIGURES ARE A PRODUCT OF TWO PRINTED NUMBERS, NOT A PRINTED FIGURE. The 2025 edition's
// workbook prints NGA's own per-unit column (energy content x combined factor); 2024 is held as a PDF only, which prints
// the energy content and the per-GJ factor on the row and not their product. Each value carries that derivation, both
// inputs are on the cited row, and every product equals the 2025 figure. natural_gas_gj is NGA's own per-GJ figure.
// Grid mapping as GRID_EF: ACT shares the NSW row, WA is SWIS, NT is DKIS, AU_AVG is "National" (Table 1 notes,
// p. 9: "Data are for financial years ending in June.").

import type { CitedValue } from './types'

export const NGA_2024 = {
  edition: 'DCCEEW NGA 2024',
  citation: 'DCCEEW NGA 2024 (AR5)',
  sourceFile: 'nga/national-greenhouse-account-factors-2024.pdf',
  correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")",
  grid: {
  AU_NSW: {
    value: 0.66,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity",
      row: "New South Wales and Australian Capital Territory",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "8",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    }
  },
  AU_VIC: {
    value: 0.77,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity",
      row: "Victoria",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "8",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    }
  },
  AU_QLD: {
    value: 0.71,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity",
      row: "Queensland",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "9",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    }
  },
  AU_SA: {
    value: 0.23,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity",
      row: "South Australia",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "9",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    }
  },
  AU_WA: {
    value: 0.51,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity",
      row: "Western Australia - South West Interconnected System (SWIS)",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "9",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    }
  },
  AU_TAS: {
    value: 0.15,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity",
      row: "Tasmania",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "9",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    }
  },
  AU_NT: {
    value: 0.56,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity",
      row: "Northern territory - Darwin Katherine Interconnected System (DKIS)",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "9",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    }
  },
  AU_AVG: {
    value: 0.63,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity",
      row: "National",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      page: "9",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    }
  }
} as Record<string, CitedValue>,
  residual: {
  value: 0.81,
  unit: "kg CO2-e/kWh",
  cite: {
    document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
    table: "Table 2 Indirect (scope 2 and scope 3) emission factors from consumption of purchased or acquired electricity: market-based factors",
    row: "National",
    column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
    page: "9",
    correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
  }
} as CitedValue,
  combustion: {
  natural_gas_m3: {
    value: 2.025129,
    unit: "kg CO2-e/m3",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 5 Direct (Scope 1) emission factors for the consumption of gaseous fuels including liquefied natural gas",
      row: "Natural gas distributed in a pipeline",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "17",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    },
    derivation: "0.0393 x 51.53 = 2.025129 kg CO2-e/m3: energy content x combined Scope 1 factor, both printed on the row; the 2024 PDF prints no per-unit figure (the 2025 workbook prints the same product)"
  },
  natural_gas_gj: {
    value: 51.53,
    unit: "kg CO2-e/GJ",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 5 Direct (Scope 1) emission factors for the consumption of gaseous fuels including liquefied natural gas",
      row: "Natural gas distributed in a pipeline",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "17",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    }
  },
  diesel_litre: {
    value: 2.70972,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Diesel oil",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "21",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    },
    derivation: "38.6 x 70.20 = 2709.72 kg CO2-e/kL; / 1,000 = 2.70972 kg CO2-e/L: energy content x combined Scope 1 factor, both printed on the row; the 2024 PDF prints no per-unit figure (the 2025 workbook prints the same product)"
  },
  propane_litre: {
    value: 1.55742,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Liquefied petroleum gas (LPG)",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "22",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    },
    derivation: "25.7 x 60.60 = 1557.42 kg CO2-e/kL; / 1,000 = 1.55742 kg CO2-e/L: energy content x combined Scope 1 factor, both printed on the row; the 2024 PDF prints no per-unit figure (the 2025 workbook prints the same product)"
  },
  fuel_oil_distillate_litre: {
    value: 2.600929,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Heating oil",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "21",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    },
    derivation: "37.3 x 69.73 = 2600.929 kg CO2-e/kL; / 1,000 = 2.600929 kg CO2-e/L: energy content x combined Scope 1 factor, both printed on the row; the 2024 PDF prints no per-unit figure (the 2025 workbook prints the same product)"
  },
  fuel_oil_residual_litre: {
    value: 2.931448,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2024) National Greenhouse Accounts Factors 2024 (national-greenhouse-account-factors-2024.pdf; \"Canberra, August\", p. 2)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Fuel oil",
      column: "Energy Content factor; Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      page: "21",
      correction: "the August 2024 publication (no correction recorded; p. 7: the factors \"replace those listed in the 2023 NGA Factors Workbook\")"
    },
    derivation: "39.7 x 73.84 = 2931.448 kg CO2-e/kL; / 1,000 = 2.931448 kg CO2-e/L: energy content x combined Scope 1 factor, both printed on the row; the 2024 PDF prints no per-unit figure (the 2025 workbook prints the same product)"
  }
} as Record<string, CitedValue>,
} as const
