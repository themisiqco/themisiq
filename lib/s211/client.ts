// lib/s211/client.ts
// Browser-side calls to the S-211 API. Every call carries the user's access token; the server decides
// access (lib/s211/server.ts). A 404 from any call means "not available to this account".
import { supabase } from '../supabase'

/** `state` is the access state a refused call names (lib/s211/server.ts), or null. */
export type ApiResult<T> = { status: number; data: T | null; error: string | null; state: string | null }

export async function s211Api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  try {
    const res = await fetch(`/api/s211${path}`, {
      method: init.method ?? 'GET', headers, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    })
    const json = await res.json().catch(() => null) as (T & { error?: string; state?: string }) | null
    return {
      status: res.status, data: res.ok ? json : null, error: res.ok ? null : (json?.error ?? `Request failed (${res.status}).`),
      state: typeof json?.state === 'string' ? json.state : null,
    }
  } catch {
    return { status: 0, data: null, error: 'No connection.', state: null }
  }
}

export type DownloadBlocker = { section: string | null; message: string; missing: string[] }
export type DownloadResult =
  | { ok: true; fileName: string; substituted: number }
  | { ok: false; status: number; error: string; blockers?: DownloadBlocker[] }

/**
 * Fetch a file from the S-211 API with the user's token and save it through a temporary link. Not
 * window.open: a download needs the Authorization header, which a navigation cannot carry.
 */
export async function s211Download(path: string): Promise<DownloadResult> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {}
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  try {
    const res = await fetch(`/api/s211${path}`, { headers })
    if (!res.ok) {
      const json = await res.json().catch(() => null) as { error?: string; blockers?: DownloadBlocker[] } | null
      return { ok: false, status: res.status, error: json?.error ?? `Request failed (${res.status}).`, blockers: json?.blockers }
    }
    const fileName = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'report.pdf'
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return { ok: true, fileName, substituted: Number(res.headers.get('X-Report-Substituted-Characters') ?? 0) }
  } catch {
    return { ok: false, status: 0, error: 'No connection.' }
  }
}
