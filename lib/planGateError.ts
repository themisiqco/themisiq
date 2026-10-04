// lib/planGateError.ts
//
// THE PLAN GATES' REFUSALS, SHOWN AS WRITTEN (LEAD1 L1, Oct 2026). The database refuses a write that needs an active
// GHG plan with a SQLSTATE the app can recognise and a message written for the customer:
//   PT410  the account had a GHG plan and it has expired   ("Your GHG access has expired. Renew to save …")
//   PT402  the account never had one, or the write needs a plan ("Saving a GHG inventory requires the GHG module. …",
//          "Uploading documents needs an active GHG plan.", "Science-based targets are part of the GHG plan. Nothing
//          was saved, and your figures are still on screen. Choose a plan to save them.")
// Raised by enforce_ghg_location_allowance() (M2), enforce_scope3_entitlement() and enforce_sbti_entitlement() (M3);
// see docs/review/patches/L1-M2-*.sql and L1-M3-*.sql.
//
// Those messages are shown verbatim and alone, without the "Save failed:" prefix the other refusals keep: they already
// say what happened and what to do, so the customer reads one set of sentences, not two. Every other error is unchanged. The Scope 3 page does not use this: it never shows a raw
// database message, and maps the two codes in lib/scope3/saveError.ts instead.

export const PLAN_GATE_CODES: readonly string[] = ['PT402', 'PT410']

type DbError = { code?: string | null; message?: string | null } | null | undefined

/** The customer-facing message for a plan-gate refusal, or null for any other error. */
export function planGateMessage(error: DbError): string | null {
  const code = (error?.code ?? '').trim()
  if (!PLAN_GATE_CODES.includes(code)) return null
  const message = (error?.message ?? '').trim()
  return message || null
}

/** What a refused save says in an alert: the plan gate's own message, or "Save failed: …" as before. */
export function saveFailedText(error: DbError): string {
  return planGateMessage(error) ?? `Save failed: ${error?.message ?? ''}`
}
