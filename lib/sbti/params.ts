// lib/sbti/params.ts
// Single source of truth for SBTi criteria values. All figures VERIFIED against the
// primary standard (SBTi Corporate Net-Zero Standard V2.0, published 11 June 2026;
// Criteria PDF, Table 1) and the 29 Apr 2026 ACA update. Engine logic lives in
// lib/sbti.ts and reads ONLY from here — a criteria change is a one-line edit here.
//
// Provenance (so the audit trail travels with the file):
//   - Category thresholds: CNZS V2.0 Criteria, Table 1 (Company category thresholds,
//     conditions, and geographies). https://files.sciencebasedtargets.org/production/files/Corporate-Net-Zero-Standard-V2-Criteria.pdf
//   - ACA rates: SBTi minimum annual linear reduction (1.5°C = 4.2%/yr S1+2;
//     WB-2°C = 2.5%/yr S3); method revised 29 Apr 2026 (net-zero-year-anchored, not flat).
//   - Net-zero: ≥90% absolute reduction across S1-3; residual ≤10% neutralized; 2050 at latest.
//   - Scope 3 significance: any category ≥5% of total S3 requires a target (CNZS V2.0).

// ── Company categorization (Table 1) ───────────────────────────────────
// Category A has TWO routes. A company is Category A if EITHER route is met; else Category B.
// Currency is EUR (not USD). Geography = ultimate-parent jurisdiction, World Bank income class.
export const CATEGORY_A_THRESHOLDS = {
  // Route 1 — ANY country: meets at least ONE of:
  anyCountry: {
    netTurnoverEur: 450_000_000,   // ≥ €450M
    fte: 1_000,                    // ≥ 1,000 FTE
  },
  // Route 2 — HIGH-INCOME countries only: S1+2 emissions trigger, OR at least TWO of the trio.
  highIncomeCountry: {
    scope12EmissionsTco2e: 10_000, // ≥ 10,000 tCO2e (standalone trigger)
    twoOfThree: {
      balanceSheetEur: 25_000_000, // ≥ €25M
      netTurnoverEur: 50_000_000,  // ≥ €50M
      fte: 250,                    // ≥ 250 FTE
    },
  },
} as const;

// ── Electricity-growth → absolute Scope 2 requirement ──────────────────
// V2.0 (workplan §1): demand growth >20%/yr forces absolute (not intensity) Scope 2
// targets. Operator is strictly-greater-than 20 (exactly 20%/yr does NOT trigger).
export const ELEC_GROWTH_ABSOLUTE_THRESHOLD_PCT = 20;

// ── Absolute Contraction Approach (ACA) ────────────────────────────────
// Minimum annual linear reduction rates. The 4.2% S1+2 floor remained after the
// 29 Apr 2026 update, but the METHOD changed from flat (rate × years) to
// net-zero-year-anchored. This module specifies the anchored ACA form; the engine
// (lib/sbti.ts, not yet written) will implement it. These are the floors.
export const ACA = {
  v2_0: {
    annualLinearReductionPct: 4.2,        // Scope 1+2, 1.5°C floor
    scope3AnnualLinearReductionPct: 2.5,  // Scope 3, WB-2°C floor
    methodRevisedDate: '2026-04-29',      // anchor: net-zero-year-based, not flat
  },
  v1_3_1: {
    annualLinearReductionPct: 4.2,        // historical flat method for V1.3.1 submissions
    scope3AnnualLinearReductionPct: 2.5,
  },
} as const;

// ── ACA scope boundary (Phase-2 deferrals — do NOT fold into the slope) ──
// The ACA above models ONE thing: an emissions-reduction slope. Three related
// but DISTINCT concepts are deliberately OUT of it; a future reader must not
// merge any of them into acaSuggestedReductionPct's rate/slope:
//   (a) Location-based Scope 2 ABSOLUTE target = the ACA emissions slope itself
//       (the 's1s2' rate bucket). IN scope — this is what the ACA models today.
//   (b) Low-carbon-electricity (LCE) alignment target = a SHARE / coverage target
//       (% of electricity that is low-carbon), NOT an emissions slope — different
//       unit, different math. DEFERRED to Phase 2; not represented here.
//   (c) Power / maritime sector 2040 net-zero = a SECTOR OVERLAY (long-term SBTs
//       anchored to a 2040 net-zero year, not 2050) — a per-sector netZeroYear
//       override, not a rate change. DEFERRED to Phase 2+.

// ── Net-zero target requirements ───────────────────────────────────────
export const NET_ZERO = {
  minAbsoluteReductionPct: 90,   // ≥90% absolute reduction across S1-3 before neutralization
  maxResidualEmissionsPct: 10,   // residual ≤10% neutralized with permanent removals
  latestNetZeroYear: 2050,       // 2050 at the latest
} as const;

// ── Scope 3 significance threshold ─────────────────────────────────────
// Any S3 category ≥5% of total Scope 3 must carry a target (replaces V1's 67%-coverage rule).
export const SCOPE3_SIGNIFICANCE_PCT = 5;

// ── Version transition dates (SBTi's own dates — wizard copy must use these) ──
export const VERSION_DATES = {
  v2_0EffectiveDate: '2027-02-01',     // effective 1 Feb 2027
  v2_0ValidationOpens: '2027-01-01',   // validation opens Q1 2027
  v2_0MandatoryDate: '2028-02-01',     // mandatory 1 Feb 2028
  v1_3_1AcceptedUntil: '2028-01-31',   // both versions accepted through 31 Jan 2028
} as const;
