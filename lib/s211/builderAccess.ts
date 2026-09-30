// lib/s211/builderAccess.ts
// The four states of the Forced Labour Reporting builder, as the pages show them, and the words for each.
// Pure, and safe in the browser: the API gate (lib/s211/server.ts) imports the messages from here, so a
// page and a refused request say the same thing.
//
//   signed-out  every builder page asks the visitor to sign in
//   preview     signed in, never bought: the module explained, every section readable, fields disabled,
//               nothing stored, no report can be created
//   read-only   the term has run out: their own reports open and read, a finished report exports, nothing
//               is created, changed or deleted
//   full        an active term or a row in s211_access: create, edit, export
//
// ⚠️ THE STATE COMES FROM THE DATABASE, NOT FROM useEntitlementAccess. The page asks /api/s211/access,
// which asks public.s211_can_read() and s211_can_write(): the same functions RLS enforces. The client hook
// reads only the entitlements table, so it cannot see a row in s211_access, and a preview-list user would
// be shown the paywall. Two sources for one decision is how a paying customer gets the wrong screen.

import { FLAT_MODULE_PRICES } from '../pricing'

export type BuilderState = 'loading' | 'signed-out' | 'preview' | 'read-only' | 'full' | 'unknown' | 'unreachable'

export const MODULE_NAME = 'Forced Labour Reporting'
export const BUILDER_ROOT = '/dashboard/forced-labour'
/** The read-only walkthrough of the sections, for an account that has not bought the module. */
export const PREVIEW_ID = 'preview'
export const ORDER_HREF = '/order?modules=forced-labour'
export const ORDER_LABEL = `Order the module, $${FLAT_MODULE_PRICES['forced-labour'].toLocaleString('en-US')}/yr`
export const RENEW_LABEL = 'Renew the module'
export const signInHref = (path: string) => `/login?next=${encodeURIComponent(path)}`

export const SIGNED_OUT_MESSAGE = 'Sign in to use Forced Labour Reporting.'
export const UNKNOWN_MESSAGE = 'Your access to Forced Labour Reporting could not be checked. Reload the page to try again.'
export const PREVIEW_MESSAGE = 'Forced Labour Reporting is not part of your plan yet. Order the module to create a report.'
export const READ_ONLY_MESSAGE = 'Your Forced Labour Reporting access has expired. Renew to create or change a report. Your existing reports are still here and still readable.'
export const PREVIEW_SECTION_MESSAGE = 'This is a preview. You can read every section, the Act’s words and the guidance. Order the module to answer the questions, save a report and download it as a PDF.'
export const READ_ONLY_EXPORT_NOTE = 'You can still download the PDF of any report that is ready to export.'

/** What a page may offer in each state. The database refuses anything else regardless. */
export const canRead = (s: BuilderState) => s === 'full' || s === 'read-only'
export const canWrite = (s: BuilderState) => s === 'full'

/** The state for an /api/s211/access reply. Anything unrecognized fails closed, as `unknown`. */
export function stateFromAccessReply(status: number, body: { state?: unknown } | null): BuilderState {
  if (status === 0) return 'unreachable'
  if (status === 401) return 'signed-out'
  const s = body?.state
  if (status === 200 && (s === 'full' || s === 'read-only' || s === 'preview')) return s
  if (status === 403 && (s === 'read-only' || s === 'preview')) return s
  return 'unknown'
}
