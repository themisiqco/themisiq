// lib/s211/access.ts
// What a signed-in user may do in Forced Labour Reporting, asked AS THE USER through their own Supabase
// client: public.s211_can_read() and public.s211_can_write()
// (supabase/migrations/20260930_s211_read_write_split.sql). The same two functions sit in the policies on
// s211_reports and s211_report_sections, so the API gate and RLS cannot disagree.
//
//   full       can write (an active 'forced-labour' term, or a row in s211_access): create, edit, export
//   read-only  can read but not write (a term that has run out): open, read, export a finished report
//   preview    neither (never bought): the module explained, the sections readable, nothing stored
//
// FAILS CLOSED, AND SAYS SO. Only an exact `true` grants anything. An error or a thrown call is reported
// as `unknown`, never read as "no access": the page then says access could not be checked rather than
// showing a paying customer the paywall.

import type { SupabaseClient } from '@supabase/supabase-js'

export const S211_READ_FUNCTION = 's211_can_read'
export const S211_WRITE_FUNCTION = 's211_can_write'

export type S211AccessState = 'full' | 'read-only' | 'preview'
export type S211Access = { read: boolean; write: boolean; state: S211AccessState } | { state: 'unknown' }

async function ask(supabase: Pick<SupabaseClient, 'rpc'>, fn: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase.rpc(fn)
    if (error) return null
    return data === true
  } catch {
    return null
  }
}

export async function s211Access(supabase: Pick<SupabaseClient, 'rpc'>): Promise<S211Access> {
  const [read, write] = await Promise.all([ask(supabase, S211_READ_FUNCTION), ask(supabase, S211_WRITE_FUNCTION)])
  if (read === null || write === null) return { state: 'unknown' }
  // Write without read cannot happen from the two functions as written; if it ever did, it is not full access.
  const state: S211AccessState = write && read ? 'full' : read ? 'read-only' : 'preview'
  return { read, write: write && read, state }
}
