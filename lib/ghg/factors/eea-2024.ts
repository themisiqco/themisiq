// lib/ghg/factors/eea-2024.ts
//
// T3d (reporting year 2025): EEA "Greenhouse gas emission intensity of electricity generation", country level, data year
// 2024, for location-based Scope 2 in EU member states (GRID_EF.EU_*). Read by a script from
// ~/themisiq-sources/eea/EEA-ghg-intensity-electricity-generation-country-level-2024.csv, the export of the chart at
// https://www.eea.europa.eu/en/analysis/indicators/greenhouse-gas-emission-intensity-of-1/greenhouse-gas-emission-intensity-of-electricity-generation
// ("Temporal coverage 1990-2024", "Published 06 Nov 2025", "Modified 10 Jul 2026").
//
// ⚠️ THE COMMA-SEPARATED BLOCK ONLY. The export holds two series: a comma-separated block (35 values, 1990 to 2024, then
// the country) and a semicolon-separated block, an earlier version with several truncated rows, which is ignored
// entirely. The row labelled "#N/A" is the EU-27 aggregate and is NOT loaded (Lisa's ruling, 8 Oct 2026); its values
// (1990 501, 2023 206, 2024 183) reproduce the indicator page's sentence "In 2024, the EU's electricity sector
// was 63% less GHG intensive than it was in 1990 and 11% less than in 2023": 1 - 183/501 = 63.5%, 1 - 183/206 = 11.2%.
// g CO2e/kWh as printed, / 1,000 = kg CO2e/kWh, the unit GRID_EF holds. This edition's 2023 column revises the EEA 2023
// edition's values; those are not loaded here (EEA 2023 stays the edition for data year 2023).

import type { CitedValue } from './types'

export const EEA_2024: Readonly<Record<string, CitedValue>> = {
  EU_SE: {
    value: 0.006,
    unit: "kg CO2e/kWh",
    derivation: "6 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Sweden",
      column: "2024",
      page: "CSV line 14",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_FI: {
    value: 0.027,
    unit: "kg CO2e/kWh",
    derivation: "27 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Finland",
      column: "2024",
      page: "CSV line 15",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_LU: {
    value: 0.035,
    unit: "kg CO2e/kWh",
    derivation: "35 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Luxembourg",
      column: "2024",
      page: "CSV line 16",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_FR: {
    value: 0.036,
    unit: "kg CO2e/kWh",
    derivation: "36 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "France",
      column: "2024",
      page: "CSV line 17",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_AT: {
    value: 0.053,
    unit: "kg CO2e/kWh",
    derivation: "53 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Austria",
      column: "2024",
      page: "CSV line 18",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_SK: {
    value: 0.059,
    unit: "kg CO2e/kWh",
    derivation: "59 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Slovakia",
      column: "2024",
      page: "CSV line 19",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_LT: {
    value: 0.061,
    unit: "kg CO2e/kWh",
    derivation: "61 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Lithuania",
      column: "2024",
      page: "CSV line 20",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_DK: {
    value: 0.064,
    unit: "kg CO2e/kWh",
    derivation: "64 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Denmark",
      column: "2024",
      page: "CSV line 21",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_LV: {
    value: 0.075,
    unit: "kg CO2e/kWh",
    derivation: "75 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Latvia",
      column: "2024",
      page: "CSV line 22",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_PT: {
    value: 0.082,
    unit: "kg CO2e/kWh",
    derivation: "82 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Portugal",
      column: "2024",
      page: "CSV line 23",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_HR: {
    value: 0.098,
    unit: "kg CO2e/kWh",
    derivation: "98 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Croatia",
      column: "2024",
      page: "CSV line 24",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_ES: {
    value: 0.125,
    unit: "kg CO2e/kWh",
    derivation: "125 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Spain",
      column: "2024",
      page: "CSV line 25",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_HU: {
    value: 0.127,
    unit: "kg CO2e/kWh",
    derivation: "127 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Hungary",
      column: "2024",
      page: "CSV line 26",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_BE: {
    value: 0.155,
    unit: "kg CO2e/kWh",
    derivation: "155 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Belgium",
      column: "2024",
      page: "CSV line 27",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_SI: {
    value: 0.175,
    unit: "kg CO2e/kWh",
    derivation: "175 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Slovenia",
      column: "2024",
      page: "CSV line 28",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_RO: {
    value: 0.188,
    unit: "kg CO2e/kWh",
    derivation: "188 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Romania",
      column: "2024",
      page: "CSV line 30",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_IT: {
    value: 0.206,
    unit: "kg CO2e/kWh",
    derivation: "206 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Italy",
      column: "2024",
      page: "CSV line 31",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_IE: {
    value: 0.237,
    unit: "kg CO2e/kWh",
    derivation: "237 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Ireland",
      column: "2024",
      page: "CSV line 32",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_NL: {
    value: 0.245,
    unit: "kg CO2e/kWh",
    derivation: "245 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Netherlands",
      column: "2024",
      page: "CSV line 33",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_BG: {
    value: 0.248,
    unit: "kg CO2e/kWh",
    derivation: "248 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Bulgaria",
      column: "2024",
      page: "CSV line 34",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_DE: {
    value: 0.291,
    unit: "kg CO2e/kWh",
    derivation: "291 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Germany",
      column: "2024",
      page: "CSV line 35",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_EL: {
    value: 0.304,
    unit: "kg CO2e/kWh",
    derivation: "304 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Greece",
      column: "2024",
      page: "CSV line 36",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_MT: {
    value: 0.337,
    unit: "kg CO2e/kWh",
    derivation: "337 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Malta",
      column: "2024",
      page: "CSV line 37",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_CZ: {
    value: 0.338,
    unit: "kg CO2e/kWh",
    derivation: "338 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Czechia",
      column: "2024",
      page: "CSV line 38",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_EE: {
    value: 0.384,
    unit: "kg CO2e/kWh",
    derivation: "384 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Estonia",
      column: "2024",
      page: "CSV line 39",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_CY: {
    value: 0.561,
    unit: "kg CO2e/kWh",
    derivation: "561 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Cyprus",
      column: "2024",
      page: "CSV line 40",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  },
  EU_PL: {
    value: 0.566,
    unit: "kg CO2e/kWh",
    derivation: "566 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Poland",
      column: "2024",
      page: "CSV line 41",
      correction: "the indicator as modified 10 Jul 2026 (the corrected values; checked against the live EEA chart by Lisa on 8 Oct 2026)"
    }
  }
}
