// lib/s211/server.ts
// The one gate every S-211 API route passes through before it touches the database. Server-only.
//
// Two checks, in order: a valid session (the browser's bearer token, verified with Supabase), then what
// that user may do (lib/s211/access.ts). Each route asks for what it needs: 'read' to list, open or
// export; 'write' to create, change or delete. A refusal never reaches a table.
//
//   no or invalid session   401 { state: 'signed-out' }
//   access not checkable    503 { state: 'unknown' }
//   needs read, has none    403 { state: 'preview' }
//   needs write, read only  403 { state: 'read-only' }
//
// These were all a 404 while the builder was unannounced. The module is public now, so the page tells a
// signed-out visitor to sign in and a signed-in one what their access allows, instead of pretending the
// route does not exist.
//
// The Supabase client returned acts AS the user, so RLS on s211_reports and s211_report_sections still
// decides which rows they can see and change, through the same two functions.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthedClient, bearerFrom } from '../supabaseAuthed'
import { s211Access, type S211AccessState } from './access'
import { SIGNED_OUT_MESSAGE, UNKNOWN_MESSAGE, PREVIEW_MESSAGE, READ_ONLY_MESSAGE } from './builderAccess'

export const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })


const refuse = (status: number, state: string, error: string) => ({ ok: false as const, response: NextResponse.json({ error, state }, { status }) })

export async function requireS211(req: Request, need: 'read' | 'write' | 'any' = 'read'):
  Promise<{ ok: true; supabase: SupabaseClient; userId: string; state: S211AccessState } | { ok: false; response: NextResponse }> {
  let authed
  try {
    authed = await getAuthedClient(bearerFrom(req))
  } catch {
    return refuse(401, 'signed-out', SIGNED_OUT_MESSAGE)
  }
  const access = await s211Access(authed.supabase)
  if (access.state === 'unknown') return refuse(503, 'unknown', UNKNOWN_MESSAGE)
  if (need === 'read' && !access.read) return refuse(403, access.state, PREVIEW_MESSAGE)
  if (need === 'write' && !access.write) return refuse(403, access.state, access.read ? READ_ONLY_MESSAGE : PREVIEW_MESSAGE)
  return { ok: true, supabase: authed.supabase, userId: authed.userId, state: access.state }
}

/** Largest section body accepted, in characters of JSON. Far above any real section. */
export const MAX_CONTENT_CHARS = 200_000
