// lib/ghg/resultsEmail.ts
//
// THE RESULTS EMAIL, PURE (LEAD1 L5, Oct 2026; design in docs/review/design-lead1.md section 2). Builds the subject, the
// HTML and the plain-text part from a SAVED ghg_inventories row, read back from the database after the write, and from
// nothing else. No React, no Supabase, no network: the claim route and the re-email route read the row and send
// (lib/ghg/resultsEmailSend.ts); the tests build from a fixture made by the real save path.
//
// WHAT IT STATES, AND FROM WHERE
//   totals         scope1_total, scope2_location_total, scope2_market_total: the saved columns
//   market-based   only when the saved workings carry a market-based row with a figure ("where computed")
//   s3_td          the saved workings' Scope 3 rows (NZ transmission and distribution losses), summed, on a line of its
//                  own, NEVER added to the totals (CLAUDE.md: s3_td is a distinct total)
//   by location    the saved workings, grouped by site; country from locations_data; grid region as the electricity
//                  row names the region that priced it, IN WORDS (lib/ghg/gridRegionNames.ts), never the engine code
//   market basis   plain sentences under Scope 2 market-based: what the engine priced electricity without contracts
//                  at, read from the saved market-based rows (a residual mix by name, or the same grid factors as
//                  location-based), and whether contracts or certificates counted as zero. No citations: sources
//                  are under "Emission factors"
//   by source      the saved workings rows with a figure, fuel and location-based electricity only, in the engine's
//                  order, at most SOURCE_LINE_LIMIT. The market-based rows stay in the workings, the export and the
//                  assurance package; here the basis line says what they used instead
//   editions       factor_editions, as the verifier page lists it (jurisdiction, family, source, edition), and
//                  gwp_version
// Rounding: totals and sites to 2 decimals, as step 4 of the wizard shows them; source lines to RESULT_DP, as the
// workings table shows them.
//
// ⚠️ NO "TRACEABLE TO SOURCE DOCUMENTS" CLAIM. A free calculation is typed figures; it has no uploads (design 3).
// ⚠️ NO EM DASHES. The copy here has none, and the engine's own labels pass through `plain`, which turns one into a
// colon (the NZ transmission and distribution row's label carries one).

import { GHG_TIERS } from '../pricing'
import { RESULT_DP, workingsActivityCell } from './workingsCells'
import { COUNTRY_WORDS } from './series'
import type { FactorEditions } from './factorEditions'
import { gridRegionName, residualRegionName } from './gridRegionNames'
import { emailShell, EMAIL_POSTAL_ADDRESS, EMAIL_FONT_DISPLAY } from '../email/layout'
import { INK, INK_MUTED, LINE, BRAND } from '../brand'

const FOOTER_REASON = 'Questions: hello@themisiq.co. You received this because you asked for your results on themisiq.co.'

export const SOURCE_LINE_LIMIT = 15
export const TOTAL_DP = 2

export const RESULTS_EMAIL_FROM = 'ThemisIQ <hello@themisiq.co>'
export const RESULTS_EMAIL_REPLY_TO = 'hello@themisiq.co'

export const RESULTS_EMAIL_COPY = {
  subject: (company: string, year: number) => `Your Scope 1 and Scope 2 results: ${company}, ${year}`,
  greeting: (fullName: string | null) => (fullName && fullName.trim() ? `Hello ${fullName.trim()},` : 'Hello,'),
  intro: 'Here are the results you calculated on ThemisIQ.',
  s3td: 'Scope 3, Category 3: electricity transmission and distribution losses, calculated automatically from your electricity use. Full Scope 3 needs a GHG plan.',
  s3tdNotInTotals: 'Not included in the totals above.',
  savedFree: 'This calculation is saved in your free ThemisIQ account. Open it any time:',
  savedPlan: 'This calculation is saved in your ThemisIQ account. Open it any time:',
  moreLines: (n: number) => `and ${n} more ${n === 1 ? 'line' : 'lines'} in your account`,
  notIncluded: 'Not included in your totals',
  noEditions: 'No published emission factor table priced these figures.',
  nextStep: () => {
    const price = GHG_TIERS.starter.priceUSD
    return `A GHG plan adds Scope 3, document uploads, report downloads for each framework and more inventories. Plans start at $${price?.toLocaleString('en-US')} USD a year.`
  },
  // The address comes from the shared email shell (lib/email/layout.ts), so the plain text and the HTML footer say the
  // same thing; the text is unchanged from before the shell.
  footer: `${EMAIL_POSTAL_ADDRESS} ${FOOTER_REASON}`,
  marketNoContracts: 'No green power contracts or certificates were entered, so this uses the same grid factors as the location-based figure.',
  marketResidual: (regions: string[]) => `Electricity not covered by contracts you entered uses the ${andList(regions)} residual ${regions.length > 1 ? 'mixes' : 'mix'}.`,
  marketGridWithContracts: 'Electricity not covered by contracts you entered uses the same grid factors as the location-based figure.',
  marketGridElsewhere: 'Where no residual mix applies, it uses the same grid factors as the location-based figure.',
  contractual: 'Electricity covered by contracts or certificates you entered counts as zero.',
} as const

