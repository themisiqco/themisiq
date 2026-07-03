// lib/sbti.test.ts
// Engine tests — step 1: categorize() only. Assertions read thresholds from params
// (not hardcoded), so a §12 criteria change to params re-points them automatically.
import { describe, it, expect } from 'vitest';
import { categorize, validateTargetConfig, acaSuggestedReductionPct, computeTrajectory, progressStatus, progressForTarget, scopeActualField, trajectoryPointForYear, requiredScope3Categories, cycleState, type TargetConfig, type SbtiProfile } from './sbti';
import { CATEGORY_A_THRESHOLDS as T, NET_ZERO, ELEC_GROWTH_ABSOLUTE_THRESHOLD_PCT, ACA, SCOPE3_SIGNIFICANCE_PCT } from './sbti/params';

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

describe('acaSuggestedReductionPct', () => {
  it('s1s2 2025→2030: floor binds (anchored 4.0 < 4.2) → floor × years', () => {
    // slope = max(100/(2050-2025)=4.0, 4.2) = 4.2; 4.2 × 5 = 21.
    expect(acaSuggestedReductionPct({ bucket: 's1s2', baseYear: 2025, targetYear: 2030 }))
      .toBeCloseTo(ACA.v2_0.annualLinearReductionPct * (2030 - 2025), 6);
  });

  it('s3 2025→2030: anchored binds (4.0 > 2.5 floor) → anchored slope × years (= 20, NOT the floor)', () => {
    const anchoredSlope = 100 / (NET_ZERO.latestNetZeroYear - 2025); // 100/25 = 4.0
    expect(acaSuggestedReductionPct({ bucket: 's3', baseYear: 2025, targetYear: 2030 }))
      .toBeCloseTo(anchoredSlope * (2030 - 2025), 6);
  });

  it('s3 floor-binding on a long horizon (nz 2075: anchored 2.0 < 2.5) → floor × years = 12.5', () => {
    // anchored = 100/(2075-2025) = 2.0 < 2.5 floor ⇒ floor binds.
    expect(acaSuggestedReductionPct({ bucket: 's3', baseYear: 2025, targetYear: 2030, netZeroYear: 2075 }))
      .toBeCloseTo(ACA.v2_0.scope3AnnualLinearReductionPct * (2030 - 2025), 6);
  });

  it('s1s2 short span 2040→2045 (nz 2050): anchored 10 binds → 50', () => {
    const anchoredSlope = 100 / (2050 - 2040); // 10
    expect(acaSuggestedReductionPct({ bucket: 's1s2', baseYear: 2040, targetYear: 2045, netZeroYear: 2050 }))
      .toBeCloseTo(anchoredSlope * (2045 - 2040), 6);
  });

  it('targetYear === baseYear → 0 (no span)', () => {
    expect(acaSuggestedReductionPct({ bucket: 's1s2', baseYear: 2030, targetYear: 2030 })).toBe(0);
  });

  it('targetYear < baseYear → 0 (guard)', () => {
    expect(acaSuggestedReductionPct({ bucket: 's3', baseYear: 2030, targetYear: 2025 })).toBe(0);
  });

  it('clamps to exactly 100 when raw exceeds 100', () => {
    // s1s2 2025→2050, default nz 2050: floor 4.2 binds; 4.2 × 25 = 105 → clamp 100.
    expect(acaSuggestedReductionPct({ bucket: 's1s2', baseYear: 2025, targetYear: 2050 })).toBe(100);
  });

  it('custom netZeroYear=2040 flows through (steeper than default 2050)', () => {
    // anchored = 100/(2040-2025) = 6.667 > 4.2 floor ⇒ anchored binds; ≈ 33.33,
    // distinct from the default-2050 result (4.2 × 5 = 21), proving the param is used.
    const anchored2040 = 100 / (2040 - 2025);
    expect(acaSuggestedReductionPct({ bucket: 's1s2', baseYear: 2025, targetYear: 2030, netZeroYear: 2040 }))
      .toBeCloseTo(anchored2040 * (2030 - 2025), 6);
  });
});

