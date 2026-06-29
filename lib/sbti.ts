// lib/sbti.ts
// SBTi target-setting & monitoring engine — single source of truth (workplan §4).
// Pure functions only: no I/O, no DB, no Date.now(). All numeric criteria are read
// from ./sbti/params — nothing is hardcoded here.
// ThemisIQ prepares & monitors targets; it does not validate them (SBTi Services does).
//
// Engine build is incremental. THIS step ships categorize() + validateTargetConfig()
// + acaSuggestedReductionPct() + computeTrajectory(). progress / renewal / cycle land later.
import { CATEGORY_A_THRESHOLDS, NET_ZERO, ELEC_GROWTH_ABSOLUTE_THRESHOLD_PCT, ACA } from './sbti/params';

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

// ── Target-config validation (version-aware, params-driven) ────────────
export type Scope = 's1' | 's2_location' | 's3' | 's1s2_combined';
export type Method = 'absolute_aca' | 'intensity';

export interface TargetConfig {
  standardVersion: 'v1_3_1' | 'v2_0';
  scope: Scope;
  method: Method;
  baseYear: number;
  targetYear: number;
  reductionPct: number;
  isNetZero?: boolean;
  s3Category?: number;        // 1–14, only valid when scope === 's3'
}
export interface SbtiProfile {
  elecDemandGrowthPct?: number | null;
}
export interface ValidationResult { ok: boolean; reasons: string[]; }

/**
 * Version-aware validation of a SINGLE target config. Accumulates ALL failing
 * reasons (no short-circuit); ok === (reasons.length === 0). Pure; every numeric
 * criterion is read from ./sbti/params (90 / 2050 / 20 are never hardcoded here).
 *
 * Rules: R1 v2 rejects s1s2_combined · R2 targetYear > baseYear · R3 reductionPct
 * in (0,100] · R4 (v2 only) high elec growth ⇒ absolute S2 · R5 net-zero ≥ floor ·
 * R6 net-zero year ≤ latest · R7 s3Category only when scope='s3' · R8 s3Category
 * 1–14 · R9 net-zero must be absolute.
 */
export function validateTargetConfig(config: TargetConfig, profile: SbtiProfile): ValidationResult {
  const reasons: string[] = [];
  const isNetZero = config.isNetZero === true;

  // R1 — V2.0 requires separate S1 and S2; combined is a V1.3.1-only construct.
  if (config.standardVersion === 'v2_0' && config.scope === 's1s2_combined') {
    reasons.push('V2.0 requires separate Scope 1 and Scope 2 targets; combined S1+S2 (s1s2_combined) is valid only under V1.3.1.');
  }

  // R2 — target horizon.
  if (config.targetYear <= config.baseYear) {
    reasons.push('Target year must be after the base year.');
  }

  // R3 — reduction bounds. Engine is intentionally stricter than the DB's >= 0:
  // a 0% reduction is not a target (decision A).
  if (config.reductionPct <= 0 || config.reductionPct > 100) {
    reasons.push('Reduction % must be greater than 0 and at most 100.');
  }

  // R4 — V2.0 ONLY: high electricity-demand growth forces an absolute Scope 2
  // target. Strict > per params; missing/null growth ⇒ rule does not fire.
  const growth = profile.elecDemandGrowthPct;
  if (
    config.standardVersion === 'v2_0' &&
    config.scope === 's2_location' &&
    config.method === 'intensity' &&
    typeof growth === 'number' &&
    growth > ELEC_GROWTH_ABSOLUTE_THRESHOLD_PCT
  ) {
    reasons.push(`High electricity-demand growth (>${ELEC_GROWTH_ABSOLUTE_THRESHOLD_PCT}%/yr) requires an absolute Scope 2 target, not intensity.`);
  }

  // R5 — net-zero minimum reduction floor.
  // NOTE: this verifies that ONE target meets the >=90% floor as a NECESSARY
  // condition. It does NOT enforce the standard's inventory-wide
  // >=90%-across-S1+2+3 aggregate — that is a SEPARATE, deferred check over the
  // company's full set of targets. Do not read this as enforcing the full floor.
  if (isNetZero && config.reductionPct < NET_ZERO.minAbsoluteReductionPct) {
    reasons.push(`Net-zero targets require at least ${NET_ZERO.minAbsoluteReductionPct}% absolute reduction (this target: ${config.reductionPct}%).`);
  }

  // R6 — latest permissible net-zero year.
  if (isNetZero && config.targetYear > NET_ZERO.latestNetZeroYear) {
    reasons.push(`Net-zero target year cannot be later than ${NET_ZERO.latestNetZeroYear}.`);
  }

  // R7 — s3Category only valid for Scope 3 targets (mirrors DB sbti_targets_s3_category_scope).
  // Per decision B, a total-Scope-3 target with NO category is valid (s3Category not required).
  if (config.s3Category != null && config.scope !== 's3') {
    reasons.push('A Scope 3 category (s3Category) is only valid when scope is "s3".');
  }

  // R8 — s3Category range when present.
  if (config.s3Category != null && !(Number.isInteger(config.s3Category) && config.s3Category >= 1 && config.s3Category <= 14)) {
    reasons.push('s3Category must be an integer from 1 to 14.');
  }

  // R9 — net-zero is inherently an absolute >=90% reduction; intensity is invalid.
  if (isNetZero && config.method === 'intensity') {
    reasons.push('Net-zero targets must use the absolute method, not intensity.');
  }

  return { ok: reasons.length === 0, reasons };
}