/** The saved row's columns this email reads. Selected by the routes as RESULTS_EMAIL_COLUMNS. */
export type SavedInventoryRow = {
  id: string
  company_name: string | null
  reporting_year: number
  free_tier: boolean | null
  scope1_total: number | null
  scope2_location_total: number | null
  scope2_market_total: number | null
  workings: unknown
  locations_data: unknown
  factor_editions: FactorEditions | null
  gwp_version: string | null
}
export const RESULTS_EMAIL_COLUMNS =
  'id, company_name, reporting_year, free_tier, scope1_total, scope2_location_total, scope2_market_total, workings, locations_data, factor_editions, gwp_version'

type Row = {
  location?: string; source?: string; scope?: number; scope2_method?: string
  activity_data?: number | null; activity_unit?: string | null
  emission_factor?: string; emission_factor_display?: string; ef_source?: string
  result_tco2e?: number | null; declaration?: string
}

export type ResultsEmailModel = {
  subject: string
  greeting: string
  company: string
  year: number
  totals: { scope1: number; scope2Location: number; scope2Market: number | null }
  /** One sentence under Scope 2 market-based, or null when it was not computed. */
  marketBasis: string | null
  s3td: number | null
  locations: Array<{ name: string; country: string; gridRegion: string; scope1: number | null; scope2: number | null }>
  sourceLines: string[]
  moreLines: number
  gwpBasis: string
  editions: string[]
  savedLine: string
  link: string
  nextStep: string | null
}

const JURISDICTION_WORDS: Record<string, string> = {
  US: 'United States', CA: 'Canada', UK: 'United Kingdom', EU: 'European Union', AU: 'Australia', NZ: 'New Zealand',
}
const FAMILY_WORDS: Record<string, string> = { combustion: 'Fuel combustion', electricity: 'Electricity', steam: 'Steam' }

/** Engine labels as plain text: an em dash becomes a colon. */
export function plain(s: string): string {
  return s.replace(/\s*—\s*/g, ': ')
}

export const tonnes = (n: number, dp = TOTAL_DP) => `${n.toFixed(dp)} tCO\u2082e`

function andList(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

// The unit after "kg CO₂e/" in the singular: a factor is per therm, per US gallon, per litre. The workings keep the
// engine's own string; this is the email's reading of it.
const SINGULAR: Record<string, string> = {
  therms: 'therm', 'US gallons': 'US gallon', gallons: 'gallon', litres: 'litre', liters: 'liter', tonnes: 'tonne',
  'short tons': 'short ton', lbs: 'lb', mmbtu: 'MMBtu', mcf: 'Mcf', ccf: 'Ccf', kwh: 'kWh', mwh: 'MWh', gj: 'GJ', mj: 'MJ', m3: 'm\u00b3',
}
export function perUnitFactor(factor: string): string {
  return factor.replace(/kg CO\u2082e\/(.+)$/, (_m, u: string) => `kg CO\u2082e/${SINGULAR[u] ?? SINGULAR[u.toLowerCase()] ?? u}`)
}

/** An edition label adds nothing when its every number is already in the source's name (eGRID2023, edition 2023). */
export function editionAddsSomething(source: string, edition: string): boolean {
  const nums = edition.match(/\d+(?:\.\d+)?/g) ?? []
  if (nums.length === 0) return !source.includes(edition)
  return nums.some(n => !source.includes(n))
}

const rowsOf = (workings: unknown): Row[] => (Array.isArray(workings) ? (workings as Row[]).filter(r => r && typeof r === 'object') : [])
const priced = (r: Row) => typeof r.result_tco2e === 'number' && Number.isFinite(r.result_tco2e)
/** The engine's grid code from a location-based electricity row: `Electricity (${usedRegion})`. */
const gridCodeOf = (r: Row) => /^Electricity \(([^,()]+)\)$/.exec(r.source ?? '')?.[1] ?? null

/** A workings row's source label with any grid or residual-mix region code given as its name. */
function sourceWords(r: Row): string {
  const src = r.source ?? 'Source'
  const grid = gridCodeOf(r)
  if (grid) return `Electricity (${gridRegionName(grid) ?? 'grid'})`
  return src.replace(/residual mix ([^)]+)\)$/, (_m, code: string) => `residual mix ${residualRegionName(code) ?? 'regional'})`)
}

