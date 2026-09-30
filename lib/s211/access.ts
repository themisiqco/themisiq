// lib/s211/access.ts
// Who may use the S-211 report builder: whoever public.s211_has_access() says, asked AS THE USER through
// their own Supabase client. The function reads public.s211_access, the one list of who is allowed in
// (supabase/migrations/20260930_s211_access_gate.sql); the same function sits in every policy on
// s211_reports and s211_report_sections, so the API gate and RLS cannot disagree.
//
// SERVER-SIDE ONLY. The only caller is lib/s211/server.ts, which every S-211 API route calls before it
// touches the database. Anyone refused gets a 404 from the API, and the pages show the 404 page. Not a
// paywall: the module is not for sale yet, and a paywall would advertise it. The paywall stage replaces
// the function's body with an entitlement check; nothing here changes.
//
// FAILS CLOSED. Only a reply of exactly `true` lets a user in. An error, a thrown call, null, or any
// other value is a refusal, so a broken or missing function closes the builder; it never opens it.

import type { SupabaseClient } from '@supabase/supabase-js'

export const S211_ACCESS_FUNCTION = 's211_has_access'

/** True only when the database answers exactly `true` for the user this client acts as. */
export async function hasS211Access(supabase: Pick<SupabaseClient, 'rpc'>): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc(S211_ACCESS_FUNCTION)
    return !error && data === true
  } catch {
    return false
  }
}