// ── ACA suggested reduction % (anchored linear, floored) ───────────────
// `bucket` is the ACA RATE BUCKET ('s1s2' = the combined S1+S2 floor, 's3' =
// the Scope-3 floor) — NOT a persisted DB scope. This function has no business
// knowing how the result later splits into separate s1 / s2_location rows.
// Floors and the default net-zero year come ONLY from params (never hardcoded).
//
// Anchored linear: ambition is linear-to-zero (100%) by the net-zero year, so the
// raw slope = 100 / yearsToNetZero. max(rawSlope, floor) means "at least the SBTi
// floor rate, but steeper if linear-to-zero is steeper" — one expression, no branch.
export function acaSuggestedReductionPct(input: {
  bucket: 's1s2' | 's3';      // rate bucket — NOT a persisted scope
  baseYear: number;
  targetYear: number;
  netZeroYear?: number;       // defaults to NET_ZERO.latestNetZeroYear
}): number {
  const nzYear = input.netZeroYear ?? NET_ZERO.latestNetZeroYear;

  // Guard first: no reduction span.
  if (input.targetYear <= input.baseYear) return 0;

  const floor = input.bucket === 's1s2'
    ? ACA.v2_0.annualLinearReductionPct
    : ACA.v2_0.scope3AnnualLinearReductionPct;

  const slope = Math.max(100 / (nzYear - input.baseYear), floor);
  const raw = slope * (input.targetYear - input.baseYear);
  return Math.min(100, Math.max(0, raw));
}

// ── Target trajectory (linear path, base→target inclusive) ─────────────
export interface Point { year: number; emissions: number; }  // emissions in absolute tCO2e

// DOWNSTREAM of acaSuggestedReductionPct: the caller computes the cumulative
// reduction % first, then passes it here. This draws the USER'S ACTUAL TARGET
// line (the reductionPct they committed to) — NOT the floor or the suggested
// default. Pure arithmetic; intentionally params-free (base emissions and the %
// are all caller-supplied — there is nothing to read from params).
//
// Phase-1 scope: ABSOLUTE-emissions lines only. An intensity target is per-unit-
// of-output and needs a projected output denominator this signature does NOT
// carry; drawing it as an absolute line would put a wrong number on a
// verifier-facing chart. So method 'intensity' returns [] — a deliberate
// Phase-2 deferral, NOT a silent zero.
export function computeTrajectory(input: {
  baseYear: number;
  baseEmissions: number;        // absolute tCO2e at base year
  targetYear: number;
  reductionPct: number;         // cumulative % reduction at targetYear (caller-supplied)
  method: 'absolute_aca' | 'intensity';
}): Point[] {
  // Method guard first: intensity paths are deferred to Phase 2 (see comment above).
  if (input.method === 'intensity') return [];

  // Span guard: no span to draw.
  if (input.targetYear <= input.baseYear) return [];

  const span = input.targetYear - input.baseYear;
  const points: Point[] = [];
  for (let y = input.baseYear; y <= input.targetYear; y++) {
    const fraction = (y - input.baseYear) / span;
    const emissions = input.baseEmissions * (1 - (input.reductionPct * fraction) / 100);
    points.push({ year: y, emissions });
  }
  return points;
}
