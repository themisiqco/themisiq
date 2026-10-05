// lib/ghg/freeCalc.ts
//
// The free calculation's rules, PURE (LEAD1 L3, Oct 2026; design in docs/review/design-lead1.md sections 1.5 to 1.6
// and 3). No Supabase, no network: the two routes (app/api/ghg/free-calc/pending and /claim) and their service
// (lib/ghg/freeCalcService.ts) call these, and the tests call them directly.
//
//   validateHold        what /pending accepts: a work email, a name, a company, and a calculation of sane size
//   inventoryFromDraft  the calculation rebuilt from the draft over the wizard's own defaults
//   inventoryRow        the ghg_inventories row, FIGURES RECOMPUTED HERE by figuresForSave; client totals ignored
//   decideClaim         insert, replace the free row, or stop with a choice; never updates a real inventory

import { emptyLocation, type Inventory, type Location } from './engine'
import { figuresForSave } from './savePayload'
import { parseGhgDraft, type GhgDraft } from './draftParse'
import { defaultReportingYear } from '../reportingYears'
import { emailKey } from '../emailKey'
import { isDisposableEmail, DISPOSABLE_EMAIL_MESSAGE } from '../disposableEmailDomains'

export const PENDING_TTL_MS = 24 * 60 * 60 * 1000
export const MAX_PAYLOAD_BYTES = 256 * 1024
export const MAX_LOCATIONS = 50
export const MAX_TEXT = 200

/** The customer-facing sentences the routes return. One place, so L4's screens and the tests read the same words. */
export const FREE_CALC_MESSAGES = {
  invalidEmail: 'Enter a valid work email address.',
  missingName: 'Enter your name.',
  missingCompany: 'Enter your company name.',
  noCalculation: 'There is no calculation to keep. Enter your figures first.',
  tooLarge: `This calculation is too large to keep for free. A free calculation holds up to ${MAX_LOCATIONS} sites.`,
  captchaFailed: 'The security check didn’t complete. Please try again.',
  rateLimited: 'Too many requests from here in a short time. Wait a little and try again.',
  nothingToClaim: 'There is no calculation waiting for this email address. Enter your figures again to keep them.',
  expired: 'This calculation was kept for 24 hours and has expired. Enter your figures again to keep them.',
  emailMismatch: 'This calculation was started with a different email address. Sign in with that address to keep it.',
  // L7 (design section 6)
  workEmail: DISPOSABLE_EMAIL_MESSAGE,
  claimRateLimited: 'Too many free accounts have been set up from this connection today. Try again tomorrow, or email hello@themisiq.co.',
  oneFree: (company: string, year: number) =>
    `Your free account keeps one calculation: ${company || 'your company'}, ${year}.`,
  conflict: (company: string, year: number) =>
    `You already have a ${year} inventory for "${company}".`,
} as const

export type HoldInput = { email: string; emailKey: string; fullName: string; company: string; draft: GhgDraft }
export type Invalid = { ok: false; code: string; message: string }

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** A deliberately plain check: one @, something either side, a dot in the domain, no spaces. */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320
}

/** What /pending accepts. The calculation is parsed by the wizard's own draft parser (lib/ghg/draft.ts). */
export function validateHold(body: unknown): { ok: true; value: HoldInput } | Invalid {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const email = text(o.email)
  if (!isPlausibleEmail(email)) return { ok: false, code: 'invalid_email', message: FREE_CALC_MESSAGES.invalidEmail }
  // L7: throwaway inboxes are refused; free webmail is not (lib/disposableEmailDomains.ts).
  if (isDisposableEmail(email)) return { ok: false, code: 'disposable_email', message: FREE_CALC_MESSAGES.workEmail }
  const fullName = text(o.fullName).slice(0, MAX_TEXT)
  if (!fullName) return { ok: false, code: 'missing_name', message: FREE_CALC_MESSAGES.missingName }
  const company = text(o.company).slice(0, MAX_TEXT)
  if (!company) return { ok: false, code: 'missing_company', message: FREE_CALC_MESSAGES.missingCompany }
  const draft = checkDraft(o.inventory)
  if (!draft.ok) return draft
  // L7: the normalised key (lib/emailKey.ts) for the rate limit and the hold, the same one /claim looks up.
  return { ok: true, value: { email, emailKey: emailKey(email), fullName, company, draft: draft.draft } }
}

/** The calculation itself: parseable, at most MAX_LOCATIONS sites, at most MAX_PAYLOAD_BYTES as JSON. */
export function checkDraft(inventory: unknown): { ok: true; draft: GhgDraft } | Invalid {
  const draft = parseGhgDraft(inventory)
  if (!draft || !draft.locations) return { ok: false, code: 'no_calculation', message: FREE_CALC_MESSAGES.noCalculation }
  if (draft.locations.length > MAX_LOCATIONS || JSON.stringify(inventory).length > MAX_PAYLOAD_BYTES) {
    return { ok: false, code: 'too_large', message: FREE_CALC_MESSAGES.tooLarge }
  }
  return { ok: true, draft }
}

