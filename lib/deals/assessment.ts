// lib/deals/assessment.ts
// Pure Deals-assessment logic, extracted from app/dashboard/deals/page.tsx so BOTH the
// authenticated dashboard and the future public target-facing route (app/deals/[token])
// compute the identical assessment from one source — no drift. No React, no I/O, no state.
// ThemisIQ prices come from lib/pricing.ts (single source of truth); consultant = cited ranges.

import { GHG_TIERS, FLAT_MODULE_PRICES, GHG_TIER_LABELS, ghgTierForEmployees, type GhgTier } from '../pricing'
import { claimsFrameworkRows, EU_MEMBER_CODES, marketsRecorded, type MarketsInput } from './markets'
import {
  SECTORS, LEGACY_SECTORS, SECTOR_TEMPLATE_SOURCE, HEAVY_SECTORS, ETS_SECTORS, FINANCIAL_SECTORS,
  FINANCIAL_RULE_SECTORS, FLAG_SECTORS, normalizeSector, type Sector,
} from './sectors'
// Sector risk copy must not retype an AI Act date — see lib/aiAct.ts. Constants only, no I/O, so this
// import does not compromise the purity note above.
import { AI_ACT_HIGH_RISK_STANDALONE, AI_ACT_HIGH_RISK_EMBEDDED, AI_ACT_CITATION } from '../aiAct'
import { CS3D_APPLIES_FROM, CS3D_CITATION } from '../cs3d'

// Fields the assessment functions read off a deal. The functions take explicit primitive
// params (below); this type documents the deal shape both surfaces hydrate from.
export type DealInput = {
  target_name: string
  sector: string
  jurisdiction: string
  revenue: number
  deal_value: number
  location_count: number
  currency: DealCurrency
}

// ─── Sector risk findings ───────────────────────────────────────────────────────
//
// A finding's `detail` used to weld two claims into one paragraph: a MECHANISM true of the sector
// anywhere, and an INSTRUMENT ASSERTION true only given a nexus. So a US-only Technology target was
// told "Conformity assessment applies from {date}" under the EU AI Act, and a Canadian retailer that
// its goods "fall under the EU Deforestation Regulation". Neither had been established.
//
// A HARD JURISDICTION GATE WAS THE WRONG FIX. These instruments genuinely reach beyond their home
// jurisdiction — CBAM catches importers into the EU, EUDR catches operators placing goods on the EU
// market, the AI Act reaches systems affecting EU persons — so dropping the finding trades a false
// positive for a false negative, and in diligence the false negative is the worse of the two because
// a buyer told a statute does not apply stops looking. Same reasoning as csrdNonEuAbstention().
//
// So the assertion is CONDITIONED, not deleted. `detail` keeps only the mechanism; the assertion
// moves to `conditional.consequence` and is appended when the deal's jurisdiction is one where the
// instrument is established. Out of jurisdiction, the reader gets the nexus test instead.
// GATING THE TOKEN ALONE WOULD NOT HAVE WORKED: the false sentence lives in the body, and a corrected
// label above an uncorrected paragraph is harder to catch in review than an obviously wrong badge.
//
// Where the instrument was the SUBJECT of the mechanism sentence a clean split was impossible and
// the sentence was rewritten — lib/deals/sectorRisks.test.ts lists those ten by name and holds their
// legal references instead of their wording.
export type SectorRiskCondition = {
  /**
   * What a ticked sales market settles (29 Sep 2026).
   *   'market'  presence in the market IS the nexus (goods, routes, systems or property there), so a
   *             ticked market establishes the finding for the target's activity there.
   *   'scope'   presence is necessary and not enough: a reporting, supervisory or turnover test still
   *             decides (CSRD reach, SFDR marketing, ECB supervision, a Modern Slavery threshold), so a
   *             ticked market is stated and the finding stays conditioned.
   */
  reach: 'market' | 'scope'
  /** The markets that meet it, where they differ from `establishedIn` (EU ETS routes: the EEA). */
  regions?: Region[]
  /** Jurisdictions — spelled as the deal form spells them — where this is ESTABLISHED, not conditioned. */
  establishedIn: string[]
  /** Heading for the conditioned note, e.g. 'Conditioned on EU market access.' */
  label: string
  /** The nexus test: what brings a target established elsewhere into scope. */
  nexus: string
  /** What this screen has not established, in the third person: 'whether the target’s goods reach the EU market'. */
  unresolved: string
  /** The instrument assertion, moved out of `detail`. Appended when established. Absent where the
   *  finding never asserted one and only its framework token was out of jurisdiction. */
  consequence?: string
}
export type SectorRisk = {
  risk: string
  severity: 'critical' | 'high' | 'medium'
  framework: string
  /** MECHANISM ONLY. Must assert no instrument — anything conditional belongs in `conditional`. */
  detail: string
  conditional?: SectorRiskCondition
}

// 'Investor expectation (IFRS S2 / TCFD)' (29 Sep 2026): IFRS S2 and TCFD are market expectations,
// not duties, so a finding that rests on them says so in the same words as the report's market
// section. The ' / ' inside the brackets is not a token separator: makeMapFramework splits outside
// brackets only, so the label passes through whole.
export const SECTOR_RISKS: Record<string, SectorRisk[]> = {
  'Energy & Utilities': [
    { risk: 'High Scope 1 emissions exposure', severity: 'critical', framework: 'SB 253 / CSRD', detail: 'Energy companies typically carry 60-80% of portfolio Scope 1 emissions, requiring full consolidation into the buyer\'s GHG inventory under prevailing emissions-accounting standards.' },
    { risk: 'Stranded asset risk', severity: 'critical', framework: 'Investor expectation (IFRS S2 / TCFD)', detail: 'Fossil fuel assets face material impairment risk under 1.5°C transition scenarios. Requires IFRS S2 climate scenario analysis.' },
    { risk: 'Physical climate risk exposure', severity: 'high', framework: 'Investor expectation (IFRS S2 / TCFD)', detail: 'Energy infrastructure faces acute and chronic physical climate risk. Requires asset-level climate risk assessment.' },
  ],
  'Financial Services': [
    { risk: 'Financed emissions (Scope 3 Cat.15)', severity: 'critical', framework: 'PCAF / CSRD', detail: 'Financed emissions typically represent 95%+ of a financial institution\'s carbon footprint. PCAF methodology required.' },
    { risk: 'SFDR portfolio alignment', severity: 'high', framework: 'SFDR / EU Taxonomy', detail: 'Portfolio sustainability characteristics affect fund marketability and investor selection.',
      conditional: { reach: 'scope', establishedIn: ['European Union'], label: 'Conditioned on marketing financial products in the EU.', nexus: 'SFDR attaches to the product and to the manager marketing it in the EU, not to where the manager is established.', unresolved: 'whether the target markets products in the EU', consequence: 'EU financial products must disclose sustainability characteristics. Article 8/9 classification impacts fund marketability.' } },
    { risk: 'Physical risk in loan book', severity: 'high', framework: 'ECB / Investor expectation (TCFD)', detail: 'Mortgage and commercial real estate portfolios face material physical climate risk.',
      conditional: { reach: 'scope', establishedIn: ['European Union'], label: 'Conditioned on EU banking supervision.', nexus: 'The ECB guidelines bind significant institutions under EU banking supervision; an institution supervised elsewhere carries the same portfolio risk under its own regulator.', unresolved: 'whether the target falls under EU banking supervision', consequence: 'ECB guidelines on climate and environmental risk apply to supervised institutions.' } },
  ],
  'Real Estate': [
    { risk: 'Embodied carbon in portfolio', severity: 'high', framework: 'CSRD / CRREM', detail: 'Building portfolios face stranding risk against decarbonisation pathways. CRREM analysis is the standard way to test it.',
      conditional: { reach: 'market', establishedIn: ['European Union'], label: 'Conditioned on EU property holdings.', nexus: 'CRREM’s EU pathways apply to assets held in EU markets; assets elsewhere are tested against the pathway for their own market.', unresolved: 'whether the target holds EU property', consequence: 'EU carbon reduction pathways apply to the EU-held portion of the portfolio.' } },
    { risk: 'Energy efficiency compliance', severity: 'high', framework: 'EU EPC / MEES', detail: 'Building portfolios carry regulatory exposure where minimum energy-performance ratings apply, and non-compliant assets can become unlettable.',
      conditional: { reach: 'market', establishedIn: ['European Union', 'UK'], label: 'Conditioned on EU or UK property holdings.', nexus: 'Both regimes attach to the property, not to the owner, and a company established elsewhere is reached through the assets it holds in those markets.', unresolved: 'whether the target holds EU or UK property', consequence: 'The EU Energy Performance of Buildings Directive and UK MEES require minimum EPC ratings. Non-compliant assets face rental prohibition.' } },
    { risk: 'Physical flood and heat risk', severity: 'critical', framework: 'Investor expectation (IFRS S2 / TCFD)', detail: 'Real estate assets face material physical climate risk. Asset-level flood mapping and heat stress analysis required.' },
  ],
  'Technology': [
    { risk: 'Data centre energy intensity', severity: 'medium', framework: 'SB 253 / CSRD', detail: 'Data centre operations carry significant Scope 2 exposure. PPA and renewable energy coverage assessment needed.' },
    { risk: 'AI governance exposure', severity: 'medium', framework: 'EU AI Act', detail: 'Technology products may contain high-risk AI systems.',
      conditional: { reach: 'market', establishedIn: ['European Union'], label: 'Conditioned on EU market access.', nexus: 'The AI Act reaches providers and deployers placing a system on the EU market, and systems whose output is used in the EU, wherever the company is established.', unresolved: 'EU availability of the target’s systems', consequence: `Conformity assessment applies from ${AI_ACT_HIGH_RISK_STANDALONE} for stand-alone systems, and from ${AI_ACT_HIGH_RISK_EMBEDDED} where the AI is built into a product already covered by EU product-safety law (${AI_ACT_CITATION}).` } },
    // `detail` keeps its CS3D sentence: "in-scope companies" is self-limiting, so it asserts nothing
    // about THIS target. The conditional here covers the ESRS S2 token beside it, which is not.
    { risk: 'Supply chain minerals risk', severity: 'high', framework: 'CS3D / ESRS S2', detail: `Hardware products may rely on conflict minerals. CS3D due diligence obligations apply to in-scope companies from ${CS3D_APPLIES_FROM} (${CS3D_CITATION}).`,
      conditional: { reach: 'scope', establishedIn: ['European Union'], label: 'Conditioned on EU reporting scope.', nexus: 'ESRS S2 is a CSRD reporting standard, so it reaches a company through its own or its parent’s CSRD obligation rather than directly.', unresolved: 'whether CSRD reaches the target' } },
  ],
  'Healthcare & Pharma': [
    { risk: 'Cold chain emissions', severity: 'medium', framework: 'SB 253 / GHG Protocol', detail: 'Pharmaceutical cold chain carries significant Scope 3 Cat.4 emissions from refrigerant leakage and transport.' },
    { risk: 'Pharmaceutical waste', severity: 'medium', framework: 'CSRD / GRI', detail: 'Pharmaceutical manufacturing generates hazardous waste requiring environmental liability assessment.' },
    { risk: 'Clinical trial supply chain', severity: 'medium', framework: 'CS3D / ESRS S2', detail: 'Clinical trial operations in emerging markets carry human rights and labour standards risk.',
      conditional: { reach: 'scope', establishedIn: ['European Union'], label: 'Conditioned on EU reporting scope.', nexus: 'ESRS S2 is a CSRD reporting standard, so it reaches a company through its own or its parent’s CSRD obligation rather than directly.', unresolved: 'whether CSRD reaches the target' } },
  ],
  'Industrials & Manufacturing': [
    { risk: 'Scope 1 process emissions', severity: 'critical', framework: 'SB 253 / CSRD', detail: 'Industrial manufacturing typically carries significant Scope 1 process emissions requiring full GHG inventory.' },
    { risk: 'Carbon border adjustment exposure', severity: 'high', framework: 'EU CBAM', detail: 'Iron and steel, cement, aluminium, fertilisers, hydrogen and electricity carry a carbon-border cost when they enter the EU.',
      conditional: { reach: 'market', establishedIn: ['European Union'], label: 'Conditioned on EU market access.', nexus: 'CBAM applies to the declarant importing covered goods into the EU. It reaches a producer established elsewhere through that import route, not through where it operates.', unresolved: 'whether goods the target produces enter the EU', consequence: 'The definitive period began 1 January 2026, with a 50-tonne annual net-mass exemption for all but electricity and hydrogen (Regulation (EU) 2023/956 as amended by (EU) 2025/2083).' } },
    { risk: 'Chemical and hazardous materials', severity: 'high', framework: 'REACH / CSRD', detail: 'Industrial operations may carry significant environmental liability from chemical usage and historical contamination.',
      conditional: { reach: 'market', establishedIn: ['European Union'], label: 'Conditioned on EU market access.', nexus: 'REACH attaches to substances manufactured in or imported into the EU, so a manufacturer established elsewhere is reached through what it ships there.', unresolved: 'whether the target’s substances or articles enter the EU' } },
  ],
  'Consumer & Retail': [
    { risk: 'Scope 3 Cat.1 supplier emissions', severity: 'high', framework: 'SB 253 / CSRD', detail: 'Consumer goods companies typically carry 70-90% of emissions in Scope 3 Cat.1. Supplier engagement programme needed.' },
    { risk: 'Deforestation exposure', severity: 'high', framework: 'EU EUDR', detail: 'Consumer goods with exposure to cattle, soy, palm oil, cocoa, coffee, wood or rubber carry deforestation risk in their sourcing.',
      conditional: { reach: 'market', establishedIn: ['European Union'], label: 'Conditioned on EU market access.', nexus: 'EUDR applies to operators and traders placing the listed commodities on the EU market, or exporting them from it. A company incorporated elsewhere is reached through that placement.', unresolved: 'whether the target’s goods reach the EU market', consequence: 'The EU Deforestation Regulation applies to large and medium operators from 30 December 2026 and to micro and small enterprises from 30 June 2027 (Regulation (EU) 2023/1115 as amended by (EU) 2025/2650).' } },
    { risk: 'Labour rights in supply chain', severity: 'high', framework: 'CS3D / Modern Slavery', detail: 'Consumer goods supply chains carry significant forced labour and child labour risk in sourcing countries.',
      conditional: { reach: 'scope', establishedIn: ['UK', 'Australia'], label: 'Conditioned on UK or Australian turnover.', nexus: 'The UK and Australian Modern Slavery Acts attach to carrying on business in those markets above a turnover threshold, wherever the company is incorporated.', unresolved: 'whether the target carries on business there above the threshold' } },
  ],
  'Agriculture & Food': [
    { risk: 'Land use change emissions', severity: 'critical', framework: 'GHG Protocol / SB 253', detail: 'Agricultural operations may carry significant land use change (LUC) emissions requiring scope 3 Cat.11 assessment.' },
    { risk: 'Deforestation and biodiversity', severity: 'critical', framework: 'EU EUDR / TNFD', detail: 'Agricultural supply chains carry deforestation and nature-related risk, and TNFD nature disclosure expectations are emerging across markets.',
      conditional: { reach: 'market', establishedIn: ['European Union'], label: 'Conditioned on EU market access.', nexus: 'EUDR applies to operators and traders placing the listed commodities on the EU market, or exporting them from it. A company incorporated elsewhere is reached through that placement.', unresolved: 'whether the target’s commodities reach the EU market', consequence: 'The EU Deforestation Regulation applies to the listed commodities placed on the EU market.' } },
    { risk: 'Water risk', severity: 'high', framework: 'CSRD / CDP Water', detail: 'Agricultural operations in water-stressed regions face material operational and regulatory risk.' },
  ],
  'Transport & Logistics': [
    { risk: 'Fleet decarbonisation liability', severity: 'high', framework: 'SB 253 / CSRD', detail: 'Transport fleet carries significant Scope 1 emissions.',
      conditional: { reach: 'market', establishedIn: ['European Union'], label: 'Conditioned on EU routes.', nexus: 'FuelEU Maritime and the ETS extension attach to voyages into, out of and within the EU, whichever state the operator is established in.', unresolved: 'whether the target’s routes touch the EU', consequence: 'EU FuelEU Maritime and ETS expansion add compliance cost.' } },
    { risk: 'Aviation and shipping ETS exposure', severity: 'high', framework: 'EU ETS', detail: 'Aviation and maritime fleets carry carbon-cost exposure that requires detailed fleet assessment.',
      conditional: { reach: 'market', regions: ['EEA'], establishedIn: ['European Union'], label: 'Conditioned on EEA routes.', nexus: 'EU ETS reaches flights and voyages into, out of and within the EEA, whichever flag or state the operator sits under.', unresolved: 'whether the target’s routes touch the EEA', consequence: 'EU ETS now covers aviation and maritime.' } },
    { risk: 'Infrastructure physical risk', severity: 'medium', framework: 'Investor expectation (IFRS S2 / TCFD)', detail: 'Transport infrastructure faces physical climate risk from flooding, extreme heat and storm events.' },
  ],
  'Mining & Metals': [
    { risk: 'Scope 1 extraction emissions', severity: 'critical', framework: 'SB 253 / CSRD', detail: 'Mining operations carry significant Scope 1 methane and process emissions requiring full GHG inventory.' },
    { risk: 'Tailings and environmental liability', severity: 'critical', framework: 'CSRD / GRI', detail: 'Mining operations carry material environmental liability from tailings management and historical contamination.' },
    // OECD DDG IS VOLUNTARY GUIDANCE, NOT LAW. This read "require OECD Due Diligence Guidance
    // compliance", which states an instrument that binds nobody as a legal obligation. That is a
    // different defect from the jurisdictional ones around it — no nexus would have made it true —
    // so it is corrected in the text rather than conditioned.
    { risk: 'Conflict minerals and HRDD', severity: 'high', framework: 'CS3D / OECD DDG', detail: 'Mining operations in conflict-affected and high-risk areas carry sourcing risk that buyers and downstream customers expect to see addressed. The OECD Due Diligence Guidance is the reference framework for that work. It is voluntary guidance rather than a legal obligation in itself, though a binding due-diligence duty such as CS3D may require equivalent steps.' },
  ],
  'Construction & Materials': [
    { risk: 'Embodied carbon in products', severity: 'high', framework: 'CSRD / EU Taxonomy', detail: 'Cement and steel production carry significant process emissions.',
      conditional: { reach: 'scope', establishedIn: ['European Union'], label: 'Conditioned on EU reporting scope.', nexus: 'The EU Taxonomy is reported by entities already inside CSRD or SFDR scope, so it reaches a company through one of those obligations rather than directly.', unresolved: 'whether an EU reporting obligation reaches the target', consequence: 'EU Taxonomy alignment assessment required.' } },
    { risk: 'EU CBAM exposure', severity: 'high', framework: 'EU CBAM', detail: 'Cement, steel and aluminium carry a carbon-border cost when they enter the EU.',
      conditional: { reach: 'market', establishedIn: ['European Union'], label: 'Conditioned on EU market access.', nexus: 'CBAM applies to the declarant importing covered goods into the EU. It reaches a producer established elsewhere through that import route, not through where it operates.', unresolved: 'whether materials the target produces enter the EU', consequence: 'The EU Carbon Border Adjustment Mechanism definitive period began in 2026.' } },
    { risk: 'Site biodiversity and land use', severity: 'medium', framework: 'CSRD / TNFD', detail: 'Construction projects face emerging biodiversity disclosure requirements under TNFD.',
      conditional: { reach: 'scope', establishedIn: ['European Union'], label: 'Conditioned on EU reporting scope.', nexus: 'ESRS E4 is a CSRD standard, so it reaches a company through its own or its parent’s CSRD obligation rather than directly.', unresolved: 'whether CSRD reaches the target', consequence: 'CSRD ESRS E4 adds a biodiversity disclosure requirement for companies in CSRD scope.' } },
  ],
  'Professional Services': [
    { risk: 'Scope 2 and business travel emissions', severity: 'medium', framework: 'SB 253 / CSRD', detail: 'Professional services firms carry Scope 2 and Scope 3 Cat.6 business travel emissions.' },
    { risk: 'Client portfolio ESG exposure', severity: 'medium', framework: 'CSRD / SFDR', detail: 'Advisory and consulting firms may carry reputational and legal exposure from ESG advice provided to clients.',
      conditional: { reach: 'scope', establishedIn: ['European Union'], label: 'Conditioned on marketing financial products in the EU.', nexus: 'SFDR attaches to the product and to the manager marketing it in the EU, not to where the adviser is established.', unresolved: 'whether the target’s clients market products in the EU' } },
  ],
}

