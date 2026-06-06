// lib/supabaseAdmin.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-only Supabase client using the SERVICE ROLE key. Bypasses Row-Level
// Security, so it can write rows on behalf of the system (e.g. the Stripe webhook
// granting entitlements after a payment — no logged-in user in that flow).
//
// SECURITY: the service-role key is all-powerful. NEVER import into browser code.
// Created LAZILY (on first use) and cached, so a build that merely loads this file
// won't fail when the key is absent in that environment.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _admin: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
  }
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (or your host env vars) and restart.',
    )
  }

  _admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _admin
}
