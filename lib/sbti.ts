// lib/sbti.ts
// SBTi target-setting & monitoring engine — single source of truth (workplan §4).
// Pure functions only: no I/O, no DB, no Date.now(). All numeric criteria are read
// from ./sbti/params — nothing is hardcoded here.
// ThemisIQ prepares & monitors targets; it does not validate them (SBTi Services does).
//
// Engine build is incremental. THIS step ships categorize() + validateTargetConfig()
// + acaSuggestedReductionPct() + computeTrajectory() + progressStatus()
// + requiredScope3Categories() + cycleState() — the final engine function.
import { CATEGORY_A_THRESHOLDS, NET_ZERO, ELEC_GROWTH_ABSOLUTE_THRESHOLD_PCT, ACA, SCOPE3_SIGNIFICANCE_PCT, FLAG_MATERIALITY_PCT, FLAG_EXEMPTION_PCT, FLAG_SECTOR_S1_COVERAGE_PCT, FLAG_SECTOR_S3_COVERAGE_PCT, FLAG_NODEFOR_MAX_DATE, FLAG_NODEFOR_MAX_YEARS_AFTER_SUBMISSION } from './sbti/params';

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

// ── Progress status (current-year actual vs trajectory) ────────────────
// Turns this year's actual emissions vs this year's trajectory point into the
// dashboard status chip. `best_efforts` is the SBTi V2.0 concept: a company that
// has exhausted all available decarbonisation options AND stayed transparent
// about the barriers stays IN the programme despite being over its trajectory —
// it is NOT the same as off-track. Pure; params-free. The caller picks the right
// year's Point off computeTrajectory()'s output and passes its `.emissions` here.
export type PerformanceStatus = 'on_track' | 'off_track' | 'best_efforts';

export function progressStatus(input: {
  actual: number;              // current-year actual emissions, tCO2e
  trajectoryEmissions: number; // current-year trajectory point (.emissions from computeTrajectory)
  effortEvidence: boolean;     // documented best-efforts evidence
}): PerformanceStatus {
  // Minimal guard: emissions must be finite (reject NaN / ±Infinity). Deliberately
  // NOT re-validating ranges — that is validateTargetConfig's job, not this one's.
  if (!Number.isFinite(input.actual) || !Number.isFinite(input.trajectoryEmissions)) {
    throw new Error('progressStatus: actual and trajectoryEmissions must be finite numbers.');
  }

  // Boundary is <= : exactly on the line counts as on-track.
  if (input.actual <= input.trajectoryEmissions) return 'on_track';
  return input.effortEvidence ? 'best_efforts' : 'off_track';
}

// ── Trajectory point selector (exact-match-or-throw) ───────────────────
// The SAFE selector callers use to pick the current-year Point off
// computeTrajectory()'s Point[] before handing `.emissions` to progressStatus.
// It exists so a wrong-year or missing-year pull can NEVER happen silently:
// exact-match-or-throw. It never returns the nearest point and never returns
// undefined. The thrown condition is what the Phase-2 dashboard surfaces as a
// "confirm the reporting year" warning — this function is the guarantee under it.
// Pure; params-free. Reuses the existing Point interface.
export function trajectoryPointForYear(trajectory: Point[], year: number): Point {
  if (!Number.isFinite(year)) {
    throw new Error(`trajectoryPointForYear: year must be a finite number (got ${year}).`);
  }
  if (trajectory.length === 0) {
    throw new Error('trajectoryPointForYear: trajectory is empty — no path to select from (e.g. a deferred intensity trajectory).');
  }

  const matches = trajectory.filter(p => p.year === year);
  if (matches.length === 0) {
    const first = trajectory[0].year;
    const last = trajectory[trajectory.length - 1].year;
    throw new Error(`trajectoryPointForYear: no point for year ${year} (available range ${first}–${last}).`);
  }
  if (matches.length > 1) {
    throw new Error(`trajectoryPointForYear: ${matches.length} points found for year ${year} — duplicate-year data integrity violation.`);
  }
  return matches[0];
}

// ── Target progress (join a saved target to its actual for a reporting year) ──
// Pure. DB-agnostic: NO Supabase, NO snake_case, NO SeriesYear import. The caller maps
// the stored row → these camelCase inputs and resolves `actual` (the SeriesYear field
// named by scopeActualField). This helper only computes the required path, grades the
// actual against it, and packages the result for the dashboard.

// Superset of PerformanceStatus adding the "no actual for this scope/year yet" state —
// distinct from off_track (which means we DO have an actual and it is over the line).
export type TargetProgressStatus = PerformanceStatus | 'no_actual';

