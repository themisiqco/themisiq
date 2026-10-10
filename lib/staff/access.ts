import 'server-only'
// lib/staff/access.ts
//
// BR3: WHO ON THE THEMISIQ TEAM MAY LOOK AT A CUSTOMER'S BILLS, AND THE RECORD OF EVERY LOOK. Server only: the
// 'server-only' import above makes the build fail if a client component imports this file, and
// lib/staff/serverOnly.test.ts proves no client component reaches it.
//
//   requireStaffRole   verifies the session (getAuthedClient: the token is checked by auth.getUser, never trusted),
//                      then reads public.staff_roles with the service-role client: the exact role, not revoked.
//                      401 with no valid session, 403 without the role (the same words whether it was never granted
//                      or revoked), 503 if the read fails (fails closed).
//   logStaffAccess     writes one row to public.staff_access_log. A failed write throws: the request fails.
//   signStaffDocument  THE ONLY WAY A STAFF ROUTE SERVES A DOCUMENT. It writes the log row first and signs only after
//                      that write succeeded; the URL lives 5 minutes (Q6, ruled 10 Oct 2026).
//
// No route uses these yet. BR8 builds the specialist queue on them, with a test that every staff route does.
// The tables: supabase/migrations/20261012_staff_roles_and_access_log.sql. Adding a person is an insert into
// staff_roles, no code change.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthedClient, AuthError } from '../supabaseAuthed'
import { createServerClient } from '../supabase'

export type StaffRole = 'bill_reader' | 'bill_review_lead'
export type StaffAction = 'view_queue' | 'view_document' | 'save_reading' | 'view_ai_reading' | 'record_spot_check' | 'view_access_log'

export const STAFF_ONLY = 'This page is for ThemisIQ staff with access to Bill Review.'
/** Q6 (10 Oct 2026): a staff signed URL lives 5 minutes. */
export const STAFF_SIGNED_URL_TTL_SECONDS = 300
const BUCKET = 'source-documents'

export type Staff = { userId: string; role: StaffRole; admin: SupabaseClient }
export type StaffRefusal = { ok: false; status: 401 | 403 | 503; body: { error: string; message: string } }

export async function requireStaffRole(accessToken: string | null | undefined, role: StaffRole): Promise<({ ok: true } & Staff) | StaffRefusal> {
  let userId: string
  try {
    ;({ userId } = await getAuthedClient(accessToken))
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, status: 401, body: { error: 'unauthenticated', message: 'Sign in to continue.' } }
    throw e
  }
  const admin = createServerClient()
  const { data, error } = await admin
    .from('staff_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role', role)
    .is('revoked_at', null)
    .limit(1)
  if (error) {
    console.error('[staff] role read failed (denying)', { role })
    return { ok: false, status: 503, body: { error: 'staff_check_failed', message: 'We couldn’t confirm your access just now. Please try again in a moment.' } }
  }
  if (!data || data.length === 0) return { ok: false, status: 403, body: { error: 'staff_only', message: STAFF_ONLY } }
  return { ok: true, userId, role, admin }
}

export class StaffLogError extends Error {
  readonly name = 'StaffLogError'
}

/** One row in the staff access log. Throws StaffLogError if it was not written; the caller's request then fails. */
export async function logStaffAccess(staff: Staff, entry: { action: StaffAction; documentRef?: string | null; inventoryId?: string | null }): Promise<void> {
  const { error } = await staff.admin.from('staff_access_log').insert({
    staff_user_id: staff.userId,
    role: staff.role,
    action: entry.action,
    document_ref: entry.documentRef ?? null,
    inventory_id: entry.inventoryId ?? null,
  })
  if (error) {
    // Metadata only: never the document.
    console.error('[staff] access log write failed', { action: entry.action, inventoryId: entry.inventoryId ?? null })
    throw new StaffLogError('The access log could not be written, so nothing was served.')
  }
}

/** Serve one document to a member of staff: log the view, then sign a 5-minute URL. Never the other way round. */
export async function signStaffDocument(staff: Staff, doc: { path: string; inventoryId: string }): Promise<string> {
  await logStaffAccess(staff, { action: 'view_document', documentRef: doc.path, inventoryId: doc.inventoryId })
  const { data, error } = await staff.admin.storage.from(BUCKET).createSignedUrl(doc.path, STAFF_SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) throw new Error('The document could not be signed.')
  return data.signedUrl
}
