// lib/pcaf/attribution.ts
// ─────────────────────────────────────────────────────────────────────────────
// PCAF attribution layer — the core financed-emissions math.
//
// The financier's share of an investee's emissions is the ATTRIBUTION FACTOR:
//
//     attribution factor = outstanding amount / denominator
//
// The math is identical across all six Phase-1 asset classes — only the MEANING of
// the denominator differs, per the PCAF Standard:
//
//   listed_equity_corp_bonds       → EVIC (enterprise value including cash)
//   business_loans_unlisted_equity → total equity + debt
//   project_finance                → total project equity + debt (project value)
//   commercial_real_estate         → property value at origination
//   mortgages                      → property value at origination
//   motor_vehicle_loans            → vehicle value at origination
//
// Financed emissions = attribution factor × investee emissions (tCO2e-native; no
// GWP math here — AR6 is cited as the basis the investee figure is reported on).
//
// Data-quality scoring and the score-5 spend-based emissions ESTIMATOR are separate
// later steps and deliberately not implemented here.
// ─────────────────────────────────────────────────────────────────────────────

import type { PcafAsset, AttributionResult, FinancedEmissionsResult } from './types';

// PCAF cites investee emissions on the AR6 100-year GWP basis.
const PCAF_GWP_BASIS = 'AR6' as const;

// Compute the attribution factor for one asset.
//
//   denominator <= 0 → throw loud (invalid input; there is no defensible factor).
//   raw factor > 1   → cap at 1, capped:true (exposure should never exceed the
//                      asset's total value; emitting >1 would over-count emissions).
//   raw factor 0..1  → capped:false.
export function attributionFactor(asset: PcafAsset): AttributionResult {
  if (asset.outstandingAmount < 0) {
    throw new Error(
      `PCAF attribution: outstandingAmount must be >= 0 (asset ${asset.id}, ` +
      `assetClass ${asset.assetClass}, got ${asset.outstandingAmount})`,
    );
  }

  if (asset.denominator <= 0) {
    throw new Error(
      `PCAF attribution: denominator must be > 0 (asset ${asset.id}, assetClass ${asset.assetClass}, got ${asset.denominator})`,
    );
  }

  const raw = asset.outstandingAmount / asset.denominator;

  if (raw > 1) {
    return { factor: 1, capped: true };
  }

  return { factor: raw, capped: false };
}

// Financed emissions for one asset = attribution factor × investee emissions (tCO2e).
export function financedEmissions(asset: PcafAsset): FinancedEmissionsResult {
  const { factor, capped } = attributionFactor(asset);

  return {
    assetId: asset.id,
    attributionFactor: factor,
    capped,
    financedEmissions: factor * asset.investeeEmissions,
    gwpBasis: PCAF_GWP_BASIS,
  };
}