// Pure mapper: target scope → the SeriesYear field the caller reads the actual from.
// Documents the join WITHOUT importing SeriesYear. s1s2_combined reads the precomputed
// scope12Total (= scope1 + location-based scope2); s2_location is location-based by design.
export function scopeActualField(
  scope: Scope
): 'scope1' | 'scope2Location' | 'scope3' | 'scope12Total' {
  switch (scope) {
    case 's1': return 'scope1';
    case 's2_location': return 'scope2Location';
    case 's3': return 'scope3';
    case 's1s2_combined': return 'scope12Total';
  }
}

export interface TargetProgress {
  scope: Scope;
  assessedYear: number;          // the reporting year assessed
  requiredEmissions: number;     // trajectory point for assessedYear (tCO2e)
  actualEmissions: number | null;// null → no actual for that scope/year
  status: TargetProgressStatus;  // 'no_actual' when actualEmissions is null
  trajectory: Point[];           // full base→target path, for charting
}

// Grade ONE saved target against its actual for a given reporting year. Throws (loud,
// like trajectoryPointForYear) when there is no drawable path — the UI gates on
// traj.length before calling, so reaching here with no path is a caller bug, not a state.
export function progressForTarget(input: {
  baseYear: number;
  baseEmissions: number;         // tCO2e at base year (stored base_year_emissions_tco2e or series)
  targetYear: number;
  reductionPct: number;
  method: Method;                // 'absolute_aca' | 'intensity'
  scope: Scope;
  assessedYear: number;          // reporting year to grade against
  actual: number | null;         // caller-resolved actual for this scope+year (null if none)
  effortEvidence: boolean;       // pass false for v1
}): TargetProgress {
  const trajectory = computeTrajectory({
    baseYear: input.baseYear,
    baseEmissions: input.baseEmissions,
    targetYear: input.targetYear,
    reductionPct: input.reductionPct,
    method: input.method,
  });

  // No drawable path (deferred intensity method or targetYear <= baseYear). Throw loud,
  // mirroring trajectoryPointForYear — a caller must gate on traj.length before asking.
  if (trajectory.length === 0) {
    throw new Error('progressForTarget: no trajectory (deferred intensity or invalid span).');
  }

  // Throws if assessedYear is outside base..target — intended (see trajectoryPointForYear).
  const requiredEmissions = trajectoryPointForYear(trajectory, input.assessedYear).emissions;

  // No actual → report the gap explicitly; never hand null to progressStatus (non-finite throws).
  if (input.actual === null) {
    return {
      scope: input.scope,
      assessedYear: input.assessedYear,
      requiredEmissions,
      actualEmissions: null,
      status: 'no_actual',
      trajectory,
    };
  }

  const status = progressStatus({
    actual: input.actual,
    trajectoryEmissions: requiredEmissions,
    effortEvidence: input.effortEvidence,
  });

  return {
    scope: input.scope,
    assessedYear: input.assessedYear,
    requiredEmissions,
    actualEmissions: input.actual,
    status,
    trajectory,
  };
}

// ── Scope 3 significance (≥5% of total S3 → must carry a target) ────────
// The SBTi Corporate Net-Zero Standard V2.0 ≥5%-of-total-S3 significance rule
// applies to Scope 3 categories 1–14 ONLY. Category 15 (financed emissions) is
// governed by the separate SBTi Financial Institutions Net-Zero Standard (FINZ)
// on a portfolio-alignment basis — it is NOT part of this engine's near-term
// coverage rule. So this function works strictly on 1–14: cat 15 is filtered out
// of BOTH the output AND the denominator. The "total S3" here is the 1–14 sum —
// the exact denominator the Corporate ≥5% rule is defined over. This engine's
// total can therefore legitimately differ from the Scope-3 module's full 1–15
// totalScope3 for a customer with financed emissions; that divergence is correct.
// Pure; reads only SCOPE3_SIGNIFICANCE_PCT from params.
export interface Scope3CategoryResult {
  category: number;   // GHG Protocol S3 category, 1–14
  pct: number;        // % of total 1–14 S3 emissions (0–100)
  required: boolean;  // true if pct >= SCOPE3_SIGNIFICANCE_PCT
}

