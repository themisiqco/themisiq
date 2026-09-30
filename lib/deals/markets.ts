// lib/deals/markets.ts
// ThemisIQ Deals: the sales-market and environmental-claims answers, as the ENGINE needs them.
//
// Split from ./claimsRules on purpose: this file holds no country list, so lib/deals/assessment.ts can
// import it without shipping the product's country list to every page that imports the engine.
// Names, the researched rules and the finding are in ./claimsRules.
//
// Columns: deals.sales_markets (text[]), deals.sales_markets_not_sure (boolean), deals.env_claims
// ('yes' | 'no' | 'not_sure'), all NULL when never asked
// (supabase/migrations/20260929_deals_sales_markets_env_claims.sql).

import type { FrameworkApplicability } from './assessment'

// ── markets ──────────────────────────────────────────────────────────────────────────────────────

/** California, recorded as its own market beside the United States (deals.sales_markets). */
export const US_CA = 'US-CA'

/** The 27 EU member states. Any one of them brings in the EU rule. */
export const EU_MEMBER_CODES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
] as const
const EU_SET = new Set<string>(EU_MEMBER_CODES)
export const isEuMember = (code: string) => EU_SET.has(code)

/** What the two market columns say, read together. */
export type MarketsInput = { sales_markets?: string[] | null; sales_markets_not_sure?: boolean | null }

/**
 * Were the markets recorded at all? NULL in both columns is a deal saved before the question existed,
 * or one where it was left blank: nothing market-specific can be said about it, and the report says so
 * in one quiet line rather than guessing.
 */
export const marketsRecorded = (m: MarketsInput): boolean =>
  (m.sales_markets?.length ?? 0) > 0 || m.sales_markets_not_sure === true

/** The line printed where a market-specific finding or caveat would go, when markets were not recorded. */
export const MARKETS_UNRECORDED_LINE = 'Sales markets not recorded; market-specific rules not assessed.'

// ── The home market: a first answer for the picker (29 Sep 2026) ─────────────────────────────────
//
// A target sells where it is established, almost always, so the picker starts with that market
// ticked rather than empty. ONLY WHERE NOTHING WAS RECORDED: a saved answer, including "not sure", is
// the user's and is never altered. Global and Other name no market, so nothing is pre-ticked.
const HOME_MARKETS: Record<string, readonly string[]> = {
  USA: ['US'],
  UK: ['GB'],
  Canada: ['CA'],
  'European Union': EU_MEMBER_CODES,
  Australia: ['AU'],
}
export const homeMarkets = (jurisdiction: string | null | undefined): string[] | null =>
  jurisdiction && HOME_MARKETS[jurisdiction] ? [...HOME_MARKETS[jurisdiction]] : null

/**
 * What the picker starts with. `auto` is true when the value is a pre-tick rather than an answer: the
 * wizard lets it follow a change of jurisdiction until the user edits the markets themselves.
 */
export const startingMarkets = (m: MarketsInput, jurisdiction: string | null | undefined): { sales_markets: string[] | null; auto: boolean } => {
  if (marketsRecorded(m)) return { sales_markets: m.sales_markets ?? null, auto: false }
  const home = homeMarkets(jurisdiction)
  return { sales_markets: home, auto: home !== null }
}

/** The picker's value, and whether it is still a pre-tick (`auto`) rather than the user's answer. */
export type MarketsState = { sales_markets: string[] | null; auto: boolean }

/** A change of jurisdiction moves a pre-tick to the new home market, and leaves an answer alone. */
export const marketsOnJurisdictionChange = (s: MarketsState, jurisdiction: string): MarketsState =>
  s.auto ? { sales_markets: homeMarkets(jurisdiction), auto: true } : s

/**
 * The markets a sign-in draft stores. ⚠️ NULL WHILE THEY ARE STILL A PRE-TICK (29 Sep 2026). The draft
 * used to store the pre-tick as a list, so after the round trip through /login startingMarkets read it
 * as a recorded answer and it stopped following the jurisdiction: USA to UK left United States ticked.
 * Stored as NULL, the restore pre-ticks again from the draft's jurisdiction and keeps following it.
 */