describe('computeTrajectory', () => {
  const ABS = 'absolute_aca' as const;

  it('absolute_aca 2025→2030, base 1000, reductionPct 21: 6 inclusive points, ends at 790', () => {
    const pts = computeTrajectory({ baseYear: 2025, baseEmissions: 1000, targetYear: 2030, reductionPct: 21, method: ABS });
    expect(pts).toHaveLength(6);                              // 2025..2030 inclusive
    expect(pts[0]).toEqual({ year: 2025, emissions: 1000 });  // fraction 0 → exact base
    expect(pts[5].year).toBe(2030);
    expect(pts[5].emissions).toBeCloseTo(1000 * (1 - 21 / 100)); // 790
  });

  it('midpoint 2027 (fraction 2/5): 1000 × (1 − 21×0.4/100) = 916.0', () => {
    const pts = computeTrajectory({ baseYear: 2025, baseEmissions: 1000, targetYear: 2030, reductionPct: 21, method: ABS });
    const p2027 = pts.find(p => p.year === 2027)!;
    expect(p2027.emissions).toBeCloseTo(916); // brief said 915.8 — arithmetic slip; correct is 916.0
  });

  it('monotonic decreasing (linear decline)', () => {
    const pts = computeTrajectory({ baseYear: 2025, baseEmissions: 1000, targetYear: 2035, reductionPct: 42, method: ABS });
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].emissions).toBeLessThanOrEqual(pts[i - 1].emissions);
    }
  });

  it("method 'intensity' → [] (Phase-2 deferral)", () => {
    expect(computeTrajectory({ baseYear: 2025, baseEmissions: 1000, targetYear: 2030, reductionPct: 21, method: 'intensity' })).toEqual([]);
  });

  it('targetYear === baseYear → []', () => {
    expect(computeTrajectory({ baseYear: 2030, baseEmissions: 1000, targetYear: 2030, reductionPct: 21, method: ABS })).toEqual([]);
  });
  it('targetYear < baseYear → []', () => {
    expect(computeTrajectory({ baseYear: 2030, baseEmissions: 1000, targetYear: 2025, reductionPct: 21, method: ABS })).toEqual([]);
  });

  it('reductionPct 100 → final point ≈ 0', () => {
    const pts = computeTrajectory({ baseYear: 2025, baseEmissions: 1000, targetYear: 2030, reductionPct: 100, method: ABS });
    expect(pts[pts.length - 1].emissions).toBeCloseTo(0);
  });

  it('reductionPct 0 → flat line, every point === baseEmissions', () => {
    const pts = computeTrajectory({ baseYear: 2025, baseEmissions: 1000, targetYear: 2030, reductionPct: 0, method: ABS });
    expect(pts).toHaveLength(6);
    for (const p of pts) expect(p.emissions).toBe(1000);
  });
});

describe('progressStatus', () => {
  it('under the line (actual < trajectory) → on_track', () => {
    expect(progressStatus({ actual: 900, trajectoryEmissions: 1000, effortEvidence: false })).toBe('on_track');
  });
  it('exactly on the line (actual === trajectory) → on_track (boundary)', () => {
    expect(progressStatus({ actual: 1000, trajectoryEmissions: 1000, effortEvidence: false })).toBe('on_track');
  });
  it('over + effortEvidence true → best_efforts', () => {
    expect(progressStatus({ actual: 1100, trajectoryEmissions: 1000, effortEvidence: true })).toBe('best_efforts');
  });
  it('over + effortEvidence false → off_track', () => {
    expect(progressStatus({ actual: 1100, trajectoryEmissions: 1000, effortEvidence: false })).toBe('off_track');
  });
  it('zero-zero edge (actual 0, trajectory 0) → on_track', () => {
    expect(progressStatus({ actual: 0, trajectoryEmissions: 0, effortEvidence: false })).toBe('on_track');
  });
  it('net-zero year: trajectory 0, actual 0.5, no effort → off_track', () => {
    expect(progressStatus({ actual: 0.5, trajectoryEmissions: 0, effortEvidence: false })).toBe('off_track');
  });
  it('net-zero year: trajectory 0, actual 0.5, effort → best_efforts', () => {
    expect(progressStatus({ actual: 0.5, trajectoryEmissions: 0, effortEvidence: true })).toBe('best_efforts');
  });
  it('non-finite guard: actual NaN throws; trajectoryEmissions Infinity throws', () => {
    expect(() => progressStatus({ actual: NaN, trajectoryEmissions: 1000, effortEvidence: false })).toThrow();
    expect(() => progressStatus({ actual: 100, trajectoryEmissions: Infinity, effortEvidence: false })).toThrow();
  });
});

