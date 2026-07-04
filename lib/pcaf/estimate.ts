// lib/pcaf/estimate.ts
// ─────────────────────────────────────────────────────────────────────────────
// PCAF emissions ESTIMATION layer — two regimes kept deliberately separate:
//
//   • estimateInvesteeEmissions  (scores 1–4) — estimates a single investee's
//     emissions from the highest-fidelity data available. The result is INVESTEE
//     emissions, to be run through the attribution layer in a later step.
//
//   • portfolioProxyEstimate     (score 5) — the legacy lumped-portfolio proxy.
//     Reproduces today's calcCat15 EXACTLY and returns financed emissions DIRECTLY
//     (no attribution — the portfolio value already stands in for exposure).
//
// PCAF data-quality hierarchy: 1 (reported+verified) is highest fidelity, 5
// (spend proxy on a lumped portfolio value) is lowest.
// ─────────────────────────────────────────────────────────────────────────────

import { EMISSION_FACTORS } from '../emissionFactors';
import type { EmissionInputs, EmissionEstimate } from './types';

// Legacy Cat 15 spend fallback: the calculator used `?? 0.12` (Financial Services),
// NOT the generic DEFAULT_SPEND_EF (0.5). Keep this exact for score-4 and score-5.
const LEGACY_SPEND_FALLBACK = 0.12;

// estimateInvesteeEmissions — scores 1–4. Picks the HIGHEST-fidelity tier for which
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

  // Tier 4 — investee revenue × sector spend-factor (a proxy; see NOTE below).
  if (Number.isFinite(inputs.revenue) && inputs.sector) {
    const revenue = inputs.revenue as number;
    if (revenue < 0) {
      throw new Error(`PCAF estimate: revenue must be >= 0 (got ${revenue})`);
    }
    // NOTE: reusing the spend table as a revenue-intensity proxy is a known
    // approximation — proper PCAF wants revenue-specific EFs. Still legitimately
    // tier 4: it uses investee-SPECIFIC revenue, higher fidelity than the score-5
    // lumped portfolio proxy. Same `?? 0.12` fallback as the legacy calculator.
    const ef = EMISSION_FACTORS.spend[inputs.sector] ?? LEGACY_SPEND_FALLBACK;
    return {
      emissions: (revenue * ef) / 1000,
      dqScore: 4,
      basis: 'economic (investee revenue × sector spend-factor, proxy)',
    };
  }

  throw new Error(
    'PCAF estimate: insufficient inputs to estimate investee emissions; ' +
      'use portfolioProxyEstimate for the score-5 fallback',
  );
}

// portfolioProxyEstimate — the SCORE-5 legacy fallback. Reproduces calcCat15 EXACTLY
// and returns financed emissions directly (no attribution).
export function portfolioProxyEstimate(input: {
  portfolioValue?: number;
  sector?: string;
  emissionsOverride?: number;
}): EmissionEstimate {
  // Manual primary-data entry — mirrors legacy `if (d.emissions_override)` (truthy,
  // so 0 falls through to the proxy). Manual entry can't be score 1 (no third-party
  // verification) → score 2.
  if (input.emissionsOverride) {
    if (input.emissionsOverride < 0) {
      throw new Error(`PCAF proxy: emissionsOverride must be >= 0 (got ${input.emissionsOverride})`);
    }
    return { emissions: input.emissionsOverride, dqScore: 2, basis: 'manual entry (tCO2e, unverified)' };
  }

  // portfolioValue may be undefined → 0 (matches legacy `|| 0`); if provided, no negatives.
  if (input.portfolioValue != null && input.portfolioValue < 0) {
    throw new Error(`PCAF proxy: portfolioValue must be >= 0 (got ${input.portfolioValue})`);
  }
  // MUST be the `?? 0.12` fallback, NOT DEFAULT_SPEND_EF (0.5).
  const ef = EMISSION_FACTORS.spend[input.sector ?? 'Financial Services'] ?? LEGACY_SPEND_FALLBACK;
  return {
    emissions: ((input.portfolioValue ?? 0) * ef) / 1000,
    dqScore: 5,
    basis: 'economic/spend proxy on portfolio value (legacy)',
  };
}
