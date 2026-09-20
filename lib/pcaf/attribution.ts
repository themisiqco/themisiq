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
// GWP math here). The investee's figure is used on whatever GWP basis the investee
// reported it on, and that basis is not recorded: see PCAF_GWP_BASIS.
//
// Data-quality scoring and the score-5 spend-based emissions ESTIMATOR are separate
// later steps and deliberately not implemented here.
// ─────────────────────────────────────────────────────────────────────────────

import type { PcafAsset, AttributionResult, FinancedEmissionsResult } from './types';

// ⚠️ NOT RECORDED, AND NOT 'AR6'. Until 18 Sep 2026 this was the literal 'AR6', stamped on every
// holding, and the Scope 3 CSV printed it as "the AR6 basis the investee figures are reported on". Nothing
// ever asked the customer which basis an investee reported on, so the stamp asserted a fact nobody had
// collected. An investee's CO2e total also cannot be re-based without its split by gas, which the holding
// form does not collect, so knowing the basis would change what can be DISCLOSED, not the figure. null
// says "not recorded"; lib/scope3/cat15.ts words that for customers (CAT15_SENTENCES.gwpAsReported).
const PCAF_GWP_BASIS = null;

// Compute the attribution factor for one asset.
//
//   outstanding not finite, or < 0 → throw loud (missing or invalid exposure).
//   denominator not finite, or <= 0 → throw loud (invalid input; there is no defensible factor).
//   raw factor > 1   → cap at 1, capped:true (exposure should never exceed the
//                      asset's total value; emitting >1 would over-count emissions).
//   raw factor 0..1  → capped:false.
export function attributionFactor(asset: PcafAsset): AttributionResult {
  // ⚠️ NOT FINITE THROWS TOO, SINCE 19 SEP 2026. This tested `< 0` only, so an absent amount (undefined)
  // slipped past and produced NaN rather than a loud failure. A blank amount is missing, not zero.
  if (!Number.isFinite(asset.outstandingAmount) || asset.outstandingAmount < 0) {
    throw new Error(
      `PCAF attribution: outstandingAmount must be >= 0 (asset ${asset.id}, ` +
      `assetClass ${asset.assetClass}, got ${asset.outstandingAmount})`,
    );
  }

  if (!Number.isFinite(asset.denominator) || asset.denominator <= 0) {
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