// ─── Which templates a stored sector gets (29 Sep 2026) ──────────────────────────
// A current sector: the templates SECTOR_TEMPLATE_SOURCE names, unchanged. A legacy value (the list
// before 29 Sep 2026): its own whole set, exactly as before. Blank, unknown or "Other": none.
export const sectorTemplates = (stored: unknown): SectorRisk[] => {
  const sector = normalizeSector(stored)
  if (!sector) return []
  if (sector in LEGACY_SECTORS) return SECTOR_RISKS[sector] ?? []
  const source = (SECTOR_TEMPLATE_SOURCE as Record<string, { from: string; risks?: readonly string[] } | null>)[sector]
  if (!source) return SECTORS.includes(sector as Sector) ? [] : (SECTOR_RISKS[sector] ?? [])
  const all = SECTOR_RISKS[source.from] ?? []
  return source.risks ? all.filter(r => source.risks!.includes(r.risk)) : all
}

// ─── Resolving a sector risk against the deal's jurisdiction ────────────────────
//
// THE ONE CHOKE POINT. Four surfaces consume sector risks — the wizard, the printed report, the
// target-facing share page and the XLSX pipeline export — and all four used to index SECTOR_RISKS
// directly. Conditioning at the render sites would have to be written four times, and the XLSX has
// NO render site at all: it only counts by severity, so it would have gone on counting findings the
// other three had marked conditional. Resolving here means a fifth consumer inherits it by having
// no other route to a finding.
//
// A resolved finding is a DISCRIMINATED UNION, so `condition` cannot be read on a finding that has
// none, and an established finding cannot accidentally render a nexus note. Same shape and the same
// reason as ObligationPrice: make the wrong read unrepresentable rather than discouraged.
export type ResolvedRisk =
  | { risk: string; severity: SectorRisk['severity']; framework: string; detail: string; scope: 'established' }
  | { risk: string; severity: SectorRisk['severity']; framework: string; detail: string; scope: 'conditional'; condition: string }

// One sentence, composed ONCE. The four surfaces render it; none of them writes it. Three separate
// literals is how CS3D's "not assessed" wording drifted before CS3D_NOT_ASSESSED_LABEL existed.
export const CONDITION_SCREEN_NOTE = 'This screen records a primary jurisdiction only, so '
/** Today's wording: markets "not sure", or never recorded. */
export const conditionSentence = (c: SectorRiskCondition): string =>
  `${c.label} ${c.nexus} ${CONDITION_SCREEN_NOTE}${c.unresolved} is not established here. Confirm before ruling it out.`

// ── Markets settle what a primary jurisdiction cannot (29 Sep 2026) ─────────────────────────────
// A condition's regions, as sales-market codes, with the words each is printed in.
export type Region = 'European Union' | 'EEA' | 'UK' | 'Australia'
const REGION: Record<Region, { codes: readonly string[]; place: string; adjective: string }> = {
  'European Union': { codes: EU_MEMBER_CODES, place: 'the EU', adjective: 'EU' },
  EEA: { codes: [...EU_MEMBER_CODES, 'IS', 'LI', 'NO'], place: 'the EEA', adjective: 'EEA' },
  UK: { codes: ['GB'], place: 'the UK', adjective: 'UK' },
  Australia: { codes: ['AU'], place: 'Australia', adjective: 'Australian' },
}
const regionsOf = (c: SectorRiskCondition): Region[] =>
  c.regions ?? c.establishedIn.filter((j): j is Region => j in REGION)
