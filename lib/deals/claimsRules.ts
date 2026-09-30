// lib/deals/claimsRules.ts
// ThemisIQ Deals: environmental-claims (greenwashing) rules by market, and what they make of a deal.
//
// ⚠️ THE TABLE IS WHAT WAS RESEARCHED, AND NOTHING ELSE. One entry per jurisdiction Lisa researched on
// 29 Sep 2026, in the words of that research, each with its source. A market with no entry gets the
// fallback sentence, which says plainly that no claims-specific rule has been assessed for it. Do not
// add a jurisdiction, or fill a field this table leaves null, without research behind it and a new
// last_verified date: a penalty figure printed in a diligence report is read as a statement of law.
//
// PURE. No React, no Supabase. Reads the product's country list for market NAMES, which is why the
// parts the engine needs live in ./markets instead: assessment.ts is imported by public pages that
// should not carry the country list.

import { countryByIso2 } from '../emissionFactors/countryOptions'
import { ECGT_DIRECTIVE_URL } from '../sources'
import {
  US_CA, isEuMember, isEnvClaims, marketsRecorded, MARKETS_UNRECORDED_LINE, type ClaimsInput,
} from './markets'

// ── market names ─────────────────────────────────────────────────────────────────────────────────

/** A code the wizard may store: a country in the product's country list, or California. */
export const isMarketCode = (code: unknown): code is string =>
  typeof code === 'string' && (code === US_CA || !!countryByIso2(code))

/** The name a market is printed under. */
export const marketName = (code: string): string =>
  code === 'EU' ? 'European Union'
    : code === US_CA ? 'California'
    : countryByIso2(code)?.display_name ?? code

// ── the rules table ──────────────────────────────────────────────────────────────────────────────

export type ClaimsRuleKey = 'EU' | 'GB' | 'CA' | 'US' | 'US-CA' | 'AU' | 'NZ' | 'IN' | 'TR' | 'KR' | 'SG'

export type ClaimsRule = {
  key: ClaimsRuleKey
  /** The market it is printed under. */
  market: string
  law: string
  /** null where the research names none. */
  regulator: string | null
  /** In force, applies from, or proposed. null where the research gives none. */
  status: string | null
  /** What the rule reaches. null where the research gives none. */
  scope: string | null
  /** The maximum penalty as researched, or what the research says about it. */
  maxPenalty: string
  /** The penalty can scale with turnover or revenue, which makes the finding HIGH severity. */
  turnoverBased: boolean
  /**
   * The primary source PRINTED as the line's source (29 Sep 2026): the instrument and where it is
   * published. null where none was supplied (TR, KR, SG), and then the research reference prints.
   */
  citation: string | null
  /** A link for the citation, only where it names a full address rather than a site. */
  citationUrl: string | null
  /** The secondary source the entry was researched from. Kept as a record; not printed. */
  researchRef: string
  lastVerified: '2026-09-29'
}

