// lib/sbti.ts
// SBTi target-setting & monitoring engine — single source of truth (workplan §4).
// Pure functions only: no I/O, no DB, no Date.now(). All numeric criteria are read
// from ./sbti/params — nothing is hardcoded here.
// ThemisIQ prepares & monitors targets; it does not validate them (SBTi Services does).
//
// Engine build is incremental. THIS step ships types + categorize() only.
// acaSuggestedReductionPct / validateTargetConfig / trajectory / progress / etc.
// land in later steps.
import { CATEGORY_A_THRESHOLDS } from './sbti/params';

// ── Company categorization (CNZS V2.0, Table 1) ────────────────────────
export interface CategorizeInput {
  highIncomeCountry: boolean;     // ultimate-parent jurisdiction, WB income class
  netTurnoverEur?: number;
  fte?: number;
  scope12EmissionsTco2e?: number;
  balanceSheetEur?: number;
}
export interface CategoryResult {
  category: 'A' | 'B';
  matchedRoute: 'route1' | 'route2_emissions' | 'route2_twoOfThree' | null;
}

// All thresholds are inclusive (≥). A missing/undefined optional input counts as
// not-met — categorize never throws on absent fields.
const meets = (value: number | undefined, threshold: number): boolean =>
  typeof value === 'number' && value >= threshold;

/**
 * Categorize a company as A or B under CNZS V2.0 (Table 1).
 *
 * Two routes to Category A:
 *   - Route 1 (ANY country): netTurnoverEur ≥ €450M OR fte ≥ 1,000.
 *   - Route 2 (HIGH-INCOME countries ONLY): scope12EmissionsTco2e ≥ 10,000
 *     (standalone), OR at least TWO of {balanceSheetEur ≥ €25M,
 *     netTurnoverEur ≥ €50M, fte ≥ 250}.
 * Category A if any route is met; otherwise Category B.
 *
 * DEFINED PRECEDENCE (deterministic for audit — confirm this is the intended order):
 *   1. Route 1 is checked first; if met → matchedRoute 'route1' (even when a
 *      high-income company would also satisfy Route 2).
 *   2. Otherwise, for high-income companies, the emissions standalone trigger is
 *      checked before the two-of-three trio: 'route2_emissions' wins over
 *      'route2_twoOfThree' when both hold.
 *   3. No route met → category 'B', matchedRoute null.
 * `matchedRoute` records WHICH test established Category A, not every test passed.
 */
export function categorize(input: CategorizeInput): CategoryResult {
  const T = CATEGORY_A_THRESHOLDS;

  // Route 1 — any country.
  const route1 =
    meets(input.netTurnoverEur, T.anyCountry.netTurnoverEur) ||
    meets(input.fte, T.anyCountry.fte);
  if (route1) return { category: 'A', matchedRoute: 'route1' };

  // Route 2 — high-income countries only.
  if (input.highIncomeCountry) {
    // 2a — emissions standalone trigger.
    if (meets(input.scope12EmissionsTco2e, T.highIncomeCountry.scope12EmissionsTco2e)) {
      return { category: 'A', matchedRoute: 'route2_emissions' };
    }
    // 2b — at least TWO of the trio.
    const trio = T.highIncomeCountry.twoOfThree;
    const trioCount =
      (meets(input.balanceSheetEur, trio.balanceSheetEur) ? 1 : 0) +
      (meets(input.netTurnoverEur, trio.netTurnoverEur) ? 1 : 0) +
      (meets(input.fte, trio.fte) ? 1 : 0);
    if (trioCount >= 2) return { category: 'A', matchedRoute: 'route2_twoOfThree' };
  }

  return { category: 'B', matchedRoute: null };
}
