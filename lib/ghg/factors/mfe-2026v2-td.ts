// lib/ghg/factors/mfe-2026v2-td.ts
//
// T3d: New Zealand electricity transmission and distribution losses (Scope 3 Category 3), the series rows of the MfE
// 2026 v2 workbook that lib/ghg/engine.ts NZ_TD_LOSS prices, keyed by the year of the row (class (b), data year). Read
// cell by cell from ~/themisiq-sources/mfe/emission_factors_2026_v2.xlsx, sheet "data", each row's section, label, unit
// and gas checked. The 2025 row was held as 0.00596 until T3d, rounded from the printed 0.00595616; it is now as printed.
// The 2023 row is not held (no reporting year 2025 window needs it).

import type { CitedValue } from './types'

export const MFE_TD_2026V2: Readonly<Record<number, CitedValue>> = {
  "2024": {
    value: 0.00752331,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "MfE Measuring Emissions emission factors 2026 v2 (emission_factors_2026_v2.xlsx, release 2026.2)",
      table: "Purchased Electricity, Heat, and Steam / Transmission and distribution losses",
      row: "Electricity Consumption, Electricity Used - 2024 (kWh)",
      column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
      cell: "data!J1708",
      correction: "release 2026.2 (the 29 May 2026 correction, which concerned waste factors)"
    }
  },
  "2025": {
    value: 0.00595616,
    unit: "kg CO2-e/kWh",
    cite: {
      document: "MfE Measuring Emissions emission factors 2026 v2 (emission_factors_2026_v2.xlsx, release 2026.2)",
      table: "Purchased Electricity, Heat, and Steam / Transmission and distribution losses",
      row: "Electricity Consumption, Electricity Used - 2025 (kWh)",
      column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
      cell: "data!J1712",
      correction: "release 2026.2 (the 29 May 2026 correction, which concerned waste factors)"
    },
    derivation: "MfE marks this value \"Calculated using the latest observed T&D\" (data!H1709:H1712), not observed"
  }
}
