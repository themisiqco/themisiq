// lib/cbam/engine.test.ts
// Pins the IR 2025/2547 Annex II mass-balance equations as implemented in ./engine:
// Eq 12 (Em_k = f × AD_k × CC_k), Eq 13/14 (EF → carbon content), Eq 15 (biomass fraction).
// The sign convention is load-bearing: outputs carry ad < 0 so DirEm* nets carbon in − out
// via a single sum. A test that expects a subtraction here is testing the wrong contract.
import { describe, it, expect } from 'vitest';
import { carbonContent, streamEmissions, massBalance } from './engine';
import type { SourceStream } from './types';

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
    const streams: SourceStream[] = [
      { kind: 'fuel', ccMode: 'direct', ad: 100, cc: 0.5, bf: 0 },
      { kind: 'fuel', ccMode: 'direct', ad: 10, cc: 1.0, bf: 0 },
      { kind: 'output', ccMode: 'direct', ad: -50, cc: 0.01, bf: 0 },
    ];
    expect(massBalance(streams)).toBeCloseTo(218.008);
  });
});