export const draftMarkets = (s: MarketsState): string[] | null => (s.auto ? null : s.sales_markets)

// ── environmental claims ─────────────────────────────────────────────────────────────────────────

export type EnvClaims = 'yes' | 'no' | 'not_sure'
export const isEnvClaims = (v: unknown): v is EnvClaims => v === 'yes' || v === 'no' || v === 'not_sure'

export type ClaimsInput = MarketsInput & { env_claims?: string | null }

// ── S-211 jurisdiction caveat: only where Canada is in play ──────────────────────────────────────
//
// The caveat says the Act can reach a company doing business in Canada wherever it is based. Printed
// on every non-Canadian deal it said nothing about this one, so it now needs a reason: Canada among
// the markets, or markets not confirmed. On a deal whose markets were never recorded it gives way to
// MARKETS_UNRECORDED_LINE, which says why nothing market-specific was assessed.
export type CaveatState = 'show' | 'quiet' | 'hide'
// ⚠️ CANADA TICKED NOW HIDES IT (29 Sep 2026): the size test runs on the deal's figures instead, and
// the Size tests section shows its limbs. "Not sure" is the one case left where nothing is known.
export const canadaCaveatForMarkets = (m: MarketsInput): CaveatState =>
  !marketsRecorded(m) ? 'quiet'
    : (m.sales_markets ?? []).includes('CA') ? 'hide'
    : m.sales_markets_not_sure === true ? 'show'
    : 'hide'

// ── the two framework rows ───────────────────────────────────────────────────────────────────────
//
// Separate from the finding because they are regimes a deal team tracks by name, not only risks: EU
// ECGT when any EU market is selected, California AB 1305 when California is. APPLIES on a reported
// claim, APPLIES: VERIFY on "not sure". A `rule` or `verify` on every row, so the no-basis guard in
// assessment.test.ts holds. Neither prices anything: they are not in SUPPLY_CHAIN_TRIGGERS or
// GHG_INVENTORY_REGIMES.

// Named in full with its short form, so a reader who has not met "ECGT" can place it.
export const EU_ECGT_FRAMEWORK = 'EU Empowering Consumers Directive (ECGT)'
/**
 * The instrument a rule-based row cites, beside its basis. Size-tested rows cite through
 * THRESHOLD_TESTS; these have no size test, so their citation is stated here.
 */
export const FRAMEWORK_CITATIONS: Readonly<Record<string, string>> = {
  [EU_ECGT_FRAMEWORK]: 'Directive (EU) 2024/825',
}
export const CA_AB1305_FRAMEWORK = 'California AB 1305'
export const EU_ECGT_RULE =
  'Applies because the target sells into the EU and reports making public environmental claims; the Empowering Consumers for the Green Transition Directive governs consumer-facing claims from 27 September 2026.'
export const EU_ECGT_VERIFY = 'Applies if the target makes environmental claims to consumers in the EU.'
export const CA_AB1305_RULE =
  'Applies because the target operates in California and reports making public environmental claims; AB 1305 requires disclosures from companies making net-zero or carbon-neutral claims, or buying or selling offsets.'
export const CA_AB1305_VERIFY =
  'Applies if the target makes net-zero or carbon-neutral claims, or buys or sells offsets, while operating in California.'

export const claimsFrameworkRows = (d: ClaimsInput): FrameworkApplicability[] => {
  const env = isEnvClaims(d.env_claims) ? d.env_claims : null
  if (env !== 'yes' && env !== 'not_sure') return []
  const codes = d.sales_markets ?? []
  const row = (framework: string, rule: string, verify: string): FrameworkApplicability =>
    env === 'yes'
      ? { framework, applies: true, status: 'applies', rule }
      : { framework, applies: true, status: 'applies', verify }
  const out: FrameworkApplicability[] = []
  if (codes.some(isEuMember)) out.push(row(EU_ECGT_FRAMEWORK, EU_ECGT_RULE, EU_ECGT_VERIFY))
  if (codes.includes(US_CA)) out.push(row(CA_AB1305_FRAMEWORK, CA_AB1305_RULE, CA_AB1305_VERIFY))
  return out
}
