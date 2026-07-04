// lib/pcaf.test.ts
// Attribution-layer tests for the PCAF financed-emissions engine.
// Exact-number assertions: factor = outstanding/denominator, financed = factor × investee tCO2e.
import { describe, it, expect } from 'vitest';
import { attributionFactor, financedEmissions } from './pcaf/attribution';
import { estimateInvesteeEmissions, portfolioProxyEstimate } from './pcaf/estimate';
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

describe('PCAF estimation — estimateInvesteeEmissions (scores 1–4)', () => {
  it('reported + verified → score 1', () => {
    const r = estimateInvesteeEmissions({ reportedEmissions: 12_345, verified: true });
    expect(r.dqScore).toBe(1);
    expect(r.emissions).toBe(12_345);
    expect(r.basis).toBe('reported, verified');
  });

  it('reported, no verified → score 2', () => {
    const r = estimateInvesteeEmissions({ reportedEmissions: 12_345 });
    expect(r.dqScore).toBe(2);
    expect(r.emissions).toBe(12_345);
    expect(r.basis).toBe('reported, unverified');
  });

  it('reported 0 + verified → score 1, emissions 0 (0 is valid)', () => {
    const r = estimateInvesteeEmissions({ reportedEmissions: 0, verified: true });
    expect(r.dqScore).toBe(1);
    expect(r.emissions).toBe(0);
  });

  it('physical activity 1_000 × EF 0.5 → score 3, emissions 500', () => {
    const r = estimateInvesteeEmissions({ physicalActivity: 1_000, physicalEmissionFactor: 0.5 });
    expect(r.dqScore).toBe(3);
    expect(r.emissions).toBe(500);
    expect(r.basis).toBe('physical activity-based');
  });

  it('revenue 100M + sector → score 4, emissions 12_000 (× 0.12 / 1000)', () => {
    const r = estimateInvesteeEmissions({ revenue: 100_000_000, sector: 'Financial Services' });
    expect(r.dqScore).toBe(4);
    expect(r.emissions).toBe(12_000);
    expect(r.basis).toContain('proxy');
  });

  it('reported -1 → throws', () => {
    expect(() => estimateInvesteeEmissions({ reportedEmissions: -1 })).toThrow();
  });

  it('revenue -1 (+ sector) → throws', () => {
    expect(() => estimateInvesteeEmissions({ revenue: -1, sector: 'Financial Services' })).toThrow();
  });

  it('no usable inputs → throws', () => {
    expect(() => estimateInvesteeEmissions({})).toThrow();
  });
});

describe('PCAF estimation — portfolioProxyEstimate (score 5, legacy calcCat15)', () => {
  it('portfolio 100M, Financial Services → score 5, 12_000', () => {
    const r = portfolioProxyEstimate({ portfolioValue: 100_000_000, sector: 'Financial Services' });
    expect(r.dqScore).toBe(5);
    expect(r.emissions).toBe(12_000);
    expect(r.basis).toBe('economic/spend proxy on portfolio value (legacy)');
  });

  it('portfolio 50M, Mining & Metals → score 5, 210_000', () => {
    const r = portfolioProxyEstimate({ portfolioValue: 50_000_000, sector: 'Mining & Metals' });
    expect(r.dqScore).toBe(5);
    expect(r.emissions).toBe(210_000);
  });

  it('portfolio 10M, sector undefined → 1_200 (Financial Services default → 0.12)', () => {
    const r = portfolioProxyEstimate({ portfolioValue: 10_000_000 });
    expect(r.dqScore).toBe(5);
    expect(r.emissions).toBe(1_200);
  });

  it('portfolio 10M, nonexistent sector → 1_200 (?? 0.12 fallback, NOT 0.5)', () => {
    const r = portfolioProxyEstimate({ portfolioValue: 10_000_000, sector: 'Nonexistent' });
    expect(r.dqScore).toBe(5);
    expect(r.emissions).toBe(1_200); // 0.5 would give 5_000 — proves the 0.12 fallback
  });

  it('emissionsOverride 8_500 → score 2, emissions 8_500', () => {
    const r = portfolioProxyEstimate({ emissionsOverride: 8_500 });
    expect(r.dqScore).toBe(2);
    expect(r.emissions).toBe(8_500);
    expect(r.basis).toBe('manual entry (tCO2e, unverified)');
  });

  it('emissionsOverride 0 (falsy) falls through to proxy → score 5, 1_200', () => {
    const r = portfolioProxyEstimate({ emissionsOverride: 0, portfolioValue: 10_000_000, sector: 'Financial Services' });
    expect(r.dqScore).toBe(5);
    expect(r.emissions).toBe(1_200);
  });

  it('emissionsOverride -1 → throws', () => {
    expect(() => portfolioProxyEstimate({ emissionsOverride: -1 })).toThrow();
  });

  it('negative portfolioValue → throws', () => {
    expect(() => portfolioProxyEstimate({ portfolioValue: -100 })).toThrow();
  });
});