/**
 * The market-based basis sentence, from the saved market-based rows. The engine labels each one either
 * `Electricity (S2 market-based, residual mix {region})` or `Electricity (S2 market-based, location-factor fallback)`
 * (lib/ghg/engine.ts buildWorkings), and cites what priced it in ef_source; the fallback is priced by the site's
 * location-based grid factor, so its region is that site's grid region.
 */
function marketBasisOf(rows: Row[]): string | null {
  const market = rows.filter(r => r.scope === 2 && r.scope2_method === 'market-based' && priced(r))
  if (market.length === 0) return null
  const residual: string[] = []
  let grid = false
  for (const r of market) {
    const code = /residual mix ([^)]+)\)$/.exec(r.source ?? '')?.[1]
    if (!code) { grid = true; continue }
    const name = residualRegionName(code) ?? 'regional'
    if (!residual.includes(name)) residual.push(name)
  }
  // Contractual instruments reduce the market-based activity below the site's metered kWh.
  const covered = market.some(m => {
    const loc = rows.find(r => r.location === m.location && r.scope === 2 && r.scope2_method === 'location-based')
    return !!loc && typeof loc.activity_data === 'number' && typeof m.activity_data === 'number' && m.activity_data < loc.activity_data
  })
  const out: string[] = []
  if (residual.length > 0) out.push(RESULTS_EMAIL_COPY.marketResidual(residual))
  if (grid) {
    out.push(residual.length > 0 ? RESULTS_EMAIL_COPY.marketGridElsewhere
      : covered ? RESULTS_EMAIL_COPY.marketGridWithContracts
      : RESULTS_EMAIL_COPY.marketNoContracts)
  }
  if (covered) out.push(RESULTS_EMAIL_COPY.contractual)
  return out.join(' ')
}

function countryWords(code: unknown): string {
  if (typeof code !== 'string' || !code.trim()) return 'Country not set'
  const w = COUNTRY_WORDS[code.trim().toUpperCase()]
  return w ? w.replace(/^the /, '') : code.trim().toUpperCase()
}

