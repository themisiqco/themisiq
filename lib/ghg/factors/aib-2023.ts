// lib/ghg/factors/aib-2023.ts
//
// T3d (reporting year 2024): AIB European Residual Mixes 2023 (data year 2023), the residual-mix CO2 factor per country
// for market-based Scope 2 in EU member states (RESIDUAL_EU). Every country checked against the PDF's Table 2 ("Table 2:
// Residual Mixes 2023", pp. 7 to 8), which governs; the value is Table 2's figure at its printed two decimals (the
// spreadsheet's Residual Mixes column Q holds more digits and agrees with it at that precision for every country but
// Austria). Table 2 has no numbered footnote, and nothing in the document says Table 2 differs from anything else.
// Austria: Table 2 prints "N/A" (full disclosure); the spreadsheet stores 0; held as null, never 0. The Netherlands is a
// printed figure in this edition (pp. 1 to 2), unlike 2024 and 2025. Greece is "GR" in the source and EL here.

import type { AibValue } from './aib-2025'

export const AIB_2023: Readonly<Record<string, AibValue>> = {
  EU_AT: {
    value: null,
    printed: "N/A",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "AT",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q2",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    },
    note: "Table 2 prints \"N/A\" (p. 7): full disclosure, \"the residual mix is not applicable\". The spreadsheet stores 0 in Q2; Table 2 governs, so null, never 0."
  },
  EU_BE: {
    value: 167.49,
    printed: "167,49",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "BE",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q4",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_BG: {
    value: 418.7,
    printed: "418,70",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "BG",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q5",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_CY: {
    value: 595.03,
    printed: "595,03",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "CY",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q7",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_CZ: {
    value: 658.58,
    printed: "658,58",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "CZ",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q8",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_DE: {
    value: 719.9,
    printed: "719,90",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "DE",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q9",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_DK: {
    value: 582.75,
    printed: "582,75",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "DK",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q10",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_EE: {
    value: 711.66,
    printed: "711,66",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "EE",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q11",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_EL: {
    value: 491.78,
    printed: "491,78",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "GR",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q16",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_ES: {
    value: 282.45,
    printed: "282,45",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "ES",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q12",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_FI: {
    value: 565.31,
    printed: "565,31",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "FI",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q13",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_FR: {
    value: 40.74,
    printed: "40,74",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "FR",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q14",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_HR: {
    value: 550.15,
    printed: "550,15",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "HR",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q17",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_HU: {
    value: 322.63,
    printed: "322,63",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "HU",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q18",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_IE: {
    value: 445.5,
    printed: "445,50",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "IE",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q19",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_IT: {
    value: 500.57,
    printed: "500,57",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "IT",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q21",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_LT: {
    value: 583.15,
    printed: "583,15",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "LT",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q22",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_LU: {
    value: 357.9,
    printed: "357,90",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "LU",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q23",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_LV: {
    value: 535.37,
    printed: "535,37",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "LV",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q24",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_MT: {
    value: 408.22,
    printed: "408,22",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "MT",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q26",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_NL: {
    value: 379.89,
    printed: "379,89",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "NL",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q27",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    },
    note: "Table 2 prints 379,89 (p. 8). PDF pp. 1 to 2: the Netherlands have full disclosure regulation but \"residual mixes can still be calculated and are included in the results\" in this edition. Held as printed."
  },
  EU_PL: {
    value: 788.24,
    printed: "788,24",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "PL",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q29",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_PT: {
    value: 539.01,
    printed: "539,01",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "PT",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q30",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_RO: {
    value: 212.54,
    printed: "212,54",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "RO",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q31",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_SE: {
    value: 68.23,
    printed: "68,23",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "SE",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q33",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_SI: {
    value: 486.76,
    printed: "486,76",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "SI",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q34",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  },
  EU_SK: {
    value: 357.56,
    printed: "357,56",
    cite: {
      document: "AIB European Residual Mixes 2023, Version 1.0, 2024-05-30 (AIB-2023-residual-mix-results.xlsx; AIB-2023-residual-mix-final-results-v1.0.pdf)",
      table: "Residual Mixes",
      row: "SK",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q35",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2024-05-30 (the original publication)"
    }
  }
}
