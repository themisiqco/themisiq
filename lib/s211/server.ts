// lib/s211/server.ts
// The one gate every S-211 API route passes through before it touches the database. Server-only.
//
// Two checks, in order: a valid session (the browser's bearer token, verified with Supabase), and the
// user id on the S211_PREVIEW_USER_IDS allow-list. Failing EITHER returns the same 404, with the same
// body, so a caller cannot tell "not signed in" from "not on the list" from "no such route".
//
// The Supabase client returned acts AS the user, so RLS on s211_reports and s211_report_sections still
// decides which rows they can see. The allow-list is a second fence, not a replacement for RLS.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthedClient, bearerFrom } from '../supabaseAuthed'
import { isPreviewUser, S211_PREVIEW_ENV } from './access'

export const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function requireS211(req: Request):
  Promise<{ ok: true; supabase: SupabaseClient; userId: string } | { ok: false; response: NextResponse }> {
  let authed
  try {
    authed = await getAuthedClient(bearerFrom(req))
  } catch {
    return { ok: false, response: notFound() }
  }
  if (!isPreviewUser(authed.userId, process.env[S211_PREVIEW_ENV])) return { ok: false, response: notFound() }
  return { ok: true, supabase: authed.supabase, userId: authed.userId }
}

/** Largest section body accepted, in characters of JSON. Far above any real section. */
export const MAX_CONTENT_CHARS = 200_000
