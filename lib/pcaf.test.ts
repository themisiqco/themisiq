// lib/pcaf.test.ts
// Attribution-layer tests for the PCAF financed-emissions engine.
// Exact-number assertions: factor = outstanding/denominator, financed = factor × investee tCO2e.
import { describe, it, expect } from 'vitest';
import { attributionFactor, financedEmissions } from './pcaf/attribution';
import { estimateInvesteeEmissions, portfolioProxyEstimate } from './pcaf/estimate';
import { assessAsset, assessPortfolio, portfolioFromProxy, resolvePcafResult } from './pcaf/engine';
import type { PcafAsset, PcafPortfolioAsset } from './pcaf/types';

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
    emissions: { revenue: 100_000_000, sector: 'Financial Services' },
  };

  it('assessAsset composes estimate → attribution', () => {
    const a = assessAsset(A);
    expect(a.financedEmissions).toBe(5_000); // 0.10 × 50_000
    expect(a.dqScore).toBe(1);
    expect(a.attributionFactor).toBe(0.1);
    expect(a.gwpBasis).toBe('AR6');
    const b = assessAsset(B);
    expect(b.financedEmissions).toBe(1_200); // 0.10 × 12_000 (investee)
    expect(b.dqScore).toBe(4);
  });

  it('two-asset portfolio → total, weighted DQ, breakdown, coverage', () => {
    const r = assessPortfolio([A, B]);
    expect(r.mode).toBe('decomposed');
    expect(r.assetCount).toBe(2);
    expect(r.totalFinancedEmissions).toBe(6_200); // 5_000 + 1_200
    // (1×5_000 + 4×1_200) / 6_200 = 9_800/6_200 ≈ 1.5806
    expect(r.weightedDataQualityScore).toBeCloseTo(1.5806, 3);
    expect(r.byAssetClass.business_loans_unlisted_equity).toBe(5_000);
    expect(r.byAssetClass.listed_equity_corp_bonds).toBe(1_200);
    expect(r.coverageByScore).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1, 5: 0 });
    expect(r.gwpBasis).toBe('AR6');
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

describe('PCAF engine — portfolioFromProxy (score-5 regime, same shape)', () => {
  it('portfolio value proxy → mode portfolio_proxy, score 5', () => {
    const r = portfolioFromProxy({ portfolioValue: 100_000_000, sector: 'Financial Services' });
    expect(r.mode).toBe('portfolio_proxy');
    expect(r.totalFinancedEmissions).toBe(12_000);
    expect(r.weightedDataQualityScore).toBe(5);
    expect(r.assetCount).toBe(1);
    expect(r.perAsset).toEqual([]);
    expect(r.coverageByScore).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 });
    expect(r.gwpBasis).toBe('AR6');
  });

  it('manual override proxy → score 2', () => {
    const r = portfolioFromProxy({ emissionsOverride: 8_500 });
    expect(r.totalFinancedEmissions).toBe(8_500);
    expect(r.weightedDataQualityScore).toBe(2);
    expect(r.coverageByScore).toEqual({ 1: 0, 2: 1, 3: 0, 4: 0, 5: 0 });
  });
});

describe('PCAF engine — resolvePcafResult (proxy vs detailed switch)', () => {
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
    emissions: { revenue: 100_000_000, sector: 'Financial Services' },
  };

  it('no mode, no assets → proxy', () => {
    const r = resolvePcafResult({ portfolioValue: 100_000_000, sector: 'Financial Services' });
    expect(r.mode).toBe('portfolio_proxy');
    expect(r.totalFinancedEmissions).toBe(12_000);
    expect(r.weightedDataQualityScore).toBe(5);
  });

  it("mode 'detailed' + undefined assets → proxy fallback", () => {
    const r = resolvePcafResult({ mode: 'detailed', portfolioValue: 100_000_000, sector: 'Financial Services' });
    expect(r.mode).toBe('portfolio_proxy');
    expect(r.totalFinancedEmissions).toBe(12_000);
  });

  it("mode 'detailed' + empty assets → proxy fallback", () => {
    const r = resolvePcafResult({ mode: 'detailed', assets: [], portfolioValue: 100_000_000, sector: 'Financial Services' });
    expect(r.mode).toBe('portfolio_proxy');
    expect(r.totalFinancedEmissions).toBe(12_000);
  });

  it('assets present but mode omitted → still proxy (explicit detailed required)', () => {
    const r = resolvePcafResult({ assets: [A, B], portfolioValue: 100_000_000, sector: 'Financial Services' });
    expect(r.mode).toBe('portfolio_proxy');
    expect(r.totalFinancedEmissions).toBe(12_000);
  });

  it("mode 'detailed' + two valid assets → decomposed", () => {
    const r = resolvePcafResult({ mode: 'detailed', assets: [A, B] });
    expect(r.mode).toBe('decomposed');
    expect(r.totalFinancedEmissions).toBe(6_200);
    expect(r.weightedDataQualityScore).toBeCloseTo(1.5806, 3);
  });

  it("mode 'detailed' + invalid asset (denominator 0) → does not throw, falls back to proxy", () => {
    const bad: PcafPortfolioAsset = {
      id: 'bad',
      assetClass: 'mortgages',
      outstandingAmount: 100,
      denominator: 0, // assessPortfolio → assessAsset → attributionFactor throws
      emissions: { reportedEmissions: 10 },
    };
    let r: ReturnType<typeof resolvePcafResult>;
    expect(() => {
      r = resolvePcafResult({ mode: 'detailed', assets: [bad], portfolioValue: 100_000_000, sector: 'Financial Services' });
    }).not.toThrow();
    expect(r!.mode).toBe('portfolio_proxy');
    expect(r!.totalFinancedEmissions).toBe(12_000);
  });
});
