// lib/sbti.test.ts
// Engine tests — step 1: categorize() only. Assertions read thresholds from params
// (not hardcoded), so a §12 criteria change to params re-points them automatically.
import { describe, it, expect } from 'vitest';
import { categorize, validateTargetConfig, type TargetConfig, type SbtiProfile } from './sbti';
import { CATEGORY_A_THRESHOLDS as T, NET_ZERO, ELEC_GROWTH_ABSOLUTE_THRESHOLD_PCT } from './sbti/params';

describe('categorize — Route 1 (any country)', () => {
  it('net turnover AT threshold (€450M) → A / route1', () => {
    expect(categorize({ highIncomeCountry: false, netTurnoverEur: T.anyCountry.netTurnoverEur }))
      .toEqual({ category: 'A', matchedRoute: 'route1' });
  });
  it('FTE AT threshold (1,000) → A / route1', () => {
    expect(categorize({ highIncomeCountry: false, fte: T.anyCountry.fte }))
      .toEqual({ category: 'A', matchedRoute: 'route1' });
  });
  it('just below both Route 1 thresholds → B', () => {
    expect(categorize({
      highIncomeCountry: false,
      netTurnoverEur: T.anyCountry.netTurnoverEur - 1,
      fte: T.anyCountry.fte - 1,
    })).toEqual({ category: 'B', matchedRoute: null });
  });
});

describe('categorize — Route 2 (high-income only)', () => {
  it('emissions AT standalone threshold (10k tCO2e) → A / route2_emissions', () => {
    expect(categorize({ highIncomeCountry: true, scope12EmissionsTco2e: T.highIncomeCountry.scope12EmissionsTco2e }))
      .toEqual({ category: 'A', matchedRoute: 'route2_emissions' });
  });
  it('emissions one below threshold + nothing else → B', () => {
    expect(categorize({ highIncomeCountry: true, scope12EmissionsTco2e: T.highIncomeCountry.scope12EmissionsTco2e - 1 }))
      .toEqual({ category: 'B', matchedRoute: null });
  });
  it('two of trio AT threshold — balance sheet (€25M) + FTE (250) → A / route2_twoOfThree', () => {
    expect(categorize({
      highIncomeCountry: true,
      balanceSheetEur: T.highIncomeCountry.twoOfThree.balanceSheetEur,
      fte: T.highIncomeCountry.twoOfThree.fte,
    })).toEqual({ category: 'A', matchedRoute: 'route2_twoOfThree' });
  });
  it('two of trio AT threshold — net turnover (€50M) + FTE (250) → A / route2_twoOfThree', () => {
    expect(categorize({
      highIncomeCountry: true,
      netTurnoverEur: T.highIncomeCountry.twoOfThree.netTurnoverEur,
      fte: T.highIncomeCountry.twoOfThree.fte,
    })).toEqual({ category: 'A', matchedRoute: 'route2_twoOfThree' });
  });
  it('exactly ONE of trio trips → B', () => {
    expect(categorize({ highIncomeCountry: true, balanceSheetEur: T.highIncomeCountry.twoOfThree.balanceSheetEur }))
      .toEqual({ category: 'B', matchedRoute: null });
  });
});

describe('categorize — high-income gating (Route 2 is high-income ONLY)', () => {
  it('NOT high-income but would pass Route 2 emissions → B', () => {
    expect(categorize({ highIncomeCountry: false, scope12EmissionsTco2e: T.highIncomeCountry.scope12EmissionsTco2e }))
      .toEqual({ category: 'B', matchedRoute: null });
  });
  it('NOT high-income but would pass Route 2 trio → B', () => {
    expect(categorize({
      highIncomeCountry: false,
      balanceSheetEur: T.highIncomeCountry.twoOfThree.balanceSheetEur,
      fte: T.highIncomeCountry.twoOfThree.fte, // 250 < 1,000, so Route 1 is NOT tripped
    })).toEqual({ category: 'B', matchedRoute: null });
  });
});

describe('categorize — clean B, absent inputs, precedence', () => {
  it('all inputs below every threshold → B / null', () => {
    expect(categorize({ highIncomeCountry: true, netTurnoverEur: 1, fte: 1, scope12EmissionsTco2e: 1, balanceSheetEur: 1 }))
      .toEqual({ category: 'B', matchedRoute: null });
  });
  it('no optional inputs at all never throws → B / null', () => {
    expect(categorize({ highIncomeCountry: true })).toEqual({ category: 'B', matchedRoute: null });
  });
  it('meets BOTH routes → route1 wins (defined precedence)', () => {
    // Route 1 (net turnover ≥ €450M) AND Route 2 emissions (≥10k, high-income).
    expect(categorize({
      highIncomeCountry: true,
      netTurnoverEur: T.anyCountry.netTurnoverEur,
      scope12EmissionsTco2e: T.highIncomeCountry.scope12EmissionsTco2e,
    })).toEqual({ category: 'A', matchedRoute: 'route1' });
  });
});