/** The model: every figure and sentence the email states, from the saved row. Tested directly. */
export function resultsEmailModel(input: { row: SavedInventoryRow; fullName: string | null; siteUrl: string }): ResultsEmailModel {
  const { row } = input
  const company = (row.company_name ?? '').trim() || 'Your company'
  const rows = rowsOf(row.workings)
  const scope12 = rows.filter(r => r.scope === 1 || r.scope === 2)

  const marketRows = rows.filter(r => r.scope === 2 && r.scope2_method === 'market-based' && priced(r))
  const s3Rows = rows.filter(r => r.scope === 3 && priced(r))
  const s3td = s3Rows.length > 0 ? s3Rows.reduce((a, r) => a + (r.result_tco2e as number), 0) : null

  // Sites in the order the workings list them, then any site in locations_data the workings never reached.
  const locs = Array.isArray(row.locations_data) ? (row.locations_data as Array<{ name?: string; country?: string }>) : []
  const names: string[] = []
  for (const r of rows) { const n = r.location ?? 'Location'; if (!names.includes(n)) names.push(n) }
  for (const l of locs) { const n = l?.name || 'Location'; if (!names.includes(n)) names.push(n) }
  // In words, never the engine code. A code with no name (none today: gridRegionNames.test.ts) reads as the
  // country's grid rather than as the code.
  const gridWords = (code: string | null, c: unknown) =>
    !code ? 'Not applicable' : gridRegionName(code) ?? `${countryWords(c)} grid`
  const locations = names.map(name => {
    const mine = rows.filter(r => (r.location ?? 'Location') === name)
    const excluded = mine.some(r => r.declaration === 'unpriceable' || (r.declaration ?? '').startsWith('country_'))
    const s1 = mine.filter(r => r.scope === 1 && priced(r))
    const s2 = mine.filter(r => r.scope === 2 && r.scope2_method === 'location-based' && priced(r))
    const loc = locs.find(l => (l?.name || 'Location') === name)
    return {
      name: plain(name),
      country: countryWords(loc?.country),
      gridRegion: gridWords(s2.map(gridCodeOf).find(Boolean) ?? null, loc?.country),
      scope1: excluded ? null : s1.reduce((a, r) => a + (r.result_tco2e as number), 0),
      scope2: excluded ? null : s2.reduce((a, r) => a + (r.result_tco2e as number), 0),
    }
  })

  const lines = scope12.filter(r => priced(r) && r.scope2_method !== 'market-based').map(r => {
    const factor = r.emission_factor_display ?? r.emission_factor
    return plain(`${r.location ?? 'Location'}, ${sourceWords(r)}: ${workingsActivityCell(r)}${factor ? ` at ${perUnitFactor(factor)}` : ''} = ${tonnes(r.result_tco2e as number, RESULT_DP)}`)
  })

  const editions: string[] = []
  for (const [j, families] of Object.entries(row.factor_editions ?? {})) {
    for (const [f, ed] of Object.entries(families ?? {})) {
      if (ed && typeof ed.source === 'string') {
        const edition = ed.edition && editionAddsSomething(ed.source, String(ed.edition)) ? `, edition ${ed.edition}` : ''
        editions.push(plain(`${JURISDICTION_WORDS[j] ?? j}, ${FAMILY_WORDS[f] ?? f}: ${ed.source}${edition}`))
      }
    }
  }

  const free = row.free_tier === true
  return {
    subject: RESULTS_EMAIL_COPY.subject(company, row.reporting_year),
    greeting: RESULTS_EMAIL_COPY.greeting(input.fullName),
    company,
    year: row.reporting_year,
    totals: {
      scope1: row.scope1_total ?? 0,
      scope2Location: row.scope2_location_total ?? 0,
      scope2Market: marketRows.length > 0 ? (row.scope2_market_total ?? 0) : null,
    },
    marketBasis: marketBasisOf(rows),
    s3td,
    locations,
    sourceLines: lines.slice(0, SOURCE_LINE_LIMIT),
    moreLines: Math.max(0, lines.length - SOURCE_LINE_LIMIT),
    gwpBasis: row.gwp_version || 'AR6',
    editions,
    savedLine: free ? RESULTS_EMAIL_COPY.savedFree : RESULTS_EMAIL_COPY.savedPlan,
    link: `${input.siteUrl.replace(/\/+$/, '')}/dashboard/ghg?id=${encodeURIComponent(row.id)}`,
    // The plan sentence is for a free account; a paid account already has what it lists.
    nextStep: free ? RESULTS_EMAIL_COPY.nextStep() : null,
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function resultsEmailText(m: ResultsEmailModel): string {
  const out: string[] = [m.greeting, '', RESULTS_EMAIL_COPY.intro, '', `${m.company}, ${m.year}`, '', 'Totals']
  out.push(`Scope 1: ${tonnes(m.totals.scope1)}`)
  out.push(`Scope 2, location-based: ${tonnes(m.totals.scope2Location)}`)
  if (m.totals.scope2Market !== null) out.push(`Scope 2, market-based: ${tonnes(m.totals.scope2Market)}`)
  if (m.marketBasis) out.push(m.marketBasis)
  if (m.s3td !== null) out.push('', RESULTS_EMAIL_COPY.s3td, `${tonnes(m.s3td)}. ${RESULTS_EMAIL_COPY.s3tdNotInTotals}`)
  out.push('', 'By location')
  for (const l of m.locations) {
    out.push(l.scope1 === null
      ? `${l.name} (${l.country}, grid region ${l.gridRegion}): ${RESULTS_EMAIL_COPY.notIncluded}`
      : `${l.name} (${l.country}, grid region ${l.gridRegion}): Scope 1 ${tonnes(l.scope1)}, Scope 2 ${tonnes(l.scope2 ?? 0)}`)
  }
  out.push('', 'By source')
  for (const s of m.sourceLines) out.push(s)
  if (m.moreLines > 0) out.push(RESULTS_EMAIL_COPY.moreLines(m.moreLines))
  out.push('', 'Emission factors', `GWP basis: ${m.gwpBasis}`)
  for (const e of m.editions.length > 0 ? m.editions : [RESULTS_EMAIL_COPY.noEditions]) out.push(e)
  out.push('', `${m.savedLine} ${m.link}`)
  if (m.nextStep) out.push('', m.nextStep)
  out.push('', RESULTS_EMAIL_COPY.footer)
  return out.join('\n')
}

// HTML: the shared shell (lib/email/layout.ts: masthead, content, footer with the postal address) around one column of
// plain content. Tables for alignment, inline styles, colours from lib/brand.ts, no buttons, nothing that reads as
// marketing. The plain-text part (resultsEmailText) is separate and unchanged by the shell.
const p = (s: string, extra = '') => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${INK};${extra}">${s}</p>`
const h = (s: string) => `<p class="email-display" style="margin:22px 0 8px;font-size:15px;font-weight:600;color:${INK};font-family:${EMAIL_FONT_DISPLAY};">${esc(s)}</p>`
const tr = (a: string, b: string) => `<tr><td style="padding:6px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};">${a}</td><td style="padding:6px 0 6px 16px;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};text-align:right;white-space:nowrap;">${b}</td></tr>`
const table = (rows: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table>`

export function resultsEmailHtml(m: ResultsEmailModel): string {
  const parts: string[] = []
  parts.push(p(esc(m.greeting)), p(esc(RESULTS_EMAIL_COPY.intro)))
  parts.push(`<p class="email-display" style="margin:0 0 4px;font-size:20px;line-height:1.3;color:${INK};font-family:${EMAIL_FONT_DISPLAY};">${esc(m.company)}, ${m.year}</p>`)
  parts.push(h('Totals'))
  parts.push(table([
    tr('Scope 1', tonnes(m.totals.scope1)),
    tr('Scope 2, location-based', tonnes(m.totals.scope2Location)),
    ...(m.totals.scope2Market !== null ? [tr('Scope 2, market-based', tonnes(m.totals.scope2Market))] : []),
  ].join('')))
  if (m.marketBasis) parts.push(p(esc(m.marketBasis), `margin-top:8px;font-size:12px;color:${INK_MUTED};`))
  if (m.s3td !== null) {
    parts.push(p(`${esc(RESULTS_EMAIL_COPY.s3td)}<br><strong>${tonnes(m.s3td)}</strong>. ${esc(RESULTS_EMAIL_COPY.s3tdNotInTotals)}`, `margin-top:12px;font-size:13px;color:${INK_MUTED};`))
  }
  parts.push(h('By location'))
  parts.push(table(m.locations.map(l => tr(
    `${esc(l.name)}<br><span style="font-size:12px;color:${INK_MUTED};">${esc(l.country)}, grid region ${esc(l.gridRegion)}</span>`,
    l.scope1 === null ? esc(RESULTS_EMAIL_COPY.notIncluded) : `Scope 1 ${tonnes(l.scope1)}<br>Scope 2 ${tonnes(l.scope2 ?? 0)}`,
  )).join('')))
  parts.push(h('By source'))
  parts.push(m.sourceLines.map(s => p(esc(s), 'margin-bottom:6px;font-size:13px;')).join(''))
  if (m.moreLines > 0) parts.push(p(esc(RESULTS_EMAIL_COPY.moreLines(m.moreLines)), `font-size:13px;color:${INK_MUTED};`))
  parts.push(h('Emission factors'))
  parts.push(p(`GWP basis: ${esc(m.gwpBasis)}`, 'margin-bottom:6px;font-size:13px;'))
  parts.push((m.editions.length > 0 ? m.editions : [RESULTS_EMAIL_COPY.noEditions]).map(e => p(esc(e), 'margin-bottom:6px;font-size:13px;')).join(''))
  parts.push(p(`${esc(m.savedLine)} <a href="${esc(m.link)}" style="color:${BRAND};">${esc(m.link)}</a>`, 'margin-top:20px;'))
  if (m.nextStep) parts.push(p(esc(m.nextStep)))
  return emailShell({
    title: m.subject,
    preheader: `${m.company}, ${m.year}: Scope 1 ${tonnes(m.totals.scope1)}, Scope 2 ${tonnes(m.totals.scope2Location)}.`,
    contentHtml: parts.join(''),
    footerLines: [FOOTER_REASON],
    // ⚠️ L6: the marketing unsubscribe link goes here, and only when marketing consent was given (design 2, item 8).
    footerExtraHtml: '',
  })
}

export type ResultsEmail = { subject: string; html: string; text: string }

export function buildResultsEmail(input: { row: SavedInventoryRow; fullName: string | null; siteUrl: string }): ResultsEmail {
  const m = resultsEmailModel(input)
  return { subject: m.subject, html: resultsEmailHtml(m), text: resultsEmailText(m) }
}
