// lib/cbam/engine.test.ts
// Pins the IR 2025/2547 Annex II mass-balance equations as implemented in ./engine:
// Eq 12 (Em_k = f × AD_k × CC_k), Eq 13/14 (EF → carbon content), Eq 15 (biomass fraction).
// The sign convention is load-bearing: outputs carry ad < 0 so DirEm* nets carbon in − out
// via a single sum. A test that expects a subtraction here is testing the wrong contract.
import { describe, it, expect } from 'vitest';
import { carbonContent, streamEmissions, massBalance, attributeDirect, computeSEE } from './engine';
import type { SourceStream, PrecursorInput, ResolveContext } from './types';

// Golden fixture A — two input streams netted against one output. DirEm* = 218.008.
// Shared by the massBalance and attributeDirect suites so the two cannot drift apart.
const FIXTURE_A: SourceStream[] = [
  { kind: 'fuel', ccMode: 'direct', ad: 100, cc: 0.5, bf: 0 },
  { kind: 'fuel', ccMode: 'direct', ad: 10, cc: 1.0, bf: 0 },
  { kind: 'output', ccMode: 'direct', ad: -50, cc: 0.01, bf: 0 },
];

// A ResolveContext whose defaults are the "nothing special happens" branch: non-EU origin,
// a verifier report that checks out. Each test overrides only the stub whose branch it exercises,
// so a failure points at one rule rather than at the fixture.
function makeCtx(over: Partial<ResolveContext> = {}): ResolveContext {
  return {
    isEuOrExempted: () => false,
    defaultLookup: () => 0,
    hasValidVerifierReport: () => true,
    computeChildSEE: () => 0,
    ...over,
  };
}

// A precursor with the fields SEE never reads set to inert values; tests override what they test.
function precursor(over: Partial<PrecursorInput> = {}): PrecursorInput {
  return {
    cnCode: '7202',
    category: 'iron_and_steel',
    massConsumed: 0,
    boundary: 'external',
    provenance: 'default',
    originCountry: 'IN',
    period: 2026,
    ...over,
  };
}

describe('carbonContent', () => {
  it('ccMode "direct" returns cc unchanged when bf = 0', () => {
    expect(carbonContent({ kind: 'fuel', ad: 1, ccMode: 'direct', cc: 0.5, bf: 0 })).toBeCloseTo(0.5);
  });

  it('ccMode "ef_per_t" divides ef by f (Eq 14)', () => {
    expect(carbonContent({ kind: 'fuel', ad: 1, ccMode: 'ef_per_t', ef: 1.832, bf: 0 })).toBeCloseTo(0.5);
  });

  it('ccMode "ef_per_tj" applies ef × ncv / f (Eq 13)', () => {
    expect(carbonContent({ kind: 'fuel', ad: 1, ccMode: 'ef_per_tj', ef: 3.664, ncv: 1, bf: 0 })).toBeCloseTo(1.0);
  });

  it('discounts the biomass fraction (Eq 15)', () => {
    expect(carbonContent({ kind: 'fuel', ad: 1, ccMode: 'direct', cc: 1.0, bf: 0.25 })).toBeCloseTo(0.75);
  });

  it('throws when ccMode "direct" has no cc — a missing carbon input must never become 0', () => {
    const s = { kind: 'fuel', ad: 1, ccMode: 'direct', bf: 0 } as SourceStream;
    expect(() => carbonContent(s)).toThrow();
  });
});

describe('streamEmissions', () => {
  it('applies Eq 12 to an input stream', () => {
    expect(streamEmissions({ kind: 'fuel', ccMode: 'direct', ad: 100, cc: 0.5, bf: 0 })).toBeCloseTo(183.2);
  });

  it('returns a negative figure for an output stream (ad < 0)', () => {
    expect(streamEmissions({ kind: 'output', ccMode: 'direct', ad: -50, cc: 0.01, bf: 0 })).toBeCloseTo(-1.832);
  });
});

