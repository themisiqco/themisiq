// lib/supabaseAuthed.ts
// Targeted auth-aware Supabase client for user-scoped API routes.
//
// Sits ALONGSIDE lib/supabase.ts (which is untouched). Use this only in API routes
// that read/write a logged-in user's own customer data, where we want Postgres RLS
// to enforce isolation rather than relying on the service-role key + manual filtering.
//
// The browser passes the user's access token (from supabase.auth.getSession()) in the
// Authorization header. We build a per-request client that acts AS that user, so RLS
// policies (e.g. user_id = auth.uid()) apply at the database level.
//
// NOTE: this is the "targeted middle option". A full @supabase/ssr cookie migration
// would be the platform-wide upgrade; this gets RLS enforcement for this module
// without touching the existing auth flow.

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Build a Supabase client authenticated as the user identified by `accessToken`.
 * Returns the client plus the verified user; throws if the token is missing/invalid.
 */
export async function getAuthedClient(accessToken: string | undefined | null): Promise<{
  supabase: SupabaseClient
  userId: string
  email: string | undefined
}> {
  if (!accessToken) {
    throw new AuthError('Missing access token')
  }

  // Client carries the user's bearer token on every request -> RLS sees auth.uid().
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Verify the token is real and resolve the user (do not trust a client-sent id).
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data?.user) {
    throw new AuthError('Invalid or expired session')
  }

  return { supabase, userId: data.user.id, email: data.user.email }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/** Extract a bearer token from a request's Authorization header. */
export function bearerFrom(req: Request): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}
