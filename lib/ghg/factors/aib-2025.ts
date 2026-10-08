// lib/ghg/factors/aib-2025.ts
//
// T3d (reporting year 2025): AIB European Residual Mixes 2025 (data year 2025), the residual-mix CO2 factor per country
// for market-based Scope 2 in EU member states (RESIDUAL_EU). Read cell by cell from
// ~/themisiq-sources/aib/AIB-2025-residual-mix-results-25052026.xlsx, sheet "Residual Mixes", column Q "CO2 (gCO2/kWh)",
// the same sheet and column that reproduce the held 2024 values, and checked against the PDF's Table 2 (pp. 7 to 8).
// g CO2/kWh, as RESIDUAL_EU holds it. Greece is "GR" in the source and EL here.
// Austria and the Netherlands print "NA" (full disclosure, "hence the residual mix is zero", PDF p. 1): null, never 0.

export interface AibValue { value: number | null; printed: string; cite: import('./types').FactorCite; note?: string }

export const AIB_2025: Readonly<Record<string, AibValue>> = {
  EU_AT: {
    value: null,
    printed: "NA",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "AT",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q2",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    },
    note: "Printed \"NA\": full disclosure, no residual mix (PDF p. 1). Not a zero."
  },
  EU_BE: {
    value: 171.01,
    printed: "171.01",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "BE",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q4",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_BG: {
    value: 371.81,
    printed: "371.81",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "BG",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q5",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_CY: {
    value: 503.63,
    printed: "503.63",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "CY",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q7",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_CZ: {
    value: 589.81,
    printed: "589.81",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "CZ",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q8",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_DE: {
    value: 701.47,
    printed: "701.47",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "DE",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q9",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_DK: {
    value: 448.9,
    printed: "448.9",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "DK",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q10",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_EE: {
    value: 467.35,
    printed: "467.35",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "EE",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q11",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_EL: {
    value: 365.2,
    printed: "365.2",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "GR",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q16",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_ES: {
    value: 238.28,
    printed: "238.28",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "ES",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q12",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_FI: {
    value: 352.45,
    printed: "352.45",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "FI",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q13",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_FR: {
    value: 17.11,
    printed: "17.11",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "FR",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q14",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_HR: {
    value: 432.4,
    printed: "432.4",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "HR",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q17",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_HU: {
    value: 453.5,
    printed: "453.5",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "HU",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q18",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_IE: {
    value: 368.74,
    printed: "368.74",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "IE",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q19",
      page: "PDF Table 2, p. 7",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_IT: {
    value: 420.2,
    printed: "420.20",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "IT",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q21",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    },
    note: "The CO2 sheet (C21) prints 427.78; the PDF Table 2 footnote 6 says \"Due to late data updates, the Italian values in this table slightly differ from the rest of the document. The values in this table are correct.\" The table value is used."
  },
  EU_LT: {
    value: 550.26,
    printed: "550.26",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "LT",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q22",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_LU: {
    value: 422.28,
    printed: "422.28",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "LU",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q23",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_LV: {
    value: 371.51,
    printed: "371.51",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "LV",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q24",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_MT: {
    value: 427.67,
    printed: "427.67",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "MT",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q26",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_NL: {
    value: null,
    printed: "NA",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "NL",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q27",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    },
    note: "Printed \"NA\": full disclosure, no residual mix (PDF p. 1). Not a zero."
  },
  EU_PL: {
    value: 726.96,
    printed: "726.96",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "PL",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q29",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_PT: {
    value: 392.86,
    printed: "392.86",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "PT",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q30",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_RO: {
    value: 245.02,
    printed: "245.02",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "RO",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q31",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_SE: {
    value: 208.56,
    printed: "208.56",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "SE",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q33",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_SI: {
    value: 634.45,
    printed: "634.45",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "SI",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q34",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  },
  EU_SK: {
    value: 350.7,
    printed: "350.7",
    cite: {
      document: "AIB European Residual Mixes 2025, Version 1.0, 2026-05-26 (AIB-2025-residual-mix-results-25052026.xlsx; AIB-2025-residual-mix-final-results-26052026.pdf)",
      table: "Residual Mixes",
      row: "SK",
      column: "CO2 (gCO2/kWh)",
      cell: "Residual Mixes!Q35",
      page: "PDF Table 2, p. 8",
      correction: "Version 1.0, 2026-05-26 (the original publication)"
    }
  }
}
