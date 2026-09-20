// lib/pcaf.test.ts
// Attribution-layer tests for the PCAF financed-emissions engine.
// Exact-number assertions: factor = outstanding/denominator, financed = factor × investee tCO2e.
import { describe, it, expect } from 'vitest';
import { attributionFactor, financedEmissions } from './pcaf/attribution';
import { estimateInvesteeEmissions } from './pcaf/estimate';
import { assessAsset, assessPortfolio } from './pcaf/engine';
import type { PcafAsset, PcafPortfolioAsset, EmissionInputs } from './pcaf/types';

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
    expect(r.gwpBasis).toBeNull();
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
    expect(r.gwpBasis).toBeNull();
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
    expect(r.gwpBasis).toBeNull();
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
    expect(r.gwpBasis).toBeNull();
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

  // 19 Sep 2026: a blank outstanding amount is MISSING, not zero. `< 0` alone let undefined through as NaN.
  it('absent or non-finite outstandingAmount / denominator throws, never NaN', () => {
    for (const bad of [undefined, NaN, Infinity]) {
      expect(() => attributionFactor(asset({ outstandingAmount: bad as unknown as number, denominator: 100 }))).toThrow();
      expect(() => attributionFactor(asset({ outstandingAmount: 1, denominator: bad as unknown as number }))).toThrow();
    }
  });

  it('zero outstandingAmount is valid → factor 0, financed 0 (closed position)', () => {
    const a = asset({ outstandingAmount: 0, denominator: 100, investeeEmissions: 5_000 });
    expect(attributionFactor(a)).toEqual({ factor: 0, capped: false });
    const r = financedEmissions(a);
    expect(r.financedEmissions).toBe(0);
    expect(r.capped).toBe(false);
    expect(r.gwpBasis).toBeNull();
  });

  // ⚠️ REWRITTEN 18 SEP 2026, NOT PRESERVED. This asserted 'AR6' on every result: a basis the library stamped
  // and nobody had collected. The contract now is that the basis is NOT RECORDED (null) on every result,
  // decomposed and per asset alike, until a holding carries one the customer supplied.
  it('gwpBasis is not recorded (null) on every result', () => {
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
      expect(r.gwpBasis).toBeNull();
      expect(r.financedEmissions).toBe(5);
    }
  });
});

describe('PCAF estimation — estimateInvesteeEmissions (scores 1–3)', () => {
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

  it('reported -1 → throws', () => {
    expect(() => estimateInvesteeEmissions({ reportedEmissions: -1 })).toThrow();
  });

  // ⚠️ REWRITTEN 19 SEP 2026, NOT PRESERVED. This block asserted the tier-4 estimate (revenue 100M in
  // 'Financial Services' → 12,000 tCO2e at score 4, from the 0.12 fallback). Tier 4 is removed; revenue and
  // sector alone are now insufficient, which is what a row saved with them must produce.
  it('revenue and sector alone → throws (no tier 4)', () => {
    const legacy = { revenue: 100_000_000, sector: 'Financial Services' } as unknown as EmissionInputs;
    expect(() => estimateInvesteeEmissions(legacy)).toThrow();
  });

  it('no usable inputs → throws', () => {
    expect(() => estimateInvesteeEmissions({})).toThrow();
  });
});

describe('PCAF engine — assessAsset / assessPortfolio (decomposed)', () => {
  const A: PcafPortfolioAsset = {
    id: 'A',
    assetClass: 'business_loans_unlisted_equity',
    outstandingAmount: 10_000_000,
    denominator: 100_000_000,
    emissions: { reportedEmissions: 50_000, verified: true },
  };
  const B: PcafPortfolioAsset = {
    id: 'B',
    assetClass: 'listed_equity_corp_bonds',
    outstandingAmount: 50_000_000,
    denominator: 500_000_000,
    // Tier 3 (was tier 4 until 19 Sep 2026): 24,000 units × 0.5 = 12,000 tCO2e investee, as before.
    emissions: { physicalActivity: 24_000, physicalEmissionFactor: 0.5 },
  };

  it('assessAsset composes estimate → attribution', () => {
    const a = assessAsset(A);
    expect(a.financedEmissions).toBe(5_000); // 0.10 × 50_000
    expect(a.dqScore).toBe(1);
    expect(a.attributionFactor).toBe(0.1);
    expect(a.gwpBasis).toBeNull();
    const b = assessAsset(B);
    expect(b.financedEmissions).toBe(1_200); // 0.10 × 12_000 (investee)
    expect(b.dqScore).toBe(3);
  });

  it('two-asset portfolio → total, weighted DQ, breakdown, coverage', () => {
    const r = assessPortfolio([A, B]);
    expect(r.mode).toBe('decomposed');
    expect(r.assetCount).toBe(2);
    expect(r.totalFinancedEmissions).toBe(6_200); // 5_000 + 1_200
    // (1×5_000 + 3×1_200) / 6_200 = 8_600/6_200 ≈ 1.3871
    expect(r.weightedDataQualityScore).toBeCloseTo(1.3871, 3);
    expect(r.byAssetClass.business_loans_unlisted_equity).toBe(5_000);
    expect(r.byAssetClass.listed_equity_corp_bonds).toBe(1_200);
    expect(r.coverageByScore).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0, 5: 0 });
    expect(r.gwpBasis).toBeNull();
  });

  it('all-zero emissions → outstanding-amount fallback, no NaN', () => {
    const z1: PcafPortfolioAsset = {
      id: 'Z1',
      assetClass: 'business_loans_unlisted_equity',
      outstandingAmount: 10_000_000,
      denominator: 100_000_000,
      emissions: { reportedEmissions: 0, verified: true }, // score 1
    };
    const z2: PcafPortfolioAsset = {
      id: 'Z2',
      assetClass: 'business_loans_unlisted_equity',
      outstandingAmount: 30_000_000,
      denominator: 100_000_000,
      emissions: { reportedEmissions: 0 }, // score 2
    };
    const r = assessPortfolio([z1, z2]);
    expect(r.totalFinancedEmissions).toBe(0);
    // (10M×1 + 30M×2) / 40M = 70M/40M = 1.75
    expect(r.weightedDataQualityScore).toBe(1.75);
    expect(Number.isNaN(r.weightedDataQualityScore)).toBe(false);
  });

  it('empty portfolio → throws', () => {
    expect(() => assessPortfolio([])).toThrow();
  });

  it('asset with unusable emission inputs → assessPortfolio throws (fail loud)', () => {
    const bad: PcafPortfolioAsset = {
      id: 'bad',
      assetClass: 'mortgages',
      outstandingAmount: 100,
      denominator: 200,
      emissions: {}, // no usable inputs
    };
    expect(() => assessPortfolio([bad])).toThrow();
  });
});