const orList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`)
const andList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** A 'market' condition met by a ticked market: appended to the finding, which is then established. */
export const conditionMetSentence = (ticked: Region[]): string =>
  `The target sells into or operates in ${andList(ticked.map(r => REGION[r].place))}, so this applies to its ${ticked.length === 1 ? `${REGION[ticked[0]].adjective} activity` : 'activity there'}.`
/** A 'scope' condition whose market is ticked: the market is stated, the deciding test is not settled. */
export const conditionScopeSentence = (c: SectorRiskCondition, ticked: Region[]): string =>
  `${c.label} ${c.nexus} The target sells into or operates in ${andList(ticked.map(r => REGION[r].place))}, which this needs; ${c.unresolved} is not established here. Confirm before ruling it out.`
/** Markets recorded, and none of the condition's among them. */
export const conditionAbsentSentence = (c: SectorRiskCondition): string =>
  `${c.label} ${c.nexus} The target does not report ${orList(regionsOf(c).map(r => REGION[r].adjective))} sales or operations. Confirm before ruling it out.`

// ⚠️ KNOWN ISSUE — SECTOR RISKS AND FRAMEWORKS DISAGREE ABOUT 'Global'. NOT FIXED HERE.
//
// Here, 'Global' resolves CONDITIONAL: "Global / multiple regions" is not confirmation of EU
// establishment, and treating it as one would reinstate the assertion for exactly the targets least
// likely to be checked. That matches csrdNonEuAbstention() and cs3dNonEuAbstention(), which both
// abstain on 'Global' for the same reason — the EU footprint is not captured.
//
// But getFrameworkApplicability does NOT treat 'Global' consistently. Two EU instruments resolve
// 'applies' outright there — EU Taxonomy and EU ETS both test
// `['European Union','Global'].includes(jurisdiction)` — while CSRD and CS3D abstain on the same
// jurisdiction. So on one Global deal the frameworks section can assert EU ETS applies while a
// sector finding citing EU ETS is conditioned on whether the target's routes touch the EEA.
//
// The argument that makes CSRD abstain applies equally to EU ETS, which turns on operating an
// installation or a route inside the EEA. Resolving that means deciding whether 'Global' asserts or
// abstains for those two, and that changes the applicable-frameworks list a customer may already
// have exported — out of scope for this change, recorded so the next reader is not surprised.
export function sectorRisks(
  sector: string | null | undefined, jurisdiction: string | null | undefined,
  // The deal's sales markets (29 Sep 2026). Absent, as on the share page whose RPC does not return
  // them, every condition keeps its primary-jurisdiction wording.
  markets?: MarketsInput,
): ResolvedRisk[] {
  const template = sectorTemplates(sector)
  const codes = new Set(markets?.sales_markets ?? [])
  const recorded = !!markets && marketsRecorded(markets)
  return template.map((r): ResolvedRisk => {
    const base = { risk: r.risk, severity: r.severity, framework: r.framework }
    if (!r.conditional) return { ...base, detail: r.detail, scope: 'established' }
    const c = r.conditional
    const withConsequence = c.consequence ? `${r.detail} ${c.consequence}` : r.detail
    // A missing jurisdiction is not a match. Nothing was established, so nothing is asserted.
    if (!!jurisdiction && c.establishedIn.includes(jurisdiction)) return { ...base, detail: withConsequence, scope: 'established' }
    const ticked = regionsOf(c).filter(reg => REGION[reg].codes.some(code => codes.has(code)))
    if (ticked.length && c.reach === 'market') {
      return { ...base, detail: `${withConsequence} ${conditionMetSentence(ticked)}`, scope: 'established' }
    }
    if (ticked.length) return { ...base, detail: r.detail, scope: 'conditional', condition: conditionScopeSentence(c, ticked) }
    // Recorded without it, and not "not sure": the absence is itself a fact the target reported.
    if (recorded && markets?.sales_markets_not_sure !== true) {
      return { ...base, detail: r.detail, scope: 'conditional', condition: conditionAbsentSentence(c) }
    }
    return { ...base, detail: r.detail, scope: 'conditional', condition: conditionSentence(c) }
  })
}

// Compliance cost estimates by deal size and sector complexity
export const getComplianceCost = (dealValue: number, sector: string, frameworks: string[]): { low: number; high: number; pctLow: number; pctHigh: number; items: { item: string; cost: string }[] } => {
  const isHighEmissions = HEAVY_SECTORS.has(normalizeSector(sector) ?? '')
  const isFinancial = FINANCIAL_SECTORS.has(normalizeSector(sector) ?? '')
  const fwCount = frameworks.length

  // ESG due diligence is a slice of all-in DD (~0.2–4% of deal value). Focused ESG scope lands low in that band.
  // High-emissions / financial sectors and more applicable frameworks push toward the upper end.
  const pctLow = isHighEmissions ? 0.0020 : isFinancial ? 0.0015 : 0.0010
  const pctHigh = (isHighEmissions ? 0.0040 : isFinancial ? 0.0035 : 0.0025) + (fwCount > 2 ? 0.0010 : 0)
  // TRUE percentage of deal value — no floors. This is a RISK-EXPOSURE figure (the dashboard
  // "ESG value-at-risk exposure" block), not a minimum engagement fee, so the $ always agrees with the
  // % and a small deal correctly shows proportionally small exposure. (The old Math.max(7500/25000)
  // floors were a cost-framing artifact; low/high are consumed only by that exposure display + its export row.)
  const low = dealValue * pctLow
  const high = dealValue * pctHigh

  const items = [
    { item: 'GHG inventory & Scope 3 assessment', cost: isHighEmissions ? '$40,000–80,000' : '$15,000–35,000' },
    { item: 'Climate scenario analysis (IFRS S2/TCFD)', cost: fwCount > 2 ? '$30,000–60,000' : '$15,000–30,000' },
    { item: 'ESG data room preparation', cost: '$10,000–25,000' },
    ...(frameworks.includes('CSRD') ? [{ item: 'CSRD double materiality assessment', cost: '$25,000–50,000' }] : []),
    ...(frameworks.includes('SB 253') ? [{ item: 'SB 253 first-year reporting', cost: '$20,000–45,000' }] : []),
    ...(frameworks.includes('CS3D') ? [{ item: 'CS3D HRDD programme setup', cost: '$30,000–60,000' }] : []),
    ...(isFinancial ? [{ item: 'PCAF financed emissions calculation', cost: '$20,000–40,000' }] : []),
    { item: 'Ongoing annual compliance (Year 1)', cost: isHighEmissions ? '$60,000–120,000' : '$30,000–60,000' },
  ]

  return { low, high, pctLow, pctHigh, items }
}

// ─── Module-aware obligation engine ─────────────────────────────────────────────
// Consultant first-year cost ranges (USD), per obligation. SOURCE BASIS: these align with 2026 M&A
// due-diligence market analyses — standalone ESG / specialist DD workstreams typically run in the tens
// of thousands per engagement; total transaction due diligence commonly runs ~0.2%–4% of deal value
// (the percentage falls as deal size rises); GHG inventory is typically the single largest ESG
// workstream, so it anchors the highest range. Anchored conservative, highs tightened so the platform
// reads as a credible alternative (not a basement bargain). Indicative benchmarks, not quotes — refresh
// periodically. The per-obligation figures below are unchanged; only the sourcing note was added.
export const CONSULTANT_RANGES = {
  ghg:              { low: 18000, high: 30000 }, // GHG inventory & Scope 3 assessment
  supplyChain:      { low: 10000, high: 20000 }, // Supply-chain / Scope 3 value-chain
  climateRisk:      { low: 12000, high: 24000 }, // Climate risk — physical & transition
  financedEmissions:{ low: 12000, high: 20000 }, // Financed emissions (PCAF Cat.15) — FS only
}

// Default pipeline size for the DASHBOARD-ONLY "across your pipeline" ROI scenario (screen N targets
// per year on one annual subscription). Display-only — never enters any per-deal figure. Change here
// to re-scale the pipeline argument. Not used on the public /deals/[token] page (wrong audience).
export const DEFAULT_PIPELINE_TARGETS = 10

// Detected frameworks whose presence implies a value-chain / Scope 3 supply-chain obligation.
// VERIFIED strings only (getApplicableFrameworks emits these) — no phantoms.
// PCAF is NOT here: financed emissions (Cat.15) is its own obligation, not supply chain.
export const SUPPLY_CHAIN_TRIGGERS = ['CS3D', 'CSRD', 'SFDR']

// Regimes whose own rule requires the target to measure its GHG emissions, so that applying one of
// them makes a GHG inventory an included obligation rather than a recommendation:
//   SB 253  Scope 1, 2 and 3 emissions reporting (Cal. Health & Safety Code s.38532)
//   CSRD    ESRS E1 climate disclosures, which include gross Scope 1, 2 and 3 emissions
//   SECR    Scope 1 and 2 emissions and energy use in the directors' report
// Deliberately NOT here: EU and UK ETS (installation-level monitoring under an emissions permit, not
// an organisational inventory), CS3D (a transition plan, not an inventory), SFDR (the adverse-impact
// indicators are about investees). Add a regime only with the rule that requires the inventory.
export const GHG_INVENTORY_REGIMES = ['SB 253', 'CSRD', 'SECR']
export const CLIMATE_RISK_REASON =
  'Recommended on every deal: physical and transition exposure is a diligence question whatever the target must report, and it is the analysis the IFRS S2 and TCFD market expectations ask for.'
export const GHG_RECOMMENDED_REASON =
  'No regime found to apply requires a GHG inventory. Recommended because investors and lenders routinely ask for one.'

// Consultant benchmarks scale with engagement complexity. ThemisIQ price also
// scales (GHG_TIERS), so the GAP narrows at high facility counts — intentional.
const CONSULTANT_LOCATION_FACTOR = (locationCount: number): number =>
  locationCount <= 3 ? 1.0 : locationCount <= 15 ? 1.5 : 2.0   // reuse GHG_TIERS thresholds
// Scope 1-intensive sectors — material process / extraction / combustion emissions, so their GHG
// INVENTORY is more work to build (more sources, more sites). This list tracks GHG-inventory BUILD
// EFFORT, NOT overall ESG risk. It is a deliberately COARSE, directional signal (heavy vs not).
// ⚠️ DO NOT derive this — or the multiplier below — from SECTOR_RISKS severity. That is a SEPARATE
// axis (risk materiality/urgency for the deal memo), and it decouples from inventory effort: e.g.
// Financial Services carries critical risk (financed emissions) but a light own-ops GHG inventory
// (its heavy work is the separately-priced PCAF line). Coupling cost to severity would misprice those
// sectors and invent per-sector precision we can't cite. Keep this coarse and effort-based.
// HEAVY_SECTORS lives in ./sectors, extended from this file's old literal list with the new sectors.
// One modest, defensible bump for Scope 1-intensive sectors' GHG line only (see included[] above).
const CONSULTANT_SECTOR_FACTOR = (sector?: string): number =>
  HEAVY_SECTORS.has(normalizeSector(sector) ?? '') ? 1.25 : 1.0
// Round a scaled consultant figure to the nearest 1000 so the "k" display stays clean.
const roundK = (x: number): number => Math.round(x / 1000) * 1000

// ─── Obligation pricing ─────────────────────────────────────────────────────────
// A single `number | null` price overloaded THREE distinct meanings — a real charge, "no
// self-serve price, quote it", and "free because it is bundled elsewhere" — and 0 was doing
// duty for the last one. That is the same category error as reading an empty result as a
// negative finding: included-free is not costs-zero. A bundled scope has NO price to state,
// so it must not be summable, must not force a quote, and must not render as a currency figure.
export type ObligationPricing =
  | { kind: 'priced'; priceUSD: number }   // a real charge — the ONLY kind that sums into a total
  | { kind: 'bundled' }                    // delivered inside another module; no separate charge
  | { kind: 'quote' }                      // no self-serve price; forces themisIqHasCustom
  | { kind: 'excluded' }                   // out of scope for ThemisIQ; in neither total

// Shared rendering so no surface invents its own wording for these states.
export const obligationPriceLabel = (p: ObligationPricing): string =>
  p.kind === 'priced' ? `USD ${p.priceUSD.toLocaleString()}`
  : p.kind === 'bundled' ? 'Included in GHG inventory'
  : p.kind === 'quote' ? 'Custom quote'
  : 'Not included'

export type ObligationTier = {
  label: string
  short: string
  pricing: ObligationPricing      // AUTHORITY for what this obligation costs
  /** @deprecated Derived from `pricing`; retained only so app/deals/[token] compiles unchanged.
   *  Cannot drift (it is computed, never set). Read `pricing` in new code and delete this once
   *  the public share page is migrated. bundled/quote/excluded all collapse to null here, which
   *  is exactly the ambiguity `pricing` exists to remove. */
  themisIqPrice: number | null
  consultantLow: number
  consultantHigh: number
  scopeNote?: string
}
export type Obligations = {
  included: ObligationTier[]      // summed into the headline (both sides)
  recommended: ObligationTier[]   // shown separately, NOT summed
  flagged: ObligationTier[]       // honest caveats — summed into NEITHER figure
  themisIqTotal: number | null    // sum of 'priced' included obligations; null when none are priced
  themisIqHasCustom: boolean      // an included obligation is 'quote' (Advisory GHG, 16+ locations)
  consultantLow: number           // sum of included consultant lows
  consultantHigh: number          // sum of included consultant highs
  // ⚠️ NARROWED 29 Sep 2026: true only when NEITHER headcount NOR location count can price GHG. Before
  // the employee bands it meant "no location count", which was then the only basis. A deal with a
  // headcount and no sites is priced now, so it must not prompt for a figure it already has.
  locationUnset: boolean
  /** What the GHG band was chosen from, for the sentence the report prints beside it. */
  ghgBasis: GhgPriceBasis
}

// ── GHG band: headcount first, sites as the fallback ────────────────────────────────────────────
//
// GHG plans are banded by EMPLOYEE COUNT (lib/pricing.ts GHG_TIERS), and a deal records one. So the
// band comes from ghgTierForEmployees whenever a usable headcount is there, and from the old location
// rule only when it is not. ONE rule, used by the report, the wizard, the pipeline export and the
// share page's /order link, so the price a reader sees and the plan /order offers cannot disagree.
//
// ⚠️ A HEADCOUNT OF 0 DOES NOT SET A BAND. ghgTierForEmployees refuses counts below 1 on purpose
// ("would sell a plan on a number nobody checked"), and a declared 0 is a holding company, not a
// small customer. It falls back to sites, and the sentence says why.
//
// The location rule's thresholds are this file's, not GHG_TIERS' (see getObligations): up to 3 sites
// is Essentials, up to 15 Professional, and above that no band is priced, which reads as a quote.
const DEAL_REPORT_SMALL_MAX = 3
const DEAL_REPORT_MID_MAX = 15

export type GhgPriceBasis =
  | { kind: 'employees'; employees: number; tier: GhgTier }
  | { kind: 'sites'; sites: number; tier: GhgTier | null; headcountZero: boolean }
  | { kind: 'none'; headcountZero: boolean }

export const ghgPriceBasis = (employeeCount: number | null | undefined, locationCount: number | null | undefined): GhgPriceBasis => {
  if (typeof employeeCount === 'number' && Number.isInteger(employeeCount) && employeeCount >= 1) {
    return { kind: 'employees', employees: employeeCount, tier: ghgTierForEmployees(employeeCount) }
  }
  const headcountZero = employeeCount === 0
  const sites = Number(locationCount) || 0
  if (sites <= 0) return { kind: 'none', headcountZero }
  return {
    kind: 'sites', sites, headcountZero,
    tier: sites <= DEAL_REPORT_SMALL_MAX ? 'starter' : sites <= DEAL_REPORT_MID_MAX ? 'professional' : null,
  }
}

/** The sentence printed beside the GHG price, naming what the band was chosen from. */
export const ghgPriceBasisNote = (b: GhgPriceBasis): string => {
  const headcount = (zero: boolean) => (zero ? 'a headcount of 0 cannot set a plan band' : 'headcount not provided')
  if (b.kind === 'employees') return `Priced on ${b.employees.toLocaleString('en-US')} employees (${GHG_TIER_LABELS[b.tier]} band).`
  if (b.kind === 'sites') return `Priced on ${b.sites} ${b.sites === 1 ? 'site' : 'sites'}; ${headcount(b.headcountZero)}.`
  return b.headcountZero
    ? 'Not priced: a headcount of 0 cannot set a plan band, and no location count was provided.'
    : 'Not priced: neither headcount nor location count was provided.'
}

/**
 * The `tier` for an /order link. A basis with no priced band is sent as 'enterprise', the plan /order
 * treats as a quote, so the checkout says "quote" where the report says "Custom quote". With no basis
 * at all the link keeps the entry band, as it always has: /order falls back to it for any unknown tier.
 */
export const ghgOrderTier = (b: GhgPriceBasis): GhgTier => (b.kind === 'none' ? 'starter' : b.tier ?? 'enterprise')

const priced = (priceUSD: number): ObligationPricing => ({ kind: 'priced', priceUSD })
const BUNDLED: ObligationPricing = { kind: 'bundled' }
const QUOTE: ObligationPricing = { kind: 'quote' }
const EXCLUDED: ObligationPricing = { kind: 'excluded' }
// A GHG_TIERS price of null means "contact us", not "free".
const tierPricing = (p: number | null): ObligationPricing => (p == null ? QUOTE : priced(p))
// Every tier is built through this, so the deprecated field is ALWAYS derived and can never
// disagree with `pricing`.
const tier = (t: Omit<ObligationTier, 'themisIqPrice'>): ObligationTier =>
  ({ ...t, themisIqPrice: t.pricing.kind === 'priced' ? t.pricing.priceUSD : null })

// Pure: deal location count + detected frameworks (+ sector) → scope-matched obligations & prices.
// ThemisIQ prices come from lib/pricing.ts (single source of truth); consultant = cited ranges.
// Consultant ranges scale PER OBLIGATION (location × sector, independently) before summing —
// never one blended factor on the total.
export function getObligations(
  locationCount: number, frameworks: string[], sector?: string,
  // Optional so a caller without it (the share page, whose RPC does not return headcount) keeps the
  // location rule. Every caller that has it passes it: see ghgPriceBasis.
  employeeCount?: number | null,
): Obligations {
  const ghgBasis = ghgPriceBasis(employeeCount, locationCount)
  const locationUnset = ghgBasis.kind === 'none'
  const loc = CONSULTANT_LOCATION_FACTOR(locationCount)
  const sec = CONSULTANT_SECTOR_FACTOR(sector)

  // GHG is ALWAYS included. The band comes from ghgPriceBasis above: headcount first, sites as the
  // fallback. (The location rule is what this block used to be; its thresholds moved up beside the
  // basis so the share page's /order link can use the same one.) A basis with no band is a QUOTE,
  // and an Enterprise headcount is a quote because GHG_TIERS.enterprise has no price.
  const ghgPricing: ObligationPricing =
    ghgBasis.kind === 'none' || ghgBasis.tier == null ? QUOTE : tierPricing(GHG_TIERS[ghgBasis.tier].priceUSD)

  // ⚠️ GHG IS INCLUDED ONLY WHEN A REGIME FOUND TO APPLY REQUIRES AN INVENTORY (29 Sep 2026). It was
  // included on every deal, so a US target with SB 253 not met was still priced for "GHG inventory &
  // Scope 3" as though something required it. `frameworks` is the flat APPLIES list (size-tested
  // APPLIES, and APPLIES: VERIFY); market expectations never reach it. Where nothing in it requires an
  // inventory, the same module moves to "Also recommended" with its reason, still priced by its band.
  // GHG consultant range scales by location AND sector (a heavy-sector inventory is more work).
  const ghgRequired = GHG_INVENTORY_REGIMES.some(f => frameworks.includes(f))
  const ghgTier = tier({ label: 'GHG inventory & Scope 3', short: 'GHG', pricing: ghgPricing,
    consultantLow: roundK(CONSULTANT_RANGES.ghg.low * loc * sec),
    consultantHigh: roundK(CONSULTANT_RANGES.ghg.high * loc * sec),
    scopeNote: ghgRequired ? ghgPriceBasisNote(ghgBasis) : `${GHG_RECOMMENDED_REASON} ${ghgPriceBasisNote(ghgBasis)}` })
  const included: ObligationTier[] = ghgRequired ? [ghgTier] : []

  // Supply chain — included when a genuine value-chain framework is detected (PCAF no longer triggers this).
  // Consultant range scales by location only (value-chain breadth), not sector.
  if (SUPPLY_CHAIN_TRIGGERS.some(f => frameworks.includes(f))) {
    included.push(tier({ label: 'Supply chain / Scope 3', short: 'supply chain', pricing: priced(FLAT_MODULE_PRICES['supply-chain']),
      consultantLow: roundK(CONSULTANT_RANGES.supplyChain.low * loc),
      consultantHigh: roundK(CONSULTANT_RANGES.supplyChain.high * loc) }))
  }

  // Financed emissions (PCAF) was an included, bundled obligation whenever PCAF was in the APPLIES
  // list. PCAF became a market expectation on 29 Sep 2026, so it can never be there, and the branch
  // was removed rather than left unreachable. The 'bundled' pricing kind stays for the next scope
  // that is genuinely included at no separate charge.

  // Recommended (NOT summed). Climate risk on every deal: physical and transition exposure is a
  // diligence question whatever the target's reporting duties, and it is the analysis the IFRS S2 and
  // TCFD market expectations ask for. (It rested on IFRS S2 / TCFD being "always emitted" as APPLIES,
  // which stopped being true on 29 Sep 2026; the recommendation did not depend on that.)
  // Consultant range scales by location only, not sector.
  const recommended: ObligationTier[] = [
    ...(ghgRequired ? [] : [ghgTier]),
    tier({ label: 'Climate risk assessment: physical and transition (IFRS S2 / TCFD)', short: 'climate risk', pricing: priced(FLAT_MODULE_PRICES['climate-risk']),
      consultantLow: roundK(CONSULTANT_RANGES.climateRisk.low * loc),
      consultantHigh: roundK(CONSULTANT_RANGES.climateRisk.high * loc),
      scopeNote: CLIMATE_RISK_REASON }),
  ]

  // Flagged (NOT summed into either figure) — honest caveats for scopes needing a separate specialist.
  const flagged: ObligationTier[] = []
  if (FLAG_SECTORS.has(normalizeSector(sector) ?? '')) {
    flagged.push(tier({ label: 'Forest, Land & Agriculture (FLAG)', short: 'FLAG', pricing: EXCLUDED, consultantLow: 0, consultantHigh: 0,
      scopeNote: 'Covered via SBTi science-based target-setting where applicable. Land-sector inventory assessed separately.' }))
  }

  // ONLY 'priced' obligations sum. A bundled scope has no figure to add — summing it as 0 would
  // assert a zero cost where the truth is "no separate charge". No priced obligation at all → null,
  // which the surfaces render as "Custom quote" rather than a zero.
  const pricedTotals = included.filter(o => o.pricing.kind === 'priced').map(o => (o.pricing as { priceUSD: number }).priceUSD)
  return {
    included, recommended, flagged,
    themisIqTotal: pricedTotals.length ? pricedTotals.reduce((a, b) => a + b, 0) : null,
    themisIqHasCustom: included.some(o => o.pricing.kind === 'quote'),
    consultantLow: included.reduce((a, o) => a + o.consultantLow, 0),
    consultantHigh: included.reduce((a, o) => a + o.consultantHigh, 0),
    locationUnset,
    ghgBasis,
  }
}

// ─── FX for statutory thresholds ────────────────────────────────────────────────
// Revenue is captured in the DEAL's currency, but every statutory threshold is denominated in
// the STATUTE's own currency — SB 253 is USD 1bn, SECR is GBP 36m. We convert the REVENUE into
// the threshold's currency and NEVER convert the threshold: the statutory figure has to stay
// verbatim so a verifier can cross-check the citation against the legislation itself.
//
// Deliberately a STATIC, DATED table — no live API. A rate that moved between two runs would let
// the same deal silently flip a statutory citation with nothing in the audit trail to explain it.
// A dated table makes the rate a reviewable input, like an emission factor (cf. EF_SOURCES).
// Refresh: replace the rates and bump FX_AS_OF in the SAME edit, never separately.
export type DealCurrency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD'

// The currencies the deal form offers. app/dashboard/deals/page.tsx renders its <select> from
// this list, so the UI and the FX table below cannot drift apart.
export const DEAL_CURRENCIES: DealCurrency[] = ['USD', 'EUR', 'GBP', 'CAD', 'AUD']

export const FX_AS_OF = '2026-07-01'
export const FX_SOURCE = 'ECB euro foreign exchange reference rates, 1 July 2026 (14:15 CET daily fixing). https://www.ecb.europa.eu/stats/exchange/eurofxref/shared/pdf/2026/07/20260701.pdf'

// Units of each currency per 1 EUR — the ECB's OWN quotation convention, TRANSCRIBED VERBATIM from
// the document named in FX_SOURCE. Every number below appears literally in that PDF, so a reviewer
// confirms this table by comparing digit for digit against the source; nothing has to be re-derived
// to check it. That is the whole reason the table is EUR-base rather than USD-cross-rated: a stored
// cross-rate is a computed number with no published figure behind it, and a cross-rate rounded to
// 2dp cannot be reconciled at all against a source that publishes 4–5 significant figures.
//
// WIDTHS ARE NOT NORMALISED. GBP is published to five decimal places and the others to four; they
// are held exactly as printed. Padding or trimming a digit to make the column tidy would be a
// silent edit to a transcribed figure.
//
// Refresh: re-transcribe from the new day's document and bump FX_AS_OF and the FX_SOURCE URL in
// the SAME edit as the rates, never separately.
export const UNITS_PER_EUR: Record<DealCurrency, number> = {
  EUR: 1,          // the base, by definition — not a published figure
  USD: 1.1383,
  GBP: 0.85973,
  CAD: 1.6191,
  AUD: 1.6518,
}

export const isDealCurrency = (c: string): c is DealCurrency => (DEAL_CURRENCIES as string[]).includes(c)

// Convert between two deal currencies through the EUR base. Same currency → identity, so a
// GBP-denominated threshold tested against GBP revenue has no float round-trip at all.
// Only ever applied to revenue — never to a threshold.
export const convertCurrency = (amount: number, from: DealCurrency, to: DealCurrency): number =>
  from === to ? amount : (amount * UNITS_PER_EUR[to]) / UNITS_PER_EUR[from]

// USD per 1 unit of the listed currency — DERIVED from the EUR base, never stored, so it cannot
// disagree with the transcribed figures. Retained because the deal report's FX-basis block prints
// the rate applied (app/dashboard/deals/page.tsx). USD is exactly 1 (x / x), so the anchor cannot
// drift. Prefer UNITS_PER_EUR in new code — it is the side with a source document behind it.
export const USD_PER_UNIT: Record<DealCurrency, number> =
  Object.fromEntries(DEAL_CURRENCIES.map(c => [c, UNITS_PER_EUR.USD / UNITS_PER_EUR[c]])) as Record<DealCurrency, number>

// ─── Multi-limb statutory thresholds ────────────────────────────────────────────
// Most size tests are N-of-M over turnover, balance-sheet total and headcount — not a single
// revenue comparison. One mechanism covers every shape: `requires === limbs.length` expresses AND
// (CSRD, CS3D), `requires < limbs.length` expresses 2-of-3 (SECR, S-211), `requires === 1` with a
// single limb expresses a plain trigger (SB 253).
export type SizeMeasure = 'turnover' | 'balance_sheet_total' | 'employees'
// Headcount carries no currency and never touches FX; money limbs convert the DEAL's figure into
// the limb's own currency, never the reverse.
export type LimbUnit = { unit: 'currency'; currency: DealCurrency } | { unit: 'count' }
export type LimbSource = 'revenue' | 'total_assets' | 'employee_count'

export type ThresholdLimb = {
  measure: SizeMeasure
  amount: number                // the figure as it appears in the legislation — never rebased
  unit: LimbUnit
  source: LimbSource            // which collected field supplies the value
  basis: string                 // the MEASURE definition, verbatim from the instrument
  // false ⇒ `source` is a PROXY for what the instrument actually defines. The instruments do not
  // agree on what "revenue" means (UK MSA: total turnover incl. subsidiaries; California:
  // worldwide gross receipts with no COGS deduction; Canada: revenue per consolidated statements;
  // CSRD: net turnover). We collect ONE figure, so where it stands in for a differently-defined
  // measure the report must say so rather than imply the statutory definition was applied.
  exactMeasure: boolean
  measureNote?: string          // what the instrument defines, when exactMeasure is false
  // Instruments do NOT agree on the boundary. SB 253 is "in excess of" and the Companies Act
  // large-company test is "exceeds the medium-sized ceiling" (both strict); S-211 is "at least"
  // (inclusive). Getting this wrong moves a target across a statutory line, so it is per-limb.
  comparison: 'gt' | 'gte'
}

// The SHAPE of the test, declared rather than inferred from the arithmetic. `requires` and
// `limbs.length` together already imply it, which is exactly the problem: a three-limb test that
// should be an AND reads as a valid 2-of-3 if someone adds a limb and leaves `requires` at 2, and
// nothing objects. Declaring the intent lets validateThresholdTests() catch that disagreement.
//   'and'     — every limb must be met (requires === limbs.length)
//   'n-of-m'  — any N of M (requires < limbs.length)
//   'trigger' — a single limb, met or not (requires === 1, one limb)
export type ThresholdSemantics = 'and' | 'n-of-m' | 'trigger'

export type ThresholdTest = {
  framework: string
  requires: number              // N of M
  semantics: ThresholdSemantics // what the N-of-M above is MEANT to express; validated at load
  limbs: ThresholdLimb[]
  lookback: 'most-recent-fy' | 'either-of-two-most-recent-fy'
  lookbackModelled: boolean     // false ⇒ evaluated on the most recent year only; stated in-report
  citation: string
  // A test's limbs are assumed to be the WHOLE statutory scope test. Set FALSE where the modelled
  // limbs are ONE ROUTE among several the instrument provides, so failing them does not establish
  // that the framework does not apply — only that this route was not triggered. ABSENT means
  // exhaustive, the safe default for a test whose limbs are the entire scope provision (CSRD
  // arts. 19a/29a). It is the falsehood that has to be declared, not the truth: a new test is
  // exhaustive until someone knowingly says otherwise, so forgetting the field cannot turn a
  // partial model into a confident negative.
  exhaustive?: false
  // The sentence shown when a non-exhaustive test's modelled route WAS evaluated and NOT met. Set by
  // applyTest as the row's `reason`, so the surfaces state why the framework was withheld without
  // re-deriving it. REQUIRED IN PRACTICE for any test declaring `exhaustive: false`: without it the
  // row is withheld carrying no explanation at all, which is the absence-rendered-as-a-finding
  // failure this whole three-state machinery exists to prevent. Typed optional only because it is
  // meaningless on an exhaustive test.
  routeNotMetReason?: string
  // TRUE ⇒ constants not yet verified. A pending test is NEVER evaluated and NEVER routed: the
  // framework keeps its existing jurisdiction-only behaviour. This is the safety net for scaffolded
  // tests — a 2-of-0 test would otherwise resolve "not-applicable" and silently under-call.
  pending?: true
}

// For an EU target that FAILS the art. 2(1)(a) limbs. `exhaustive: false` makes that outcome
// 'not-assessed' rather than 'not-applicable' (see evaluateTest), and this is the sentence that says
// why: the route assessed here was not met, and the routes that were not modelled are still open.
// Declared above THRESHOLD_TESTS because the CS3D entry references it — the table's own order is
// unchanged.
//
// No trailing full stop: the report appends one at the render site (deals/report/page.tsx), and
// resolveCs3d strips any trailing period defensively.
// ⚠️ THE SECOND NON-EXHAUSTIVE TEST, and the note at CS3D_ROUTE_NOT_MET_REASON anticipated it: "when a
// second non-exhaustive test lands, they will [collide], and each keeps its own sentence." This is that
// sentence. Canada S-211's modelled route is the SIZE route in s.2(b); the definition is also met by a
// Canadian stock-exchange listing at ANY size, and by anything prescribed by regulation.
export const CANADA_S211_ROUTE_NOT_MET_REASON =
  'below the size route assessed here; the Act also reaches any entity listed on a Canadian stock exchange, at any size, and anything prescribed by regulation, neither of which this route tests.'

// ⚠️ THE LISTING ROUTE APPLIES, BUT NOT UNCONDITIONALLY, AND THIS IS WHY IT CARRIES A VERIFY NOTE.
// s.2 makes a listed company an "entity". The REPORTING DUTY is a separate question: it also turns on
// producing, selling or distributing goods, or importing goods into Canada. This assessment collects
// sector and revenue and asks nothing about goods, so a listing establishes the entity limb and not the
// duty. Reporting a bare APPLIES would state as settled something the form never asked about.
export const CANADA_S211_LISTING_VERIFY =
  'a Canadian listing makes the company an entity under s.2, but the reporting duty also turns on producing, selling or distributing goods, or importing goods into Canada; this assessment does not ask about goods, so confirm that before relying on this'

// ⚠️ A STANDING LIMITATION, NOT A FRAMEWORK ROW, AND THE DIFFERENCE WAS MEASURED. A
// canadaS211NonCaAbstention() pushing a not-assessed row for every non-Canada jurisdiction was written
// on 26 Sep 2026 and withdrawn the same day: it put a withheld S-211 row on EVERY DEAL and failed 13
// tests, including "a fully-declared UK deal withholds nothing". A UK technology deal would have carried
// "PARTIAL: Canada S-211 NOT ASSESSED" in its report. The precedent it was modelled on is also narrower
// than it looks — cs3dNonEuAbstention() fires for jurisdiction === 'Global' alone, not for every non-EU
// jurisdiction. So the limitation is stated ONCE, in the register that already holds TWO-YEAR CHECK NOT
// RUN, where a reader looks for what an assessment did not reach.
//
// CARRIES ITS OWN HEADING, unlike the reason constants: it is not fed to resolveRegime, so nothing
// prepends a heading or strips a trailing period for it. Full stops included for that reason.
export const CANADA_S211_JURISDICTION_CAVEAT =
  'Canada S-211 not fully assessed: the Act can also apply to a company doing business in Canada, wherever it is based. This assessment records one primary jurisdiction, so Canadian operations are not established here.'

// ⚠️ SHOWN ONLY WHERE IT IS TRUE AND UNRESOLVED. Not Canada, because a Canadian target runs the size
// test and the caveat would be describing a route that WAS reached; and not a listed Yes, because that
// settles applicability outright and carries its own VERIFY note about goods. A caveat on a deal it does
// not apply to is the noise that made the framework-row version wrong.
/**
 * The caveat as printed, heading and body split at the constant's colon. It is shown only where
 * Canada is not confirmed either way (markets "not sure"): with Canada ticked the size test runs on
 * the deal's figures instead (see the S-211 routing in getFrameworkApplicability), so there is no
 * longer a Canada-ticked wording to give.
 */
export const canadaS211CaveatText = (): { heading: string; body: string } => {
  const heading = CANADA_S211_JURISDICTION_CAVEAT.split(':')[0]
  const cut = CANADA_S211_JURISDICTION_CAVEAT.slice(CANADA_S211_JURISDICTION_CAVEAT.indexOf(':') + 2)
  return { heading, body: cut.charAt(0).toUpperCase() + cut.slice(1) }
}

export const showCanadaS211JurisdictionCaveat = (
  jurisdiction: string, listedCaExchange?: boolean | null,
): boolean => jurisdiction !== 'Canada' && listedCaExchange !== true

// ⚠️ NO `reason` ON THE LISTING ROUTE'S ROW, AND THAT IS DELIBERATE RATHER THAN AN OMISSION. A sentence
// naming the route was drafted and dropped on 26 Sep 2026: `FrameworkApplicability.reason` is documented
// as "why the framework's applicability could not be ESTABLISHED from the modelled test", and
// lib/deals/reportModel.ts:313 maps any row carrying one to state 'conditional' on a branch its own
// comment says "must stay ungated on status". That function is CS3D-only today, so nothing would have
// misfired — but a row that definitively APPLIES, carrying a field that means "could not be established",
// is a trap for whoever generalises it. The route is recorded in the comment at the push site instead.

// ⚠️ THE WIZARD QUESTION, HELD AS A CONSTANT SO ONE STRING SERVES THE FORM AND ANY LATER SURFACE. Plain
// language, and the third option is not decoration: a target whose listing status is unknown must not be
// reported as out of scope, so "Not sure" leaves the listing route untaken and lets the size route answer
// as far as it can, which is never a confident negative because the test is non-exhaustive.
export const CANADA_S211_LISTING_QUESTION = 'Is the target listed on a Canadian stock exchange?'
export const CANADA_S211_LISTING_HINT =
  "A listing can bring a company within Canada's forced labour reporting Act whatever its size or where it is based. If you are not sure, choose Not sure."

export const CS3D_ROUTE_NOT_MET_REASON =
  'below the size route assessed here; CS3D can also reach companies through group parentage and through franchising or licensing arrangements, which this assessment does not model'

export const THRESHOLD_TESTS: Record<string, ThresholdTest> = {
  'SB 253': {
    framework: 'SB 253',
    requires: 1, semantics: 'trigger',
    lookback: 'most-recent-fy', lookbackModelled: true,
    citation: 'California Health & Safety Code §38532 (SB 253)',
    limbs: [{
      measure: 'turnover', amount: 1_000_000_000, unit: { unit: 'currency', currency: 'USD' },
      source: 'revenue', exactMeasure: false, comparison: 'gt',
      basis: 'Total annual revenues over USD 1,000,000,000, entity doing business in California.',
      measureNote: 'California measures worldwide GROSS RECEIPTS with no deduction for cost of goods sold, materially larger than net turnover for a distributor. The figure applied is the deal’s single revenue input, not separately collected on a gross-receipts basis.',
    }],
  },
  'SECR': {
    framework: 'SECR',
    requires: 2, semantics: 'n-of-m',
    lookback: 'most-recent-fy', lookbackModelled: true,
    citation: 'Companies (Directors’ Report) and LLP (Energy and Carbon Report) Regulations 2018, applying the Companies Act 2006 s.465 "large company" test',
    limbs: [
      { measure: 'turnover', amount: 36_000_000, unit: { unit: 'currency', currency: 'GBP' },
        source: 'revenue', exactMeasure: false, comparison: 'gt',
        basis: 'Turnover of more than GBP 36,000,000 (Companies Act 2006 s.465 limb 1).',
        measureNote: 'Companies Act turnover for the company and, where a group, its subsidiaries. The figure applied is the deal’s single revenue input.' },
      { measure: 'balance_sheet_total', amount: 18_000_000, unit: { unit: 'currency', currency: 'GBP' },
        source: 'total_assets', exactMeasure: false, comparison: 'gt',
        basis: 'Balance sheet total of more than GBP 18,000,000 (Companies Act 2006 s.465 limb 2).',
        measureNote: 'Aggregate of amounts shown as assets in the balance sheet, before deduction of liabilities.' },
      { measure: 'employees', amount: 250, unit: { unit: 'count' },
        source: 'employee_count', exactMeasure: false, comparison: 'gt',
        basis: 'More than 250 employees (Companies Act 2006 s.465 limb 3).',
        measureNote: 'Average number of employees over the financial year, not headcount at a point in time.' },
    ],
  },
  // ⚠️ THE SIZE ROUTE ONLY, AND s.2 HAS THREE. (a) a Canadian stock-exchange listing, at any size, which
  // getFrameworkApplicability routes separately on `listed_ca_exchange`; (b) the size test below; and
  // (c) anything PRESCRIBED BY REGULATION, which is a DELIBERATE ABSENCE HERE. Nothing has been
  // prescribed to date, and modelling an empty power would mean inventing a limb with no content. It is
  // written down rather than omitted silently because `exhaustive: false` is what carries it: the day
  // something is prescribed, the withheld outcome is already the correct one and only this comment needs
  // to change.
  'Canada S-211': {
    framework: 'Canada S-211',
    requires: 2, semantics: 'n-of-m',
    // s.2 gives three routes and this models one, so a failed size test is 'not-assessed' rather than
    // 'not-applicable'. See CANADA_S211_ROUTE_NOT_MET_REASON.
    exhaustive: false,
    routeNotMetReason: CANADA_S211_ROUTE_NOT_MET_REASON,
    // See the migration header: the statute measures over EITHER of the two most recent financial
    // years; two scalar columns hold one. Evaluated on the most recent year only. Failure mode is
    // UNDER-calling a target that crossed a limb last year and dipped this year; the below-side
    // near-threshold flag is the mitigation, not a fix.
    lookback: 'either-of-two-most-recent-fy', lookbackModelled: false,
    citation: 'Fighting Against Forced Labour and Child Labour in Supply Chains Act (S-211), s.2 "entity"',
    limbs: [
      { measure: 'balance_sheet_total', amount: 20_000_000, unit: { unit: 'currency', currency: 'CAD' },
        source: 'total_assets', exactMeasure: false, comparison: 'gte',
        basis: 'At least CAD 20,000,000 in assets, in either of the two most recent financial years.',
        measureNote: 'Assets per consolidated financial statements. LOOKBACK NOT MODELLED: most recent year only.' },
      { measure: 'turnover', amount: 40_000_000, unit: { unit: 'currency', currency: 'CAD' },
        source: 'revenue', exactMeasure: false, comparison: 'gte',
        basis: 'At least CAD 40,000,000 in revenue, in either of the two most recent financial years.',
        measureNote: 'Revenue per consolidated financial statements. LOOKBACK NOT MODELLED: most recent year only.' },
      { measure: 'employees', amount: 250, unit: { unit: 'count' },
        source: 'employee_count', exactMeasure: false, comparison: 'gte',
        basis: 'An average of at least 250 employees, in either of the two most recent financial years.',
        // ⚠️ AN AVERAGE, WHICH THIS LIMB DID NOT SAY UNTIL 26 SEP 2026. s.2(b) measures an average over
        // the financial year; the note read "Employees of the entity", which describes a point count and
        // made S-211 the one employees limb in this file not stating the measure. SECR, CSRD and CS3D all
        // already did. Same shape as theirs: name the statutory measure, then name what is applied.
        measureNote: 'The Act measures an AVERAGE number of employees over the financial year. The figure applied is the deal’s single point figure. LOOKBACK NOT MODELLED: most recent year only.' },
    ],
  },
  // POST-OMNIBUS. Directive (EU) 2026/470 (Omnibus I), OJ 26 Feb 2026, in force 18 Mar 2026,
  // amending the Accounting Directive as amended by CSRD. The pre-Omnibus balance-sheet limb is
  // REMOVED — this is a TWO-limb AND, not a 2-of-3, so `requires` must stay equal to `limbs.length`
  // (validateThresholdTests enforces that; see `semantics`).
  //
  // SCOPE OF THESE CONSTANTS: they are the EU-UNDERTAKING test only. CSRD also reaches
  // third-country undertakings on entirely separate figures (EUR 450m EU-generated parent turnover,
  // EUR 200m subsidiary/branch turnover), which this model has no jurisdiction shape to express.
  // See csrdNonEuAbstention() — a non-EU target must ABSTAIN, never resolve 'not-applicable' off
  // these limbs.
  'CSRD': {
    framework: 'CSRD',
    requires: 2, semantics: 'and',
    lookback: 'most-recent-fy', lookbackModelled: true,
    citation: 'Accounting Directive as amended by Directive (EU) 2026/470 (Omnibus I), arts. 19a/29a: >1,000 employees and >EUR 450m net turnover',
    limbs: [
      { measure: 'employees', amount: 1_000, unit: { unit: 'count' },
        source: 'employee_count', exactMeasure: false, comparison: 'gt',
        basis: 'More than 1,000 employees (Accounting Directive art. 3, as amended by Omnibus I).',
        measureNote: 'The Directive measures the AVERAGE number of employees during the financial year. The figure applied is the deal’s single point-in-time headcount input.' },
      { measure: 'turnover', amount: 450_000_000, unit: { unit: 'currency', currency: 'EUR' },
        source: 'revenue', exactMeasure: false, comparison: 'gt',
        basis: 'Net turnover of more than EUR 450,000,000 (Accounting Directive art. 3, as amended by Omnibus I).',
        measureNote: 'The Directive measures NET turnover, and for a parent the consolidated figure. The figure applied is the deal’s single revenue input, converted at the dated ECB reference rate shown in the FX basis section.' },
    ],
  },
  // POST-OMNIBUS. Directive (EU) 2024/1760 (CS3D) as amended by Directive (EU) 2026/470 (Omnibus I).
  // A TWO-limb AND, so `requires` must stay equal to `limbs.length` (validateThresholdTests
  // enforces that; see `semantics`).
  //
  // SCOPE OF THESE CONSTANTS: art. 2(1)(a) ONLY — the EU-company employee-and-turnover route.
  // CS3D catches a company by three further routes this model does NOT express:
  //   (b) group parentage — an ultimate parent of a group meeting the figures on a consolidated
  //       basis, which needs a group/standalone distinction the deal form does not collect;
  //   (c) franchising and licensing — EUR 75m in royalties with EUR 275m net worldwide turnover,
  //       and no royalty figure is collected at all.
  // So a target BELOW these limbs is NOT out of scope — it is only outside route (a). 'not-met' on
  // these two limbs means route (a) was not triggered, never that CS3D does not apply.
  //
  // ART. 2(8) EXCLUSIONS ARE NOT APPLIED: AIFs and UCITS are excluded from CS3D outright regardless
  // of size, and this model has no entity-type field to recognise one — so a fund meeting the
  // figures resolves 'applies' here when the Directive excludes it. That is an OVER-call, the safer
  // direction, but it is a real divergence and must be stated wherever this test is reported.
  //
  // lookbackModelled: FALSE. Art. 2(5) requires the figures be met in EACH OF THE TWO consecutive
  // financial years preceding the reporting year; two scalar columns hold one year, so a target that
  // crossed both limbs once is over-called and one that dipped in the second year is not caught as
  // the Directive would catch it. The report states this rather than implying a two-year test ran.
  'CS3D': {
    framework: 'CS3D',
    requires: 2, semantics: 'and',
    lookback: 'most-recent-fy', lookbackModelled: false,
    // Routes (b) and (c) above are not modelled, so these limbs are not the whole scope test:
    // failing them cannot resolve 'not-applicable'. See evaluateTest's status mapping.
    exhaustive: false,
    routeNotMetReason: CS3D_ROUTE_NOT_MET_REASON,
    citation: 'Directive (EU) 2024/1760 as amended by Directive (EU) 2026/470 (Omnibus I), art. 2(1)(a): >5,000 employees and >EUR 1.5bn net worldwide turnover',
    limbs: [
      { measure: 'employees', amount: 5_000, unit: { unit: 'count' },
        source: 'employee_count', exactMeasure: false, comparison: 'gt',
        basis: 'More than 5,000 employees on average (Directive (EU) 2024/1760 art. 2(1)(a), as amended by Omnibus I).',
        measureNote: 'The Directive measures the AVERAGE number of employees during the financial year. The figure applied is the deal’s single point-in-time headcount input.' },
      { measure: 'turnover', amount: 1_500_000_000, unit: { unit: 'currency', currency: 'EUR' },
        source: 'revenue', exactMeasure: false, comparison: 'gt',
        basis: 'Net worldwide turnover of more than EUR 1,500,000,000 (Directive (EU) 2024/1760 art. 2(1)(a), as amended by Omnibus I).',
        measureNote: 'The Directive measures NET WORLDWIDE turnover. The figure applied is the deal’s single revenue input, converted at the dated ECB reference rate shown in the FX basis section.' },
    ],
  },
}

// Only tests that are ready to evaluate. Everything else keeps jurisdiction-only behaviour.
export const isTestActive = (t: ThresholdTest | undefined): t is ThresholdTest =>
  !!t && !t.pending && t.limbs.length > 0

// The declared `semantics` must agree with the arithmetic `requires`/`limbs.length` actually
// perform. Without this, an AND test that gains a third limb while `requires` stays at 2 becomes a
// 2-of-3 test — a real under-call, invisible in review, and the reason this check exists.
//
// A pending test with no limbs is SKIPPED, not passed: its `requires` cannot be reconciled against
// limbs that do not exist yet. The check binds the moment the limbs are filled, which is the same
// edit that would activate the test — so the guard arrives with the constants, not after them.
export const validateThresholdTests = (
  tests: Record<string, ThresholdTest> = THRESHOLD_TESTS,
): void => {
  for (const [key, t] of Object.entries(tests)) {
    if (t.pending && t.limbs.length === 0) continue
    const n = t.requires
    const m = t.limbs.length
    const shape = `requires ${n}, ${m} limb${m === 1 ? '' : 's'}`
    const fail = (expected: string) => {
      throw new Error(
        `THRESHOLD_TESTS['${key}'] (${t.framework}): semantics '${t.semantics}' requires ${expected}, but the test declares ${shape}.`,
      )
    }
    if (t.semantics === 'and' && n !== m) fail('requires === limbs.length')
    if (t.semantics === 'n-of-m' && !(n < m && n >= 1)) fail('1 <= requires < limbs.length')
    if (t.semantics === 'trigger' && !(n === 1 && m === 1)) fail('requires === 1 with exactly 1 limb')
  }
}

// Load-time, not call-time: a malformed table is a coding error, so it should stop the build and
// the test suite rather than reach a deal report. There is no user-facing path that can trigger it.
validateThresholdTests()

// Human labels for the fields a limb draws on — a not-assessed outcome must name the field that
// would resolve it, so a disappearing framework reads as a prompt rather than an absence.
// MID-SENTENCE register: these read inside "Enter balance-sheet total and headcount to assess SECR."
// Do not capitalise them; two tests pin that sentence verbatim.
export const FIELD_LABELS: Record<LimbSource, string> = {
  revenue: 'target annual revenue',
  total_assets: 'balance-sheet total',
  employee_count: 'headcount',
}

// STANDALONE register: the same fields named as the deal form titles them, for report cells that
// hold a field NAME rather than a sentence. Separate from FIELD_LABELS because that map is tuned to
// read mid-sentence and is pinned to exact strings by test.
// A report an external deal team reads must never print a database identifier: `deals.total_assets`
// names a column in our schema, which tells the reader nothing they can act on and leaks how the
// data is stored. Keep these in step with the labels in app/dashboard/deals/page.tsx.
export const FIELD_FORM_LABELS: Record<LimbSource, string> = {
  revenue: 'Target annual revenue',
  total_assets: 'Balance-sheet total',
  employee_count: 'Employees (headcount)',
}

// A limb value within ±10% of its OWN figure is marginal — reported rather than given as a clean
// in/out, because at that distance the answer turns on things this screen cannot settle. That is
// true of every limb, not only the money ones: turnover and balance-sheet total can move on FX and
// on which accounting definition of the measure is applied, and headcount — which never touches FX
// — still moves on whether the instrument means an average over the year or a point-in-time count.
// Group-vs-entity scoping bites on all three.
//
// Marginal is a property of a LIMB. The framework-level near-threshold marker fires only where a
// marginal limb is DECISIVE for the outcome (see `nearOutcomeFlip`); a marginal limb that cannot
// change the answer is noise. Boundary is INCLUSIVE (exactly ±10% counts as marginal).
export const NEAR_THRESHOLD_BAND = 0.10
export const NEAR_BAND_PCT = `${Math.round(NEAR_THRESHOLD_BAND * 100)}%`

// ─── Undeclared revenue is not zero revenue ──────────────────────────────────────
// Absence of data is not a value: with no revenue declared we have not EVALUATED the
// revenue-triggered statutes, which is a different claim from having evaluated them and found
// they do not apply. Every surface must be able to tell those two apart, so the predicate and
// the copy live here rather than being re-derived per surface.
//
// LIMITATION: the deal form coerces a blank field to 0 (Number('') === 0) and stores it in a
// NOT NULL-ish numeric column, so a genuinely pre-revenue target cannot today be distinguished
// from an undeclared one. Both are treated as undeclared — the safer of the two readings, since
// asserting "revenue = 0" about a target we were never told about is the worse error.
export const isRevenueDeclared = (revenue: unknown): boolean =>
  typeof revenue === 'number' && Number.isFinite(revenue) && revenue > 0

// Three states, never two. `assessed-none` is a finding; `not-assessed` is the absence of one.
export type AssessmentState = 'not-assessed' | 'assessed-none' | 'assessed-findings'

// The revenue guard is PER-FRAMEWORK, not per-section. Only SB 253 and SECR consult revenue; the
// other thirteen resolve from jurisdiction and sector alone. A report with revenue blank therefore
// lists everything it CAN determine and names only the triggers it cannot — blanking the whole
// section was itself a form of "absence rendered as a finding".
// WITHHELD IS TWO POPULATIONS, NOT ONE. `notAssessed` answers "was anything withheld", which is the
// only question the union can answer honestly. WHY it was withheld differs, and the difference changes
// what the reader should do about it:
//
//   unevaluated — a limb could not be settled: an undeclared figure, a deal currency with no
//                 published rate, or no size test at all (a hand-built abstention with no `test`).
//                 The size test did NOT complete. `fieldsToResolve`, where non-empty, names what
//                 would settle it, so the reader's next action is to enter a figure.
//   routeNotMet — every modelled limb WAS evaluated and the modelled route was not triggered, yet
//                 applicability is still open because the instrument reaches companies by routes this
//                 model does not express (CS3D's group-parentage and franchising routes; see
//                 `exhaustive: false`). The test COMPLETED. No figure the form collects would change
//                 the answer, so there is nothing for the reader to enter.
//
// The two PARTITION notAssessed: every withheld row is in exactly one, and
// unevaluated.length + routeNotMet.length === notAssessed.length by construction.
//
// A CONSUMER MAKING A CLAIM ABOUT WHY A FRAMEWORK WAS WITHHELD MUST SPEAK ABOUT ONE POPULATION. The
// union cannot carry that claim: "the size test could not be completed" is false of every routeNotMet
// row, and "no field would resolve it" is false of every unevaluated one. Only a claim that says
// nothing about the cause — "marked NOT ASSESSED, which is not a finding that it does not apply" —
// may be made about the union.
export type DealAssessmentView = {
  evaluated: boolean          // false when sector/jurisdiction are missing — nothing was run at all
  notAssessed: string[]       // THE UNION: size-gated frameworks in scope whose applicability is unresolved
  unevaluated: string[]       // a limb could not be settled — the size test did not complete
  routeNotMet: string[]       // every limb evaluated, modelled route not met — the test DID complete
  // The fields that would settle them — a prompt, not an absence. Derivable as the UNEVALUATED
  // population's fields: a routeNotMet row has unknownCount 0, so `test.fieldsToResolve` is empty and
  // it contributes nothing here BY DEFINITION, not by coincidence. A non-empty list therefore always
  // refers to `unevaluated`, and pairing it with the union would name a field against a framework it
  // cannot settle.
  fieldsToResolve: LimbSource[]
  frameworks: AssessmentState
  nearThreshold: AssessmentState
}

export const assessmentView = (evaluated: boolean, rows: FrameworkApplicability[]): DealAssessmentView => {
  if (!evaluated) return { evaluated: false, notAssessed: [], unevaluated: [], routeNotMet: [], fieldsToResolve: [], frameworks: 'not-assessed', nearThreshold: 'not-assessed' }
  const withheld = rows.filter(r => r.status === 'not-assessed')
  const notAssessed = withheld.map(r => r.framework)
  const fieldsToResolve = [...new Set(withheld.flatMap(r => r.test?.fieldsToResolve ?? []))]
  const applied = rows.filter(r => r.applies).length
  const near = rows.filter(r => r.status === 'near-threshold').length
  // The two populations documented on DealAssessmentView. ONE definition of the predicate: the
  // proximity gate below reads `unevaluated.length` rather than re-deriving it, so the count and the
  // list cannot disagree about which rows they describe. Split from `rows`, not from `notAssessed`,
  // because the distinction lives on the row's `test` and a list of names cannot carry it.
  const unevaluated = withheld.filter(r => !r.test || r.test.unknownCount > 0).map(r => r.framework)
  const routeNotMet = withheld.filter(r => r.test && r.test.unknownCount === 0).map(r => r.framework)
  return {
    evaluated: true,
    notAssessed,
    unevaluated,
    routeNotMet,
    fieldsToResolve,
    // Reports what it could determine. Only fully unassessed when NOTHING resolved and something
    // was withheld — otherwise the resolved list stands and `notAssessed` carries the caveat.
    frameworks: applied > 0 ? 'assessed-findings' : notAssessed.length ? 'not-assessed' : 'assessed-none',
    // Conservative by design: ONE limb that could not be evaluated blocks any proximity claim,
    // because a limb that was never evaluated could be the marginal one. Not a revenue question — a
    // limb goes unevaluated on ANY undeclared figure (revenue, balance-sheet total or headcount), or
    // on a deal currency with no published rate.
    //
    // THE TEST IS WHETHER A LIMB WENT UNEVALUATED, NOT WHETHER A FRAMEWORK WAS WITHHELD. The two
    // stopped being the same thing once a test could be non-exhaustive (`exhaustive: false`): a
    // framework withheld because the MODELLED ROUTE WAS NOT MET had every limb evaluated, and a
    // fully-evaluated route that simply did not catch this target tells us nothing about proximity on
    // any OTHER framework. Suppressing on it would delete a real marginal CSRD or SECR limb from the
    // report to caveat a question that was actually answered — and since CS3D's figures are high,
    // that would be the normal case for an EU deal rather than an edge case.
    //   `test.unknownCount` is the discriminator: it counts the limbs that could not be settled, so
    //   > 0 is exactly the condition the rationale above describes.
    //   NO `test` AT ALL also suppresses — a hand-built abstention (csrdNonEuAbstention,
    //   cs3dNonEuAbstention) ran no limbs whatsoever, so nothing about the target's size was
    //   established and it is the strongest case for withholding a proximity claim, not the weakest.
    //
    // Where no size-gated framework is in scope at all, nothing was withheld and "none nearby" is a
    // real, fully-assessed finding. That is Australia and Other today. Canada is NOT in that set
    // (S-211 is an active 2-of-3 test), nor is the EU (CSRD is active post-Omnibus), nor Global
    // (CSRD abstains there — see csrdNonEuAbstention, which is permanently not-assessed and so
    // permanently blocks a proximity claim for a Global target).
    nearThreshold: unevaluated.length ? 'not-assessed' : near > 0 ? 'assessed-findings' : 'assessed-none',
  }
}

// Shared copy — the wizard screens and the report must not drift. Defaults to every framework carrying an
// ACTIVE size test, derived from THRESHOLD_TESTS at call time, so adding a test cannot leave this
// stale and a `pending` one is never named. Pass the in-scope subset to name only what actually
// went unevaluated for this deal. The `fields` list must be DERIVED FROM LIMBS — it is required on
// every note helper below, with no default, because a note helper must never name a field it has not
// been given. A default filled that gap by guessing, and named revenue at a reader who had entered
// it: an abstention with no limbs (CS3D) yields an empty list, which is the true answer.
// A size-gated framework that vanishes must read as a PROMPT, not an absence. Every not-assessed
// note therefore names the specific field(s) that would resolve it.
export const resolveFieldsPrompt = (fields: LimbSource[], frameworks: string[]): string =>
  fields.length === 0 ? ''
  : `Enter ${fields.map(f => FIELD_LABELS[f]).join(' and ')} to assess ${frameworks.join(' and ')}.`

// NOT revenue-specific, and has not been since the multi-limb work: a test goes unassessed on ANY
// undeclared figure, or on a deal currency with no published rate. The old name said revenue and
// was the same wrong default that once prompted a reader for a figure they had already entered.
export const notAssessedNote = (
  frameworks: string[] = Object.keys(THRESHOLD_TESTS).filter(k => isTestActive(THRESHOLD_TESTS[k])),
  fields: LimbSource[],
): string =>
  `NOT ASSESSED: size test incomplete for ${frameworks.join(', ')}. ${resolveFieldsPrompt(fields, frameworks)}`.trim()

// THE UNEVALUATED-POPULATION NOTE. Used where a list DID resolve but a size test could not be
// completed — the caveat must not read as a finding. Its claim ("could not be completed", "not
// evaluated") is TRUE ONLY of `view.unevaluated`; for a routeNotMet row the test completed and every
// limb was evaluated, which is what routeNotMetNote below says instead.
//
// Signature deliberately unchanged — (frameworks, fields), ONE population per call. A MIXED deal is
// currently unreachable: `routeNotMet` can only ever contain CS3D (the only test declaring
// `exhaustive: false`), CS3D reaches that outcome only with BOTH revenue and headcount declared, and
// with both declared CSRD — which draws on the same two figures — resolves definitively rather than
// being withheld. Verified by sweep, not assumed. So no caller needs to render both notes at once
// today; when a second non-exhaustive test lands, they will, and each keeps its own sentence.
export const partiallyAssessedNote = (frameworks: string[], fields: LimbSource[]): string => {
  const one = frameworks.length === 1
  return `Determined from jurisdiction and sector. NOT ASSESSED: ${frameworks.join(', ')}: the size test could not be completed, so ${one ? 'this trigger was' : 'these triggers were'} not evaluated. This is not a finding that ${one ? 'it does' : 'they do'} not apply. ${resolveFieldsPrompt(fields, frameworks)}`.trim()
}

// THE ROUTENOTMET-POPULATION NOTE. Its counterpart above, for the other half of the partition: the
// size test RAN, every limb was evaluated, and the target is under the figure — yet applicability is
// still open because the instrument reaches companies by routes this assessment does not model.
//
// NO `fields` PARAMETER, BY DEFINITION. A routeNotMet row has unknownCount 0, so `fieldsToResolve`
// contributes nothing for it; there is no figure the form collects that would change the answer. A
// fields argument could only ever be empty here, and accepting one would invite a caller to pass the
// union's fields and prompt for a number that settles nothing — the defect this split exists to end.
// The trailing phrase on a PARTIAL panel heading. The heading names the UNION — it must, because it
// is claiming that these frameworks were withheld and it has to name all of them — but the phrase
// says HOW, and the union cannot carry that:
//   'NOT ASSESSED' reads to a customer as NOTHING HAPPENED, which is false of a row where every limb
//   was evaluated against a real figure and the target simply fell under it. Saying it there
//   contradicts the near-threshold table on the same page, which shows that row's limbs and values.
//   'NOT RESOLVED' says the answer is open without claiming the work was not done.
// A MIXED deal takes 'NOT ASSESSED' deliberately: it is the WEAKER claim and therefore true of both
// populations — unresolved either way — where 'NOT RESOLVED' would imply every named framework was
// actually tested. Mixed is unreachable today (see partiallyAssessedNote), so this is the forward
// case, and it must fail toward the claim that cannot be wrong.
export const partialHeadingPhrase = (
  populations: Pick<DealAssessmentView, 'unevaluated' | 'routeNotMet'>,
): string =>
  populations.routeNotMet.length > 0 && populations.unevaluated.length === 0
    ? 'NOT RESOLVED'
    : 'NOT ASSESSED'

export const routeNotMetNote = (frameworks: string[]): string => {
  const one = frameworks.length === 1
  return `Determined from jurisdiction and sector. NOT RESOLVED: ${frameworks.join(', ')}, tested against company size, and the target is below that threshold. ${one ? 'It can' : 'They can'} also apply through a parent company, or through franchising or licensing arrangements, neither of which this assessment checks. This is not a finding that ${one ? 'it does' : 'they do'} not apply.`
}
// The near check runs over EVERY limb — turnover, balance-sheet total and headcount — so this must
// not name revenue. Saying "revenue" describes the old single-limb model and would understate what
// was checked: a deal whose headcount sits 2% under 250 has a near limb and no near revenue.
export const nearThresholdNoneNote = (): string =>
  `None. No figure sits within ${NEAR_BAND_PCT} of its threshold.`

// ─── Limb + outcome evaluation ──────────────────────────────────────────────────
// The size figures a test draws on. `revenue` keeps the legacy rule (the form coerces blank to 0,
// so 0 must read as undeclared — documented limitation). The two NEW fields sit in nullable
// columns, so null means undeclared and 0 is a real declared value: a holding company with 0
// employees definitively fails the employee limb, which is not the same as not knowing.
export type DealSize = {
  revenue: number | null
  total_assets: number | null
  employee_count: number | null
  currency: string
}
const declaredLegacy = (v: number | null | undefined): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v > 0
const declaredNullable = (v: number | null | undefined): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0

export type LimbState = 'met' | 'not-met' | 'not-assessed'
export type LimbResult = {
  limb: ThresholdLimb
  state: LimbState
  valueApplied: number | null   // expressed in the limb's own unit (converted for money limbs)
  ratio: number | null          // valueApplied / limb.amount
  near: boolean
  side?: 'above' | 'below'
  fieldToResolve?: LimbSource   // set when not-assessed — the field that would settle it
  rateUnavailable?: boolean
}

const evaluateLimb = (limb: ThresholdLimb, size: DealSize): LimbResult => {
  const raw = limb.source === 'revenue' ? size.revenue
    : limb.source === 'total_assets' ? size.total_assets
    : size.employee_count
  const declared = limb.source === 'revenue' ? declaredLegacy(raw) : declaredNullable(raw)
  if (!declared) return { limb, state: 'not-assessed', valueApplied: null, ratio: null, near: false, fieldToResolve: limb.source }

  let value = raw as number
  if (limb.unit.unit === 'currency') {
    if (!isDealCurrency(size.currency)) {
      // No dated rate ⇒ the limb cannot be evaluated. Flag rather than guess; treating an unknown
      // currency as 1:1 USD is the original defect this machinery replaced.
      return { limb, state: 'not-assessed', valueApplied: null, ratio: null, near: false, fieldToResolve: limb.source, rateUnavailable: true }
    }
    value = convertCurrency(value, size.currency, limb.unit.currency)
  }
  const ratio = value / limb.amount
  const near = Math.abs(value - limb.amount) <= limb.amount * NEAR_THRESHOLD_BAND
  const met = limb.comparison === 'gte' ? value >= limb.amount : value > limb.amount
  return { limb, state: met ? 'met' : 'not-met', valueApplied: value, ratio, near, side: near ? (met ? 'above' : 'below') : undefined }
}

export type ThresholdOutcome = {
  framework: string
  requires: number
  limbs: LimbResult[]
  metCount: number
  unknownCount: number
  ceiling: number               // metCount + unknownCount — best case if every unknown limb were met
  fieldsToResolve: LimbSource[]
  nearOutcomeFlip: boolean      // a MARGINAL limb is decisive for the outcome
  flipSide?: 'above' | 'below'
  lookbackModelled: boolean
}

// N-of-M with partial evaluation. An undeclared limb does NOT fail the test — it makes the outcome
// indeterminate only where it could still change the answer:
//   metCount >= requires   → applies        (already satisfied; no unknown can unsatisfy it)
//   ceiling  <  requires   → not-applicable (cannot reach N even if every unknown were met)
//   otherwise              → not-assessed   (genuinely undetermined; name the fields)
// So a 2-of-3 test with two declared limbs both met APPLIES regardless of the third, and with two
// declared limbs both unmet is DEFINITIVELY out. Only the ambiguous middle is not-assessed.
//
// EXCEPT where the test is non-exhaustive (`exhaustive: false`): its limbs are one route among
// several, so the ARITHMETIC is unchanged but the CLAIM is weaker — failing every modelled limb
// establishes that this route was not triggered, not that the framework does not apply. That maps to
// 'not-assessed', the absence of a finding, rather than 'not-applicable', which is a finding. The
// gap it leaves is real and visible: no field would resolve it, so `fieldsToResolve` stays empty and
// the surfaces prompt for nothing. What is missing is a route this model does not express.
export const evaluateTest = (test: ThresholdTest, size: DealSize): { status: FrameworkStatus; applies: boolean; outcome: ThresholdOutcome } => {
  const limbs = test.limbs.map(l => evaluateLimb(l, size))
  const metCount = limbs.filter(l => l.state === 'met').length
  const unknownCount = limbs.filter(l => l.state === 'not-assessed').length
  const ceiling = metCount + unknownCount

  const applies = metCount >= test.requires
  const definitivelyOut = ceiling < test.requires
  const status: FrameworkStatus = applies ? 'applies'
    : definitivelyOut ? (test.exhaustive === false ? 'not-assessed' : 'not-applicable')
    : 'not-assessed'

  // Outcome-flip near-threshold: mark only when a MARGINAL limb is decisive, not whenever any limb
  // happens to sit near its figure. A near limb that cannot change the answer is noise.
  const nearAboveMet = limbs.filter(l => l.state === 'met' && l.near).length
  const nearBelowUnmet = limbs.filter(l => l.state === 'not-met' && l.near).length
  const flipDown = applies && nearAboveMet > 0 && (metCount - nearAboveMet) < test.requires
  const flipUp = !applies && nearBelowUnmet > 0 && (metCount + nearBelowUnmet + unknownCount) >= test.requires

  return {
    status, applies,
    outcome: {
      framework: test.framework, requires: test.requires, limbs, metCount, unknownCount, ceiling,
      fieldsToResolve: [...new Set(limbs.filter(l => l.state === 'not-assessed').map(l => l.fieldToResolve!))],
      nearOutcomeFlip: flipDown || flipUp,
      flipSide: flipDown ? 'above' : flipUp ? 'below' : undefined,
      lookbackModelled: test.lookbackModelled,
    },
  }
}

// 'market' (29 Sep 2026): expected by investors, lenders or customers, NOT required by law for this
// target on the information given. Always `applies: false`, so a market row can never reach
// getApplicableFrameworks' flat list, and therefore never prices an obligation or licenses a regime
// token on a risk finding.
export type FrameworkStatus = 'applies' | 'near-threshold' | 'not-applicable' | 'not-assessed' | 'market'
export type FrameworkApplicability = {
  framework: string
  // Authoritative in/out — the ONLY thing getApplicableFrameworks filters on. Near-ness never
  // changes it: a company 5% OVER a trigger is legally in scope and must stay in scope.
  applies: boolean
  status: FrameworkStatus
  side?: 'above' | 'below'          // set only when status === 'near-threshold'
  // ⚠️ APPLIES, WITH A CONDITION THIS ASSESSMENT DID NOT TEST. Set only alongside `applies: true`, and
  // NOT a fifth FrameworkStatus: the union is switched over exhaustively in several places, and a new
  // member there would be a build-wide change to express one row's caveat. A consumer renders the same
  // "verify" treatment a near-threshold row gets, because the reader's job is the same — check something
  // before relying on it. DISTINCT FROM `reason`, which means the opposite: reason withholds, verify
  // asserts and qualifies.
  verify?: string
  test?: ThresholdOutcome           // per-limb detail behind the decision
  // ⚠️ THE BASIS OF AN APPLIES ROW THAT HAS NO SIZE TEST. Every `applies: true` row must carry one of
  // `test` (a statutory size test ran), `verify` (applies on a named rule, with a condition to check)
  // or `rule` (applies by a rule this function states). Nothing may reach APPLIES by default any more:
  // until 29 Sep 2026 a framework with no active test fell through to an unconditional APPLIES, which
  // is how IFRS S2 and TCFD came to be asserted against every deal. assessment.test.ts fails on a row
  // that breaks this.
  rule?: string
  // A market row's own sentence, where it needs more than the section's introduction (UK SRS).
  note?: string
  // The size test ran on the deal's WHOLE figures for a market the target is not established in: Canada
  // S-211 for a non-Canadian target selling into Canada. The Act measures the business in Canada; the
  // deal records one set of global figures, so every limb is a proxy and the report says so.
  globalFigures?: true
  // Why the framework's applicability could not be ESTABLISHED FROM THE MODELLED TEST. That covers an
  // abstention no size test can answer (no EU-footprint field, no entity-type field) AND a
  // NON-EXHAUSTIVE test whose modelled route was evaluated and NOT met — the route is settled, the
  // framework is not, because other routes exist that this model does not express.
  // SO IT MAY ACCOMPANY EITHER 'not-assessed' OR 'near-threshold', and a consumer MUST NOT GATE ON
  // STATUS WHEN READING IT: a marginal-but-unmet non-exhaustive test raises the near-threshold marker
  // while still carrying its reason, and resolveCs3d silently lost that reason for as long as it
  // checked the status first.
  // In every case a reader is told what is missing (a fact about the target, or about this model)
  // rather than prompted for a field.
  reason?: string
}

// CSRD's limbs above are the EU-undertaking test. A 'Global' target may still be caught as a
// third-country undertaking on separate constants (EUR 450m EU-generated parent turnover, EUR 200m
// subsidiary/branch turnover), and this assessment does not capture an EU footprint at all — no
// market multi-select, no EU-subsidiary field. So it ABSTAINS.
//
// Not 'not-applicable': answering a third-country target with the EU-undertaking limbs would turn a
// false positive into a FALSE NEGATIVE, which in diligence is the worse of the two — a buyer told a
// statute does not apply stops looking. Same three-state treatment resolveCs3d gives CS3D
// (lib/deals/reportModel.ts).
export const CSRD_NON_EU_REASON =
  'CSRD also reaches non-EU parents through EU subsidiaries and branches on separate thresholds, measured on EU-generated turnover and on the subsidiaries’ and branches’ own figures; this assessment does not collect the target’s EU footprint in those terms, so applicability cannot be resolved here.'

export const csrdNonEuAbstention = (): FrameworkApplicability => ({
  framework: 'CSRD', applies: false, status: 'not-assessed', reason: CSRD_NON_EU_REASON,
})

// CS3D's limbs above are the art. 2(1)(a) EU-COMPANY test. For a company formed outside the EU the
// Directive changes the measure rather than the figure: art. 2(2) turns on net turnover generated IN
// THE UNION, and a single worldwide revenue input cannot answer that. So a non-EU target ABSTAINS on
// the same reasoning as CSRD — resolving it against the EU-company limbs would answer a question the
// Directive does not ask, and a 'not-applicable' would be the false negative that stops a buyer
// looking.
//
// No trailing full stop: the report appends one at the render site (deals/report/page.tsx), and
// resolveCs3d strips any trailing period defensively.
export const CS3D_NON_EU_REASON =
  'For a company formed outside the EU, CS3D turns on net turnover generated IN THE UNION; this assessment collects a single revenue figure and does not capture the target’s EU turnover, so applicability cannot be resolved here'

export const cs3dNonEuAbstention = (): FrameworkApplicability => ({
  framework: 'CS3D', applies: false, status: 'not-assessed', reason: CS3D_NON_EU_REASON,
})

// CS3D's THRESHOLD_TESTS entry is still `pending` — no limbs, so no size test runs. Routing it
// through `plain()` therefore fell through to an unconditional `applies: true` for every EU deal,
// which asserted the statute against targets that fail its limbs by a wide margin (observed: 1,850
// employees, EUR 620m revenue, reported as APPLIES). Directly under a CSRD row that now shows its
// full statutory workings, a bare unqualified APPLIES is both wrong and conspicuous.
//
// So CS3D abstains until its constants land: NOT 'applies' (asserts a statute never tested) and NOT
// 'not-applicable' (a false negative, the worse error in diligence). Same shape as the CSRD non-EU
// abstention above.
//
// No trailing full stop: the report appends one at the render site (deals/report/page.tsx), and
// resolveCs3d strips any trailing period defensively.
export const CS3D_PENDING_REASON =
  'CS3D applies above 5,000 employees and EUR 1.5bn net worldwide turnover (Directive (EU) 2026/470). This assessment does not yet run that size test, so applicability is not resolved here'

export const cs3dPendingAbstention = (): FrameworkApplicability => ({
  framework: 'CS3D', applies: false, status: 'not-assessed', reason: CS3D_PENDING_REASON,
})

// ── Rule-based rows: the condition each one leaves open ──────────────────────────────────────────
// Each applies on a jurisdiction or sector rule, and each binds only a class of firm this assessment
// does not identify, so it is APPLIES: VERIFY with the condition stated. Wording approved 29 Sep 2026.
export const SFDR_VERIFY = 'Applies if the target is an EU financial market participant or financial adviser.'
export const FCA_CLIMATE_VERIFY = 'Applies to UK asset managers above GBP 5bn AUM and asset owners above GBP 1.5bn.'
export const UK_SDR_VERIFY = 'Naming and marketing rules apply to UK fund managers using sustainability terms.'
export const ANTI_GREENWASHING_VERIFY = 'Applies if the target is FCA-authorised.'
export const ETS_VERIFY =
  'Applies if the target operates covered installations or activities (e.g. combustion above 20MW thermal input, specified industrial processes, aviation, maritime).'
export const EU_TAXONOMY_RULE =
  'Applies because CSRD applies: undertakings reporting under CSRD disclose Taxonomy alignment (Regulation (EU) 2020/852, Article 8).'
/**
 * The frameworks this engine lists as market expectations, never as APPLIES rows. One list, used by
 * the engine's market() rows below (assessment.test.ts pins that they agree) and by surfaces that
 * read a `frameworks` snapshot saved before 29 Sep 2026, when these four were stored as applying.
 */
export const MARKET_FRAMEWORKS = ['IFRS S2', 'TCFD', 'PCAF', 'UK SRS (S1/S2)'] as const
const MARKET_SET = new Set<string>(MARKET_FRAMEWORKS)

/**
 * A stored `frameworks` list without the market expectations. For display of a snapshot only: it
 * changes nothing stored, and a live derivation never needs it (market rows never reach that list).
 */
export const withoutMarketExpectations = (frameworks: unknown): string[] =>
  Array.isArray(frameworks) ? frameworks.filter((f): f is string => typeof f === 'string' && !MARKET_SET.has(f)) : []

export const UK_SRS_NOTE =
  'Endorsed for voluntary use February 2026. The FCA proposes mandatory climate reporting (S2) for UK-listed companies for periods from 1 January 2027 (CP26/5).'

const applyTest = (test: ThresholdTest, size: DealSize): FrameworkApplicability => {
  const { status, applies, outcome } = evaluateTest(test, size)
  // Near-threshold is a PRESENTATION of a decided outcome, never a replacement for it: the marker
  // is raised only when a marginal limb is decisive, and `applies` is untouched either way.
  const near = outcome.nearOutcomeFlip
  // The ONE case where an evaluated test carries a reason. A non-exhaustive test that cannot reach
  // `requires` was fully evaluated and still withheld (see evaluateTest's status mapping), so the row
  // would otherwise be the one thing this module refuses to produce: a framework removed from the
  // findings with nothing said about why. Same arithmetic as `definitivelyOut`, read back off the
  // outcome rather than recomputed from `size`.
  const routeNotMet = test.exhaustive === false && outcome.ceiling < outcome.requires
  return {
    framework: test.framework,
    applies,
    status: near ? 'near-threshold' : status,
    ...(near && outcome.flipSide ? { side: outcome.flipSide } : {}),
    test: outcome,
    ...(routeNotMet && test.routeNotMetReason ? { reason: test.routeNotMetReason } : {}),
  }
}

// Framework applicability — RICH form. Returns every framework evaluated for this deal, each with
// its status and (for revenue-triggered ones) the converted figure behind the decision, so a report
// can show WHY a statute was or wasn't cited. `dealType` is accepted but not read (no framework
// trigger depends on it today); kept so the signature matches getApplicableFrameworks.
export const getFrameworkApplicability = (
  jurisdiction: string, revenue: number, sector: string, dealType: string, currency: string = 'USD',
  // ⚠️ `listed_ca_exchange` IS TRI-STATE AND THE THIRD STATE IS THE POINT. true takes the listing route;
  // false and null/undefined both leave it untaken. It is optional with a default so every existing
  // caller keeps working unchanged, and an absent answer can never be read as "not listed".
  size: {
    total_assets?: number | null
    employee_count?: number | null
    listed_ca_exchange?: boolean | null
    // Sales markets and environmental claims (29 Sep 2026). NULL or absent = never asked, and then
    // no claims row is produced: see claimsFrameworkRows in ./markets.
    sales_markets?: string[] | null
    sales_markets_not_sure?: boolean | null
    env_claims?: string | null
  } = {},
): FrameworkApplicability[] => {
  const out: FrameworkApplicability[] = []
  // The sector as the rules read it: blank or whitespace-only is no sector.
  const sectorKey = normalizeSector(sector) ?? ''
  const dealSize: DealSize = {
    revenue, currency,
    total_assets: size.total_assets ?? null,
    employee_count: size.employee_count ?? null,
  }
  // ⚠️ SIZE-TESTED FRAMEWORKS ONLY. This replaced `plain()`, which returned an unconditional
  // APPLIES for any framework whose size test was absent or pending: IFRS S2 and TCFD were asserted
  // against every deal that way, UK SRS against every UK deal, and SFDR, UK SDR and the rest against
  // every financial-services deal in their jurisdiction. A framework with no active test is now NOT
  // ASSESSED, with its reason, never APPLIES. Frameworks that apply on a rule rather than a size test
  // are pushed explicitly below with their `rule` or `verify`, and market expectations with market().
  const sized = (framework: string) => {
    const t = THRESHOLD_TESTS[framework]
    out.push(isTestActive(t) ? applyTest(t, dealSize) : {
      framework, applies: false, status: 'not-assessed',
      reason: `${framework} has no size test in this assessment yet, so its applicability is not resolved here`,
    })
  }
  const verify = (framework: string, condition: string) =>
    out.push({ framework, applies: true, status: 'applies', verify: condition })
  const market = (framework: string, note?: string) =>
    out.push({ framework, applies: false, status: 'market', ...(note ? { note } : {}) })

  // US — California SB 253 (statutory trigger is USD 1bn total annual revenue, doing business in CA)
  if (jurisdiction === 'USA') sized('SB 253')

  // EU — the CSRD size test is the EU-UNDERTAKING test, so it is applied ONLY to an EU target.
  // 'Global' keeps CSRD in scope but abstains: in scope to consider, not resolvable here.
  if (jurisdiction === 'European Union') sized('CSRD')
  else if (jurisdiction === 'Global') out.push(csrdNonEuAbstention())
  // SFDR binds financial market participants and financial advisers, which a sector of "Financial
  // Services" suggests and does not establish.
  if (jurisdiction === 'European Union' && FINANCIAL_RULE_SECTORS.SFDR.has(sectorKey)) verify('SFDR', SFDR_VERIFY)
  // EU Taxonomy disclosure is owed by undertakings that report under CSRD, so it applies exactly when
  // CSRD applies on this deal: not on jurisdiction, and not for a Global target whose CSRD abstains.
  if (out.some(f => f.framework === 'CSRD' && f.applies)) {
    out.push({ framework: 'EU Taxonomy', applies: true, status: 'applies', rule: EU_TAXONOMY_RULE })
  }
  // CS3D — the art. 2(1)(a) limbs are the EU-COMPANY test, so they are applied ONLY to an EU target.
  // 'Global' keeps CS3D in scope but abstains: art. 2(2) measures turnover generated IN THE UNION,
  // which this assessment does not collect. Same split as CSRD above.
  if (jurisdiction === 'European Union') sized('CS3D')
  else if (jurisdiction === 'Global') out.push(cs3dNonEuAbstention())

  // UK — distinct regime, NOT CSRD
  if (jurisdiction === 'UK') {
    sized('SECR')            // large UK cos: Scope 1+2 mandatory (DEFRA factors). 2-of-3, not turnover-only.
    // Endorsed for voluntary use, not yet mandatory: a market expectation, with the pending FCA
    // proposal stated so a reader knows it may not stay one.
    market('UK SRS (S1/S2)', UK_SRS_NOTE)
    // Each binds a class of FCA-regulated firm that a sector label does not establish, and each is
    // attached only to the financial sectors it can reach (FINANCIAL_RULE_SECTORS in ./sectors).
    if (FINANCIAL_RULE_SECTORS.FCA_CLIMATE.has(sectorKey)) verify('FCA climate disclosure (TCFD)', FCA_CLIMATE_VERIFY)
    if (FINANCIAL_RULE_SECTORS.UK_SDR.has(sectorKey)) verify('UK SDR', UK_SDR_VERIFY)
    if (FINANCIAL_RULE_SECTORS.ANTI_GREENWASHING.has(sectorKey)) verify('Anti-greenwashing rule', ANTI_GREENWASHING_VERIFY)
  }

  // Canada — S-211 forced/child labour supply-chain reporting. NOT a supply-chain MODULE trigger (it is
  // a reporting obligation, not a value-chain accounting scope), so it does not enter
  // SUPPLY_CHAIN_TRIGGERS and does not price anything.
  //
  // ⚠️ TWO ROUTES, AND THE LISTING ONE IS CHECKED FIRST BECAUSE IT DOES NOT DEPEND ON THE FIGURES.
  // s.2(a) brings a listed entity within the Act at ANY size, so a small listed target is in scope while
  // failing every size limb. Routing it here rather than as a limb is deliberate: ThresholdLimb models
  // SIZE measures with a ±10% near-threshold margin, and a boolean has no margin, no unit and no
  // proximity. Expressing it as a limb would mean widening SizeMeasure, LimbSource, LimbUnit and the
  // marginal-value logic to carry one field that none of them describes. The jurisdiction gate above is
  // already the place where non-size routing lives.
  // ⚠️ AND A FALSE OR ABSENT ANSWER STILL DOES NOT PRODUCE A NEGATIVE. The size test is non-exhaustive,
  // so failing it yields 'not-assessed'. That is what makes "Not sure" safe to offer.
  // ⚠️ THE LISTING CHECK RUNS FIRST AND OUTSIDE THE JURISDICTION GATE, WHICH IS UNIQUE IN THIS FUNCTION.
  // s.2(a) reaches an entity listed on a Canadian stock exchange WHEREVER IT IS ESTABLISHED, so gating it
  // on jurisdiction === 'Canada' is what made a US-established TSX-listed target unreachable: no row was
  // created at all, so there was nothing to withhold and nothing to narrate. Every other framework here
  // is routed by jurisdiction or sector; this one is routed by an answer.
  // No `reason` on this row: see the note beside CANADA_S211_ROUTE_NOT_MET_REASON. `reason` means the
  // applicability could not be established, and this row establishes it. `verify` is the field that
  // qualifies a settled row.
  if (size.listed_ca_exchange === true) {
    out.push({ framework: 'Canada S-211', applies: true, status: 'applies', verify: CANADA_S211_LISTING_VERIFY })
  } else if (jurisdiction === 'Canada') {
    sized('Canada S-211')
  } else if ((size.sales_markets ?? []).includes('CA')) {
    // DOING BUSINESS IN CANADA, FROM THE SALES MARKETS (29 Sep 2026). The Act reaches a company doing
    // business in Canada wherever it is based, and the target reports Canada among its markets, so the
    // same size test runs: same limbs, same thresholds, same non-exhaustive treatment. On the deal's
    // global figures, which is the proxy `globalFigures` makes the report state on every limb.
    sized('Canada S-211')
    out[out.length - 1] = { ...out[out.length - 1], globalFigures: true }
  }
  // NO ROW FOR A NON-CANADIAN TARGET WHOSE MARKETS DO NOT INCLUDE CANADA. Stating that as a withheld
  // FRAMEWORK ROW was tried and withdrawn on 26 Sep 2026: it landed on every deal and failed 13 tests.
  // Where Canada is not confirmed either way (markets "not sure"), CANADA_S211_JURISDICTION_CAVEAT says
  // so once, gated by showCanadaS211JurisdictionCaveat and canadaCaveatForMarkets.

  // Environmental-claims regimes named by market (EU ECGT, California AB 1305): APPLIES on a reported
  // claim, APPLIES: VERIFY on "not sure", nothing when claims are "no" or never asked. Each carries its
  // `rule` or `verify`. The finding with the penalties is built in ./claimsRules for the report.
  out.push(...claimsFrameworkRows(size))

  // Market expectations, every jurisdiction. Investors, lenders and customers ask for these; no
  // statute this assessment tests requires them of this target. PCAF is the financed-emissions
  // standard, so it is expected of financial-services targets only.
  market('IFRS S2')
  market('TCFD')
  if (FINANCIAL_RULE_SECTORS.PCAF.has(sectorKey)) market('PCAF')
  // Emissions trading binds operators of covered installations and activities, which a heavy-industry
  // sector suggests and does not establish.
  if (ETS_SECTORS.has(sectorKey)) {
    if (jurisdiction === 'UK') verify('UK ETS', ETS_VERIFY)
    else if (['European Union', 'Global'].includes(jurisdiction)) verify('EU ETS', ETS_VERIFY)
  }

  return out
}

// Framework applicability — FLAT form. Unchanged contract for every existing consumer
// (getObligations, getComplianceCost, mapFramework, the frameworks jsonb column): same strings,
// same order, still string[]. `currency` defaults to USD so the old 4-arg call site still compiles.
// Near-threshold frameworks are NOT silently promoted into this list — it stays the legal in/out.
// Read getFrameworkApplicability when you need the marker.
// ── THE CANONICAL JURISDICTION LIST ──────────────────────────────────────────────────────────────
//
// LIVES HERE, WITH THE ENGINE THAT MATCHES ON IT. It was declared in app/dashboard/deals/page.tsx —
// the dropdown that produces the values — which put the list in one consumer and the interpretation
// in another, with nothing holding them together. The engine matches by EXACT EQUALITY
// (`jurisdiction === 'UK'` and eight siblings), and a value hitting no branch does not error: it
// falls through to the universal baseline and renders as REGIME_FALLBACK: 'GHG Protocol'
// — on the target-facing /deals/[token] page, reading exactly like a real answer.
//
// So the list and the branches must agree, and agreement is now testable: see the jurisdiction
// coverage block in assessment.test.ts, which fails if a member is added without the engine learning
// it, or if an existing one stops resolving. The wizard imports this rather than declaring its own.
export const JURISDICTIONS = ['USA', 'European Union', 'UK', 'Canada', 'Australia', 'Global', 'Other']

export const getApplicableFrameworks = (
  jurisdiction: string, revenue: number, sector: string, dealType: string, currency: string = 'USD',
  // Kept in step with getFrameworkApplicability's `size`, which the comment above already requires:
  // this is the thin wrapper, and a field it cannot forward is a field the filtered list cannot see.
  size: {
    total_assets?: number | null
    employee_count?: number | null
    listed_ca_exchange?: boolean | null
    // Sales markets and environmental claims (29 Sep 2026). NULL or absent = never asked, and then
    // no claims row is produced: see claimsFrameworkRows in ./markets.
    sales_markets?: string[] | null
    sales_markets_not_sure?: boolean | null
    env_claims?: string | null
  } = {},
): string[] =>
  getFrameworkApplicability(jurisdiction, revenue, sector, dealType, currency, size)
    .filter(f => f.applies)
    .map(f => f.framework)
