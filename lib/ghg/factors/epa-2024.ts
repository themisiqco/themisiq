// lib/ghg/factors/epa-2024.ts
//
// T3d (reporting year 2025): US EPA GHG Emission Factors Hub 2024, stationary combustion (Table 1) and steam and heat
// (Table 7), transcribed cell by cell from ~/themisiq-sources/epa/ghg-emission-factors-hub-2024.xlsx, sheet "Emission
// Factors Hub", and checked against the PDF of the same edition. Same keys and the same derivations as the held 2025
// values in lib/ghg/engine.ts (EF): kg of each gas per unit, CH4 and N2O converted from grams (/ 1,000) and per scf to
// per Mcf (x 1,000) exactly as EF states. Every value here equals the 2025 edition's: EPA did not change Table 1 or
// Table 7 for these rows between the two editions.
// Left out: EF.ammonia (a literal 0 in EF, not an EPA value; there is no Hub row for it).

import type { CitedGases } from './types'

export const EPA_2024 = {
  edition: 'US EPA 2024',
  citation: 'US EPA (2024) Emission Factors for Greenhouse Gas Inventories',
  sourceFile: 'epa/ghg-emission-factors-hub-2024.xlsx',
  correction: "the file as last modified 5 June 2024 (no later correction recorded)",
  combustion: {
  natural_gas_mcf: {
    co2: {
      value: 54.44,
      unit: "kg CO2 per Mcf",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Natural Gas",
        column: "CO2 Factor (kg CO2 per scf)",
        cell: "Emission Factors Hub!H40",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "per Mcf = per scf x 1,000 (as the repo derives natural_gas_mcf); CH4/N2O g per scf x 1,000 / 1,000 g per kg = same digits in kg per Mcf"
    },
    ch4: {
      value: 0.00103,
      unit: "kg CH4 per Mcf",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Natural Gas",
        column: "CH4 Factor (g CH4 per scf)",
        cell: "Emission Factors Hub!I40",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "per Mcf = per scf x 1,000 (as the repo derives natural_gas_mcf); CH4/N2O g per scf x 1,000 / 1,000 g per kg = same digits in kg per Mcf"
    },
    n2o: {
      value: 0.0001,
      unit: "kg N2O per Mcf",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Natural Gas",
        column: "N2O Factor (g N2O per scf)",
        cell: "Emission Factors Hub!J40",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "per Mcf = per scf x 1,000 (as the repo derives natural_gas_mcf); CH4/N2O g per scf x 1,000 / 1,000 g per kg = same digits in kg per Mcf"
    }
  },
  natural_gas_mmbtu: {
    co2: {
      value: 53.06,
      unit: "kg CO2 per mmBtu",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Natural Gas",
        column: "CO2 Factor (kg CO2 per mmBtu)",
        cell: "Emission Factors Hub!E40",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    ch4: {
      value: 0.001,
      unit: "kg CH4 per mmBtu",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Natural Gas",
        column: "CH4 Factor (g CH4 per mmBtu)",
        cell: "Emission Factors Hub!F40",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    n2o: {
      value: 0.0001,
      unit: "kg N2O per mmBtu",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Natural Gas",
        column: "N2O Factor (g N2O per mmBtu)",
        cell: "Emission Factors Hub!G40",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    }
  },
  propane_gallon: {
    co2: {
      value: 5.72,
      unit: "kg CO2 per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Propane",
        column: "CO2 Factor (kg CO2 per gallon)",
        cell: "Emission Factors Hub!H74",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    ch4: {
      value: 0.00027,
      unit: "kg CH4 per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Propane",
        column: "CH4 Factor (g CH4 per gallon)",
        cell: "Emission Factors Hub!I74",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    n2o: {
      value: 0.00005,
      unit: "kg N2O per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Propane",
        column: "N2O Factor (g N2O per gallon)",
        cell: "Emission Factors Hub!J74",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    }
  },
  diesel_gallon: {
    co2: {
      value: 10.21,
      unit: "kg CO2 per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Distillate Fuel Oil No. 2",
        column: "CO2 Factor (kg CO2 per gallon)",
        cell: "Emission Factors Hub!H57",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    ch4: {
      value: 0.00041,
      unit: "kg CH4 per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Distillate Fuel Oil No. 2",
        column: "CH4 Factor (g CH4 per gallon)",
        cell: "Emission Factors Hub!I57",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    n2o: {
      value: 0.00008,
      unit: "kg N2O per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Distillate Fuel Oil No. 2",
        column: "N2O Factor (g N2O per gallon)",
        cell: "Emission Factors Hub!J57",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    }
  },
  fuel_oil_gallon: {
    co2: {
      value: 10.21,
      unit: "kg CO2 per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Distillate Fuel Oil No. 2",
        column: "CO2 Factor (kg CO2 per gallon)",
        cell: "Emission Factors Hub!H57",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    ch4: {
      value: 0.00041,
      unit: "kg CH4 per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Distillate Fuel Oil No. 2",
        column: "CH4 Factor (g CH4 per gallon)",
        cell: "Emission Factors Hub!I57",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    n2o: {
      value: 0.00008,
      unit: "kg N2O per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Distillate Fuel Oil No. 2",
        column: "N2O Factor (g N2O per gallon)",
        cell: "Emission Factors Hub!J57",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    }
  },
  fuel_oil_distillate_gallon: {
    co2: {
      value: 10.21,
      unit: "kg CO2 per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Distillate Fuel Oil No. 2",
        column: "CO2 Factor (kg CO2 per gallon)",
        cell: "Emission Factors Hub!H57",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    ch4: {
      value: 0.00041,
      unit: "kg CH4 per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Distillate Fuel Oil No. 2",
        column: "CH4 Factor (g CH4 per gallon)",
        cell: "Emission Factors Hub!I57",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    n2o: {
      value: 0.00008,
      unit: "kg N2O per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Distillate Fuel Oil No. 2",
        column: "N2O Factor (g N2O per gallon)",
        cell: "Emission Factors Hub!J57",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    }
  },
  fuel_oil_residual_gallon: {
    co2: {
      value: 11.27,
      unit: "kg CO2 per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Residual Fuel Oil No. 6",
        column: "CO2 Factor (kg CO2 per gallon)",
        cell: "Emission Factors Hub!H77",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    ch4: {
      value: 0.00045,
      unit: "kg CH4 per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Residual Fuel Oil No. 6",
        column: "CH4 Factor (g CH4 per gallon)",
        cell: "Emission Factors Hub!I77",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    },
    n2o: {
      value: 0.00009,
      unit: "kg N2O per gallon",
      cite: {
        document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
        table: "Table 1 Stationary Combustion",
        row: "Residual Fuel Oil No. 6",
        column: "N2O Factor (g N2O per gallon)",
        cell: "Emission Factors Hub!J77",
        page: "1",
        correction: "the file as last modified 5 June 2024 (no later correction recorded)"
      },
      derivation: "none beyond g -> kg (CH4, N2O printed in g, divided by 1,000 as every US mass key is stored in kg)"
    }
  }
} as Record<string, CitedGases>,
  steam_mmbtu: {
  co2: {
    value: 66.33,
    unit: "kg CO2 per mmBtu",
    cite: {
      document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
      table: "Table 7 Steam and Heat",
      row: "Steam and Heat",
      column: "CO2 Factor (kg CO2 / mmBtu)",
      cell: "Emission Factors Hub!D402",
      page: "4",
      correction: "the file as last modified 5 June 2024 (no later correction recorded)"
    },
    derivation: "none beyond g -> kg for CH4/N2O"
  },
  ch4: {
    value: 0.00125,
    unit: "kg CH4 per mmBtu",
    cite: {
      document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
      table: "Table 7 Steam and Heat",
      row: "Steam and Heat",
      column: "CH4 Factor (g CH4 / mmBtu)",
      cell: "Emission Factors Hub!E402",
      page: "4",
      correction: "the file as last modified 5 June 2024 (no later correction recorded)"
    },
    derivation: "none beyond g -> kg for CH4/N2O"
  },
  n2o: {
    value: 0.000125,
    unit: "kg N2O per mmBtu",
    cite: {
      document: "US EPA GHG Emission Factors Hub 2024 (\"Last Modified: June 5, 2024\"), ghg-emission-factors-hub-2024.xlsx",
      table: "Table 7 Steam and Heat",
      row: "Steam and Heat",
      column: "N2O Factor (g N2O / mmBtu)",
      cell: "Emission Factors Hub!F402",
      page: "4",
      correction: "the file as last modified 5 June 2024 (no later correction recorded)"
    },
    derivation: "none beyond g -> kg for CH4/N2O"
  }
} as CitedGases,
} as const
