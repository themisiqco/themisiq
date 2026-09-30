// lib/s211/client.ts
// Browser-side calls to the S-211 API. Every call carries the user's access token; the server decides
// access (lib/s211/server.ts). A 404 from any call means "not available to this account".
import { supabase } from '../supabase'

export type ApiResult<T> = { status: number; data: T | null; error: string | null }

export async function s211Api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  try {
    const res = await fetch(`/api/s211${path}`, {
      method: init.method ?? 'GET', headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    })
    const json = await res.json().catch(() => null) as (T & { error?: string }) | null
    return { status: res.status, data: res.ok ? json : null, error: res.ok ? null : (json?.error ?? `Request failed (${res.status}).`) }
  } catch {
    return { status: 0, data: null, error: 'No connection.' }
  }
}