describe('scopeActualField', () => {
  it("'s1' → 'scope1'", () => { expect(scopeActualField('s1')).toBe('scope1'); });
  it("'s2_location' → 'scope2Location'", () => { expect(scopeActualField('s2_location')).toBe('scope2Location'); });
  it("'s3' → 'scope3'", () => { expect(scopeActualField('s3')).toBe('scope3'); });
  it("'s1s2_combined' → 'scope12Total'", () => { expect(scopeActualField('s1s2_combined')).toBe('scope12Total'); });
});

describe('progressForTarget', () => {
  // Shared base case: 2020→2030, base 1000, 50% cumulative (absolute_aca), scope s1, assessed 2025.
  // required(2025) = baseEmissions * (1 - reductionPct * fraction / 100),
  //   fraction = (2025-2020)/(2030-2020) = 5/10 = 0.5  →  1000 * (1 - 50*0.5/100) = 750.
  const base = {
    baseYear: 2020, baseEmissions: 1000, targetYear: 2030, reductionPct: 50,
    method: 'absolute_aca' as const, scope: 's1' as const, assessedYear: 2025, effortEvidence: false,
  };
  const REQ_2025 = 1000 * (1 - (50 * (5 / 10)) / 100); // 750

  it('actual under the line (700 < 750) → on_track, actual echoed', () => {
    const r = progressForTarget({ ...base, actual: 700 });
    expect(r.status).toBe('on_track');
    expect(r.actualEmissions).toBe(700);
    expect(r.requiredEmissions).toBeCloseTo(REQ_2025);
  });

  it('actual over the line (800 > 750), effortEvidence false → off_track', () => {
    expect(progressForTarget({ ...base, actual: 800 }).status).toBe('off_track');
  });

  it('actual over the line (800 > 750), effortEvidence true → best_efforts', () => {
    expect(progressForTarget({ ...base, actual: 800, effortEvidence: true }).status).toBe('best_efforts');
  });

  it('actual null → no_actual, actualEmissions null, requiredEmissions still the 2025 point (750)', () => {
    const r = progressForTarget({ ...base, actual: null });
    expect(r.status).toBe('no_actual');
    expect(r.actualEmissions).toBeNull();
    expect(r.requiredEmissions).toBeCloseTo(REQ_2025);
  });

  it('assessedYear === baseYear → required === baseEmissions (fraction 0); actual at base → on_track', () => {
    const r = progressForTarget({ ...base, assessedYear: 2020, actual: 1000 });
    expect(r.requiredEmissions).toBeCloseTo(1000);
    expect(r.status).toBe('on_track');
  });

  it('trajectory returned is non-empty and length === targetYear - baseYear + 1 (11 inclusive)', () => {
    const r = progressForTarget({ ...base, actual: 700 });
    expect(r.trajectory.length).toBe(2030 - 2020 + 1);
    expect(r.trajectory.length).toBeGreaterThan(0);
  });

  it("method 'intensity' → throws (no drawable trajectory)", () => {
    expect(() => progressForTarget({ ...base, method: 'intensity', actual: 700 })).toThrow();
  });

  it('assessedYear outside base..target range → throws (propagated from trajectoryPointForYear)', () => {
    expect(() => progressForTarget({ ...base, assessedYear: 2031, actual: 700 })).toThrow();
  });

  it('realistic: 2025→2050, base 1000, 90%, s1, assessed 2030 → required 1000*(1-90*(5/25)/100)=820; actual 800 under → on_track', () => {
    const r = progressForTarget({
      baseYear: 2025, baseEmissions: 1000, targetYear: 2050, reductionPct: 90,
      method: 'absolute_aca', scope: 's1', assessedYear: 2030, actual: 800, effortEvidence: false,
    });
    expect(r.requiredEmissions).toBeCloseTo(1000 * (1 - (90 * (5 / 25)) / 100)); // 820
    expect(r.status).toBe('on_track');
  });
});

