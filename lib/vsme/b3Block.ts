/**
 * VSME B3 — emissions + assembly
 * --------------------------------------------------------------------------
 * Reads a saved ghg_inventories row (+ its locations) and produces the full
 * b3_energyAndEmissions block: energy via buildB3Energy(), emissions from the
 * saved scope totals. Reading the SAVED row (not a live recompute) keeps the
 * export aligned with the audit trail the customer already has.
 *
 * Field names match the saved ghg_inventories columns (handleSave payload).
 * The gwp_version column records the basis the totals were saved on (now AR6
 * across the board); gwpBasis reads it rather than assuming.
 *
 * Lives in lib/vsme/ with b3Energy.ts, energyContent.ts, climateCore.ts.
 */

import { buildB3Energy, type B3Location } from "./b3Energy";
import type {
  VsmeEnergyConsumption,
  VsmeGhgEmissions,
  GwpBasis,
} from "./climateCore";

/** Structural subset of a saved ghg_inventories row plus its locations. */
export interface B3InventoryRow {
  company_name: string;
  reporting_year: number;
  fiscal_year_end_month?: number; // 1–12; undefined/12 ⇒ calendar year
  revenue_millions: number;       // ⚠ stored in USD millions
  scope1_total: number;           // tCO2e
  scope2_location_total: number;  // tCO2e
  scope2_market_total?: number;   // tCO2e
  gwp_version?: GwpBasis;         // basis label recorded on the saved row (AR6 default)
  locations: B3Location[];
}

/**
 * Derive the reporting period from year + fiscal-year-end month.
 * ⚠ CONFIRM against the engine's periodFromYearAndEnd() — in particular whether
 * reporting_year labels the year the fiscal year ENDS (assumed here) or begins.
 */
function deriveReportingPeriod(
  year: number,
  fyEndMonth?: number
): { start: string; end: string } {
  const m = fyEndMonth && fyEndMonth >= 1 && fyEndMonth <= 12 ? fyEndMonth : 12;
  const end = new Date(Date.UTC(year, m, 0)); // last day of month m in `year`
  const start = new Date(Date.UTC(year, m - 12, 1)); // first day, 12 months earlier
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/** Build the complete b3_energyAndEmissions block from a saved inventory row. */
export function buildB3Block(row: B3InventoryRow): {
  energy: VsmeEnergyConsumption;
  emissions: VsmeGhgEmissions;
} {
  const energy = buildB3Energy(row.locations);

  const scope1 = row.scope1_total ?? 0;
  const scope2LB = row.scope2_location_total ?? 0;
  const turnover = (row.revenue_millions ?? 0) * 1_000_000; // ⚠ USD

  // VSME intensity = total GHG / turnover. Scope 3 excluded (Basic-module basis).
  const intensity = turnover > 0 ? (scope1 + scope2LB) / turnover : 0;

  const period = deriveReportingPeriod(row.reporting_year, row.fiscal_year_end_month);

  const emissions: VsmeGhgEmissions = {
    scope1_tCO2e: scope1,
    scope2LocationBased_tCO2e: scope2LB, // VSME-required method
    scope2MarketBased_tCO2e: row.scope2_market_total ?? undefined, // optional supplement
    // Basic B3 excludes Scope 3 (it lives in the separate scope3 page and is a
    // Comprehensive-module consideration only). Left undefined deliberately.
    scope3_tCO2e: undefined,
    ghgIntensity_tCO2ePerTurnover: intensity,
    turnover,
    turnoverCurrency: "USD", // ⚠ engine has no currency field; app assumes USD
    // Basis recorded on the saved row (handleSave writes gwp_version='AR6');
    // fall back to AR6 if somehow absent.
    gwpBasis: row.gwp_version ?? "AR6",
    reportingPeriodStart: period.start,
    reportingPeriodEnd: period.end,
  };

  return { energy, emissions };
}
