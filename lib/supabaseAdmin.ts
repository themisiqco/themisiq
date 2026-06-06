// lib/supabaseAdmin.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-only Supabase client using the SERVICE ROLE key. This bypasses Row-Level
// Security, so it can write rows on behalf of the system (e.g. the Stripe webhook
// granting entitlements after a payment — there's no logged-in user in that flow).
//
// SECURITY: the service-role key is all-powerful. This file must NEVER be imported
// into browser/client code — only from server-side API routes. The key lives only
// in .env.local (git-ignored) and only on the server.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
}
if (!serviceKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local and restart `npm run dev`.',
  )
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