describe('trajectoryPointForYear', () => {
  const traj = computeTrajectory({ baseYear: 2025, baseEmissions: 1000, targetYear: 2030, reductionPct: 21, method: 'absolute_aca' });

  it('year present (2027) → that exact point', () => {
    const expected = traj.find(p => p.year === 2027)!;
    expect(trajectoryPointForYear(traj, 2027)).toEqual(expected);
    expect(trajectoryPointForYear(traj, 2027).year).toBe(2027);
  });
  it('base year (2025) → { year: 2025, emissions: 1000 }', () => {
    expect(trajectoryPointForYear(traj, 2025)).toEqual({ year: 2025, emissions: 1000 });
  });
  it('target year (2030) → final point', () => {
    expect(trajectoryPointForYear(traj, 2030)).toEqual(traj[traj.length - 1]);
  });
  it('year below range (2024) → throws', () => {
    expect(() => trajectoryPointForYear(traj, 2024)).toThrow();
  });
  it('year above range (2031) → throws', () => {
    expect(() => trajectoryPointForYear(traj, 2031)).toThrow();
  });
  it('empty trajectory ([]) → throws', () => {
    expect(() => trajectoryPointForYear([], 2027)).toThrow();
  });
  it('non-finite year (NaN) → throws', () => {
    expect(() => trajectoryPointForYear(traj, NaN)).toThrow();
  });
  it('duplicate-year input → throws', () => {
    expect(() => trajectoryPointForYear([{ year: 2027, emissions: 900 }, { year: 2027, emissions: 800 }], 2027)).toThrow();
  });
});

describe('requiredScope3Categories', () => {
  it('typical mix → 60/30/10%, all required, sorted ascending', () => {
    const out = requiredScope3Categories([{ category: 6, emissions: 300 }, { category: 1, emissions: 600 }, { category: 7, emissions: 100 }]);
    expect(out.map(r => r.category)).toEqual([1, 6, 7]);          // sorted ascending
    expect(out.map(r => r.required)).toEqual([true, true, true]);
    expect(out[0].pct).toBeCloseTo(60);
    expect(out[1].pct).toBeCloseTo(30);
    expect(out[2].pct).toBeCloseTo(10);
  });

  it('sub-threshold 4% → not required', () => {
    const out = requiredScope3Categories([{ category: 1, emissions: 4 }, { category: 2, emissions: 96 }]);
    const c1 = out.find(r => r.category === 1)!;
    expect(c1.pct).toBeCloseTo(4);
    expect(c1.required).toBe(false);
  });

  it('exactly at the threshold → required (>= boundary)', () => {
    const out = requiredScope3Categories([
      { category: 1, emissions: SCOPE3_SIGNIFICANCE_PCT },
      { category: 2, emissions: 100 - SCOPE3_SIGNIFICANCE_PCT },
    ]);
    const c1 = out.find(r => r.category === 1)!;
    expect(c1.pct).toBeCloseTo(SCOPE3_SIGNIFICANCE_PCT);
    expect(c1.required).toBe(true);
  });

  it('denominator EXCLUDES cat 15: [{1,50},{15,50}] → only cat 1, pct 100', () => {
    // If cat 15 were in the denominator, cat 1 would be 50% — proving the 1–14-only denominator.
    expect(requiredScope3Categories([{ category: 1, emissions: 50 }, { category: 15, emissions: 50 }]))
      .toEqual([{ category: 1, pct: 100, required: true }]);
  });

  it('cat 15 alone → [] (nothing 1–14)', () => {
    expect(requiredScope3Categories([{ category: 15, emissions: 100 }])).toEqual([]);
  });

  it('zero-present 1–14 category stays in output (pct 0, not required)', () => {
    expect(requiredScope3Categories([{ category: 1, emissions: 100 }, { category: 2, emissions: 0 }]))
      .toEqual([
        { category: 1, pct: 100, required: true },
        { category: 2, pct: 0, required: false },
      ]);
  });

  it('empty input → []', () => {
    expect(requiredScope3Categories([])).toEqual([]);
  });
  it('all-zero → [] (total 0)', () => {
    expect(requiredScope3Categories([{ category: 1, emissions: 0 }, { category: 2, emissions: 0 }])).toEqual([]);
  });

  it('throws on category 16 / 0 / non-integer / negative emissions / duplicate', () => {
    expect(() => requiredScope3Categories([{ category: 16, emissions: 10 }])).toThrow();
    expect(() => requiredScope3Categories([{ category: 0, emissions: 10 }])).toThrow();
    expect(() => requiredScope3Categories([{ category: 1.5, emissions: 10 }])).toThrow();
    expect(() => requiredScope3Categories([{ category: 1, emissions: -5 }])).toThrow();
    expect(() => requiredScope3Categories([{ category: 1, emissions: 10 }, { category: 1, emissions: 20 }])).toThrow();
  });

  it('pct precision: [{1,1},{2,2}] → cat 1 ≈ 33.33%', () => {
    const out = requiredScope3Categories([{ category: 1, emissions: 1 }, { category: 2, emissions: 2 }]);
    expect(out.find(r => r.category === 1)!.pct).toBeCloseTo(100 / 3);
  });
});