describe('massBalance', () => {
  it('nets outputs against inputs by summing signed stream emissions', () => {
    expect(massBalance(FIXTURE_A)).toBeCloseTo(218.008);
  });
});

describe('attributeDirect', () => {
  it('passes a positive DirEm* through unchanged (Eq 55, EAF single-process)', () => {
    expect(attributeDirect(FIXTURE_A)).toBeCloseTo(218.008);
  });

  it('clamps a negative DirEm* to zero — the mandatory zero-floor, never returns negative', () => {
    // This output stream alone gives massBalance = −183.2.
    const streams: SourceStream[] = [{ kind: 'output', ccMode: 'direct', ad: -100, cc: 0.5, bf: 0 }];
    expect(massBalance(streams)).toBeCloseTo(-183.2);
    expect(attributeDirect(streams)).toBe(0);
  });
});

describe('computeSEE', () => {
  it('with no precursors, SEE_g is just ae_g = AttrEm / AL_g (Eq 63)', () => {
    const r = computeSEE(218.008, 100, [], makeCtx());
    expect(r.aeG).toBeCloseTo(2.18008);
    expect(r.see).toBeCloseTo(2.18008);
    expect(r.precursorContribution).toBe(0);
    expect(r.unresolved).toEqual([]);
  });

  it('adds an external default precursor as m_i × SEE_i (Eq 61/62)', () => {
    const r = computeSEE(200, 100, [precursor({ massConsumed: 110 })], makeCtx({ defaultLookup: () => 1.4 }));
    expect(r.aeG).toBeCloseTo(2.0);
    expect(r.precursorContribution).toBeCloseTo(1.54); // m_i 1.1 × 1.4
    expect(r.see).toBeCloseTo(3.54);
    expect(r.unresolved).toEqual([]);
  });

  it('skips a joint precursor — already inside AttrEm, never double-counted', () => {
    const r = computeSEE(
      200, 100,
      [precursor({ massConsumed: 110, boundary: 'joint' })],
      makeCtx({ defaultLookup: () => 1.4 }),
    );
    expect(r.precursorContribution).toBe(0);
    expect(r.see).toBeCloseTo(2.0);
  });

  it('zero-rates an EU/exempted-origin precursor without consulting the default', () => {
    let lookups = 0;
    const r = computeSEE(
      200, 100,
      [precursor({ massConsumed: 110, originCountry: 'DE' })],
      makeCtx({
        isEuOrExempted: (c) => c === 'DE',
        defaultLookup: () => { lookups++; return 99; },
      }),
    );
    expect(r.precursorContribution).toBe(0);
    expect(r.see).toBeCloseTo(r.aeG);
    expect(lookups).toBe(0); // the 99 was never reachable — zero-rating short-circuits first
  });

  it('falls back to the default AND flags loudly when a verified precursor has no valid report', () => {
    const r = computeSEE(
      200, 100,
      [precursor({ massConsumed: 100, provenance: 'actual_verified', seeValue: 5.0 })],
      makeCtx({ hasValidVerifierReport: () => false, defaultLookup: () => 1.4 }),
    );
    expect(r.precursorContribution).toBeCloseTo(1.4); // the default, NOT the unbacked seeValue of 5.0
    expect(r.unresolved).toEqual([{ cnCode: '7202', reason: 'missing_or_invalid_verifier_report' }]);
  });

  it('uses the actual seeValue when the verifier report checks out', () => {
    const r = computeSEE(
      200, 100,
      [precursor({ massConsumed: 100, provenance: 'actual_verified', seeValue: 1.2 })],
      makeCtx({ defaultLookup: () => 99 }),
    );
    expect(r.precursorContribution).toBeCloseTo(1.2);
    expect(r.see).toBeCloseTo(3.2);
    expect(r.unresolved).toEqual([]);
  });

  it('throws when AL_g is not > 0 — ae_g would be a division by zero', () => {
    expect(() => computeSEE(200, 0, [], makeCtx())).toThrow();
  });
});
