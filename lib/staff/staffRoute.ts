import 'server-only'
// lib/staff/staffRoute.ts
//
// BR8: EVERY STAFF ROUTE GOES THROUGH THIS. It verifies the session and the role (requireStaffRole: 401, 403 with the
// one sentence, 503 when the role cannot be read), then runs the handler. A failed access-log write (StaffLogError)
// fails the request with 503 and nothing served or saved. Any other fault is logged with metadata only.

import { NextRequest, NextResponse } from 'next/server'
import { bearerFrom } from '../supabaseAuthed'
import { requireStaffRole, StaffLogError, type Staff, type StaffRole } from './access'

type Result = { ok: true; [k: string]: unknown } | { ok: false; status: number; error: string }

export function staffRoute(role: StaffRole, handler: (staff: Staff, req: NextRequest) => Promise<Result>) {
  return async (req: NextRequest) => {
    try {
      const gate = await requireStaffRole(bearerFrom(req), role)
      if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })
      const r = await handler(gate, req)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
      return NextResponse.json(r)
    } catch (e) {
      if (e instanceof StaffLogError) return NextResponse.json({ error: e.message }, { status: 503 })
      console.error('[staff route] failed', { path: req.nextUrl?.pathname ?? null })
      return NextResponse.json({ error: 'Something went wrong; nothing was changed.' }, { status: 500 })
    }
  }
}

/** The request's JSON body, or {} when there is none or it cannot be read. */
export const bodyOf = async (req: NextRequest): Promise<Record<string, unknown>> => {
  try { const b = await req.json(); return b && typeof b === 'object' ? b : {} } catch { return {} }
}