export function requiredScope3Categories(
  scope3Breakdown: { category: number; emissions: number }[],
): Scope3CategoryResult[] {
  // Guards: validate every row before any maths (surface upstream mapping bugs loud).
  const seen = new Set<number>();
  for (const row of scope3Breakdown) {
    if (!Number.isInteger(row.category) || row.category < 1 || row.category > 15) {
      throw new Error(`requiredScope3Categories: invalid category ${row.category} — must be an integer GHG Protocol Scope 3 category (1–15).`);
    }
    if (!(row.emissions >= 0) || !Number.isFinite(row.emissions)) {
      throw new Error(`requiredScope3Categories: category ${row.category} has invalid emissions ${row.emissions} — must be a finite, non-negative number.`);
    }
    if (seen.has(row.category)) {
      throw new Error(`requiredScope3Categories: duplicate category ${row.category} — data-integrity violation (input must have one row per category).`);
    }
    seen.add(row.category);
  }

  // Drop cat 15 silently (valid input, but FINZ's domain — see comment above).
  const inScope = scope3Breakdown.filter(r => r.category <= 14);

  // Denominator = the 1–14 sum. Empty / all-zero ⇒ nothing required (no divide-by-zero).
  const total = inScope.reduce((sum, r) => sum + r.emissions, 0);
  if (total <= 0) return [];

  return inScope
    .map(r => {
      const pct = (r.emissions / total) * 100;
      return { category: r.category, pct, required: pct >= SCOPE3_SIGNIFICANCE_PCT };
    })
    .sort((a, b) => a.category - b.category);
}

// ── SBTi V2.0 accountability-cycle classifier ──────────────────────────
// Classifies where a company sits in its SBTi V2.0 5-year accountability cycle.
// PURE date classifier over ALREADY-STORED dates: cycle_end, renewal_due and
// transition_plan_due are computed at write-time and stored on sbti_cycle — this
// function reads and compares them, it does NOT derive them.
//
// Dates are YYYY-MM-DD strings compared AS STRINGS: lexicographic order equals
// calendar order for that fixed format, with zero timezone surface. This
// deliberately avoids new Date('YYYY-MM-DD'), which parses as UTC midnight and
// shifts the day in negative-offset zones. The caller MUST pass `today` as a
// LOCAL calendar date — NOT new Date().toISOString().slice(0,10), which is the
// UTC date and can be a day off near midnight.
//
// `phase` tracks the RENEWAL cycle only. `transitionPlanDue` is an orthogonal
// Category-A output and is NEVER folded into phase.
export type CyclePhase = 'pending' | 'active' | 'review_due' | 'overdue';
export interface CycleState {
  phase: CyclePhase;
  renewalDue: string;               // YYYY-MM-DD, echoed from input
  transitionPlanDue: string | null; // YYYY-MM-DD for Category A with an unpublished plan; else null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function cycleState(input: {
  cycle: {
    cycleStart: string;                // YYYY-MM-DD
    cycleEnd: string;                  // YYYY-MM-DD
    renewalDue: string;                // YYYY-MM-DD
    transitionPlanDue?: string | null; // YYYY-MM-DD or null
    transitionPlanPublished: boolean;
  };
  category: 'A' | 'B';
  today: string;                       // YYYY-MM-DD — caller supplies the LOCAL calendar date
}): CycleState {
  const { cycle, category, today } = input;

  // Format guard: the four required dates must each be YYYY-MM-DD.
  const required: [string, unknown][] = [
    ['cycleStart', cycle.cycleStart],
    ['cycleEnd', cycle.cycleEnd],
    ['renewalDue', cycle.renewalDue],
    ['today', today],
  ];
  for (const [field, value] of required) {
    if (typeof value !== 'string' || !ISO_DATE.test(value)) {
      throw new Error(`cycleState: ${field} must be a YYYY-MM-DD date (got ${JSON.stringify(value)}).`);
    }
  }
  // transitionPlanDue is optional; if present it must be well-formed.
  if (cycle.transitionPlanDue != null && !ISO_DATE.test(cycle.transitionPlanDue)) {
    throw new Error(`cycleState: transitionPlanDue must be a YYYY-MM-DD date or null (got ${JSON.stringify(cycle.transitionPlanDue)}).`);
  }

  // Integrity guard: cycleStart <= cycleEnd <= renewalDue (string compare = calendar order).
  if (cycle.cycleStart > cycle.cycleEnd) {
    throw new Error(`cycleState: cycleStart (${cycle.cycleStart}) is after cycleEnd (${cycle.cycleEnd}) — upstream write bug.`);
  }
  if (cycle.cycleEnd > cycle.renewalDue) {
    throw new Error(`cycleState: cycleEnd (${cycle.cycleEnd}) is after renewalDue (${cycle.renewalDue}) — upstream write bug.`);
  }

  // Phase — mutually exclusive, evaluated in order (pure string comparison).
  let phase: CyclePhase;
  if (today < cycle.cycleStart) phase = 'pending';
  else if (today < cycle.cycleEnd) phase = 'active';
  else if (today < cycle.renewalDue) phase = 'review_due';
  else phase = 'overdue';

  // transitionPlanDue: Category-A only, only while unpublished and a date exists.
  const transitionPlanDue =
    category === 'A' && !cycle.transitionPlanPublished && cycle.transitionPlanDue != null
      ? cycle.transitionPlanDue
      : null;

  return { phase, renewalDue: cycle.renewalDue, transitionPlanDue };
}

