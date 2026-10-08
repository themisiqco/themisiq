// lib/ghg/factors/eea-2023.ts
//
// T3d (reporting year 2024), Lisa's ruling 1 (8 Oct 2026): EEA data year 2023, REVISED. The values are the 2023 column of
// the comma-separated block of ~/themisiq-sources/eea/EEA-ghg-intensity-electricity-generation-country-level-2024.csv,
// read by script. They replace the values held from EEA-ghg-intensity-electricity-generation-country-level.csv, whose
// sources were the April 2024 submission plus EEA's approximated 2023 estimates; the 2024 file is the final inventory, so
// this is a correction of data year 2023 (published 6 Nov 2025) that affects values. Each citation records the superseded
// value and its source. Every one of the 27 member states changed. The EU-27 row ("#N/A") is not loaded, so EU_AVG holds
// no 2023 value, as it holds no 2024 one: an EU_AVG line for a window that takes data year 2023 is an unpriced line.

import type { CitedValue } from './types'

export const EEA_2023_REVISED: Readonly<Record<string, CitedValue>> = {
  EU_SE: {
    value: 0.007,
    unit: "kg CO2e/kWh",
    derivation: "7 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Sweden",
      column: "2023",
      page: "CSV line 14",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 8 g CO2e/kWh (0.008 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 42, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_FI: {
    value: 0.033,
    unit: "kg CO2e/kWh",
    derivation: "33 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Finland",
      column: "2023",
      page: "CSV line 15",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 40 g CO2e/kWh (0.04 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 41, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_LU: {
    value: 0.038,
    unit: "kg CO2e/kWh",
    derivation: "38 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Luxembourg",
      column: "2023",
      page: "CSV line 16",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 56 g CO2e/kWh (0.056 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 39, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_FR: {
    value: 0.047,
    unit: "kg CO2e/kWh",
    derivation: "47 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "France",
      column: "2023",
      page: "CSV line 17",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 50 g CO2e/kWh (0.05 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 40, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_AT: {
    value: 0.059,
    unit: "kg CO2e/kWh",
    derivation: "59 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Austria",
      column: "2023",
      page: "CSV line 18",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 85 g CO2e/kWh (0.085 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 36, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_SK: {
    value: 0.083,
    unit: "kg CO2e/kWh",
    derivation: "83 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Slovakia",
      column: "2023",
      page: "CSV line 19",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 84 g CO2e/kWh (0.084 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 37, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_LT: {
    value: 0.078,
    unit: "kg CO2e/kWh",
    derivation: "78 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Lithuania",
      column: "2023",
      page: "CSV line 20",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 124 g CO2e/kWh (0.124 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 33, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_DK: {
    value: 0.083,
    unit: "kg CO2e/kWh",
    derivation: "83 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Denmark",
      column: "2023",
      page: "CSV line 21",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 94 g CO2e/kWh (0.094 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 35, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_LV: {
    value: 0.068,
    unit: "kg CO2e/kWh",
    derivation: "68 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Latvia",
      column: "2023",
      page: "CSV line 22",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 67 g CO2e/kWh (0.067 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 38, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_PT: {
    value: 0.115,
    unit: "kg CO2e/kWh",
    derivation: "115 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Portugal",
      column: "2023",
      page: "CSV line 23",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 119 g CO2e/kWh (0.119 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 34, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_HR: {
    value: 0.139,
    unit: "kg CO2e/kWh",
    derivation: "139 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Croatia",
      column: "2023",
      page: "CSV line 24",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 134 g CO2e/kWh (0.134 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 32, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_ES: {
    value: 0.14,
    unit: "kg CO2e/kWh",
    derivation: "140 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Spain",
      column: "2023",
      page: "CSV line 25",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 158 g CO2e/kWh (0.158 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 29, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_HU: {
    value: 0.147,
    unit: "kg CO2e/kWh",
    derivation: "147 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Hungary",
      column: "2023",
      page: "CSV line 26",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 154 g CO2e/kWh (0.154 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 30, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_BE: {
    value: 0.15,
    unit: "kg CO2e/kWh",
    derivation: "150 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Belgium",
      column: "2023",
      page: "CSV line 27",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 145 g CO2e/kWh (0.145 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 31, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_SI: {
    value: 0.166,
    unit: "kg CO2e/kWh",
    derivation: "166 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Slovenia",
      column: "2023",
      page: "CSV line 28",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 176 g CO2e/kWh (0.176 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 28, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_RO: {
    value: 0.189,
    unit: "kg CO2e/kWh",
    derivation: "189 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Romania",
      column: "2023",
      page: "CSV line 30",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 234 g CO2e/kWh (0.234 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 25, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_IT: {
    value: 0.248,
    unit: "kg CO2e/kWh",
    derivation: "248 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Italy",
      column: "2023",
      page: "CSV line 31",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 225 g CO2e/kWh (0.225 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 26, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_IE: {
    value: 0.255,
    unit: "kg CO2e/kWh",
    derivation: "255 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Ireland",
      column: "2023",
      page: "CSV line 32",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 260 g CO2e/kWh (0.26 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 23, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_NL: {
    value: 0.255,
    unit: "kg CO2e/kWh",
    derivation: "255 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Netherlands",
      column: "2023",
      page: "CSV line 33",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 263 g CO2e/kWh (0.263 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 22, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_BG: {
    value: 0.293,
    unit: "kg CO2e/kWh",
    derivation: "293 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Bulgaria",
      column: "2023",
      page: "CSV line 34",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 281 g CO2e/kWh (0.281 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 21, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_DE: {
    value: 0.316,
    unit: "kg CO2e/kWh",
    derivation: "316 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Germany",
      column: "2023",
      page: "CSV line 35",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 329 g CO2e/kWh (0.329 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 20, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_EL: {
    value: 0.343,
    unit: "kg CO2e/kWh",
    derivation: "343 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Greece",
      column: "2023",
      page: "CSV line 36",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 258 g CO2e/kWh (0.258 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 24, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_MT: {
    value: 0.341,
    unit: "kg CO2e/kWh",
    derivation: "341 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Malta",
      column: "2023",
      page: "CSV line 37",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 342 g CO2e/kWh (0.342 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 19, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_CZ: {
    value: 0.361,
    unit: "kg CO2e/kWh",
    derivation: "361 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Czechia",
      column: "2023",
      page: "CSV line 38",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 440 g CO2e/kWh (0.44 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 18, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_EE: {
    value: 0.543,
    unit: "kg CO2e/kWh",
    derivation: "543 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Estonia",
      column: "2023",
      page: "CSV line 39",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 690 g CO2e/kWh (0.69 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 15, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_CY: {
    value: 0.575,
    unit: "kg CO2e/kWh",
    derivation: "575 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Cyprus",
      column: "2023",
      page: "CSV line 40",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 585 g CO2e/kWh (0.585 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 17, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  },
  EU_PL: {
    value: 0.595,
    unit: "kg CO2e/kWh",
    derivation: "595 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, CSV export (EEA-ghg-intensity-electricity-generation-country-level-2024.csv)",
      table: "comma-separated block (1990 to 2024, then the country)",
      row: "Poland",
      column: "2023",
      page: "CSV line 41",
      correction: "the final 2023 inventory, published 6 Nov 2025 (as modified 10 Jul 2026); supersedes 614 g CO2e/kWh (0.614 kg) from EEA-ghg-intensity-electricity-generation-country-level.csv line 16, which rested on the April 2024 submission and EEA's approximated 2023 estimates"
    }
  }
}
