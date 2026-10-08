// lib/ghg/factors/eccc-2026.ts
//
// T3d (reporting year 2025): ECCC's two 2026 publications the engine reads.
//   1. Emission factors and reference values v4.0 (9 Sep 2026), Table 5.4, provincial and territorial electricity
//      consumption intensities, re-keyed by DATA YEAR 2024 (flag C2, ruling 8.1): footnote 42 cites "ECCC. (2026). NIR
//      1990-2024, Part 3, Tables A7-2 to A7-14". The title's "for 2027" is the year ECCC says the table must be used in for
//      its offset system, which is not the selection rule here. GRID_EF.{province}[2024].
//      Printed in g CO2e/kWh and divided by 1,000: every held Table 5.1 to 5.3 value equals its printed figure / 1,000.
//      PE prints 265 and NB 375 here; the "PEI takes New Brunswick's value" footnote is attached to Tables 5.1 to 5.3 only.
//   2. National Inventory Report 1990-2024 (2026 edition), Table A4-2, natural gas energy content (R12), GCV, the
//      "2024 Value" column: 38.52 TJ/GL. CA_NG_HEAT_BY_EDITION[2024].
// Both read from the PDF pages cited, and checked by rendering the page.

import type { CitedValue } from './types'

export const ECCC_TABLE_5_4: Readonly<Record<string, CitedValue>> = {
  BC: {
    value: 0.018,
    unit: "kg CO2e/kWh",
    derivation: "18 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "BC",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  AB: {
    value: 0.346,
    unit: "kg CO2e/kWh",
    derivation: "346 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "AB",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  SK: {
    value: 0.581,
    unit: "kg CO2e/kWh",
    derivation: "581 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "SK",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  MB: {
    value: 0.003,
    unit: "kg CO2e/kWh",
    derivation: "3.0 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "MB",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  ON: {
    value: 0.073,
    unit: "kg CO2e/kWh",
    derivation: "73 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "ON",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  QC: {
    value: 0.0026,
    unit: "kg CO2e/kWh",
    derivation: "2.6 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "QC",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  NB: {
    value: 0.375,
    unit: "kg CO2e/kWh",
    derivation: "375 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "NB",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  NS: {
    value: 0.628,
    unit: "kg CO2e/kWh",
    derivation: "628 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "NS",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  PE: {
    value: 0.265,
    unit: "kg CO2e/kWh",
    derivation: "265 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "PE",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  NL: {
    value: 0.017,
    unit: "kg CO2e/kWh",
    derivation: "17 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "NL",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  YT: {
    value: 0.134,
    unit: "kg CO2e/kWh",
    derivation: "134 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "YT",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  NT: {
    value: 0.49,
    unit: "kg CO2e/kWh",
    derivation: "490 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "NT",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  },
  NU: {
    value: 0.76,
    unit: "kg CO2e/kWh",
    derivation: "760 g CO2e/kWh as printed, / 1,000",
    cite: {
      document: "ECCC (2026) Emission factors and reference values, Version 4.0 (September 9, 2026), En84-294-2026-eng.pdf",
      table: "Table 5.4: Electricity consumption intensities (g CO2e/kWh electricity consumed) for 2027",
      row: "NU",
      column: "g CO2e/kWh",
      page: "17 (PDF page 21)",
      correction: "Version 4.0, the original publication of Table 5.4"
    }
  }
}

export const ECCC_NIR_2026_NG_HEAT: CitedValue = {
  value: 0.03852,
  unit: "GJ/m3",
  derivation: "38.52 TJ/GL as printed; 1 GL = 10^6 m3, so 38.52 MJ/m3 = 0.03852 GJ/m3",
  cite: {
    document: "ECCC (2026) National Inventory Report 1990-2024, Annex 4 (NIR-1990-2024-2026-edition.pdf)",
    table: "Table A4–2 Reference Approach Energy Contents and Emission Factors for Canada",
    row: "Gaseous Primary Fuels, Natural Gas",
    column: "Energy Content, GCV - \"2024 Value\" (gross calorific value; data year 2024)",
    page: "521 (PDF page 543)",
    correction: "the 2026 edition as published (no correction recorded)"
  }
}
