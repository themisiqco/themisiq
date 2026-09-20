// lib/pcaf/engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// PCAF composition + portfolio aggregation.
//
// Composes the two lower layers, both reused UNCHANGED:
//   • estimateInvesteeEmissions (Step 3) — investee emissions, scores 1–3.
//   • financedEmissions          (Step 2) — attribution × investee emissions.
//
// assessPortfolio decomposes a real asset list into a single verifier-facing
// result with a coverage-weighted data-quality score. There is no lumped-proxy
// regime: portfolioFromProxy and resolvePcafResult, which substituted the score-5
// proxy for the whole portfolio whenever one holding failed, were removed on
// 19 Sep 2026 (see estimate.ts). lib/scope3/cat15.ts withholds the figure instead.
//
// Fail-loud philosophy: a bad asset THROWS rather than being silently dropped —
// a portfolio total that quietly omits assets would misrepresent coverage.
// ─────────────────────────────────────────────────────────────────────────────

import { financedEmissions } from './attribution';
import { estimateInvesteeEmissions } from './estimate';
import type {
  PcafPortfolioAsset,
  AssetAssessment,
  PortfolioResult,
  DataQualityScore,
} from './types';

// Compose: estimate investee emissions (scores 1–3) → attribution → financed.
export function assessAsset(asset: PcafPortfolioAsset): AssetAssessment {
  const est = estimateInvesteeEmissions(asset.emissions); // may throw loud
  const fe = financedEmissions({
    id: asset.id,
    assetClass: asset.assetClass,
    outstandingAmount: asset.outstandingAmount,
    denominator: asset.denominator,
    investeeEmissions: est.emissions,
  });
  return {
    assetId: fe.assetId,
    assetClass: asset.assetClass,
    attributionFactor: fe.attributionFactor,
    capped: fe.capped,
    financedEmissions: fe.financedEmissions,
    dqScore: est.dqScore,
    basis: est.basis,
    gwpBasis: fe.gwpBasis,
  };
}

// A fresh zeroed coverage tally — one slot per DQ tier.
function emptyCoverage(): Record<DataQualityScore, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

// Decomposed portfolio → one honest result.
export function assessPortfolio(assets: PcafPortfolioAsset[]): PortfolioResult {
  if (assets.length === 0) {
    throw new Error('assessPortfolio: empty portfolio; nothing to weight');
  }

  const perAsset = assets.map(assessAsset); // a bad asset throws — fail loud, don't drop.

  const totalFE = perAsset.reduce((sum, a) => sum + a.financedEmissions, 0);

  // Weighted DQ: weight each asset's score by its financed emissions. When the whole
  // portfolio nets to zero emissions, fall back to outstanding-amount weighting, and
  // finally to an unweighted mean — so the headline is never NaN.
  let weightedDataQualityScore: number;
  if (totalFE > 0) {
    weightedDataQualityScore =
      perAsset.reduce((sum, a) => sum + a.dqScore * a.financedEmissions, 0) / totalFE;
  } else {
    const totalOut = assets.reduce((sum, a) => sum + a.outstandingAmount, 0);
    weightedDataQualityScore =
      totalOut > 0
        ? assets.reduce((sum, a, i) => sum + a.outstandingAmount * perAsset[i].dqScore, 0) / totalOut
        : perAsset.reduce((sum, a) => sum + a.dqScore, 0) / perAsset.length;
  }

  const byAssetClass: PortfolioResult['byAssetClass'] = {};
  const coverageByScore = emptyCoverage();
  for (const a of perAsset) {
    byAssetClass[a.assetClass] = (byAssetClass[a.assetClass] ?? 0) + a.financedEmissions;
    coverageByScore[a.dqScore] += 1;
  }

  return {
    mode: 'decomposed',
    totalFinancedEmissions: totalFE,
    weightedDataQualityScore,
    assetCount: assets.length,
    perAsset,
    byAssetClass,
    coverageByScore,
    // Not recorded: the holdings keep each investee's own basis. See PCAF_GWP_BASIS in attribution.ts.
    gwpBasis: null,
  };
}
