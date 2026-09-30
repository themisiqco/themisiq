// app/api/s211/access/route.ts
// GET: what this user may do in Forced Labour Reporting. 200 { state: 'full' | 'read-only' | 'preview' }
// for a signed-in user; 401 signed out; 503 when access could not be checked. Every builder page asks
// this first and renders the matching state. See lib/s211/server.ts and lib/s211/access.ts.
import { NextResponse } from 'next/server'
import { requireS211 } from '../../../../lib/s211/server'

export async function GET(req: Request) {
  const gate = await requireS211(req, 'any')
  if (!gate.ok) return gate.response
  return NextResponse.json({ state: gate.state })
}
