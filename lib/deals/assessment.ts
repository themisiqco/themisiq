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
  currency: DealCurrency
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
    { risk: 'Supply chain minerals risk', severity: 'high', framework: 'CS3D / ESRS S2', detail: 'Hardware products may rely on conflict minerals. CS3D due diligence obligations apply to in-scope companies from 26 July 2029 (Directive (EU) 2026/470).' },
  ],
  'Healthcare & Pharma': [
    { risk: 'Cold chain emissions', severity: 'medium', framework: 'SB 253 / GHG Protocol', detail: 'Pharmaceutical cold chain carries significant Scope 3 Cat.4 emissions from refrigerant leakage and transport.' },
    { risk: 'Pharmaceutical waste', severity: 'medium', framework: 'CSRD / GRI', detail: 'Pharmaceutical manufacturing generates hazardous waste requiring environmental liability assessment.' },
    { risk: 'Clinical trial supply chain', severity: 'medium', framework: 'CS3D / ESRS S2', detail: 'Clinical trial operations in emerging markets carry human rights and labour standards risk.' },
  ],
  'Industrials & Manufacturing': [
    { risk: 'Scope 1 process emissions', severity: 'critical', framework: 'SB 253 / CSRD', detail: 'Industrial manufacturing typically carries significant Scope 1 process emissions requiring full GHG inventory.' },
    { risk: 'Carbon border adjustment exposure', severity: 'high', framework: 'EU CBAM', detail: 'EU Carbon Border Adjustment Mechanism covers iron and steel, cement, aluminium, fertilisers, hydrogen and electricity. The definitive period began 1 January 2026, with a 50-tonne annual net-mass exemption for all but electricity and hydrogen (Regulation (EU) 2023/956 as amended by (EU) 2025/2083).' },
    { risk: 'Chemical and hazardous materials', severity: 'high', framework: 'REACH / CSRD', detail: 'Industrial operations may carry significant environmental liability from chemical usage and historical contamination.' },
  ],
  'Consumer & Retail': [
    { risk: 'Scope 3 Cat.1 supplier emissions', severity: 'high', framework: 'SB 253 / CSRD', detail: 'Consumer goods companies typically carry 70-90% of emissions in Scope 3 Cat.1. Supplier engagement programme needed.' },
    { risk: 'Deforestation exposure', severity: 'high', framework: 'EU EUDR', detail: 'Consumer goods with exposure to cattle, soy, palm oil, cocoa, coffee, wood or rubber fall under the EU Deforestation Regulation, applying to large and medium operators from 30 December 2026 and to micro and small enterprises from 30 June 2027 (Regulation (EU) 2023/1115 as amended by (EU) 2025/2650).' },
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
// Scope 1-intensive sectors — material process / extraction / combustion emissions, so their GHG
// INVENTORY is more work to build (more sources, more sites). This list tracks GHG-inventory BUILD
// EFFORT, NOT overall ESG risk. It is a deliberately COARSE, directional signal (heavy vs not).
// ⚠️ DO NOT derive this — or the multiplier below — from SECTOR_RISKS severity. That is a SEPARATE
// axis (risk materiality/urgency for the deal memo), and it decouples from inventory effort: e.g.
// Financial Services carries critical risk (financed emissions) but a light own-ops GHG inventory
// (its heavy work is the separately-priced PCAF line). Coupling cost to severity would misprice those
// sectors and invent per-sector precision we can't cite. Keep this coarse and effort-based.
const HEAVY_SECTORS = ['Energy & Utilities', 'Industrials & Manufacturing', 'Mining & Metals', 'Transport & Logistics', 'Agriculture & Food']
// One modest, defensible bump for Scope 1-intensive sectors' GHG line only (see included[] above).
const CONSULTANT_SECTOR_FACTOR = (sector?: string): number =>
  sector && HEAVY_SECTORS.includes(sector) ? 1.25 : 1.0
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
  locationUnset: boolean          // location_count unset/0 → prompt for the ThemisIQ figure
}

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
export function getObligations(locationCount: number, frameworks: string[], sector?: string): Obligations {
  const locationUnset = !locationCount || locationCount <= 0
  const loc = CONSULTANT_LOCATION_FACTOR(locationCount)
  const sec = CONSULTANT_SECTOR_FACTOR(sector)

  // GHG — ALWAYS included. Tier by location count (GHG_TIERS is the authority).
  const ghgPricing: ObligationPricing =
    locationUnset ? QUOTE
    : locationCount <= (GHG_TIERS.starter.locationAllowance ?? 3)      ? tierPricing(GHG_TIERS.starter.priceUSD)
    : locationCount <= (GHG_TIERS.professional.locationAllowance ?? 15) ? tierPricing(GHG_TIERS.professional.priceUSD)
    : tierPricing(GHG_TIERS.advisory.priceUSD) // null → Advisory / custom quote (16+)

  const included: ObligationTier[] = [
    // GHG consultant range scales by location AND sector (a heavy-sector inventory is more work).
    tier({ label: 'GHG inventory & Scope 3', short: 'GHG', pricing: ghgPricing,
      consultantLow: roundK(CONSULTANT_RANGES.ghg.low * loc * sec),
      consultantHigh: roundK(CONSULTANT_RANGES.ghg.high * loc * sec) }),
  ]

  // Supply chain — included when a genuine value-chain framework is detected (PCAF no longer triggers this).
  // Consultant range scales by location only (value-chain breadth), not sector.
  if (SUPPLY_CHAIN_TRIGGERS.some(f => frameworks.includes(f))) {
    included.push(tier({ label: 'Supply chain / Scope 3', short: 'supply chain', pricing: priced(FLAT_MODULE_PRICES['supply-chain']),
      consultantLow: roundK(CONSULTANT_RANGES.supplyChain.low * loc),
      consultantHigh: roundK(CONSULTANT_RANGES.supplyChain.high * loc) }))
  }

  // Financed emissions (PCAF, Scope 3 Cat.15) — Financial Services. A REAL included ThemisIQ scope,
  // delivered inside the GHG module, so it is BUNDLED — not priced at zero. It therefore sums into
  // nothing and never renders as a currency figure. (Pricing it 0 made a quote-tier FS deal read
  // "~USD 0 + custom" instead of "Custom quote": a free inclusion masquerading as a zero cost.)
  // Portfolio-driven: consultant range scales by NEITHER location nor sector.
  if (frameworks.includes('PCAF')) {
    included.push(tier({ label: 'Financed emissions (PCAF, Scope 3 Cat.15)', short: 'financed emissions', pricing: BUNDLED,
      consultantLow: roundK(CONSULTANT_RANGES.financedEmissions.low),
      consultantHigh: roundK(CONSULTANT_RANGES.financedEmissions.high),
      scopeNote: 'Included in the GHG module (PCAF-aligned engine); consultants bill this separately.' }))
  }

  // Recommended (NOT summed) — Climate Risk is always relevant (IFRS S2 / TCFD always emitted).
  // Consultant range scales by location only, not sector.
  const recommended: ObligationTier[] = [
    tier({ label: 'Climate risk assessment — physical & transition (IFRS S2 / TCFD)', short: 'climate risk', pricing: priced(FLAT_MODULE_PRICES['climate-risk']),
      consultantLow: roundK(CONSULTANT_RANGES.climateRisk.low * loc),
      consultantHigh: roundK(CONSULTANT_RANGES.climateRisk.high * loc) }),
  ]

  // Flagged (NOT summed into either figure) — honest caveats for scopes needing a separate specialist.
  const flagged: ObligationTier[] = []
  if (sector === 'Agriculture & Food') {
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
      measureNote: 'California measures worldwide GROSS RECEIPTS with no deduction for cost of goods sold — materially larger than net turnover for a distributor. The figure applied is the deal’s single revenue input, not separately collected on a gross-receipts basis.',
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
  'Canada S-211': {
    framework: 'Canada S-211',
    requires: 2, semantics: 'n-of-m',
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
        measureNote: 'Assets per consolidated financial statements. LOOKBACK NOT MODELLED — most recent year only.' },
      { measure: 'turnover', amount: 40_000_000, unit: { unit: 'currency', currency: 'CAD' },
        source: 'revenue', exactMeasure: false, comparison: 'gte',
        basis: 'At least CAD 40,000,000 in revenue, in either of the two most recent financial years.',
        measureNote: 'Revenue per consolidated financial statements. LOOKBACK NOT MODELLED — most recent year only.' },
      { measure: 'employees', amount: 250, unit: { unit: 'count' },
        source: 'employee_count', exactMeasure: false, comparison: 'gte',
        basis: 'At least 250 employees, in either of the two most recent financial years.',
        measureNote: 'Employees of the entity. LOOKBACK NOT MODELLED — most recent year only.' },
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
    citation: 'Accounting Directive as amended by Directive (EU) 2026/470 (Omnibus I), arts. 19a/29a — >1,000 employees and >EUR 450m net turnover',
    limbs: [
      { measure: 'employees', amount: 1_000, unit: { unit: 'count' },
        source: 'employee_count', exactMeasure: false, comparison: 'gt',
        basis: 'More than 1,000 employees (Accounting Directive art. 3, as amended by Omnibus I).',
        measureNote: 'The Directive measures the AVERAGE number of employees during the financial year. The figure applied is the deal’s single point-in-time headcount input.' },
      { measure: 'turnover', amount: 450_000_000, unit: { unit: 'currency', currency: 'EUR' },
        source: 'revenue', exactMeasure: false, comparison: 'gt',
        basis: 'Net turnover of more than EUR 450,000,000 (Accounting Directive art. 3, as amended by Omnibus I).',
        measureNote: 'The Directive measures NET turnover, and for a parent the consolidated figure. The figure applied is the deal’s single revenue input, converted at the dated ECB rate in FX_SOURCE.' },
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
    citation: 'Directive (EU) 2024/1760 as amended by Directive (EU) 2026/470 (Omnibus I), art. 2(1)(a) — >5,000 employees and >EUR 1.5bn net worldwide turnover',
    limbs: [
      { measure: 'employees', amount: 5_000, unit: { unit: 'count' },
        source: 'employee_count', exactMeasure: false, comparison: 'gt',
        basis: 'More than 5,000 employees on average (Directive (EU) 2024/1760 art. 2(1)(a), as amended by Omnibus I).',
        measureNote: 'The Directive measures the AVERAGE number of employees during the financial year. The figure applied is the deal’s single point-in-time headcount input.' },
      { measure: 'turnover', amount: 1_500_000_000, unit: { unit: 'currency', currency: 'EUR' },
        source: 'revenue', exactMeasure: false, comparison: 'gt',
        basis: 'Net worldwide turnover of more than EUR 1,500,000,000 (Directive (EU) 2024/1760 art. 2(1)(a), as amended by Omnibus I).',
        measureNote: 'The Directive measures NET WORLDWIDE turnover. The figure applied is the deal’s single revenue input, converted at the dated ECB rate in FX_SOURCE.' },
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
export type DealAssessmentView = {
  evaluated: boolean          // false when sector/jurisdiction are missing — nothing was run at all
  notAssessed: string[]       // size-gated frameworks in scope that could not be evaluated
  fieldsToResolve: LimbSource[]  // the fields that would settle them — a prompt, not an absence
  frameworks: AssessmentState
  nearThreshold: AssessmentState
}

export const assessmentView = (evaluated: boolean, rows: FrameworkApplicability[]): DealAssessmentView => {
  if (!evaluated) return { evaluated: false, notAssessed: [], fieldsToResolve: [], frameworks: 'not-assessed', nearThreshold: 'not-assessed' }
  const notAssessed = rows.filter(r => r.status === 'not-assessed').map(r => r.framework)
  const fieldsToResolve = [...new Set(rows.filter(r => r.status === 'not-assessed').flatMap(r => r.test?.fieldsToResolve ?? []))]
  const applied = rows.filter(r => r.applies).length
  const near = rows.filter(r => r.status === 'near-threshold').length
  // Withheld rows split two ways and only one of them bears on proximity — see the note on
  // `nearThreshold` below. Counted from `rows` because the distinction lives on the row's `test`,
  // and `notAssessed` is a list of names that cannot carry it.
  const unevaluated = rows.filter(r => r.status === 'not-assessed' && (!r.test || r.test.unknownCount > 0)).length
  return {
    evaluated: true,
    notAssessed,
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
    nearThreshold: unevaluated > 0 ? 'not-assessed' : near > 0 ? 'assessed-findings' : 'assessed-none',
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

export const notAssessedRevenueNote = (
  frameworks: string[] = Object.keys(THRESHOLD_TESTS).filter(k => isTestActive(THRESHOLD_TESTS[k])),
  fields: LimbSource[],
): string =>
  `NOT ASSESSED — size test incomplete for ${frameworks.join(', ')}. ${resolveFieldsPrompt(fields, frameworks)}`.trim()

// Used where a list DID resolve but a size test was withheld — the caveat must not read as a finding.
export const partiallyAssessedNote = (frameworks: string[], fields: LimbSource[]): string => {
  const one = frameworks.length === 1
  return `Determined from jurisdiction and sector. NOT ASSESSED: ${frameworks.join(', ')} — the size test could not be completed, so ${one ? 'this trigger was' : 'these triggers were'} not evaluated. This is not a finding that ${one ? 'it does' : 'they do'} not apply. ${resolveFieldsPrompt(fields, frameworks)}`.trim()
}
// The near check runs over EVERY limb — turnover, balance-sheet total and headcount — so this must
// not name revenue. Saying "revenue" describes the old single-limb model and would understate what
// was checked: a deal whose headcount sits 2% under 250 has a near limb and no near revenue.
export const nearThresholdNoneNote = (): string =>
  `None — no limb sits within ${NEAR_BAND_PCT} of its threshold.`

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

export type FrameworkStatus = 'applies' | 'near-threshold' | 'not-applicable' | 'not-assessed'
export type FrameworkApplicability = {
  framework: string
  // Authoritative in/out — the ONLY thing getApplicableFrameworks filters on. Near-ness never
  // changes it: a company 5% OVER a trigger is legally in scope and must stay in scope.
  applies: boolean
  status: FrameworkStatus
  side?: 'above' | 'below'          // set only when status === 'near-threshold'
  test?: ThresholdOutcome           // per-limb detail behind the decision
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
  'CSRD also reaches non-EU parents through EU subsidiaries and branches on separate thresholds; this assessment does not capture the target’s EU footprint, so applicability cannot be resolved here.'

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
  size: { total_assets?: number | null; employee_count?: number | null } = {},
): FrameworkApplicability[] => {
  const out: FrameworkApplicability[] = []
  const dealSize: DealSize = {
    revenue, currency,
    total_assets: size.total_assets ?? null,
    employee_count: size.employee_count ?? null,
  }
  // One push for every framework: routed through its size test where one is defined AND ready,
  // otherwise jurisdiction/sector-only. A `pending` test cannot change behaviour.
  const plain = (framework: string) => {
    const t = THRESHOLD_TESTS[framework]
    out.push(isTestActive(t) ? applyTest(t, dealSize) : { framework, applies: true, status: 'applies' })
  }

  // US — California SB 253 (statutory trigger is USD 1bn total annual revenue, doing business in CA)
  if (jurisdiction === 'USA') plain('SB 253')

  // EU — the CSRD size test is the EU-UNDERTAKING test, so it is applied ONLY to an EU target.
  // 'Global' keeps CSRD in scope but abstains: in scope to consider, not resolvable here.
  if (jurisdiction === 'European Union') plain('CSRD')
  else if (jurisdiction === 'Global') out.push(csrdNonEuAbstention())
  if (jurisdiction === 'European Union' && sector === 'Financial Services') plain('SFDR')
  if (['European Union', 'Global'].includes(jurisdiction)) plain('EU Taxonomy')
  // CS3D — the art. 2(1)(a) limbs are the EU-COMPANY test, so they are applied ONLY to an EU target.
  // 'Global' keeps CS3D in scope but abstains: art. 2(2) measures turnover generated IN THE UNION,
  // which this assessment does not collect. Same split as CSRD above.
  if (jurisdiction === 'European Union') plain('CS3D')
  else if (jurisdiction === 'Global') out.push(cs3dNonEuAbstention())

  // UK — distinct regime, NOT CSRD
  if (jurisdiction === 'UK') {
    plain('SECR')            // large UK cos: Scope 1+2 mandatory (DEFRA factors). 2-of-3, not turnover-only.
    plain('UK SRS (S1/S2)')                               // IFRS S1/S2 endorsement — voluntary now, proposed mandatory for listed FY2027+
    if (sector === 'Financial Services') {
      plain('FCA climate disclosure (TCFD)')                // FCA-regulated managers / insurers / pensions
      plain('UK SDR')                                        // sustainability disclosure + investment labels
      plain('Anti-greenwashing rule')                        // applies to all FCA-authorised firms making ESG claims
    }
  }

  // Canada — S-211 forced/child labour supply-chain reporting. 2-of-3 size test; NOT a
  // supply-chain MODULE trigger (it is a reporting obligation, not a value-chain accounting scope),
  // so it does not enter SUPPLY_CHAIN_TRIGGERS and does not price anything.
  if (jurisdiction === 'Canada') plain('Canada S-211')

  // Investor baseline (expected regardless of jurisdiction)
  plain('IFRS S2')
  plain('TCFD')
  if (sector === 'Financial Services') plain('PCAF')
  if (['Energy & Utilities', 'Industrials & Manufacturing', 'Mining & Metals'].includes(sector)) {
    if (jurisdiction === 'UK') plain('UK ETS')
    else if (['European Union', 'Global'].includes(jurisdiction)) plain('EU ETS')
  }

  return out
}

// Framework applicability — FLAT form. Unchanged contract for every existing consumer
// (getObligations, getComplianceCost, mapFramework, the frameworks jsonb column): same strings,
// same order, still string[]. `currency` defaults to USD so the old 4-arg call site still compiles.
// Near-threshold frameworks are NOT silently promoted into this list — it stays the legal in/out.
// Read getFrameworkApplicability when you need the marker.
export const getApplicableFrameworks = (
  jurisdiction: string, revenue: number, sector: string, dealType: string, currency: string = 'USD',
  size: { total_assets?: number | null; employee_count?: number | null } = {},
): string[] =>
  getFrameworkApplicability(jurisdiction, revenue, sector, dealType, currency, size)
    .filter(f => f.applies)
    .map(f => f.framework)