export const CLAIMS_RULES: readonly ClaimsRule[] = [
  {
    key: 'EU', market: 'European Union',
    law: 'Empowering Consumers for the Green Transition Directive', regulator: null,
    status: 'Applies from 27 September 2026.',
    scope: 'Consumer-facing claims. Bans generic environmental claims, self-made sustainability labels and climate-neutral product claims based on offsets.',
    maxPenalty: 'At least 4% of annual turnover, or EUR 2M.', turnoverBased: true,
    citation: 'Directive (EU) 2024/825, eur-lex.europa.eu/eli/dir/2024/825/oj',
    citationUrl: ECGT_DIRECTIVE_URL,
    researchRef: 'https://www.lw.com/en/insights/eu-empowering-consumers-directive-new-rules-on-green-claims-apply-from-27-september-2026',
    lastVerified: '2026-09-29',
  },
  {
    key: 'GB', market: 'United Kingdom',
    law: 'Digital Markets, Competition and Consumers Act 2024', regulator: 'Competition and Markets Authority (CMA)',
    status: 'In force 6 April 2025.',
    scope: 'Consumer-facing claims.',
    maxPenalty: 'Up to 10% of global group turnover.', turnoverBased: true,
    citation: 'Digital Markets, Competition and Consumers Act 2024, legislation.gov.uk',
    citationUrl: null,
    researchRef: 'https://www.reedsmith.com/articles/green-police-expanding-cmas-enforcement-powers-on-greenwashing-in-the-uk/',
    lastVerified: '2026-09-29',
  },
  {
    key: 'CA', market: 'Canada',
    law: 'Competition Act environmental claims provisions, as amended by Bill C-15', regulator: 'Competition Bureau',
    status: 'Bill C-15 received royal assent 26 March 2026.',
    scope: 'Product claims need adequate and proper testing; business-activity claims need adequate and proper substantiation. Business-to-business claims are included.',
    maxPenalty: 'The greater of CAD 10M (CAD 15M for a repeat), 3 times the benefit, or 3% of worldwide revenue.', turnoverBased: true,
    citation: 'Competition Act, R.S.C. 1985, c. C-34, laws-lois.justice.gc.ca',
    citationUrl: null,
    researchRef: 'https://www.mltaikins.com/insights/federal-government-narrows-scope-of-the-competition-acts-anti-greenwashing-provisions-as-bill-c-15-receives-royal-assent/',
    lastVerified: '2026-09-29',
  },
  {
    key: 'US', market: 'United States',
    law: 'FTC Act section 5, with the Green Guides (guidance, not law)', regulator: 'Federal Trade Commission (FTC)',
    status: null,
    scope: 'Consumer-facing claims.',
    maxPenalty: 'Decided case by case.', turnoverBased: false,
    citation: 'FTC Green Guides, 16 CFR Part 260, ftc.gov',
    citationUrl: null,
    researchRef: 'https://natlawreview.com/article/what-will-new-ftc-do-green-guides',
    lastVerified: '2026-09-29',
  },
  {
    key: 'US-CA', market: 'California',
    law: 'California AB 1305, Voluntary Carbon Market Disclosures Act', regulator: null,
    status: 'Disclosures due since 1 January 2025.',
    scope: 'Companies operating in California that make net-zero or carbon-neutral claims, or buy or sell offsets.',
    maxPenalty: 'Up to USD 2,500 per day per violation, to a maximum of USD 500,000.', turnoverBased: false,
    citation: 'AB 1305 (2023), leginfo.legislature.ca.gov',
    citationUrl: null,
    researchRef: 'https://www.velaw.com/insights/californias-combatting-of-greenwashing-in-the-voluntary-carbon-market/',
    lastVerified: '2026-09-29',
  },
  {
    key: 'AU', market: 'Australia',
    law: 'Australian Consumer Law, and the ASIC Act for financial products', regulator: 'ACCC; ASIC for financial products',
    status: null,
    scope: 'All environmental claims.',
    maxPenalty: 'The greater of AUD 50M, 3 times the benefit, or 30% of adjusted turnover.', turnoverBased: true,
    citation: 'Competition and Consumer Act 2010 Sch. 2 (Australian Consumer Law), legislation.gov.au',
    citationUrl: null,
    researchRef: 'https://www.allens.com.au/insights-news/insights/2025/08/greenwashing-enforcement-reaches-new-heights/',
    lastVerified: '2026-09-29',
  },
  {
    key: 'NZ', market: 'New Zealand',
    law: 'Fair Trading Act', regulator: 'Commerce Commission',
    status: 'Civil penalty regime expected late 2026.',
    scope: null,
    maxPenalty: 'Maximum rising from NZD 600,000 to NZD 5M.', turnoverBased: false,
    citation: 'Fair Trading Act 1986, legislation.govt.nz',
    citationUrl: null,
    researchRef: 'https://www.comcom.govt.nz/news-and-media/news-and-events/2025/stronger-fair-trading-act-a-win-for-consumers-and-rule-abiding-businesses/',
    lastVerified: '2026-09-29',
  },
  {
    key: 'IN', market: 'India',
    law: 'CCPA Guidelines for Prevention and Regulation of Greenwashing 2024 (binding, under the Consumer Protection Act 2019)', regulator: 'Central Consumer Protection Authority (CCPA)',
    status: 'In force October 2024.',
    scope: 'Claims need third-party substantiation and a QR code or URL disclosure.',
    maxPenalty: 'INR 10 to 50 lakh; endorser bans of 1 to 3 years.', turnoverBased: false,
    citation: 'CCPA Greenwashing Guidelines 2024, consumeraffairs.nic.in',
    citationUrl: null,
    researchRef: 'https://www.lawrbit.com/article/guidelines-for-prevention-regulation-of-greenwashing-or-misleading-environmental-claims-2024/',
    lastVerified: '2026-09-29',
  },
  {
    key: 'TR', market: 'Türkiye',
    law: 'Amended Regulation on Commercial Advertising and Unfair Commercial Practices', regulator: null,
    status: 'In force 1 August 2026.',
    scope: 'Claims need certificates from accredited or independent bodies.',
    maxPenalty: 'Penalty not stated.', turnoverBased: false,
    citation: null,
    citationUrl: null,
    researchRef: 'https://cms.law/en/che/publication/cms-green-globe/turkey',
    lastVerified: '2026-09-29',
  },
  {
    key: 'KR', market: 'South Korea',
    law: 'Act on Fair Labelling and Advertising', regulator: 'Korea Fair Trade Commission (KFTC)',
    status: null,
    scope: null,
    maxPenalty: 'Corrective orders and fines.', turnoverBased: false,
    citation: null,
    citationUrl: null,
    researchRef: 'https://www.slaughterandmay.com/services/practices/environmental-social-and-governance/esg-in-apac-2025/south-korea/',
    lastVerified: '2026-09-29',
  },
  {
    key: 'SG', market: 'Singapore',
    law: 'Consumer Protection (Fair Trading) Act', regulator: 'Competition and Consumer Commission of Singapore (CCS)',
    status: null,
    scope: null,
    maxPenalty: 'Injunctions and restitution.', turnoverBased: false,
    citation: null,
    citationUrl: null,
    researchRef: 'https://www.clydeco.com/en/insights/2026/06/greenwashing-overview-singapore',
    lastVerified: '2026-09-29',
  },
]

