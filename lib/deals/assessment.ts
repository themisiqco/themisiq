// lib/deals/assessment.ts
// Pure Deals-assessment logic, extracted from app/dashboard/deals/page.tsx so BOTH the
// authenticated dashboard and the future public target-facing route (app/deals/[token])
// compute the identical assessment from one source — no drift. No React, no I/O, no state.
// ThemisIQ prices come from lib/pricing.ts (single source of truth); consultant = cited ranges.

import { GHG_TIERS, FLAT_MODULE_PRICES } from '../pricing'

// Fields the assessment functions read off a deal. The functions take explicit primitive
// params (below); this type documents the deal shape both surfaces hydrate from.
export type DealInput = {
  target_name: string
  sector: string
  jurisdiction: string
  revenue: number
  deal_value: number
  location_count: number
  currency: string
}

export type SectorRisk = { risk: string; severity: 'critical' | 'high' | 'medium'; framework: string; detail: string }

export const SECTOR_RISKS: Record<string, SectorRisk[]> = {
  'Energy & Utilities': [
    { risk: 'High Scope 1 emissions exposure', severity: 'critical', framework: 'SB 253 / CSRD', detail: 'Energy companies typically carry 60-80% of portfolio Scope 1 emissions, requiring full consolidation into the buyer\'s GHG inventory under prevailing emissions-accounting standards.' },
    { risk: 'Stranded asset risk', severity: 'critical', framework: 'IFRS S2 / TCFD', detail: 'Fossil fuel assets face material impairment risk under 1.5°C transition scenarios. Requires IFRS S2 climate scenario analysis.' },
    { risk: 'Physical climate risk exposure', severity: 'high', framework: 'TCFD / IFRS S2', detail: 'Energy infrastructure faces acute and chronic physical climate risk. Requires asset-level climate risk assessment.' },
  ],
  'Financial Services': [
    { risk: 'Financed emissions (Scope 3 Cat.15)', severity: 'critical', framework: 'PCAF / CSRD', detail: 'Financed emissions typically represent 95%+ of a financial institution\'s carbon footprint. PCAF methodology required.' },
    { risk: 'SFDR portfolio alignment', severity: 'high', framework: 'SFDR / EU Taxonomy', detail: 'EU financial products must disclose sustainability characteristics. Article 8/9 classification impacts fund marketability.' },
    { risk: 'Physical risk in loan book', severity: 'high', framework: 'ECB / TCFD', detail: 'Mortgage and commercial real estate portfolios face material physical climate risk under ECB guidelines.' },
  ],
  'Real Estate': [
    { risk: 'Embodied carbon in portfolio', severity: 'high', framework: 'CSRD / CRREM', detail: 'Building portfolios face stranding risk under EU carbon reduction pathways. CRREM analysis required.' },
    { risk: 'Energy efficiency compliance', severity: 'high', framework: 'EU EPC / MEES', detail: 'EU Energy Performance of Buildings Directive and UK MEES require minimum EPC ratings. Non-compliant assets face rental prohibition.' },
    { risk: 'Physical flood and heat risk', severity: 'critical', framework: 'TCFD / IFRS S2', detail: 'Real estate assets face material physical climate risk. Asset-level flood mapping and heat stress analysis required.' },
  ],
  'Technology': [
    { risk: 'Data centre energy intensity', severity: 'medium', framework: 'SB 253 / CSRD', detail: 'Data centre operations carry significant Scope 2 exposure. PPA and renewable energy coverage assessment needed.' },
    { risk: 'AI governance exposure', severity: 'medium', framework: 'EU AI Act', detail: 'Technology products may contain high-risk AI systems requiring EU AI Act conformity assessment by August 2026.' },
    { risk: 'Supply chain minerals risk', severity: 'high', framework: 'CS3D / ESRS S2', detail: 'Hardware products may rely on conflict minerals. CS3D HRDD obligations apply from 2027.' },
  ],
  'Healthcare & Pharma': [
    { risk: 'Cold chain emissions', severity: 'medium', framework: 'SB 253 / GHG Protocol', detail: 'Pharmaceutical cold chain carries significant Scope 3 Cat.4 emissions from refrigerant leakage and transport.' },
    { risk: 'Pharmaceutical waste', severity: 'medium', framework: 'CSRD / GRI', detail: 'Pharmaceutical manufacturing generates hazardous waste requiring environmental liability assessment.' },
    { risk: 'Clinical trial supply chain', severity: 'medium', framework: 'CS3D / ESRS S2', detail: 'Clinical trial operations in emerging markets carry human rights and labour standards risk.' },
  ],
  'Industrials & Manufacturing': [
    { risk: 'Scope 1 process emissions', severity: 'critical', framework: 'SB 253 / CSRD', detail: 'Industrial manufacturing typically carries significant Scope 1 process emissions requiring full GHG inventory.' },
    { risk: 'Carbon border adjustment exposure', severity: 'high', framework: 'EU CBAM', detail: 'EU Carbon Border Adjustment Mechanism applies to steel, cement, aluminium, fertilisers and electricity imports from 2026.' },
    { risk: 'Chemical and hazardous materials', severity: 'high', framework: 'REACH / CSRD', detail: 'Industrial operations may carry significant environmental liability from chemical usage and historical contamination.' },
  ],
  'Consumer & Retail': [
    { risk: 'Scope 3 Cat.1 supplier emissions', severity: 'high', framework: 'SB 253 / CSRD', detail: 'Consumer goods companies typically carry 70-90% of emissions in Scope 3 Cat.1. Supplier engagement programme needed.' },
    { risk: 'Deforestation exposure', severity: 'high', framework: 'EU EUDR', detail: 'Consumer goods with exposure to cattle, soy, palm oil, cocoa, coffee, wood or rubber face EU Deforestation Regulation from 2025.' },
    { risk: 'Labour rights in supply chain', severity: 'high', framework: 'CS3D / Modern Slavery', detail: 'Consumer goods supply chains carry significant forced labour and child labour risk in sourcing countries.' },
  ],
  'Agriculture & Food': [
    { risk: 'Land use change emissions', severity: 'critical', framework: 'GHG Protocol / SB 253', detail: 'Agricultural operations may carry significant land use change (LUC) emissions requiring scope 3 Cat.11 assessment.' },
    { risk: 'Deforestation and biodiversity', severity: 'critical', framework: 'EU EUDR / TNFD', detail: 'Agricultural supply chains face EU Deforestation Regulation and emerging TNFD nature-related disclosure requirements.' },
    { risk: 'Water risk', severity: 'high', framework: 'CSRD / CDP Water', detail: 'Agricultural operations in water-stressed regions face material operational and regulatory risk.' },
  ],
  'Transport & Logistics': [
    { risk: 'Fleet decarbonisation liability', severity: 'high', framework: 'SB 253 / CSRD', detail: 'Transport fleet carries significant Scope 1 emissions. EU FuelEU Maritime and ETS expansion add compliance cost.' },
    { risk: 'Aviation and shipping ETS exposure', severity: 'high', framework: 'EU ETS', detail: 'EU ETS now covers aviation and maritime. Carbon cost exposure requires detailed fleet assessment.' },
    { risk: 'Infrastructure physical risk', severity: 'medium', framework: 'TCFD / IFRS S2', detail: 'Transport infrastructure faces physical climate risk from flooding, extreme heat and storm events.' },
  ],
  'Mining & Metals': [
    { risk: 'Scope 1 extraction emissions', severity: 'critical', framework: 'SB 253 / CSRD', detail: 'Mining operations carry significant Scope 1 methane and process emissions requiring full GHG inventory.' },
    { risk: 'Tailings and environmental liability', severity: 'critical', framework: 'CSRD / GRI', detail: 'Mining operations carry material environmental liability from tailings management and historical contamination.' },
    { risk: 'Conflict minerals and HRDD', severity: 'high', framework: 'CS3D / OECD DDG', detail: 'Mining operations in conflict-affected areas require OECD Due Diligence Guidance compliance.' },
  ],
  'Construction & Materials': [
    { risk: 'Embodied carbon in products', severity: 'high', framework: 'CSRD / EU Taxonomy', detail: 'Cement and steel production carry significant process emissions. EU Taxonomy alignment assessment required.' },
    { risk: 'EU CBAM exposure', severity: 'high', framework: 'EU CBAM', detail: 'Construction materials (cement, steel, aluminium) face EU Carbon Border Adjustment Mechanism from 2026.' },
    { risk: 'Site biodiversity and land use', severity: 'medium', framework: 'CSRD / TNFD', detail: 'Construction projects face emerging biodiversity disclosure requirements under TNFD and CSRD ESRS E4.' },
  ],
  'Professional Services': [
    { risk: 'Scope 2 and business travel emissions', severity: 'medium', framework: 'SB 253 / CSRD', detail: 'Professional services firms carry Scope 2 and Scope 3 Cat.6 business travel emissions.' },
    { risk: 'Client portfolio ESG exposure', severity: 'medium', framework: 'CSRD / SFDR', detail: 'Advisory and consulting firms may carry reputational and legal exposure from ESG advice provided to clients.' },
  ],
}

