// lib/ghg/factors/desnz-2023.ts
//
// T3d (reporting year 2025): DEFRA/DESNZ 2023 grid electricity, stationary combustion and district heat, transcribed
// cell by cell from ~/themisiq-sources/defra/ghg-conversion-factors-2023-full-file-update.xlsx (v1.1) by a script that checks
// each row's labels and each column header before reading the value. Same rows and columns as the held 2026 values in
// lib/ghg/engine.ts (EF_UK, GRID_EF.UK, STEAM_EF.UK): kg CO2e per unit, the gases combined by DESNZ on AR5, as published.
// ⚠️ THE 2023 WORKBOOK STORES ITS TOTALS UNROUNDED. Unlike 2024 to 2026, whose cells hold five-decimal figures, the 2023
// full set stores each total (column D, and the electricity and heat rows) as an unrounded formula result, the sum of the
// CO2, CH4 and N2O columns, and DISPLAYS it at the cell number format: two decimals for Fuels column D ("??0.00"),
// up to five or six for the electricity and heat rows. The value held is the cell's stored value, read by script; the
// two-decimal display is a format, not a figure DESNZ prints elsewhere, and no rounding of ours is applied. (Ruling
// requested in the T3d 2024 report.)
// Fleet fuel from the same Fuels rows is in lib/emissionFactors/mobile/defra2023.ts; Category 3 upstream factors are
// lib/emissionFactors/defraEnergy2023.json.

import type { CitedValue } from './types'

export const DESNZ_2023 = {
  edition: 'DEFRA 2023',
  citation: 'UK DEFRA/DESNZ (2023) GHG Conversion Factors for Company Reporting',
  sourceFile: 'defra/ghg-conversion-factors-2023-full-file-update.xlsx',
  correction: "Version 1.1, the update of 28 Jun 2023 (a small number of factors updated; Passenger vehicles X45: unknown and plug-in hybrid factors converted to AR5)",
  combustion: {
  natural_gas_kwh: {
    value: 0.18292892617449666,
    unit: "kg CO2e/kWh (Gross CV)",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2023, full set (v1.1)",
      table: "Fuels",
      row: "Natural gas, kWh (Gross CV)",
      column: "kg CO2e",
      cell: "Fuels!D42",
      correction: "Version 1.1, the update of 28 Jun 2023 (a small number of factors updated; Passenger vehicles X45: unknown and plug-in hybrid factors converted to AR5)"
    }
  },
  natural_gas_m3: {
    value: 2.038390310067114,
    unit: "kg CO2e/m3",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2023, full set (v1.1)",
      table: "Fuels",
      row: "Natural gas, cubic metres",
      column: "kg CO2e",
      cell: "Fuels!D40",
      correction: "Version 1.1, the update of 28 Jun 2023 (a small number of factors updated; Passenger vehicles X45: unknown and plug-in hybrid factors converted to AR5)"
    }
  },
  propane_litre: {
    value: 1.543577598657718,
    unit: "kg CO2e/litre",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2023, full set (v1.1)",
      table: "Fuels",
      row: "Propane, litres",
      column: "kg CO2e",
      cell: "Fuels!D52",
      correction: "Version 1.1, the update of 28 Jun 2023 (a small number of factors updated; Passenger vehicles X45: unknown and plug-in hybrid factors converted to AR5)"
    }
  },
  propane_kg: {
    value: 2.99763233422819,
    unit: "kg CO2e/kg",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2023, full set (v1.1)",
      table: "Fuels",
      row: "Propane, tonnes",
      column: "kg CO2e",
      cell: "Fuels!D51",
      correction: "Version 1.1, the update of 28 Jun 2023 (a small number of factors updated; Passenger vehicles X45: unknown and plug-in hybrid factors converted to AR5)"
    },
    derivation: "per tonne / 1,000, exact: 2997.632334228188 kg CO2e per tonne"
  },
  diesel_litre: {
    value: 2.5120638845637586,
    unit: "kg CO2e/litre",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2023, full set (v1.1)",
      table: "Fuels",
      row: "Diesel (average biofuel blend), litres",
      column: "kg CO2e",
      cell: "Fuels!D72",
      correction: "Version 1.1, the update of 28 Jun 2023 (a small number of factors updated; Passenger vehicles X45: unknown and plug-in hybrid factors converted to AR5)"
    }
  },
  fuel_oil_distillate_litre: {
    value: 2.75540897852349,
    unit: "kg CO2e/litre",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2023, full set (v1.1)",
      table: "Fuels",
      row: "Processed fuel oils - distillate oil, litres",
      column: "kg CO2e",
      cell: "Fuels!D108",
      correction: "Version 1.1, the update of 28 Jun 2023 (a small number of factors updated; Passenger vehicles X45: unknown and plug-in hybrid factors converted to AR5)"
    }
  },
  fuel_oil_residual_litre: {
    value: 3.1749249825503356,
    unit: "kg CO2e/litre",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2023, full set (v1.1)",
      table: "Fuels",
      row: "Processed fuel oils - residual oil, litres",
      column: "kg CO2e",
      cell: "Fuels!D104",
      correction: "Version 1.1, the update of 28 Jun 2023 (a small number of factors updated; Passenger vehicles X45: unknown and plug-in hybrid factors converted to AR5)"
    }
  }
} as Record<string, CitedValue>,
  steam_kwh: {
  value: 0.17964657181208055,
  unit: "kg CO2e/kWh",
  cite: {
    document: "UK Government GHG Conversion Factors for Company Reporting 2023, full set (v1.1)",
    table: "Heat and steam",
    row: "Heat and steam, District heat and steam, kWh",
    column: "kg CO2e",
    cell: "Heat and steam!E22",
    correction: "Version 1.1, the update of 28 Jun 2023 (a small number of factors updated; Passenger vehicles X45: unknown and plug-in hybrid factors converted to AR5)"
  }
} as CitedValue,
  grid_uk: {
  value: 0.20707428859060403,
  unit: "kg CO2e/kWh",
  cite: {
    document: "UK Government GHG Conversion Factors for Company Reporting 2023, full set (v1.1)",
    table: "UK electricity",
    row: "Electricity generated, Electricity: UK, kWh",
    column: "kg CO2e",
    cell: "UK electricity!E24",
    correction: "Version 1.1, the update of 28 Jun 2023 (a small number of factors updated; Passenger vehicles X45: unknown and plug-in hybrid factors converted to AR5)"
  }
} as CitedValue,
} as const