/**
 * The calculation, rebuilt over the wizard's defaults (app/dashboard/ghg/page.tsx, the initial inventory), the same
 * way the wizard restores a draft: every location spread over emptyLocation(), so a missing field takes its default.
 * `company` is the name typed in the form, used when the calculation itself carries none.
 */
export function inventoryFromDraft(draft: GhgDraft, company: string, now: Date = new Date()): Inventory {
  const locations = (draft.locations ?? []).map((l, i) =>
    ({ ...emptyLocation(String(i + 1), `Location ${i + 1}`), ...(l as object) }) as Location)
  return {
    company_name: (draft.company_name ?? '').trim() || company.trim(),
    company_id: null,
    reporting_year: draft.reporting_year ?? defaultReportingYear(now),
    revenue_millions: draft.revenue_millions ?? 0,
    employee_count: draft.employee_count ?? 0,
    boundary_approach: draft.boundary_approach ?? 'operational_control',
    california_nexus: draft.california_nexus ?? false,
    fiscal_year_end_month: draft.fiscal_year_end_month ?? 12,
    coverage_resolutions: [],
    prior_year_s1: draft.prior_year_s1 ?? 0,
    prior_year_s2: draft.prior_year_s2 ?? 0,
    selected_frameworks: draft.selected_frameworks ?? ['sb253'],
    locations: locations.length > 0 ? locations : [emptyLocation('1', 'Location 1')],
  } as Inventory
}

/**
 * The ghg_inventories row, the same columns the wizard's Save writes, with every figure computed HERE by
 * figuresForSave (lib/ghg/savePayload.ts). Nothing the client calculated is stored as a figure.
 */
export function inventoryRow(inv: Inventory, userId: string, companyId: string, freeTier: boolean, now: Date = new Date()) {
  const saved = figuresForSave(inv, 'AR6')
  const rev = inv.revenue_millions
  return {
    user_id: userId,
    reporting_year: inv.reporting_year,
    fiscal_year_end_month: inv.fiscal_year_end_month,
    company_name: inv.company_name,
    company_id: companyId,
    revenue_millions: rev,
    employee_count: inv.employee_count,
    boundary_approach: inv.boundary_approach,
    california_nexus: inv.california_nexus,
    prior_year_s1: inv.prior_year_s1,
    prior_year_s2: inv.prior_year_s2,
    comparability_disclosure: null,
    selected_frameworks: inv.selected_frameworks,
    locations_data: saved.locations_data,
    coverage_resolutions: [],
    pct_estimated: saved.pct_estimated,
    scope1_total: saved.totals.s1_total,
    scope2_location_total: saved.totals.s2_location,
    scope2_market_total: saved.totals.s2_market,
    scope1_intensity: rev > 0 ? saved.totals.s1_total / rev : 0,
    scope2_intensity: rev > 0 ? saved.totals.s2_location / rev : 0,
    derivation_version: saved.derivation_version,
    gwp_version: 'AR6',
    factor_editions: saved.factor_editions,
    workings: saved.workings,
    status: 'draft',
    free_tier: freeTier,
    updated_at: now.toISOString(),
  }
}

export type OwnInventory = { id: string; company_name: string | null; reporting_year: number; free_tier: boolean }
export type ClaimDecision =
  | { action: 'insert' }
  | { action: 'replace_free'; id: string }
  | { action: 'one_free'; free: OwnInventory }
  | { action: 'conflict'; existing: OwnInventory }

/**
 * What the claim does with the account's inventories as they are. ⚠️ IT NEVER UPDATES A REAL INVENTORY (design 1.5b):
 * the only row it may update is the account's own free calculation, and only when the customer chose "Replace it"
 * (replaceFreeId). A collision with any other row on (company, year), the unique key, stops with a choice.
 */
export function decideClaim(input: {
  rows: OwnInventory[]
  target: { company_name: string; reporting_year: number }
  active: boolean
  replaceFreeId?: string | null
}): ClaimDecision {
  const { rows, target, active } = input
  const collision = rows.find(r => (r.company_name ?? '') === target.company_name && r.reporting_year === target.reporting_year)
  const free = rows.find(r => r.free_tier)
  const replacing = !!free && !!input.replaceFreeId && input.replaceFreeId === free.id

  if (!active && free && !replacing) return { action: 'one_free', free }
  if (collision && !(replacing && free && collision.id === free.id)) return { action: 'conflict', existing: collision }
  if (replacing && free) return { action: 'replace_free', id: free.id }
  return { action: 'insert' }
}

/** The country the leads view records: the first site's, from the calculation. */
export function firstCountry(inv: Inventory): string | null {
  const c = (inv.locations?.[0] as { country?: unknown } | undefined)?.country
  return typeof c === 'string' && c.trim() ? c.trim().toUpperCase().slice(0, 2) : null
}