// ── SBTi FLAG target-setting (FLAG-1: applicability + config validation) ────────
// SBTi FLAG Guidance v1.2 (Mar 2026). Consumes caller-supplied FLAG emission PRIMITIVES
// (not FlagInventory — the engine stays inventory-agnostic, matching baseEmissions/actual).
// Mirrors requiredScope3Categories: loud guards, %-of-total, params thresholds, graded result.
export type FlagTargetStatus = 'required_sector' | 'required_material' | 'recommended' | 'exempt_below_floor';
export interface FlagApplicabilityResult {
  status: FlagTargetStatus;
  flagPct: number;    // flagGrossEmissions / totalS123 × 100
  required: boolean;  // true for the two 'required_*' statuses
  reason: string;     // human-readable, cites the rule
}

/**
 * Determine whether a company must set a separate SBTi FLAG target (SBTi FLAG v1.2).
 *   - FLAG-designated sector member: required unless FLAG < 5% of footprint (exempt).
 *   - Non-sector: required if FLAG ≥ 20% of footprint; recommended (voluntary) 5–20%; exempt < 5%.
 * flagGrossEmissions is GROSS-of-removals. A net-sequestering inventory (gross < 0) has no positive
 * FLAG emissions to trigger materiality → exempt, but flagged honestly (removals-target rules may apply).
 */
export function flagTargetApplicability(input: {
  flagGrossEmissions: number;      // tCO2e, gross (removals excluded) — FlagInventory.grossEmissions, caller-supplied
  totalS123Emissions: number;      // tCO2e, total Scope 1+2+3 (the SBTi denominator)
  isFlagDesignatedSector: boolean;
}): FlagApplicabilityResult {
  const { flagGrossEmissions, totalS123Emissions, isFlagDesignatedSector } = input;

  if (!Number.isFinite(flagGrossEmissions)) {
    throw new Error('flagTargetApplicability: flagGrossEmissions must be a finite number.');
  }
  if (!Number.isFinite(totalS123Emissions) || totalS123Emissions <= 0) {
    throw new Error('flagTargetApplicability: totalS123Emissions must be a finite number > 0 (cannot compute a percentage of zero total).');
  }
  if (flagGrossEmissions > totalS123Emissions) {
    throw new Error(`flagTargetApplicability: flagGrossEmissions (${flagGrossEmissions}) cannot exceed totalS123Emissions (${totalS123Emissions}) — input error.`);
  }

  // Net-sequestering FLAG inventory: no positive gross emissions to weigh — honest exempt, not a silent 0.
  if (flagGrossEmissions < 0) {
    return {
      status: 'exempt_below_floor',
      flagPct: 0,
      required: false,
      reason: 'net-sequestering FLAG inventory (gross < 0); no positive FLAG emissions to trigger materiality — FLAG removals-target rules may still apply (SBTi FLAG v1.2).',
    };
  }

  const flagPct = (flagGrossEmissions / totalS123Emissions) * 100;
  const pctStr = flagPct.toFixed(1);

  if (isFlagDesignatedSector) {
    if (flagPct >= FLAG_EXEMPTION_PCT) {
      return { status: 'required_sector', flagPct, required: true,
        reason: `FLAG-designated sector with FLAG emissions ${pctStr}% ≥${FLAG_EXEMPTION_PCT}% → separate FLAG target required (SBTi FLAG v1.2).` };
    }
    return { status: 'exempt_below_floor', flagPct, required: false,
      reason: `FLAG-designated sector but FLAG emissions ${pctStr}% <${FLAG_EXEMPTION_PCT}% → below the exemption floor, no separate FLAG target required (SBTi FLAG v1.2).` };
  }

  if (flagPct >= FLAG_MATERIALITY_PCT) {
    return { status: 'required_material', flagPct, required: true,
      reason: `FLAG emissions ${pctStr}% ≥${FLAG_MATERIALITY_PCT}% of total footprint → material, separate FLAG target required (SBTi FLAG v1.2).` };
  }
  if (flagPct >= FLAG_EXEMPTION_PCT) {
    return { status: 'recommended', flagPct, required: false,
      reason: `FLAG emissions ${pctStr}% between ${FLAG_EXEMPTION_PCT}% and ${FLAG_MATERIALITY_PCT}% → FLAG target recommended (voluntary), not required (SBTi FLAG v1.2).` };
  }
  return { status: 'exempt_below_floor', flagPct, required: false,
    reason: `FLAG emissions ${pctStr}% <${FLAG_EXEMPTION_PCT}% of total footprint → exempt from a separate FLAG target (SBTi FLAG v1.2).` };
}

