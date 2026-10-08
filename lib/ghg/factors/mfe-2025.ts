// lib/ghg/factors/mfe-2025.ts
//
// T3d (reporting year 2025): NZ MfE Measuring Emissions 2025 v3, stationary combustion by use class, transcribed
// cell by cell from ~/themisiq-sources/mfe/EmissionFactors_2025_v3.xlsx (sheet "data"; value column O, gas column N; every value is a text cell, parsed exactly).
// Each row matched by section, use class, label, unit and gas to the row the held 2026 v2 value comes from (lib/ghg/engine.ts
// EF_NZ); the UUIDs are the same as 2026's. kg CO2-e per unit, the total MfE prints, held in `co2` as EF_NZ holds it.
// MfE prints nine or ten significant figures here (2026 v2 prints six); the value is as printed.

import type { CitedValue } from './types'

export const MFE_2025 = {
  edition: 'MfE 2025 v3',
  citation: 'NZ MfE Measuring Emissions 2025 v3 (as-published basis: factors stored verbatim, no AR re-basing)',
  sourceFile: 'mfe/EmissionFactors_2025_v3.xlsx',
  correction: "release 2025.3 (README \"Release date\" 2026-02-24; no correction to a fuel row recorded)",
  combustion: {
  commercial: {
    natural_gas_kwh: {
      value: 0.1951479317,
      unit: "kg CO2-e/kWh",
      cite: {
        document: "MfE Measuring Emissions emission factors 2025 v3 (EmissionFactors_2025_v3.xlsx, release 2025.3)",
        table: "Fuel / Stationary Combustion of Fuels",
        row: "Commercial Use, Natural Gas (kWh) (kWh)",
        column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
        cell: "data!O1379",
        correction: "release 2025.3 (README \"Release date\" 2026-02-24; no correction to a fuel row recorded)"
      }
    },
    diesel_litre: {
      value: 2.679858468,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions emission factors 2025 v3 (EmissionFactors_2025_v3.xlsx, release 2025.3)",
        table: "Fuel / Stationary Combustion of Fuels",
        row: "Commercial Use, Diesel (litre)",
        column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
        cell: "data!O1359",
        correction: "release 2025.3 (README \"Release date\" 2026-02-24; no correction to a fuel row recorded)"
      }
    },
    propane_kg: {
      value: 2.971635097,
      unit: "kg CO2-e/kg",
      cite: {
        document: "MfE Measuring Emissions emission factors 2025 v3 (EmissionFactors_2025_v3.xlsx, release 2025.3)",
        table: "Fuel / Stationary Combustion of Fuels",
        row: "Commercial Use, LPG (kg)",
        column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
        cell: "data!O1367",
        correction: "release 2025.3 (README \"Release date\" 2026-02-24; no correction to a fuel row recorded)"
      }
    },
    fuel_oil_distillate_litre: {
      value: 2.970880948,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions emission factors 2025 v3 (EmissionFactors_2025_v3.xlsx, release 2025.3)",
        table: "Fuel / Stationary Combustion of Fuels",
        row: "Commercial Use, Light Fuel Oil (litre)",
        column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
        cell: "data!O1371",
        correction: "release 2025.3 (README \"Release date\" 2026-02-24; no correction to a fuel row recorded)"
      }
    },
    fuel_oil_residual_litre: {
      value: 3.053591727,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions emission factors 2025 v3 (EmissionFactors_2025_v3.xlsx, release 2025.3)",
        table: "Fuel / Stationary Combustion of Fuels",
        row: "Commercial Use, Heavy Fuel Oil (litre)",
        column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
        cell: "data!O1363",
        correction: "release 2025.3 (README \"Release date\" 2026-02-24; no correction to a fuel row recorded)"
      }
    }
  },
  industrial: {
    natural_gas_kwh: {
      value: 0.1947850517,
      unit: "kg CO2-e/kWh",
      cite: {
        document: "MfE Measuring Emissions emission factors 2025 v3 (EmissionFactors_2025_v3.xlsx, release 2025.3)",
        table: "Fuel / Stationary Combustion of Fuels",
        row: "Industrial Use, Natural Gas (kWh) (kWh)",
        column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
        cell: "data!O1419",
        correction: "release 2025.3 (README \"Release date\" 2026-02-24; no correction to a fuel row recorded)"
      }
    },
    diesel_litre: {
      value: 2.67269124,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions emission factors 2025 v3 (EmissionFactors_2025_v3.xlsx, release 2025.3)",
        table: "Fuel / Stationary Combustion of Fuels",
        row: "Industrial Use, Diesel (litre)",
        column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
        cell: "data!O1399",
        correction: "release 2025.3 (README \"Release date\" 2026-02-24; no correction to a fuel row recorded)"
      }
    },
    propane_kg: {
      value: 2.966315097,
      unit: "kg CO2-e/kg",
      cite: {
        document: "MfE Measuring Emissions emission factors 2025 v3 (EmissionFactors_2025_v3.xlsx, release 2025.3)",
        table: "Fuel / Stationary Combustion of Fuels",
        row: "Industrial Use, LPG (kg)",
        column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
        cell: "data!O1407",
        correction: "release 2025.3 (README \"Release date\" 2026-02-24; no correction to a fuel row recorded)"
      }
    },
    fuel_oil_distillate_litre: {
      value: 2.963348405,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions emission factors 2025 v3 (EmissionFactors_2025_v3.xlsx, release 2025.3)",
        table: "Fuel / Stationary Combustion of Fuels",
        row: "Industrial Use, Light Fuel Oil (litre)",
        column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
        cell: "data!O1411",
        correction: "release 2025.3 (README \"Release date\" 2026-02-24; no correction to a fuel row recorded)"
      }
    },
    fuel_oil_residual_litre: {
      value: 3.04600607,
      unit: "kg CO2-e/litre",
      cite: {
        document: "MfE Measuring Emissions emission factors 2025 v3 (EmissionFactors_2025_v3.xlsx, release 2025.3)",
        table: "Fuel / Stationary Combustion of Fuels",
        row: "Industrial Use, Heavy Fuel Oil (litre)",
        column: "EmissionFactor (GHG_TOTAL_KGCO2_e)",
        cell: "data!O1403",
        correction: "release 2025.3 (README \"Release date\" 2026-02-24; no correction to a fuel row recorded)"
      }
    }
  }
} as { commercial: Record<string, CitedValue>; industrial: Record<string, CitedValue> },
} as const