/** For a market with no researched rule. */
export const CLAIMS_FALLBACK =
  'General consumer protection law applies to environmental claims. No claims-specific rule has been assessed for this market.'

const RULE_BY_KEY = new Map(CLAIMS_RULES.map(r => [r.key, r]))

/**
 * The researched rules a set of markets brings in, in table order, each once. Any EU member brings in
 * the EU rule; California brings in both the US rule and AB 1305. `other` is every selected market
 * with no rule of its own, for the one combined fallback line.
 */
export const rulesForMarkets = (codes: readonly string[]): { rules: ClaimsRule[]; other: string[] } => {
  const keys = new Set<ClaimsRuleKey>()
  const other: string[] = []
  for (const c of codes) {
    if (isEuMember(c)) keys.add('EU')
    else if (c === US_CA) { keys.add('US'); keys.add('US-CA') }
    else if (RULE_BY_KEY.has(c as ClaimsRuleKey)) keys.add(c as ClaimsRuleKey)
    else other.push(c)
  }
  return { rules: CLAIMS_RULES.filter(r => keys.has(r.key)), other: [...new Set(other)] }
}

// ── the finding ──────────────────────────────────────────────────────────────────────────────────

export const CLAIMS_FINDING_TITLE = 'Environmental claims liability'
export const NO_CLAIMS_NOTE = 'Target reports no public environmental claims. Confirm in the data room.'
export const CLAIMS_UNRECORDED_LINE = 'Environmental claims not recorded; claims rules not assessed.'
export const MARKETS_NOT_CONFIRMED =
  'Markets not confirmed. Environmental claims rules apply in every market the target sells into.'
export const CLAIMS_DATA_ROOM_ITEM = 'Public environmental claims and supporting evidence'

export type ClaimsLine = {
  market: string
  law: string
  regulator: string | null
  status: string | null
  scope: string | null
  maxPenalty: string
  /** What prints as the source: the primary citation, or the research reference where there is none. */
  source: string
  /** Where the page may link the source; null prints it as plain text. */
  sourceUrl: string | null
  lastVerified: string
}

export type ClaimsAssessment =
  | {
      kind: 'finding'
      /** APPLIES on a reported claim in confirmed markets; APPLIES: VERIFY on "not sure" either way. */
      status: 'applies' | 'verify'
      severity: 'high' | 'medium'
      title: string
      lines: ClaimsLine[]
      /** One combined line for the selected markets with no researched rule, or null. */
      fallback: string | null
      /** Set when the markets themselves were not confirmed. */
      notConfirmed: string | null
    }
  | { kind: 'note'; text: string }


/**
 * What the report says about environmental claims for this deal. Always something: a finding, or one
 * line saying why there is none. Never silence, which would read as "checked and clear".
 *   env_claims 'no'                  the target's own report, to be confirmed
 *   markets not recorded             the quiet line: nothing market-specific can be said
 *   env_claims not recorded          the same, for the claims question
 *   'yes' or 'not_sure'              the finding, one line per researched market
 */
export const assessClaims = (d: ClaimsInput): ClaimsAssessment => {
  const env = isEnvClaims(d.env_claims) ? d.env_claims : null
  if (env === 'no') return { kind: 'note', text: NO_CLAIMS_NOTE }
  if (!marketsRecorded(d)) return { kind: 'note', text: MARKETS_UNRECORDED_LINE }
  if (env === null) return { kind: 'note', text: CLAIMS_UNRECORDED_LINE }

  const notSure = d.sales_markets_not_sure === true
  const { rules, other } = rulesForMarkets(d.sales_markets ?? [])
  return {
    kind: 'finding',
    status: env === 'yes' && !notSure ? 'applies' : 'verify',
    severity: rules.some(r => r.turnoverBased) ? 'high' : 'medium',
    title: CLAIMS_FINDING_TITLE,
    lines: rules.map(r => ({
      market: r.market, law: r.law, regulator: r.regulator, status: r.status, scope: r.scope,
      maxPenalty: r.maxPenalty, source: r.citation ?? r.researchRef,
      sourceUrl: r.citation ? r.citationUrl : r.researchRef, lastVerified: r.lastVerified,
    })),
    fallback: other.length ? `${other.map(marketName).join(', ')}: ${CLAIMS_FALLBACK}` : null,
    notConfirmed: notSure ? MARKETS_NOT_CONFIRMED : null,
  }
}

