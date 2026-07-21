// lib/cbam/defaultShare.test.ts
// Pins computeDefaultShare (lib/cbam/defaultShare.ts) — the "share of embedded emissions for which
// default values were used", IR 2025/2547 Annex IV §1.2 (4)(b) / §1.1 15(d).
//
// The methodology is a documented ThemisIQ choice (see the file header): fraction not percentage,
// both legs separately, numerator = Σ m_i·SEE_i over DEFAULT-resolved precursors, denominator =
// the leg's embedded emissions. The two load-bearing behaviours these tests protect are:
//   • the fallback case — an actual_verified precursor with no valid verifier report falls to the
//     default value and MUST count toward the share; and
//   • zero denominator → null, NEVER 0 (an undefined share is not a zero share).
import { describe, it, expect } from 'vitest';
import { computeDefaultShare, ResolvedPrecursor } from './defaultShare';
import type { PrecursorInput } from './types';

const precursor = (over: Partial<PrecursorInput> = {}): PrecursorInput => ({
  cnCode: '7201 10 11',
  category: 'pig_iron',
  massConsumed: 100,
  boundary: 'external',
  provenance: 'default',
  originCountry: 'CN',
  period: 2026,
  ...over,
});

const res = (over: Partial<ResolvedPrecursor> = {}): ResolvedPrecursor => ({
  direct: 0,
  indirect: 0,
  fromDefault: false,
  ...over,
});

describe('computeDefaultShare — direct leg', () => {
  it('no precursors → direct share is a real computed 0 (nothing was defaulted)', () => {
    // denominator > 0 (the good has its own attributed emissions), numerator 0 → 0, not null.
    const r = computeDefaultShare([], new Map(), 100, { direct: 2.0, indirect: 0 });
    expect(r.direct).toBe(0);
  });

  it('one fully-defaulted precursor contributing exactly half the total → 0.5', () => {
    // m_i = 100/100 = 1; contribution = 1 × 1.0 = 1.0; denominator 2.0 → 0.5
    const p = precursor({ massConsumed: 100 });
    const resolved = new Map([[p, res({ direct: 1.0, fromDefault: true })]]);
    const r = computeDefaultShare([p], resolved, 100, { direct: 2.0, indirect: 0 });
    expect(r.direct).toBeCloseTo(0.5, 10);
  });

  it('mixed actual + default → only the defaulted portion enters the numerator', () => {
    // Two precursors each m_i = 1 and each SEE_i,direct = 1.0. Total direct embedded = 2.0.
    // One is defaulted (counts), one is actual/verified (does not). Share = 1.0 / 2.0 = 0.5.
    const pDefault = precursor({ cnCode: 'DEF', massConsumed: 100 });
    const pActual = precursor({ cnCode: 'ACT', massConsumed: 100, provenance: 'actual_verified' });
    const resolved = new Map([
      [pDefault, res({ direct: 1.0, fromDefault: true })],
      [pActual, res({ direct: 1.0, fromDefault: false })],
    ]);
    const r = computeDefaultShare([pDefault, pActual], resolved, 100, { direct: 2.0, indirect: 0 });
    expect(r.direct).toBeCloseTo(0.5, 10);
  });

  it('actual_verified WITHOUT a verifier report falls back to default and COUNTS toward the share', () => {
    // The operator intended an actual figure but is reporting the default value — fromDefault is true.
    // This is the resolveSEE fallback (missing_or_invalid_verifier_report): it contributes a defaulted
    // number, so it must be in the numerator. Two precursors, only the fallback one defaulted → 0.5.
    const pFallback = precursor({
      cnCode: 'FALLBACK',
      massConsumed: 100,
      provenance: 'actual_verified',   // intended actual...
      // ...but no valid verifier report, so resolveSEE returned the default value → fromDefault: true
    });
    const pGenuineActual = precursor({ cnCode: 'ACT', massConsumed: 100, provenance: 'actual_verified' });
    const resolved = new Map([
      [pFallback, res({ direct: 1.0, fromDefault: true })],
      [pGenuineActual, res({ direct: 1.0, fromDefault: false })],
    ]);
    const r = computeDefaultShare([pFallback, pGenuineActual], resolved, 100, { direct: 2.0, indirect: 0 });
    expect(r.direct).toBeCloseTo(0.5, 10);
  });

  it("excludes 'joint' precursors — they are inside the process, never resolved", () => {
    // The joint row is absent from the resolution map (computeSEE never resolves it) and must be
    // skipped BEFORE lookup, not throw. Only the external default precursor contributes.
    const pJoint = precursor({ cnCode: 'JOINT', boundary: 'joint', massConsumed: 999 });
    const pExt = precursor({ cnCode: 'EXT', boundary: 'external', massConsumed: 100 });
    const resolved = new Map([[pExt, res({ direct: 1.0, fromDefault: true })]]);
    const r = computeDefaultShare([pJoint, pExt], resolved, 100, { direct: 2.0, indirect: 0 });
    expect(r.direct).toBeCloseTo(0.5, 10);
  });

  it('throws if a non-joint precursor is missing from the resolution map (divergence guard)', () => {
    const p = precursor({ cnCode: 'ORPHAN' });
    expect(() => computeDefaultShare([p], new Map(), 100, { direct: 2.0, indirect: 0 })).toThrow(
      /resolution map|ORPHAN/,
    );
  });

  it('throws on a non-positive activity level', () => {
    expect(() => computeDefaultShare([], new Map(), 0, { direct: 1.0, indirect: 0 })).toThrow(
      /activityLevel|AL_g/,
    );
  });
});

describe('computeDefaultShare — zero denominator → null, not 0', () => {
  it('a zero direct denominator yields null (undefined share), asserted NOT 0', () => {
    const p = precursor({ massConsumed: 100 });
    const resolved = new Map([[p, res({ direct: 1.0, fromDefault: true })]]);
    const r = computeDefaultShare([p], resolved, 100, { direct: 0, indirect: 0 });
    expect(r.direct).toBeNull();
    expect(r.direct).not.toBe(0);
  });
});

describe('computeDefaultShare — indirect leg', () => {
  it('a defaulted indirect contribution is measured against the indirect denominator', () => {
    // m_i = 1, indirect SEE_i = 0.4, indirect denominator = 1.0 → indirect share 0.4.
    const p = precursor({ massConsumed: 100 });
    const resolved = new Map([[p, res({ direct: 1.0, indirect: 0.4, fromDefault: true })]]);
    const r = computeDefaultShare([p], resolved, 100, { direct: 2.0, indirect: 1.0 });
    expect(r.indirect).toBeCloseTo(0.4, 10);
  });

  it('Annex II good (no indirect leg): indirect denominator 0 → indirect is null, distinct from 0', () => {
    // Crude steel carries no indirect leg — see.indirect is 0 and there is no indirect contribution.
    // The direct share is a well-defined number; the indirect share is UNDEFINED (null), and null
    // must be distinguishable from a 0 share. This is where "null ≠ 0" earns its keep.
    const p = precursor({ massConsumed: 100 });
    const resolved = new Map([[p, res({ direct: 1.0, indirect: 0, fromDefault: true })]]);
    const r = computeDefaultShare([p], resolved, 100, { direct: 2.0, indirect: 0 });
    expect(r.direct).toBeCloseTo(0.5, 10);   // direct still well-defined...
    expect(r.indirect).toBeNull();           // ...but indirect is undefined, not 0
    expect(r.indirect).not.toBe(0);
  });
});
