// lib/forcedLabour/client.ts
// Browser-side calls to /api/forced-labour, the routes for the report overview and every country but Canada.
// The same shape as lib/s211/client.ts s211Api, which Canada's builder keeps using unchanged.
import { supabase } from '../supabase'
import type { ApiResult } from '../s211/client'

export async function flApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  try {
    const res = await fetch(`/api/forced-labour${path}`, {
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

/** The overview's shape (app/api/forced-labour/reports/[id]/route.ts). */
export type Overview = {
  report: { id: string; canadaReportId: string | null; organizationName: string | null }
  countries: { country: string; status: string; sectionStatus: Record<string, string>; applicability: Record<string, unknown> }[]
  shared: { field_key: string; label: string; value: unknown; usedBy: string[] }[]
}

/** One row of the reports list (app/api/forced-labour/reports/route.ts). `id` is the report's (its parent's). */
export type ReportListRow = { id: string; name: string; countries: ('canada' | 'uk' | 'australia')[]; canadaReportingYear: number | null; updated_at: string | null }

/** Fetch a file from /api/forced-labour with the user's token and save it (as lib/s211/client.ts s211Download). */
export async function flDownload(path: string): Promise<{ ok: true; fileName: string; substituted: number } | { ok: false; status: number; error: string; blockers?: { section: string | null; message: string; missing: string[] }[] }> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {}
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  try {
    const res = await fetch(`/api/forced-labour${path}`, { headers })
    if (!res.ok) {
      const json = await res.json().catch(() => null) as { error?: string; blockers?: { section: string | null; message: string; missing: string[] }[] } | null
      return { ok: false, status: res.status, error: json?.error ?? `Request failed (${res.status}).`, blockers: json?.blockers }
    }
    const fileName = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'statement.pdf'
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url; a.download = fileName
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return { ok: true, fileName, substituted: Number(res.headers.get('X-Report-Substituted-Characters') ?? 0) }
  } catch {
    return { ok: false, status: 0, error: 'No connection.' }
  }
}

