// lib/ghg/factors/nga-2026.ts
//
// T3d (reporting year 2026): DCCEEW National Greenhouse Accounts Factors 2026, Scope 2 electricity by state (Table 1),
// the national Residual Mix Factor (Table 2) and stationary combustion (Tables 5 and 8), read cell by cell from
// ~/themisiq-sources/nga/national-greenhouse-accounts-factors-2026.xlsx and checked against the PDF of the same edition
// (109 cells compared; none disagrees). Same keys as the held 2025 values in lib/ghg/engine.ts (GRID_EF.AU_*, RESIDUAL_AU,
// EF_AU), kg CO2-e per unit, the gases combined by NGA on AR5. Like 2025 (and unlike the PDF-only 2023 and 2024), the
// per-unit combustion figures are NGA's own printed column ('Energy - Scope 1 ' sheet, energy content x combined factor);
// the PDF prints their inputs, which match. Every Scope 2 electricity value moved from 2025; combustion did not.
// The p. 2 attribution reads "Canberra, August"; the file properties are dated 6 to 7 October 2026 (registry note).

import type { CitedValue } from './types'

export const NGA_2026 = {
  edition: 'DCCEEW NGA 2026',
  citation: 'DCCEEW NGA 2026 (AR5)',
  sourceFile: 'nga/national-greenhouse-accounts-factors-2026.xlsx',
  correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)",
  grid: {
  AU_NSW: {
    value: 0.6,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) location-based emission factors associated with the consumption and losses of purchased or acquired electricity",
      row: "New South Wales and Australian Capital Territory",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      cell: "'Table 1'!B4",
      page: "10",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    }
  },
  AU_VIC: {
    value: 0.74,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) location-based emission factors associated with the consumption and losses of purchased or acquired electricity",
      row: "Victoria",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      cell: "'Table 1'!B5",
      page: "10",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    }
  },
  AU_QLD: {
    value: 0.65,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) location-based emission factors associated with the consumption and losses of purchased or acquired electricity",
      row: "Queensland",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      cell: "'Table 1'!B6",
      page: "10",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    }
  },
  AU_SA: {
    value: 0.21,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) location-based emission factors associated with the consumption and losses of purchased or acquired electricity",
      row: "South Australia",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      cell: "'Table 1'!B7",
      page: "10",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    }
  },
  AU_WA: {
    value: 0.45,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) location-based emission factors associated with the consumption and losses of purchased or acquired electricity",
      row: "Western Australia - South West Interconnected System (SWIS)",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      cell: "'Table 1'!B8",
      page: "10",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    }
  },
  AU_TAS: {
    value: 0.21,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) location-based emission factors associated with the consumption and losses of purchased or acquired electricity",
      row: "Tasmania",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      cell: "'Table 1'!B10",
      page: "10",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    }
  },
  AU_NT: {
    value: 0.55,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) location-based emission factors associated with the consumption and losses of purchased or acquired electricity",
      row: "Northern territory - Darwin Katherine Interconnected System (DKIS)",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      cell: "'Table 1'!B11",
      page: "10",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    }
  },
  AU_AVG: {
    value: 0.59,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 1 Indirect (scope 2 and scope 3) location-based emission factors associated with the consumption and losses of purchased or acquired electricity",
      row: "National",
      column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
      cell: "'Table 1'!B12",
      page: "10",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    }
  }
} as Record<string, CitedValue>,
  residual: {
  value: 0.79,
  unit: "kg CO2-e/kWh",
  cite: {
    document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
    table: "Table 2 Indirect (scope 2 and scope 3) market-based emission factors associated with the consumption and losses of purchased or acquired electricity",
    row: "National",
    column: "Scope 2 Emission Factors (kg CO2-e/kWh)",
    cell: "'Table 2'!B4",
    page: "11",
    correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
  }
} as CitedValue,
  combustion: {
  natural_gas_m3: {
    value: 2.025129,
    unit: "kg CO2-e/m3",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 5 Direct (Scope 1) emission factors for the consumption of gaseous fuels including liquefied natural gas",
      row: "Natural gas distributed in a pipeline",
      column: "Energy - Scope 1 sheet, kg CO2-e/m3 (energy content x combined factor, NGA's own column)",
      cell: "'Energy - Scope 1 '!I26",
      page: "19",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    },
    derivation: "Workbook \"Energy - Scope 1\" prints 2.025129 kg CO2-e/m3 ('Energy - Scope 1 '!I26, formula =G26*F26: 0.0393 GJ/m3 x 51.53). The PDF table prints only the inputs, which equal the workbook's; their product 0.0393 x 51.53 = 2.025129 agrees."
  },
  natural_gas_gj: {
    value: 51.53,
    unit: "kg CO2-e/GJ",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 5 Direct (Scope 1) emission factors for the consumption of gaseous fuels including liquefied natural gas",
      row: "Natural gas distributed in a pipeline",
      column: "Scope 1 Emission Factor (kg CO2-e/GJ), Combined gases",
      cell: "'Table 5'!F5",
      page: "19",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    }
  },
  diesel_litre: {
    value: 2.70972,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Diesel oil",
      column: "Energy - Scope 1 sheet, kg CO2-e/kL (energy content x combined factor, NGA's own column)",
      cell: "'Energy - Scope 1 '!I48",
      page: "24",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    },
    derivation: "Workbook \"Energy - Scope 1\" prints 2709.72 kg CO2-e/kL ('Energy - Scope 1 '!I48, formula =G48*F48: 38.6 GJ/kL x 70.2); per litre is per kL / 1,000 = 2.70972. The PDF table prints only the inputs (energy content and per-GJ factors), which equal the workbook's; their product 38.6 x 70.20 = 2709.72 agrees."
  },
  propane_litre: {
    value: 1.55742,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Liquefied petroleum gas (LPG)",
      column: "Energy - Scope 1 sheet, kg CO2-e/kL (energy content x combined factor, NGA's own column)",
      cell: "'Energy - Scope 1 '!I52",
      page: "24",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    },
    derivation: "Workbook \"Energy - Scope 1\" prints 1557.42 kg CO2-e/kL ('Energy - Scope 1 '!I52, formula =G52*F52: 25.7 GJ/kL x 60.6); per litre is per kL / 1,000 = 1.55742. The PDF table prints only the inputs (energy content and per-GJ factors), which equal the workbook's; their product 25.7 x 60.60 = 1557.42 agrees."
  },
  fuel_oil_distillate_litre: {
    value: 2.600929,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Heating oil",
      column: "Energy - Scope 1 sheet, kg CO2-e/kL (energy content x combined factor, NGA's own column)",
      cell: "'Energy - Scope 1 '!I47",
      page: "24",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    },
    derivation: "Workbook \"Energy - Scope 1\" prints 2600.929 kg CO2-e/kL ('Energy - Scope 1 '!I47, formula =G47*F47: 37.3 GJ/kL x 69.73); per litre is per kL / 1,000 = 2.600929. The PDF table prints only the inputs (energy content and per-GJ factors), which equal the workbook's; their product 37.3 x 69.73 = 2600.929 agrees."
  },
  fuel_oil_residual_litre: {
    value: 2.931448,
    unit: "kg CO2-e/L",
    cite: {
      document: "DCCEEW (2026) National Greenhouse Accounts Factors 2026 (national-greenhouse-accounts-factors-2026.xlsx and .pdf; \"Canberra, August\", p. 2)",
      table: "Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes",
      row: "Fuel oil",
      column: "Energy - Scope 1 sheet, kg CO2-e/kL (energy content x combined factor, NGA's own column)",
      cell: "'Energy - Scope 1 '!I49",
      page: "24",
      correction: "the 2026 publication (no correction recorded; section 1.2, p. 8: the factors replace those of NGA 2025)"
    },
    derivation: "Workbook \"Energy - Scope 1\" prints 2931.448 kg CO2-e/kL ('Energy - Scope 1 '!I49, formula =G49*F49: 39.7 GJ/kL x 73.84); per litre is per kL / 1,000 = 2.931448. The PDF table prints only the inputs (energy content and per-GJ factors), which equal the workbook's; their product 39.7 x 73.84 = 2931.448 agrees."
  }
} as Record<string, CitedValue>,
} as const
