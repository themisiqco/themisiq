// lib/s211/reportPatch.ts
// Which report columns the client may change, and how each is checked. Pure. Anything else in the body
// is ignored, so user_id, status and the timestamps cannot be written from the browser this way.

/** Columns the reports list shows. */
export const REPORT_LIST_COLUMNS = 'id, company_name, reporting_year, status, created_at, updated_at'
/** Columns one report's page reads: the entity-test inputs and the dates. */
export const REPORT_COLUMNS =
  'id, company_name, reporting_year, financial_year_end, listed_in_canada, place_of_business_in_canada, does_business_in_canada, has_assets_in_canada, ' +
  'recent_fy_assets, recent_fy_revenue, recent_fy_avg_employees, recent_fy_currency, prior_fy_assets, prior_fy_revenue, prior_fy_avg_employees, prior_fy_currency, ' +
  'status, created_at, updated_at'

const BOOL = ['listed_in_canada', 'place_of_business_in_canada', 'does_business_in_canada', 'has_assets_in_canada'] as const
const MONEY = ['recent_fy_assets', 'recent_fy_revenue', 'prior_fy_assets', 'prior_fy_revenue'] as const
const COUNT = ['recent_fy_avg_employees', 'prior_fy_avg_employees'] as const
const CURRENCY = ['recent_fy_currency', 'prior_fy_currency'] as const

export type ReportPatch = Record<string, string | number | boolean | null>

export function cleanReportPatch(body: unknown): { ok: true; patch: ReportPatch } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Nothing to save.' }
  const b = body as Record<string, unknown>
  const patch: ReportPatch = {}
  if ('company_name' in b) {
    const v = typeof b.company_name === 'string' ? b.company_name.trim() : ''
    if (!v) return { ok: false, error: 'Enter the company name.' }
    patch.company_name = v.slice(0, 300)
  }
  if ('financial_year_end' in b) {
    const v = b.financial_year_end
    if (v !== null && !(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))) return { ok: false, error: 'The financial year end is not a date.' }
    patch.financial_year_end = v as string | null
  }
  for (const k of BOOL) if (k in b) {
    const v = b[k]
    if (v !== null && typeof v !== 'boolean') return { ok: false, error: `${k} must be yes, no or not answered.` }
    patch[k] = v as boolean | null
  }
  for (const k of [...MONEY, ...COUNT]) if (k in b) {
    const v = b[k]
    if (v === null || v === '') { patch[k] = null; continue }
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Figures must be zero or more.' }
    patch[k] = n
  }
  for (const k of CURRENCY) if (k in b) {
    const v = b[k]
    if (v === null || v === '') { patch[k] = null; continue }
    const code = typeof v === 'string' ? v.trim().toUpperCase() : ''
    if (!/^[A-Z]{3}$/.test(code)) return { ok: false, error: 'A currency is a three-letter code, such as CAD.' }
    patch[k] = code
  }
  return { ok: true, patch }
}
