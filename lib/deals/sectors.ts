// lib/deals/sectors.ts
// ThemisIQ Deals: the sector list, the values stored before it, and which rules each sector drives.
//
// DATA ONLY. No engine import, so the wizard, the engine and the export can all read it. The risk
// templates themselves stay in lib/deals/assessment.ts (SECTOR_RISKS, keyed by the ORIGINAL sector
// names); SECTOR_TEMPLATE_SOURCE below says which of them each sector uses.
//
// ⚠️ EVERY VALUE STORED BEFORE 29 SEP 2026 MUST PRINT EXACTLY WHAT IT PRINTED BEFORE. Stored values are
// not rewritten (LEGACY_SECTORS, decision of 29 Sep 2026), so a deal saved as 'Technology' or
// 'Energy & Utilities' still carries that string, and every set below includes the old values that
// were in the old literal lists. lib/deals/sectors.test.ts pins each set against those old lists.

// ── The list ─────────────────────────────────────────────────────────────────────────────────────

/** The sectors the wizard offers, in its order. Stored as written. */
export const SECTORS = [
  'Oil & Gas',
  'Power & Utilities (incl. renewables)',
  'Mining & Metals',
  'Chemicals',
  'Construction & Materials',
  'Industrials & Manufacturing',
  'Automotive & Transport Equipment',
  'Transport & Logistics',
  'Agriculture, Food & Beverage',
  'Consumer Goods & Apparel',
  'Retail & E-commerce',
  'Hospitality, Leisure & Travel',
  'Healthcare & Pharma',
  'Technology & Software',
  'Telecommunications & Media',
  'Banking & Lending',
  'Insurance',
  'Asset Management & Private Capital',
  'Real Estate',
  'Professional & Business Services',
  'Waste, Water & Environmental Services',
  'Other (describe)',
] as const
export type Sector = typeof SECTORS[number]
export const OTHER_SECTOR: Sector = 'Other (describe)'

/**
 * Values from the list before 29 Sep 2026 that are not in it now. `resolvesTo` is the new sector a 1:1
 * rename maps to; null where the old value split into several and the user must choose (Energy &
 * Utilities, Financial Services, Consumer & Retail). Either way a legacy value keeps its OLD templates
 * and rules until the deal is re-saved with a new sector: nothing about an existing deal changes.
 * Six old values kept their names (Real Estate, Healthcare & Pharma, Industrials & Manufacturing,
 * Transport & Logistics, Mining & Metals, Construction & Materials) and are simply in SECTORS.
 */
export const LEGACY_SECTORS: Readonly<Record<string, { resolvesTo: Sector | null; candidates: readonly Sector[] }>> = {
  'Energy & Utilities': { resolvesTo: null, candidates: ['Oil & Gas', 'Power & Utilities (incl. renewables)'] },
  'Financial Services': { resolvesTo: null, candidates: ['Banking & Lending', 'Insurance', 'Asset Management & Private Capital'] },
  'Consumer & Retail': { resolvesTo: null, candidates: ['Consumer Goods & Apparel', 'Retail & E-commerce'] },
  'Technology': { resolvesTo: 'Technology & Software', candidates: ['Technology & Software'] },
  'Agriculture & Food': { resolvesTo: 'Agriculture, Food & Beverage', candidates: ['Agriculture, Food & Beverage'] },
  'Professional Services': { resolvesTo: 'Professional & Business Services', candidates: ['Professional & Business Services'] },
  'Other': { resolvesTo: 'Other (describe)', candidates: ['Other (describe)'] },
}
export const LEGACY_SECTOR_VALUES = Object.keys(LEGACY_SECTORS)

/**
 * A stored sector as the engine reads it. '' and whitespace-only are NO SECTOR, exactly like NULL:
 * three production deals carry '' today, and a blank must never be matched as though it named one.
 */
export const normalizeSector = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

// ── Which templates each sector uses ─────────────────────────────────────────────────────────────
//
// `from` is a SECTOR_RISKS key (an original sector name); `risks`, where given, keeps only those
// templates. Wired ONLY where a template applies UNCHANGED. A sector whose templates need adapting or
// writing has none yet (null) and prints the "no template" sentence until they are researched.
// A legacy value is not listed here: it keeps its own whole template set (see sectorTemplates).
export const SECTOR_TEMPLATE_SOURCE: Readonly<Record<Sector, { from: string; risks?: readonly string[] } | null>> = {
  'Oil & Gas': { from: 'Energy & Utilities' },                            // a methane template to follow
  'Power & Utilities (incl. renewables)': {
    from: 'Energy & Utilities',
    // Stranded fossil assets is the one to adapt for renewables and networks, so it waits.
    risks: ['High Scope 1 emissions exposure', 'Physical climate risk exposure'],
  },
  'Mining & Metals': { from: 'Mining & Metals' },
  'Chemicals': null,                                                      // adapted from Industrials
  'Construction & Materials': { from: 'Construction & Materials' },
  'Industrials & Manufacturing': { from: 'Industrials & Manufacturing' },
  'Automotive & Transport Equipment': null,                               // new and adapted
  'Transport & Logistics': { from: 'Transport & Logistics' },
  'Agriculture, Food & Beverage': { from: 'Agriculture & Food' },
  'Consumer Goods & Apparel': { from: 'Consumer & Retail' },
  'Retail & E-commerce': null,                                            // adapted from Consumer & Retail
  'Hospitality, Leisure & Travel': null,                                  // new
  'Healthcare & Pharma': { from: 'Healthcare & Pharma' },
  'Technology & Software': { from: 'Technology' },
  'Telecommunications & Media': null,                                     // adapted from Technology
  'Banking & Lending': {
    from: 'Financial Services',
    risks: ['Financed emissions (Scope 3 Cat.15)', 'Physical risk in loan book'],
  },
  'Insurance': null,                                                      // adapted and new
  'Asset Management & Private Capital': {
    from: 'Financial Services',
    risks: ['Financed emissions (Scope 3 Cat.15)', 'SFDR portfolio alignment'],
  },
  'Real Estate': { from: 'Real Estate' },
  'Professional & Business Services': { from: 'Professional Services' },
  'Waste, Water & Environmental Services': null,                          // new
  'Other (describe)': null,
}