describe('cycleState', () => {
  const baseCycle = {
    cycleStart: '2027-02-01', cycleEnd: '2032-02-01', renewalDue: '2032-08-01',
    transitionPlanDue: '2028-02-01', transitionPlanPublished: false,
  };
  const at = (today: string, category: 'A' | 'B' = 'A') => cycleState({ cycle: baseCycle, category, today });

  it("today before cycleStart → 'pending'", () => {
    expect(at('2027-01-01').phase).toBe('pending');
  });
  it("today === cycleStart → 'active' (inclusive boundary)", () => {
    expect(at('2027-02-01').phase).toBe('active');
  });
  it("mid-cycle → 'active'", () => {
    expect(at('2029-06-01').phase).toBe('active');
  });
  it("today === cycleEnd → 'review_due' (boundary)", () => {
    expect(at('2032-02-01').phase).toBe('review_due');
  });
  it("in review window → 'review_due'", () => {
    expect(at('2032-05-01').phase).toBe('review_due');
  });
  it("today === renewalDue → 'overdue' (inclusive boundary)", () => {
    expect(at('2032-08-01').phase).toBe('overdue');
  });
  it("after renewalDue → 'overdue'", () => {
    expect(at('2033-01-01').phase).toBe('overdue');
  });

  it('echoes renewalDue in the result', () => {
    expect(at('2029-06-01').renewalDue).toBe('2032-08-01');
  });

  it('transitionPlanDue: Cat A, unpublished, date present → echoes the date', () => {
    expect(at('2029-06-01', 'A').transitionPlanDue).toBe('2028-02-01');
  });
  it('transitionPlanDue: Cat A, transitionPlanPublished true → null', () => {
    expect(cycleState({ cycle: { ...baseCycle, transitionPlanPublished: true }, category: 'A', today: '2029-06-01' }).transitionPlanDue).toBeNull();
  });
  it('transitionPlanDue: Cat B (date present) → null', () => {
    expect(at('2029-06-01', 'B').transitionPlanDue).toBeNull();
  });
  it('transitionPlanDue: Cat A, input transitionPlanDue null → null', () => {
    expect(cycleState({ cycle: { ...baseCycle, transitionPlanDue: null }, category: 'A', today: '2029-06-01' }).transitionPlanDue).toBeNull();
  });

  it('throws: malformed today / missing cycleEnd / out-of-order boundaries', () => {
    expect(() => at('2027-2-1')).toThrow();                                                                   // malformed today
    expect(() => cycleState({ cycle: { ...baseCycle, cycleEnd: undefined as unknown as string }, category: 'A', today: '2029-06-01' })).toThrow(); // missing cycleEnd
    expect(() => cycleState({ cycle: { ...baseCycle, cycleStart: '2027-02-01', cycleEnd: '2026-01-01' }, category: 'A', today: '2029-06-01' })).toThrow(); // cycleEnd before cycleStart
  });
});