// Compliance cost estimates by deal size and sector complexity
export const getComplianceCost = (dealValue: number, sector: string, frameworks: string[]): { low: number; high: number; pctLow: number; pctHigh: number; items: { item: string; cost: string }[] } => {
  const isHighEmissions = ['Energy & Utilities', 'Industrials & Manufacturing', 'Mining & Metals', 'Transport & Logistics', 'Agriculture & Food'].includes(sector)
  const isFinancial = sector === 'Financial Services'
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

// Consultant benchmarks scale with engagement complexity. ThemisIQ price also
// scales (GHG_TIERS), so the GAP narrows at high facility counts — intentional.
const CONSULTANT_LOCATION_FACTOR = (locationCount: number): number =>
  locationCount <= 3 ? 1.0 : locationCount <= 15 ? 1.5 : 2.0   // reuse GHG_TIERS thresholds
const HEAVY_SECTORS = ['Energy & Utilities', 'Industrials & Manufacturing', 'Mining & Metals', 'Transport & Logistics', 'Agriculture & Food']
const CONSULTANT_SECTOR_FACTOR = (sector?: string): number =>
  sector && HEAVY_SECTORS.includes(sector) ? 1.25 : 1.0
// Round a scaled consultant figure to the nearest 1000 so the "k" display stays clean.
const roundK = (x: number): number => Math.round(x / 1000) * 1000

export type ObligationTier = { label: string; short: string; themisIqPrice: number | null; consultantLow: number; consultantHigh: number; scopeNote?: string }
export type Obligations = {
  included: ObligationTier[]      // summed into the headline (both sides)
  recommended: ObligationTier[]   // shown separately, NOT summed
  flagged: ObligationTier[]       // honest caveats — summed into NEITHER figure
  themisIqTotal: number | null    // sum of non-null included ThemisIQ prices; null when nothing summable
  themisIqHasCustom: boolean       // an included price is null (Advisory GHG, 16+ locations)
  consultantLow: number           // sum of included consultant lows
  consultantHigh: number          // sum of included consultant highs
  locationUnset: boolean          // location_count unset/0 → prompt for the ThemisIQ figure
}

// Pure: deal location count + detected frameworks (+ sector) → scope-matched obligations & prices.
// ThemisIQ prices come from lib/pricing.ts (single source of truth); consultant = cited ranges.
// Consultant ranges scale PER OBLIGATION (location × sector, independently) before summing —
// never one blended factor on the total.
export function getObligations(locationCount: number, frameworks: string[], sector?: string): Obligations {
  const locationUnset = !locationCount || locationCount <= 0
  const loc = CONSULTANT_LOCATION_FACTOR(locationCount)
  const sec = CONSULTANT_SECTOR_FACTOR(sector)

  // GHG — ALWAYS included. Tier by location count (GHG_TIERS is the authority).
  const ghgPrice: number | null =
    locationUnset ? null
    : locationCount <= (GHG_TIERS.starter.locationAllowance ?? 3)      ? GHG_TIERS.starter.priceUSD
    : locationCount <= (GHG_TIERS.professional.locationAllowance ?? 15) ? GHG_TIERS.professional.priceUSD
    : GHG_TIERS.advisory.priceUSD // null → Advisory / custom quote (16+)

  const included: ObligationTier[] = [
    // GHG consultant range scales by location AND sector (a heavy-sector inventory is more work).
    { label: 'GHG inventory & Scope 3', short: 'GHG', themisIqPrice: ghgPrice,
      consultantLow: roundK(CONSULTANT_RANGES.ghg.low * loc * sec),
      consultantHigh: roundK(CONSULTANT_RANGES.ghg.high * loc * sec) },
  ]

  // Supply chain — included when a genuine value-chain framework is detected (PCAF no longer triggers this).
  // Consultant range scales by location only (value-chain breadth), not sector.
  if (SUPPLY_CHAIN_TRIGGERS.some(f => frameworks.includes(f))) {
    included.push({ label: 'Supply chain / Scope 3', short: 'supply chain', themisIqPrice: FLAT_MODULE_PRICES['supply-chain'],
      consultantLow: roundK(CONSULTANT_RANGES.supplyChain.low * loc),
      consultantHigh: roundK(CONSULTANT_RANGES.supplyChain.high * loc) })
  }

  // Financed emissions (PCAF, Scope 3 Cat.15) — Financial Services. Now a REAL included ThemisIQ
  // scope bundled in the GHG module (price 0), replacing the old mislabelled supply-chain trigger.
  // Portfolio-driven: consultant range scales by NEITHER location nor sector.
  if (frameworks.includes('PCAF')) {
    included.push({ label: 'Financed emissions (PCAF, Scope 3 Cat.15)', short: 'financed emissions', themisIqPrice: 0,
      consultantLow: roundK(CONSULTANT_RANGES.financedEmissions.low),
      consultantHigh: roundK(CONSULTANT_RANGES.financedEmissions.high),
      scopeNote: 'Included in the GHG module (PCAF-aligned engine); consultants bill this separately.' })
  }

  // Recommended (NOT summed) — Climate Risk is always relevant (IFRS S2 / TCFD always emitted).
  // Consultant range scales by location only, not sector.
  const recommended: ObligationTier[] = [
    { label: 'Climate risk assessment — physical & transition (IFRS S2 / TCFD)', short: 'climate risk', themisIqPrice: FLAT_MODULE_PRICES['climate-risk'],
      consultantLow: roundK(CONSULTANT_RANGES.climateRisk.low * loc),
      consultantHigh: roundK(CONSULTANT_RANGES.climateRisk.high * loc) },
  ]

  // Flagged (NOT summed into either figure) — honest caveats for scopes needing a separate specialist.
  const flagged: ObligationTier[] = []
  if (sector === 'Agriculture & Food') {
    flagged.push({ label: 'Forest, Land & Agriculture (FLAG)', short: 'FLAG', themisIqPrice: null, consultantLow: 0, consultantHigh: 0,
      scopeNote: 'Covered via SBTi science-based target-setting where applicable. Land-sector inventory assessed separately.' })
  }

  // themisIqPrice 0 is a REAL (free/bundled) price — kept by the != null filter, adds nothing to the
  // sum, and does NOT set themisIqHasCustom (only null prices do).
  const nonNull = included.filter(o => o.themisIqPrice != null).map(o => o.themisIqPrice as number)
  return {
    included, recommended, flagged,
    themisIqTotal: nonNull.length ? nonNull.reduce((a, b) => a + b, 0) : null,
    themisIqHasCustom: included.some(o => o.themisIqPrice == null),
    consultantLow: included.reduce((a, o) => a + o.consultantLow, 0),
    consultantHigh: included.reduce((a, o) => a + o.consultantHigh, 0),
    locationUnset,
  }
}

// Framework applicability
export const getApplicableFrameworks = (jurisdiction: string, revenue: number, sector: string, dealType: string): string[] => {
  const fw: string[] = []

  // US — California SB 253 (statutory trigger is >$1B total annual revenue, doing business in CA)
  if (jurisdiction === 'USA' && revenue > 1000000000) fw.push('SB 253')

  // EU
  if (['European Union', 'Global'].includes(jurisdiction)) fw.push('CSRD')
  if (jurisdiction === 'European Union' && sector === 'Financial Services') fw.push('SFDR')
  if (['European Union', 'Global'].includes(jurisdiction)) fw.push('EU Taxonomy')
  if (['European Union', 'Global'].includes(jurisdiction)) fw.push('CS3D')

  // UK — distinct regime, NOT CSRD
  if (jurisdiction === 'UK') {
    if (revenue > 36000000) fw.push('SECR')               // large UK cos: Scope 1+2 mandatory (DEFRA factors)
    fw.push('UK SRS (S1/S2)')                              // IFRS S1/S2 endorsement — voluntary now, proposed mandatory for listed FY2027+
    if (sector === 'Financial Services') {
      fw.push('FCA climate disclosure (TCFD)')            // FCA-regulated managers / insurers / pensions
      fw.push('UK SDR')                                    // sustainability disclosure + investment labels
      fw.push('Anti-greenwashing rule')                    // applies to all FCA-authorised firms making ESG claims
    }
  }

  // Investor baseline (expected regardless of jurisdiction)
  fw.push('IFRS S2')
  fw.push('TCFD')
  if (sector === 'Financial Services') fw.push('PCAF')
  if (['Energy & Utilities', 'Industrials & Manufacturing', 'Mining & Metals'].includes(sector)) {
    if (jurisdiction === 'UK') fw.push('UK ETS')
    else if (['European Union', 'Global'].includes(jurisdiction)) fw.push('EU ETS')
  }

  return fw
}