describe('validateTargetConfig', () => {
  const profile0: SbtiProfile = {};
  const validV2: TargetConfig = {
    standardVersion: 'v2_0', scope: 's1', method: 'absolute_aca',
    baseYear: 2022, targetYear: 2030, reductionPct: 50,
  };

  it('clean valid V2.0 config → ok, no reasons', () => {
    expect(validateTargetConfig(validV2, profile0)).toEqual({ ok: true, reasons: [] });
  });

  // ── each rule fails in isolation, at/near its boundary ──
  it('R1 — v2.0 rejects s1s2_combined', () => {
    const r = validateTargetConfig({ ...validV2, scope: 's1s2_combined' }, profile0);
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/combined/i);
  });
  it('R2 — targetYear === baseYear (boundary) rejected', () => {
    const r = validateTargetConfig({ ...validV2, targetYear: validV2.baseYear }, profile0);
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/after the base year/i);
  });
  it('R3 — reductionPct === 0 (boundary) rejected', () => {
    const r = validateTargetConfig({ ...validV2, reductionPct: 0 }, profile0);
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/greater than 0/i);
  });
  it('R4 — v2.0 intensity S2, growth just over threshold → rejected', () => {
    const r = validateTargetConfig(
      { ...validV2, scope: 's2_location', method: 'intensity' },
      { elecDemandGrowthPct: ELEC_GROWTH_ABSOLUTE_THRESHOLD_PCT + 1 },
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/absolute Scope 2/i);
  });
  it('R5 — net-zero one below the floor rejected', () => {
    const r = validateTargetConfig(
      { ...validV2, isNetZero: true, targetYear: NET_ZERO.latestNetZeroYear, reductionPct: NET_ZERO.minAbsoluteReductionPct - 1 },
      profile0,
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/absolute reduction/i);
  });
  it('R6 — net-zero year one past latest rejected', () => {
    const r = validateTargetConfig(
      { ...validV2, isNetZero: true, targetYear: NET_ZERO.latestNetZeroYear + 1, reductionPct: NET_ZERO.minAbsoluteReductionPct },
      profile0,
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/cannot be later than/i);
  });
  it('R7 — s3Category present with non-s3 scope rejected', () => {
    const r = validateTargetConfig({ ...validV2, scope: 's1', s3Category: 5 }, profile0);
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/only valid when scope/i);
  });
  it('R8 — s3Category out of range (15) rejected', () => {
    const r = validateTargetConfig({ ...validV2, scope: 's3', s3Category: 15 }, profile0);
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/1 to 14/);
  });
  it('R9 — net-zero with intensity method rejected', () => {
    const r = validateTargetConfig(
      { ...validV2, isNetZero: true, method: 'intensity', targetYear: NET_ZERO.latestNetZeroYear, reductionPct: NET_ZERO.minAbsoluteReductionPct },
      profile0,
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/must use the absolute method/i);
  });

  // ── R4 firing vs NOT firing ──
  it('R4 — exactly AT threshold does NOT fire (strict >)', () => {
    const r = validateTargetConfig(
      { ...validV2, scope: 's2_location', method: 'intensity' },
      { elecDemandGrowthPct: ELEC_GROWTH_ABSOLUTE_THRESHOLD_PCT },
    );
    expect(r).toEqual({ ok: true, reasons: [] });
  });
  it('R4 — null growth does NOT fire', () => {
    const r = validateTargetConfig(
      { ...validV2, scope: 's2_location', method: 'intensity' },
      { elecDemandGrowthPct: null },
    );
    expect(r.ok).toBe(true);
  });
  it('R4 — absolute_aca method does NOT fire even with high growth', () => {
    const r = validateTargetConfig(
      { ...validV2, scope: 's2_location', method: 'absolute_aca' },
      { elecDemandGrowthPct: ELEC_GROWTH_ABSOLUTE_THRESHOLD_PCT + 100 },
    );
    expect(r.ok).toBe(true);
  });
  it('R4 — v1_3_1 does NOT fire even with high growth (decision D)', () => {
    const r = validateTargetConfig(
      { ...validV2, standardVersion: 'v1_3_1', scope: 's2_location', method: 'intensity' },
      { elecDemandGrowthPct: ELEC_GROWTH_ABSOLUTE_THRESHOLD_PCT + 100 },
    );
    expect(r.ok).toBe(true);
  });

  // ── net-zero floor boundary ──
  it('R5 — net-zero AT the floor (=== minAbsoluteReductionPct) is ok', () => {
    const r = validateTargetConfig(
      { ...validV2, isNetZero: true, targetYear: NET_ZERO.latestNetZeroYear, reductionPct: NET_ZERO.minAbsoluteReductionPct },
      profile0,
    );
    expect(r).toEqual({ ok: true, reasons: [] });
  });

  // ── decision B guard: total-Scope-3 target with no category ──
  it('valid total-Scope-3 target with no s3Category → ok', () => {
    const r = validateTargetConfig({ ...validV2, scope: 's3' }, profile0);
    expect(r).toEqual({ ok: true, reasons: [] });
  });

  // ── accumulation: multiple rules trip at once, none short-circuited ──
  it('accumulates ALL failing reasons (no short-circuit)', () => {
    const r = validateTargetConfig(
      {
        standardVersion: 'v2_0', scope: 's1s2_combined', method: 'intensity',
        baseYear: 2022, targetYear: 2022, reductionPct: 0, isNetZero: true,
      },
      profile0,
    );
    // R1 (combined) + R2 (year<=base) + R3 (<=0) + R5 (net-zero<floor) + R9 (net-zero intensity)
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(5);
  });
});
