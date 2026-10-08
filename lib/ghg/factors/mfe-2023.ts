// lib/ghg/factors/mfe-2023.ts
//
// T3d (reporting year 2024): NZ MfE Measuring Emissions 2023, stationary combustion by use class, transcribed cell by cell
// from ~/themisiq-sources/mfe/Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx (one sheet, "in"; value column J, gas column I; no ID column, so rows are matched by
// section, use class, label, unit and gas alone, and each sits at the same row number as in 2024). EF_NZ's keys. kg CO2-e per unit, the total MfE prints, held in `co2` as EF_NZ holds it.
// MfE prints nine or ten significant figures here (2026 v2 prints six); the value is as printed.

import type { CitedValue } from './types'

export const MFE_2023 = {
  edition: 'MfE 2023',
  citation: 'NZ MfE Measuring Emissions 2023 (as-published basis: factors stored verbatim, no AR re-basing)',
  sourceFile: 'mfe/Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx',
  correction: "the 2023.1 release, published 1 August 2023 (the workbook prints no version or correction)",
  combustion: {
  commercial: {
    natural_gas_kwh: {
      value: 0.193531416,
      unit: "kg CO2-e/kWh",
      cite: {
        document: "MfE Measuring Emissions Guidance emission factors flat file, August 2023 (Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Commercial use, Natural Gas (kWh)",
        column: "EmissionFactor (CO2e)",
        cell: "in!J50",
        correction: "the 2023.1 release, published 1 August 2023 (the workbook prints no version or correction)"
      }
    },
    diesel_litre: {
      value: 2.689139697,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions Guidance emission factors flat file, August 2023 (Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Commercial use, Diesel (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "in!J34",
        correction: "the 2023.1 release, published 1 August 2023 (the workbook prints no version or correction)"
      }
    },
    propane_kg: {
      value: 2.971635097,
      unit: "kg CO2-e/kg",
      cite: {
        document: "MfE Measuring Emissions Guidance emission factors flat file, August 2023 (Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Commercial use, LPG (kg)",
        column: "EmissionFactor (CO2e)",
        cell: "in!J38",
        correction: "the 2023.1 release, published 1 August 2023 (the workbook prints no version or correction)"
      }
    },
    fuel_oil_distillate_litre: {
      value: 2.970880948,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions Guidance emission factors flat file, August 2023 (Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Commercial use, Light Fuel Oil (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "in!J46",
        correction: "the 2023.1 release, published 1 August 2023 (the workbook prints no version or correction)"
      }
    },
    fuel_oil_residual_litre: {
      value: 3.004558494,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions Guidance emission factors flat file, August 2023 (Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Commercial use, Heavy Fuel Oil (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "in!J42",
        correction: "the 2023.1 release, published 1 August 2023 (the workbook prints no version or correction)"
      }
    }
  },
  industrial: {
    natural_gas_kwh: {
      value: 0.193168536,
      unit: "kg CO2-e/kWh",
      cite: {
        document: "MfE Measuring Emissions Guidance emission factors flat file, August 2023 (Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Industrial Use, Natural Gas (kWh)",
        column: "EmissionFactor (CO2e)",
        cell: "in!J90",
        correction: "the 2023.1 release, published 1 August 2023 (the workbook prints no version or correction)"
      }
    },
    diesel_litre: {
      value: 2.68197247,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions Guidance emission factors flat file, August 2023 (Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Industrial Use, Diesel (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "in!J74",
        correction: "the 2023.1 release, published 1 August 2023 (the workbook prints no version or correction)"
      }
    },
    propane_kg: {
      value: 2.966315097,
      unit: "kg CO2-e/kg",
      cite: {
        document: "MfE Measuring Emissions Guidance emission factors flat file, August 2023 (Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Industrial Use, LPG (kg)",
        column: "EmissionFactor (CO2e)",
        cell: "in!J78",
        correction: "the 2023.1 release, published 1 August 2023 (the workbook prints no version or correction)"
      }
    },
    fuel_oil_distillate_litre: {
      value: 2.963348406,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions Guidance emission factors flat file, August 2023 (Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Industrial Use, Light Fuel Oil (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "in!J86",
        correction: "the 2023.1 release, published 1 August 2023 (the workbook prints no version or correction)"
      }
    },
    fuel_oil_residual_litre: {
      value: 2.996972838,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions Guidance emission factors flat file, August 2023 (Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Industrial Use, Heavy Fuel Oil (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "in!J82",
        correction: "the 2023.1 release, published 1 August 2023 (the workbook prints no version or correction)"
      }
    }
  }
} as { commercial: Record<string, CitedValue>; industrial: Record<string, CitedValue> },
} as const