// ── Which sectors the wizard offers ──────────────────────────────────────────────────────────────
//
// ONE FLAG PER SECTOR (29 Sep 2026). A sector is offered only once it has at least one template, so a
// user is never steered to a sector that would print "no template" where a close neighbour has
// findings (a chemicals company picks Industrials & Manufacturing until Chemicals has its own).
// Hidden sectors stay in SECTORS: stored values, rules and the share gate still know them. "Other
// (describe)" is always offered. lib/deals/sectors.test.ts fails if a ready sector has no template.
export const SECTOR_READY: Readonly<Record<Sector, boolean>> = {
  'Oil & Gas': true,
  'Power & Utilities (incl. renewables)': true,
  'Mining & Metals': true,
  'Chemicals': false,
  'Construction & Materials': true,
  'Industrials & Manufacturing': true,
  'Automotive & Transport Equipment': false,
  'Transport & Logistics': true,
  'Agriculture, Food & Beverage': true,
  'Consumer Goods & Apparel': true,
  'Retail & E-commerce': false,
  'Hospitality, Leisure & Travel': false,
  'Healthcare & Pharma': true,
  'Technology & Software': true,
  'Telecommunications & Media': false,
  'Banking & Lending': true,
  'Insurance': false,
  'Asset Management & Private Capital': true,
  'Real Estate': true,
  'Professional & Business Services': true,
  'Waste, Water & Environmental Services': false,
  'Other (describe)': true,
}
/** The sectors the wizard's dropdown offers, in SECTORS order. */
export const VISIBLE_SECTORS: readonly Sector[] = SECTORS.filter(s => SECTOR_READY[s])

// ── Sets that drive rules ────────────────────────────────────────────────────────────────────────
//
// Each is the old literal list, extended with new sectors. The old values stay in, so a deal saved
// before 29 Sep 2026 is treated as it was.

/**
 * High-emissions sectors: the value-at-risk band, the GHG cost item and the consultant ×1.25 scaling.
 * Old list: Energy & Utilities, Industrials & Manufacturing, Mining & Metals, Transport & Logistics,
 * Agriculture & Food. Construction & Materials added 29 Sep 2026 by decision: it kept its name, so this
 * changes its figures, and no production deal carried it on that date.
 */
export const HEAVY_SECTORS: ReadonlySet<string> = new Set([
  'Energy & Utilities', 'Industrials & Manufacturing', 'Mining & Metals', 'Transport & Logistics', 'Agriculture & Food',
  'Oil & Gas', 'Power & Utilities (incl. renewables)', 'Chemicals', 'Construction & Materials',
  'Agriculture, Food & Beverage', 'Waste, Water & Environmental Services',
])

/**
 * Sectors that get the EU / UK ETS APPLIES: VERIFY row (covered installations or activities). A
 * narrower set than HEAVY_SECTORS, as it always was. Old list: Energy & Utilities, Industrials &
 * Manufacturing, Mining & Metals. Construction & Materials added 29 Sep 2026 by decision (cement, lime
 * and other mineral installations), with the same no-production-deal note as HEAVY_SECTORS.
 *
 * ⚠️ WASTE, WATER & ENVIRONMENTAL SERVICES STAYS OUT (decision of 29 Sep 2026). ETS coverage of waste
 * incineration is to be handled as a DATED RISK FINDING in the template stage, where it can state when
 * and how incineration comes into scope, rather than as a verify row inferred from the sector.
 */
export const ETS_SECTORS: ReadonlySet<string> = new Set([
  'Energy & Utilities', 'Industrials & Manufacturing', 'Mining & Metals',
  'Oil & Gas', 'Power & Utilities (incl. renewables)', 'Chemicals', 'Construction & Materials',
])

/** Financial sectors: the value-at-risk band and the PCAF cost item. Old list: Financial Services. */
export const FINANCIAL_SECTORS: ReadonlySet<string> = new Set([
  'Financial Services', 'Banking & Lending', 'Insurance', 'Asset Management & Private Capital',
])

/**
 * The financial-services rules, each attached to the sectors it can reach (decision of 29 Sep 2026).
 * Legacy 'Financial Services' keeps every one of them, as before.
 */
export const FINANCIAL_RULE_SECTORS = {
  SFDR: new Set(['Financial Services', 'Banking & Lending', 'Insurance', 'Asset Management & Private Capital']),
  PCAF: new Set(['Financial Services', 'Banking & Lending', 'Insurance', 'Asset Management & Private Capital']),
  FCA_CLIMATE: new Set(['Financial Services', 'Insurance', 'Asset Management & Private Capital']),
  UK_SDR: new Set(['Financial Services', 'Asset Management & Private Capital']),
  ANTI_GREENWASHING: new Set(['Financial Services', 'Banking & Lending', 'Insurance', 'Asset Management & Private Capital']),
} as const satisfies Record<string, ReadonlySet<string>>

/** The FLAG (land-sector) caveat in the cost section. Old list: Agriculture & Food. */
export const FLAG_SECTORS: ReadonlySet<string> = new Set(['Agriculture & Food', 'Agriculture, Food & Beverage'])
