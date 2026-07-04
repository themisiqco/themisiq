// lib/pcaf.test.ts
// Attribution-layer tests for the PCAF financed-emissions engine.
// Exact-number assertions: factor = outstanding/denominator, financed = factor × investee tCO2e.
import { describe, it, expect } from 'vitest';
import { attributionFactor, financedEmissions } from './pcaf/attribution';
import type { PcafAsset } from './pcaf/types';

const asset = (over: Partial<PcafAsset>): PcafAsset => ({
  id: 'a1',
  assetClass: 'business_loans_unlisted_equity',
  outstandingAmount: 0,
  denominator: 1,
  investeeEmissions: 0,
  ...over,
});

describe('PCAF attribution — attributionFactor + financedEmissions', () => {
  it('1. business loans: 10M / 100M → factor 0.10, financed 5,000 tCO2e', () => {
    const a = asset({
      assetClass: 'business_loans_unlisted_equity',
      outstandingAmount: 10_000_000,
      denominator: 100_000_000,
      investeeEmissions: 50_000,
    });
    expect(attributionFactor(a)).toEqual({ factor: 0.1, capped: false });
    const r = financedEmissions(a);
    expect(r.attributionFactor).toBe(0.1);
    expect(r.financedEmissions).toBe(5_000);
    expect(r.capped).toBe(false);
    expect(r.gwpBasis).toBe('AR6');
  });

  it('2. listed equity: 50M / 500M → factor 0.10, financed 20,000 tCO2e', () => {
    const a = asset({
      assetClass: 'listed_equity_corp_bonds',
      outstandingAmount: 50_000_000,
      denominator: 500_000_000,
      investeeEmissions: 200_000,
    });
    expect(attributionFactor(a).factor).toBe(0.1);
    const r = financedEmissions(a);
    expect(r.financedEmissions).toBe(20_000);
    expect(r.gwpBasis).toBe('AR6');
  });

  it('3. mortgages: 300k / 400k → factor 0.75, financed 4.5 tCO2e', () => {
    const a = asset({
      assetClass: 'mortgages',
      outstandingAmount: 300_000,
      denominator: 400_000,
      investeeEmissions: 6,
    });
    expect(attributionFactor(a).factor).toBe(0.75);
    const r = financedEmissions(a);
    expect(r.financedEmissions).toBe(4.5);
    expect(r.gwpBasis).toBe('AR6');
  });

  it('4. cap: 120 / 100 → factor 1, capped true', () => {
    const a = asset({ outstandingAmount: 120, denominator: 100, investeeEmissions: 1_000 });
    const res = attributionFactor(a);
    expect(res.factor).toBe(1);
    expect(res.capped).toBe(true);
    const r = financedEmissions(a);
    expect(r.attributionFactor).toBe(1);
    expect(r.capped).toBe(true);
    expect(r.financedEmissions).toBe(1_000); // capped factor 1 × 1,000
    expect(r.gwpBasis).toBe('AR6');
  });

  it('5. denominator 0 → throws', () => {
    expect(() => attributionFactor(asset({ denominator: 0 }))).toThrow();
    expect(() => financedEmissions(asset({ denominator: 0 }))).toThrow();
  });

  it('negative denominator also throws (invalid input)', () => {
    expect(() => attributionFactor(asset({ denominator: -100 }))).toThrow();
  });

  it('negative outstandingAmount throws (exposure cannot be negative)', () => {
    expect(() => attributionFactor(asset({ outstandingAmount: -100, denominator: 100 }))).toThrow();
  });

  it('zero outstandingAmount is valid → factor 0, financed 0 (closed position)', () => {
    const a = asset({ outstandingAmount: 0, denominator: 100, investeeEmissions: 5_000 });
    expect(attributionFactor(a)).toEqual({ factor: 0, capped: false });
    const r = financedEmissions(a);
    expect(r.financedEmissions).toBe(0);
    expect(r.capped).toBe(false);
    expect(r.gwpBasis).toBe('AR6');
  });

  it('gwpBasis is AR6 on every result', () => {
    const classes: PcafAsset['assetClass'][] = [
      'listed_equity_corp_bonds',
      'business_loans_unlisted_equity',
      'project_finance',
      'commercial_real_estate',
      'mortgages',
      'motor_vehicle_loans',
    ];
    for (const c of classes) {
      const r = financedEmissions(asset({ assetClass: c, outstandingAmount: 1, denominator: 2, investeeEmissions: 10 }));
      expect(r.gwpBasis).toBe('AR6');
      expect(r.financedEmissions).toBe(5);
    }
  });
});
