// lib/ghg/factors/mfe-2026v2-grid.ts
//
// T3d (reporting year 2024), Lisa's ruling 2 (8 Oct 2026): New Zealand grid electricity (Scope 2, GRID_EF.NZ), the series
// rows of the MfE 2026 v2 workbook, keyed by the year of the row (class (b)), as printed. Until T3d 2024 they were held
// rounded to three significant figures (0.0766, 0.0994, 0.0787); they are now the printed values, cited to the cell, as was
// ruled for T&D 2025. Read cell by cell from ~/themisiq-sources/mfe/emission_factors_2026_v2.xlsx, sheet "data", each row's
// section, label, unit and gas checked.

import type { CitedValue } from './types'

export const MFE_GRID_2026V2: Readonly<Record<number, CitedValue>> = {
  "2023": {
    value: 0.0765687,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "MfE Measuring Emissions emission factors 2026 v2 (emission_factors_2026_v2.xlsx, release 2026.2)",
      table: "Purchased Electricity, Heat, and Steam / Purchased Electricity",
      row: "Annual Averages, Electricity Used - 2023 (kWh)",
      column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
      cell: "data!J1600",
      correction: "release 2026.2 (the 29 May 2026 correction, which concerned waste factors); held rounded as 0.0766 until T3d 2024"
    }
  },
  "2024": {
    value: 0.0993596,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "MfE Measuring Emissions emission factors 2026 v2 (emission_factors_2026_v2.xlsx, release 2026.2)",
      table: "Purchased Electricity, Heat, and Steam / Purchased Electricity",
      row: "Annual Averages, Electricity Used - 2024 (kWh)",
      column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
      cell: "data!J1604",
      correction: "release 2026.2 (the 29 May 2026 correction, which concerned waste factors); held rounded as 0.0994 until T3d 2024"
    }
  },
  "2025": {
    value: 0.0786625,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "MfE Measuring Emissions emission factors 2026 v2 (emission_factors_2026_v2.xlsx, release 2026.2)",
      table: "Purchased Electricity, Heat, and Steam / Purchased Electricity",
      row: "Annual Averages, Electricity Used - 2025 (kWh)",
      column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
      cell: "data!J1608",
      correction: "release 2026.2 (the 29 May 2026 correction, which concerned waste factors); held rounded as 0.0787 until T3d 2024"
    }
  }
}
