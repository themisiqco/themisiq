// lib/deals/draft.ts
//
// ── PRESERVING A WIZARD'S WORTH OF TYPING ACROSS THE LOGIN BOUNCE ────────────────────────────────
//
// A signed-out visitor can fill in the whole deal form and is then asked to sign in to see the
// results. Sending them to /login and back with an empty form would make the ask worse than the
// wall it replaced: they would have done the work twice to reach the thing they were already
// looking at. So the draft rides through.
//
// SAME PATTERN AS lib/checkout.ts, deliberately, down to the key prefix and the swallowed
// exceptions: sessionStorage.setItem before redirecting to /login?next=…, read-and-remove on the way
// back. That file is the precedent for "preserve an intent across auth" in this repo and a second
// shape for the same job is how two flows come to lose data differently.
//
// ⚠️ NOT localStorage, AND NOT A URL PARAMETER.
//   · sessionStorage dies with the tab, which is the right lifetime for an unsaved draft — a deal
//     someone abandoned should not reappear a week later in a form they opened for another target.
//   · A URL parameter would put the target's name, revenue, headcount and balance-sheet total into
//     the browser history, the referer header and any proxy log between here and the auth provider.
//     checkout.ts can afford its `intent=` fallback because a module list is not confidential; this
//     payload is a buyer's financial view of an acquisition target, and it stays in the tab.
//     THAT IS THE ONE DELIBERATE DIVERGENCE FROM checkout.ts — there is no URL fallback here, so a
//     browser with sessionStorage disabled loses the draft and the form comes back blank. Losing a
//     draft is recoverable; leaking a target's figures into a log is not.

/** The wizard's own form shape, all optional — see the merge note on parseDealDraft. */
export type DealDraft = {
  target_name?: string
  sector?: string
  revenue?: number
  employee_count?: number | null
  total_assets?: number | null
  jurisdiction?: string
  deal_type?: string
  deal_value?: number
  location_count?: number
  currency?: string
  has_ghg_data?: boolean
  has_esg_report?: boolean
  notes?: string
}

export const DEAL_DRAFT_KEY = 'themisiq:pendingDeal'

// ⚠️ A DRAFT IS UNTRUSTED INPUT EVEN THOUGH THIS TAB WROTE IT. It survives a full page load, so what
// comes back is whatever is under that key now — a payload from an older deploy with fields this
// build no longer has, a half-written value, or something else entirely. A wizard that spreads it
// blindly adopts all of it.
//
// PURE, AND EXPORTED SEPARATELY FROM THE STORAGE CALLS, so the parse is testable without a DOM. It
// returns a PARTIAL and the caller merges it over the wizard's own defaults — never the reverse.
// Merging the other way would let a missing key blank a field the form had already defaulted, and an
// unknown key ride into React state and then into the save payload.
export function parseDealDraft(raw: string | null | undefined): DealDraft | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>

  // Field by field, by type. An allow-list rather than a strip-list: a key this build does not know
  // about is DROPPED, which is the safe direction — the alternative is carrying an unknown column
  // into handleSave's row payload and having Postgres refuse the whole save.
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  // Number(''), NaN and Infinity are all rejected: the form coerces a blank to 0 and 0 is a real
  // value, so a non-finite number here is corruption rather than emptiness.
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  // NULL IS A VALUE ON THESE TWO, NOT AN ABSENCE. employee_count and total_assets sit in nullable
  // columns precisely so undeclared stays distinct from a declared zero; collapsing a stored null to
  // undefined here would let the merge restore the wizard's default instead of the null the user
  // left, and a holding company with 0 employees would come back as "not known".
  const nullableNum = (v: unknown): number | null | undefined =>
    v === null ? null : typeof v === 'number' && Number.isFinite(v) ? v : undefined
  const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)

  const draft: DealDraft = {}
  const assign = <K extends keyof DealDraft>(k: K, v: DealDraft[K] | undefined) => {
    if (v !== undefined) draft[k] = v
  }
  assign('target_name', str(o.target_name))
  assign('sector', str(o.sector))
  assign('revenue', num(o.revenue))
  assign('employee_count', nullableNum(o.employee_count))
  assign('total_assets', nullableNum(o.total_assets))
  assign('jurisdiction', str(o.jurisdiction))
  assign('deal_type', str(o.deal_type))
  assign('deal_value', num(o.deal_value))
  assign('location_count', num(o.location_count))
  assign('currency', str(o.currency))
  assign('has_ghg_data', bool(o.has_ghg_data))
  assign('has_esg_report', bool(o.has_esg_report))
  assign('notes', str(o.notes))

  // AN EMPTY OBJECT IS NOT A DRAFT. Every field failed its type check, or there were none — either
  // way there is nothing to restore, and returning {} would have the caller announce that it
  // recovered work it did not recover.
  return Object.keys(draft).length > 0 ? draft : null
}

/** Store the draft before bouncing to /login. Swallows a disabled sessionStorage, as checkout.ts does. */
export function saveDealDraft(draft: DealDraft): void {
  try {
    sessionStorage.setItem(DEAL_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    /* sessionStorage unavailable — the form comes back blank. See the header. */
  }
}

// READ AND REMOVE IN ONE CALL, so there is no path that restores a draft and leaves it behind. A
// draft that survives its own restore reappears over the next deal the user starts in that tab,
// which is the same class of defect as the wizard's old auto-load of a random inventory.
export function takeDealDraft(): DealDraft | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(DEAL_DRAFT_KEY)
    if (raw !== null) sessionStorage.removeItem(DEAL_DRAFT_KEY)
  } catch {
    return null
  }
  return parseDealDraft(raw)
}