// ── FLAG target config + validation (FLAG-1) ────────────────────────────────────
export interface NoDeforestationCommitment {
  committed: boolean;
  targetDate: string;              // ISO 'YYYY-MM-DD'
  submissionDate?: string;         // FLAG target submission date, for the +2yr check
}
export interface FlagTargetConfig {
  baseYear: number;
  targetYear: number;
  pathway: 'sector' | 'commodity' | 'combination';   // trajectory itself is FLAG-2
  reductionPct?: number;           // deferred to FLAG-2
  noDeforestation: NoDeforestationCommitment;
  scope1CoveragePct?: number;      // validated against 95% if supplied
  scope3CoveragePct?: number;      // validated against 67% if supplied
}

/**
 * Validate a near-term FLAG target config (SBTi FLAG v1.2). Accumulates ALL failing reasons
 * (no short-circuit); ok === reasons.length === 0. Pure; dates compared as YYYY-MM-DD strings
 * (lexicographic == calendar for that format; zero timezone surface — matches cycleState).
 */
export function validateFlagTargetConfig(cfg: FlagTargetConfig): ValidationResult {
  const reasons: string[] = [];

  // F1 — target after base year.
  if (!(cfg.targetYear > cfg.baseYear)) {
    reasons.push('FLAG target year must be after the base year.');
  }
  // F2 — near-term FLAG horizon 5–10 years.
  const horizon = cfg.targetYear - cfg.baseYear;
  if (horizon < 5 || horizon > 10) {
    reasons.push(`Near-term FLAG target horizon must be 5–10 years (targetYear − baseYear); got ${horizon}.`);
  }
  // F3 — no-deforestation commitment is MANDATORY.
  if (cfg.noDeforestation.committed !== true) {
    reasons.push('A no-deforestation commitment is mandatory for any FLAG target (SBTi FLAG v1.2, FLAG-C4).');
  }

  const td = cfg.noDeforestation.targetDate;
  if (!ISO_DATE.test(td)) {
    reasons.push(`No-deforestation targetDate must be an ISO YYYY-MM-DD date; got '${td}'.`);
  } else {
    // F4 — targetDate ≤ 2030-12-31 hard ceiling.
    if (td > FLAG_NODEFOR_MAX_DATE) {
      reasons.push(`No-deforestation target date ${td} exceeds the ${FLAG_NODEFOR_MAX_DATE} ceiling (SBTi FLAG v1.2).`);
    }
    // F5 — targetDate ≤ submissionDate + 2 years (only if submissionDate supplied and valid).
    const sd = cfg.noDeforestation.submissionDate;
    if (sd != null) {
      if (!ISO_DATE.test(sd)) {
        reasons.push(`No-deforestation submissionDate must be an ISO YYYY-MM-DD date; got '${sd}'.`);
      } else {
        const [y, m, d] = sd.split('-');
        const ceiling = `${Number(y) + FLAG_NODEFOR_MAX_YEARS_AFTER_SUBMISSION}-${m}-${d}`;
        if (td > ceiling) {
          reasons.push(`No-deforestation target date ${td} is more than ${FLAG_NODEFOR_MAX_YEARS_AFTER_SUBMISSION} years after the submission date ${sd} (must be ≤ ${ceiling}).`);
        }
      }
    }
  }

  // F6 — Scope-1 coverage ≥95% if supplied.
  if (cfg.scope1CoveragePct != null && cfg.scope1CoveragePct < FLAG_SECTOR_S1_COVERAGE_PCT) {
    reasons.push(`FLAG Scope-1 coverage ${cfg.scope1CoveragePct}% is below the required ${FLAG_SECTOR_S1_COVERAGE_PCT}%.`);
  }
  // F7 — Scope-3 coverage ≥67% if supplied.
  if (cfg.scope3CoveragePct != null && cfg.scope3CoveragePct < FLAG_SECTOR_S3_COVERAGE_PCT) {
    reasons.push(`FLAG Scope-3 coverage ${cfg.scope3CoveragePct}% is below the required ${FLAG_SECTOR_S3_COVERAGE_PCT}%.`);
  }

  return { ok: reasons.length === 0, reasons };
}
