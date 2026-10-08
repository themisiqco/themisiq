// lib/ghg/factors/desnz-2025.ts
//
// T3d (reporting year 2025): DEFRA/DESNZ 2025 grid electricity, stationary combustion and district heat, transcribed
// cell by cell from ~/themisiq-sources/defra/ghg-conversion-factors-2025-full-set.xlsx (v1) by a script that checks
// each row's labels and each column header before reading the value. Same rows and columns as the held 2026 values in
// lib/ghg/engine.ts (EF_UK, GRID_EF.UK, STEAM_EF.UK): kg CO2e per unit, the gases combined by DESNZ on AR5, as published.
// Fleet fuel from the same Fuels rows is in lib/emissionFactors/mobile/defra2025.ts; Category 3 upstream factors are
// lib/emissionFactors/defraEnergy2025.json.

import type { CitedValue } from './types'

export const DESNZ_2025 = {
  edition: 'DEFRA 2025',
  citation: 'UK DEFRA/DESNZ (2025) GHG Conversion Factors for Company Reporting',
  sourceFile: 'defra/ghg-conversion-factors-2025-full-set.xlsx',
  correction: "Version 1, the original publication (no correction recorded)",
  combustion: {
  natural_gas_kwh: {
    value: 0.18296,
    unit: "kg CO2e/kWh (Gross CV)",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2025, full set (v1)",
      table: "Fuels",
      row: "Natural gas, kWh (Gross CV)",
      column: "kg CO2e",
      cell: "Fuels!D42",
      correction: "Version 1, the original publication (no correction recorded)"
    }
  },
  natural_gas_m3: {
    value: 2.06672,
    unit: "kg CO2e/m3",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2025, full set (v1)",
      table: "Fuels",
      row: "Natural gas, cubic metres",
      column: "kg CO2e",
      cell: "Fuels!D40",
      correction: "Version 1, the original publication (no correction recorded)"
    }
  },
  propane_litre: {
    value: 1.54358,
    unit: "kg CO2e/litre",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2025, full set (v1)",
      table: "Fuels",
      row: "Propane, litres",
      column: "kg CO2e",
      cell: "Fuels!D52",
      correction: "Version 1, the original publication (no correction recorded)"
    }
  },
  propane_kg: {
    value: 2.99763233,
    unit: "kg CO2e/kg",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2025, full set (v1)",
      table: "Fuels",
      row: "Propane, tonnes",
      column: "kg CO2e",
      cell: "Fuels!D51",
      correction: "Version 1, the original publication (no correction recorded)"
    },
    derivation: "per tonne / 1,000, exact: 2997.63233 kg CO2e per tonne"
  },
  diesel_litre: {
    value: 2.57082,
    unit: "kg CO2e/litre",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2025, full set (v1)",
      table: "Fuels",
      row: "Diesel (average biofuel blend), litres",
      column: "kg CO2e",
      cell: "Fuels!D72",
      correction: "Version 1, the original publication (no correction recorded)"
    }
  },
  fuel_oil_distillate_litre: {
    value: 2.75541,
    unit: "kg CO2e/litre",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2025, full set (v1)",
      table: "Fuels",
      row: "Processed fuel oils - distillate oil, litres",
      column: "kg CO2e",
      cell: "Fuels!D108",
      correction: "Version 1, the original publication (no correction recorded)"
    }
  },
  fuel_oil_residual_litre: {
    value: 3.17492,
    unit: "kg CO2e/litre",
    cite: {
      document: "UK Government GHG Conversion Factors for Company Reporting 2025, full set (v1)",
      table: "Fuels",
      row: "Processed fuel oils - residual oil, litres",
      column: "kg CO2e",
      cell: "Fuels!D104",
      correction: "Version 1, the original publication (no correction recorded)"
    }
  }
} as Record<string, CitedValue>,
  steam_kwh: {
  value: 0.17529,
  unit: "kg CO2e/kWh",
  cite: {
    document: "UK Government GHG Conversion Factors for Company Reporting 2025, full set (v1)",
    table: "Heat and steam",
    row: "Heat and steam, District heat and steam, kWh",
    column: "kg CO2e",
    cell: "Heat and steam!E22",
    correction: "Version 1, the original publication (no correction recorded)"
  }
} as CitedValue,
  grid_uk: {
  value: 0.177,
  unit: "kg CO2e/kWh",
  cite: {
    document: "UK Government GHG Conversion Factors for Company Reporting 2025, full set (v1)",
    table: "UK electricity",
    row: "Electricity generated, Electricity: UK, kWh",
    column: "kg CO2e",
    cell: "UK electricity!E26",
    correction: "Version 1, the original publication (no correction recorded)"
  }
} as CitedValue,
} as const
