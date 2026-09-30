// Fixture deals for the Deals report: buildDealReportModel's tests, and the PDF generator's smoke
// test. Each carries sales markets and an environmental-claims answer, as every deal saved from
// 29 Sep 2026 can; a deal with neither recorded (every older deal) is tested separately. Plain rows
// shaped like public.deals, so every fixture goes through the same derivation a saved deal does.
// The three are chosen by what they make the report print, and the tests assert that each one
// still does, so a threshold change that moves a fixture out of its case fails loudly rather than
// quietly testing something else.

import type { DealReportDeal } from './reportModel'

/** One fixed instant, so reportDate and the reference are stable across runs. */
export const FIXTURE_GENERATED_AT = new Date('2026-09-29T12:00:00Z')

/**
 * NEAR-THRESHOLD. A UK target in GBP sitting just under two SECR limbs: turnover GBP 34.5m against
 * the GBP 36m trigger and a balance sheet of GBP 17.2m against GBP 18m, with 240 staff against 250.
 * SECR is near-threshold and below, so the near table and the near-below sentence both print.
 */
export const NEAR_THRESHOLD_DEAL: DealReportDeal = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  target_name: 'Harbour Logistics Ltd',
  sector: 'Transport & Logistics',
  jurisdiction: 'UK',
  deal_type: 'ma',
  revenue: 34_500_000,
  currency: 'GBP',
  deal_value: 120_000_000,
  location_count: 8,
  employee_count: 240,
  total_assets: 17_200_000,
  listed_ca_exchange: false,
  has_ghg_data: false,
  has_esg_report: true,
  // The UK, and "not sure" beyond it, so the S-211 caveat shows (Canada not confirmed either way) and
  // nothing is converted. With Canada ticked the S-211 size test would run instead, in CAD.
  // Reports no claims, so the note, not the finding.
  sales_markets: ['GB'],
  sales_markets_not_sure: true,
  env_claims: 'no',
}

/**
 * NOT ASSESSED. A UK target with GBP 50m turnover but no headcount and no balance sheet, so SECR's
 * 2-of-3 test has one limb met and cannot be settled: the PARTIAL, NEAR-THRESHOLD: NOT ASSESSED and
 * FRAMEWORK COLUMN panels print. It is outside Canada and not listed there, so the S-211
 * jurisdiction caveat prints, and the two-year check panels print beneath the size-test table. No
 * deal value and no location count, so the cost section takes its "not provided" branches.
 */
export const NOT_ASSESSED_DEAL: DealReportDeal = {
  id: 'a1b2c3d4-0000-4000-8000-000000000002',
  target_name: 'Société Générale Nord',
  sector: 'Technology',
  jurisdiction: 'UK',
  deal_type: 'ma',
  revenue: 50_000_000,
  currency: 'GBP',
  deal_value: 0,
  location_count: 0,
  employee_count: null,
  total_assets: null,
  listed_ca_exchange: null,
  has_ghg_data: false,
  has_esg_report: false,
  // Markets and claims both "not sure": the S-211 caveat shows, and the claims finding is
  // APPLIES: VERIFY with "Markets not confirmed" and no market lines.
  sales_markets: null,
  sales_markets_not_sure: true,
  env_claims: 'not_sure',
}

/**
 * FX CONVERSION. An EU target reported in USD, so its revenue and balance sheet are converted into
 * EUR for the CSRD and CS3D limbs and the FX basis table carries conversion rows. Large enough that
 * CSRD applies outright.
 */
export const FX_DEAL: DealReportDeal = {
  id: 'a1b2c3d4-0000-4000-8000-000000000003',
  target_name: 'Nestlé Ingredients SA',
  sector: 'Agriculture & Food',
  jurisdiction: 'European Union',
  deal_type: 'pe',
  revenue: 900_000_000,
  currency: 'USD',
  deal_value: 2_400_000_000,
  location_count: 22,
  employee_count: 3_200,
  total_assets: 1_100_000_000,
  listed_ca_exchange: false,
  has_ghg_data: true,
  has_esg_report: true,
  // EU members, the US with California, and Brazil, with claims: EU ECGT and California AB 1305
  // rows, a HIGH finding (the EU penalty scales with turnover), and a fallback line for Brazil.
  sales_markets: ['FR', 'DE', 'US', 'US-CA', 'BR'],
  sales_markets_not_sure: null,
  env_claims: 'yes',
}

export const REPORT_FIXTURES = [
  { name: 'near-threshold', deal: NEAR_THRESHOLD_DEAL },
  { name: 'not-assessed', deal: NOT_ASSESSED_DEAL },
  { name: 'fx-conversion', deal: FX_DEAL },
] as const
