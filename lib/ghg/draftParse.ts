// lib/ghg/draftParse.ts
//
// The GHG draft's shape and its parser, with NO imports (LEAD1 L3, Oct 2026). Moved out of lib/ghg/draft.ts, which
// re-exports both unchanged, because that file reaches lib/drafts.ts, which imports React hooks and the browser
// Supabase client. The free-calculation routes (app/api/ghg/free-calc/*) parse the same draft on the server and
// cannot load either: Next refuses a React hook in a route handler's import graph.

/** The fields a restore carries. All optional: the caller merges over its own defaults. */
export type GhgDraft = {
  company_name?: string
  company_id?: string | null
  reporting_year?: number
  revenue_millions?: number
  employee_count?: number
  boundary_approach?: string
  california_nexus?: boolean
  fiscal_year_end_month?: number
  prior_year_s1?: number
  prior_year_s2?: number
  selected_frameworks?: string[]
  // Typed as unknown[] on purpose: this module does not model a Location, and pretending to would be
  // the drifting second copy the note above rejects. The page spreads these over emptyLocation(), so a
  // location missing a field gets that field's default rather than undefined.
  locations?: unknown[]
}

/**
 * PURE, and exported separately from the storage calls so the parse is testable without a DOM.
 *
 * Returns null for anything that is not a usable draft, which the caller treats as "no draft".
 */
export function parseGhgDraft(u: unknown): GhgDraft | null {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null
  const o = u as Record<string, unknown>

  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  // Number(''), NaN and Infinity are rejected: the form coerces a blank to 0 and 0 is a real figure, so
  // a non-finite number here is corruption rather than emptiness.
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
  // NULL IS A VALUE HERE, NOT AN ABSENCE: company_id is nullable and "no company row yet" is a real
  // state the save path branches on. Collapsing it to undefined would let the merge restore a default.
  const nullableStr = (v: unknown): string | null | undefined =>
    v === null ? null : typeof v === 'string' ? v : undefined

  const draft: GhgDraft = {}
  const assign = <K extends keyof GhgDraft>(k: K, v: GhgDraft[K] | undefined) => {
    if (v !== undefined) draft[k] = v
  }

  assign('company_name', str(o.company_name))
  assign('company_id', nullableStr(o.company_id))
  assign('reporting_year', num(o.reporting_year))
  assign('revenue_millions', num(o.revenue_millions))
  assign('employee_count', num(o.employee_count))
  assign('boundary_approach', str(o.boundary_approach))
  assign('california_nexus', bool(o.california_nexus))
  assign('fiscal_year_end_month', num(o.fiscal_year_end_month))
  assign('prior_year_s1', num(o.prior_year_s1))
  assign('prior_year_s2', num(o.prior_year_s2))

  // Every member must be a string, or the row is dropped whole. A framework list with a number in it
  // would reach a `.includes()` on the wizard and silently fail to match rather than throw.
  if (Array.isArray(o.selected_frameworks) && o.selected_frameworks.every(f => typeof f === 'string')) {
    draft.selected_frameworks = o.selected_frameworks as string[]
  }

  // ⚠️ NON-EMPTY, AND EVERY MEMBER AN OBJECT. The page reads inventory.locations[activeLocation] and
  // indexes into the result on every render, so an empty array or an array of primitives is worse than
  // no draft at all: it would restore a wizard that throws on paint. An empty list is also never
  // something the form produces — it starts with one location and cannot delete the last.
  if (Array.isArray(o.locations) && o.locations.length > 0
      && o.locations.every(l => !!l && typeof l === 'object' && !Array.isArray(l))) {
    draft.locations = o.locations
  }

  // Nothing recognised ⇒ not a draft. Prevents an empty object restoring as "a draft with no fields",
  // which would clear the stash and report success while restoring nothing.
  return Object.keys(draft).length > 0 ? draft : null
}
