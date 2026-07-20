// lib/cbam/sefa.test.ts
// Pins the SEFA calculation (lib/cbam/sefa.ts), IR 2025/2620 Equations 2/4/6.
//
// The most load-bearing test here is the null-CSCF throw: a silent 1.0 substitution would fabricate
// a regulatory multiplier, so sfaProc MUST refuse. Every resolvePrecursorSefa branch that cannot be
// honestly computed is asserted to throw with a diagnosable message, not return a placeholder.
//
// Scalar inputs use real seeded values: cbam_factor 0.975 is the 2026 row of cbam_sefa_params, and
// benchmark 0.044 is 7208 10 00 Column A from cbam_benchmarks (line 233 of the seed migration).
import { describe, it, expect } from 'vitest';
import { sfaProc, computeSEFA, resolvePrecursorSefa, SEFAContext } from './sefa';
import type { PrecursorInput } from './types';

// A non-joint, non-EU precursor. Individual tests override provenance/boundary/origin as needed.
const precursor = (over: Partial<PrecursorInput> = {}): PrecursorInput => ({
  cnCode: '7201 10 11',
  category: 'pig_iron',
  massConsumed: 110,
  boundary: 'external',
  provenance: 'default',
  originCountry: 'CN',
  period: 2026,
  ...over,
});

describe('sfaProc — Eq 2 / Eq 6 core', () => {
  it('2026 CBAM factor × published CSCF × 7208 10 00 Column A → 0.0429', () => {
    // 0.975 × 1.0 × 0.044 = 0.0429
    expect(sfaProc(0.975, 1.0, 0.044)).toBeCloseTo(0.0429, 10);
  });

  // THE central test: a null CSCF is unpublished, not 1.0. SEFA is not determinable — must throw.
  it('throws when CSCF is null, and the message names CSCF', () => {
    expect(() => sfaProc(0.975, null, 0.044)).toThrow(/CSCF/);
    // and it must NOT silently behave like cscf = 1.0
    expect(() => sfaProc(0.975, null, 0.044)).toThrow(/not\s+determinable|unpublished|never treat/i);
  });

  it('throws on a NaN or undefined benchmark rather than yielding NaN', () => {
    expect(() => sfaProc(0.975, 1.0, NaN)).toThrow(/benchmark/);
    // undefined slips past the type system at the DB seam; guard it explicitly.
    expect(() => sfaProc(0.975, 1.0, undefined as unknown as number)).toThrow(/benchmark/);
  });

  it('throws on a NaN cbamFactor', () => {
    expect(() => sfaProc(NaN, 1.0, 0.044)).toThrow(/cbamFactor|CBAM_y/);
  });
});

describe('computeSEFA — Eq 4 roll-up', () => {
  it('no precursors → sefa equals sfaProc, contribution 0', () => {
    const r = computeSEFA(0.0429, [], 100, () => 0);
    expect(r.sfaProc).toBe(0.0429);
    expect(r.precursorContribution).toBe(0);
    expect(r.sefa).toBe(0.0429);
  });

  it('one precursor: mass 110, AL 100, SEFA_i 0.5 → contribution 0.55, sefa = sfaProc + 0.55', () => {
    // m_i = 110/100 = 1.1; contribution = 1.1 × 0.5 = 0.55
    const r = computeSEFA(0.0429, [precursor({ massConsumed: 110 })], 100, () => 0.5);
    expect(r.precursorContribution).toBeCloseTo(0.55, 10);
    expect(r.sefa).toBeCloseTo(0.0429 + 0.55, 10);
  });

  it("excludes 'joint' precursors from the sum (already inside sfaProc)", () => {
    const rows = [
      precursor({ cnCode: 'JOINT', boundary: 'joint', massConsumed: 999 }),
      precursor({ cnCode: 'EXT', boundary: 'external', massConsumed: 110 }),
    ];
    // only EXT contributes: 1.1 × 0.5 = 0.55 — the joint 999-mass row must not appear
    const r = computeSEFA(0.0429, rows, 100, () => 0.5);
    expect(r.precursorContribution).toBeCloseTo(0.55, 10);
  });

  it('throws on a non-positive activity level', () => {
    expect(() => computeSEFA(0.0429, [], 0, () => 0)).toThrow(/activityLevel|AL_g/);
  });
});

describe('resolvePrecursorSefa — provenance fork, fail-loud branches', () => {
  const ctx: SEFAContext = {
    isEuOrExempted: (c) => c === 'FR' || c === 'DE',
    cbamFactor: 0.975,
    cscf: 1.0,
    defaultBenchmarkB: () => 0.481,   // 7208 10 00 Column B (D) — a real seeded value
  };

  it("'default' resolves via Eq 6 (Column B): 0.975 × 1.0 × 0.481", () => {
    const v = resolvePrecursorSefa(precursor({ provenance: 'default' }), ctx);
    expect(v).toBeCloseTo(0.975 * 1.0 * 0.481, 10);
  });

  it("'default' propagates the null-CSCF throw", () => {
    const nullCscf: SEFAContext = { ...ctx, cscf: null };
    expect(() => resolvePrecursorSefa(precursor({ provenance: 'default' }), nullCscf)).toThrow(/CSCF/);
  });

  it("EU/exempted origin throws — free allocation for EU precursors is an open question, not 0", () => {
    const eu = precursor({ provenance: 'default', originCountry: 'FR' });
    expect(() => resolvePrecursorSefa(eu, ctx)).toThrow(/EU\/exempted|open question|do NOT assume 0/i);
  });

  it("'computed_here' throws — recursive SEFA not in the MVP", () => {
    const p = precursor({ provenance: 'computed_here' });
    expect(() => resolvePrecursorSefa(p, ctx)).toThrow(/computed_here|recursive/i);
  });

  it("'actual_verified' throws — no sefa_value column to express a verified SEFA", () => {
    const p = precursor({ provenance: 'actual_verified', verifierReportId: 'VR-1' });
    expect(() => resolvePrecursorSefa(p, ctx)).toThrow(/actual_verified|sefa_value|no .* column/i);
  });
});
