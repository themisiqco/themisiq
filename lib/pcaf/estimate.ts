// lib/pcaf/estimate.ts
// ─────────────────────────────────────────────────────────────────────────────
// PCAF emissions ESTIMATION layer: estimateInvesteeEmissions estimates a single
// investee's emissions from the highest-fidelity data available (scores 1–3). The
// result is INVESTEE emissions, run through the attribution layer by engine.ts.
//
// ⚠️ NO SCORE 4 OR 5, REMOVED 19 SEP 2026. This file also held a tier-4 path
// (investee revenue × a sector spend factor) and portfolioProxyEstimate, the
// score-5 lumped proxy (portfolio value × a sector spend factor, substituting
// 'Financial Services' when no sector was given). Both priced from the thirteen-key
// EMISSION_FACTORS.spend table with a 0.12 fallback, and every sector the app can
// offer is an EXIOBASE code that misses that table, so both always priced at 0.12.
// Neither had a caller in app/ or lib/ outside tests after the Cat 15 proxy was
// withdrawn (17 Sep 2026): code that produces a confident number from a constant is
// one import away from being live again. See lib/scope3/cat15.ts for why a portfolio
// value times a spend factor does not measure emissions.
// ─────────────────────────────────────────────────────────────────────────────

import type { EmissionInputs, EmissionEstimate } from './types';

// estimateInvesteeEmissions — scores 1–3. Picks the HIGHEST-fidelity tier for which
// inputs exist. Number.isFinite lets 0 be a valid value; negatives throw loud.
export function estimateInvesteeEmissions(inputs: EmissionInputs): EmissionEstimate {
  // Tier 1/2 — investee's own reported emissions (verified → 1, else 2).
  if (Number.isFinite(inputs.reportedEmissions)) {
    const reported = inputs.reportedEmissions as number;
    if (reported < 0) {
      throw new Error(`PCAF estimate: reportedEmissions must be >= 0 (got ${reported})`);
    }
    return inputs.verified === true
      ? { emissions: reported, dqScore: 1, basis: 'reported, verified' }
      : { emissions: reported, dqScore: 2, basis: 'reported, unverified' };
  }

  // Tier 3 — physical activity × emission factor.
  if (Number.isFinite(inputs.physicalActivity) && Number.isFinite(inputs.physicalEmissionFactor)) {
    const activity = inputs.physicalActivity as number;
    const factor = inputs.physicalEmissionFactor as number;
    if (activity < 0 || factor < 0) {
      throw new Error(
        `PCAF estimate: physicalActivity and physicalEmissionFactor must be >= 0 (got ${activity}, ${factor})`,
      );
    }
    return { emissions: activity * factor, dqScore: 3, basis: 'physical activity-based' };
  }

  throw new Error('PCAF estimate: insufficient inputs to estimate investee emissions');
}
