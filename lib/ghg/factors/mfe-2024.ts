// lib/ghg/factors/mfe-2024.ts
//
// T3d (reporting year 2025): NZ MfE Measuring Emissions 2024, stationary combustion by use class, transcribed
// cell by cell from ~/themisiq-sources/mfe/Measuring_Emissions_Flat_EmissionFactors_2024.xlsx (one sheet, "Emission Factors"; value column J, gas column I).
// Each row matched by section, use class, label, unit and gas to the row the held 2026 v2 value comes from (lib/ghg/engine.ts
// EF_NZ); the UUIDs are the same as 2026's. kg CO2-e per unit, the total MfE prints, held in `co2` as EF_NZ holds it.
// MfE prints nine or ten significant figures here (2026 v2 prints six); the value is as printed.

import type { CitedValue } from './types'

export const MFE_2024 = {
  edition: 'MfE 2024',
  citation: 'NZ MfE Measuring Emissions 2024 (as-published basis: factors stored verbatim, no AR re-basing)',
  sourceFile: 'mfe/Measuring_Emissions_Flat_EmissionFactors_2024.xlsx',
  correction: "the 2024.1 release, published 29 July 2024 (the workbook prints no version or correction)",
  combustion: {
  commercial: {
    natural_gas_kwh: {
      value: 0.19488931,
      unit: "kg CO2-e/kWh",
      cite: {
        document: "MfE Measuring Emissions flat emission factors 2024 (Measuring_Emissions_Flat_EmissionFactors_2024.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Commercial use, Natural Gas (kWh)",
        column: "EmissionFactor (CO2e)",
        cell: "Emission Factors!J50",
        correction: "the 2024.1 release, published 29 July 2024 (the workbook prints no version or correction)"
      }
    },
    diesel_litre: {
      value: 2.678493439,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions flat emission factors 2024 (Measuring_Emissions_Flat_EmissionFactors_2024.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Commercial use, Diesel (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "Emission Factors!J34",
        correction: "the 2024.1 release, published 29 July 2024 (the workbook prints no version or correction)"
      }
    },
    propane_kg: {
      value: 2.971635097,
      unit: "kg CO2-e/kg",
      cite: {
        document: "MfE Measuring Emissions flat emission factors 2024 (Measuring_Emissions_Flat_EmissionFactors_2024.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Commercial use, LPG (kg)",
        column: "EmissionFactor (CO2e)",
        cell: "Emission Factors!J38",
        correction: "the 2024.1 release, published 29 July 2024 (the workbook prints no version or correction)"
      }
    },
    fuel_oil_distillate_litre: {
      value: 2.970880948,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions flat emission factors 2024 (Measuring_Emissions_Flat_EmissionFactors_2024.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Commercial use, Light Fuel Oil (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "Emission Factors!J46",
        correction: "the 2024.1 release, published 29 July 2024 (the workbook prints no version or correction)"
      }
    },
    fuel_oil_residual_litre: {
      value: 3.053591726,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions flat emission factors 2024 (Measuring_Emissions_Flat_EmissionFactors_2024.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Commercial use, Heavy Fuel Oil (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "Emission Factors!J42",
        correction: "the 2024.1 release, published 29 July 2024 (the workbook prints no version or correction)"
      }
    }
  },
  industrial: {
    natural_gas_kwh: {
      value: 0.19452643,
      unit: "kg CO2-e/kWh",
      cite: {
        document: "MfE Measuring Emissions flat emission factors 2024 (Measuring_Emissions_Flat_EmissionFactors_2024.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Industrial Use, Natural Gas (kWh)",
        column: "EmissionFactor (CO2e)",
        cell: "Emission Factors!J90",
        correction: "the 2024.1 release, published 29 July 2024 (the workbook prints no version or correction)"
      }
    },
    diesel_litre: {
      value: 2.671326212,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions flat emission factors 2024 (Measuring_Emissions_Flat_EmissionFactors_2024.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Industrial Use, Diesel (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "Emission Factors!J74",
        correction: "the 2024.1 release, published 29 July 2024 (the workbook prints no version or correction)"
      }
    },
    propane_kg: {
      value: 2.966315097,
      unit: "kg CO2-e/kg",
      cite: {
        document: "MfE Measuring Emissions flat emission factors 2024 (Measuring_Emissions_Flat_EmissionFactors_2024.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Industrial Use, LPG (kg)",
        column: "EmissionFactor (CO2e)",
        cell: "Emission Factors!J78",
        correction: "the 2024.1 release, published 29 July 2024 (the workbook prints no version or correction)"
      }
    },
    fuel_oil_distillate_litre: {
      value: 2.963348406,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions flat emission factors 2024 (Measuring_Emissions_Flat_EmissionFactors_2024.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Industrial Use, Light Fuel Oil (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "Emission Factors!J86",
        correction: "the 2024.1 release, published 29 July 2024 (the workbook prints no version or correction)"
      }
    },
    fuel_oil_residual_litre: {
      value: 3.04600607,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions flat emission factors 2024 (Measuring_Emissions_Flat_EmissionFactors_2024.xlsx)",
        table: "Fuel / Stationary combustion fuel emission factors",
        row: "Industrial Use, Heavy Fuel Oil (litre)",
        column: "EmissionFactor (CO2e)",
        cell: "Emission Factors!J82",
        correction: "the 2024.1 release, published 29 July 2024 (the workbook prints no version or correction)"
      }
    }
  }
} as { commercial: Record<string, CitedValue>; industrial: Record<string, CitedValue> },
} as const
