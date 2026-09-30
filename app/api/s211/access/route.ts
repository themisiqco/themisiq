// app/api/s211/access/route.ts
// GET: 200 { allowed: true } for a signed-in user public.s211_has_access() lets in; 404 for anyone else.
// The builder's pages call this before rendering anything. See lib/s211/server.ts.
import { NextResponse } from 'next/server'
import { requireS211 } from '../../../../lib/s211/server'

export async function GET(req: Request) {
  const gate = await requireS211(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({ allowed: true })
}
