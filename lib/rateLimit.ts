// lib/rateLimit.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Supabase-table-backed fixed-window rate limiter for public endpoints.
//
// Why a table (not in-memory): on Vercel each request may hit a different serverless
// instance, so an in-process counter wouldn't be shared and would be trivially bypassed.
// The `rate_limits` table (migration 20260702_rate_limits.sql) is the single shared store
// this stack has (no Redis/KV in deps). Writes go through the service-role admin client.
//
// FAILS OPEN: if the store errors, we ALLOW the request (a DB hiccup must not block a
// legitimate submission) — the fault is logged. Input validation still applies regardless.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from './supabaseAdmin'

export interface RateLimitCheck {
  bucket: string           // logical endpoint key, e.g. 'order-quote-request'
  ip: string | null
  email?: string | null
  ipLimit: number          // max hits per window per IP
  emailLimit: number       // max hits per window per email
  windowMs: number
}

export interface RateLimitResult {
  ok: boolean
  retryAfterSec: number
}

// Count recent hits per ip and per email in the window; deny if either is at/over its limit,
// otherwise record one row and allow. Fixed-window — simple and robust for this purpose.
export async function checkAndRecordRateLimit(c: RateLimitCheck): Promise<RateLimitResult> {
  const retryAfterSec = Math.ceil(c.windowMs / 1000)
  try {
    const admin = getSupabaseAdmin()
    const sinceISO = new Date(Date.now() - c.windowMs).toISOString()

    if (c.ip) {
      const { count, error } = await admin
        .from('rate_limits')
        .select('id', { count: 'exact', head: true })
        .eq('bucket', c.bucket)
        .eq('ip', c.ip)
        .gte('created_at', sinceISO)
      if (error) throw error
      if ((count ?? 0) >= c.ipLimit) return { ok: false, retryAfterSec }
    }

    if (c.email) {
      const { count, error } = await admin
        .from('rate_limits')
        .select('id', { count: 'exact', head: true })
        .eq('bucket', c.bucket)
        .eq('email', c.email)
        .gte('created_at', sinceISO)
      if (error) throw error
      if ((count ?? 0) >= c.emailLimit) return { ok: false, retryAfterSec }
    }

    const { error: insErr } = await admin
      .from('rate_limits')
      .insert({ bucket: c.bucket, ip: c.ip, email: c.email ?? null })
    if (insErr) throw insErr

    return { ok: true, retryAfterSec }
  } catch (err) {
    // Fail OPEN — never let a limiter/store fault block a legitimate request. Logged.
    console.error('[rateLimit] check failed (failing open):', err)
    return { ok: true, retryAfterSec }
  }
}

// Best-effort client IP from proxy headers (Vercel/most proxies set x-forwarded-for).
export function ipFromHeaders(req: { headers: { get(name: string): string | null } }): string | null {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim() || null
  return req.headers.get('x-real-ip')
}
