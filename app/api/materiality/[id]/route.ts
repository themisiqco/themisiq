// app/api/materiality/[id]/route.ts
// ThemisIQ — Fetch a single materiality assessment by ID.
//
// Auth pattern mirrors the POST route: bearer token from Authorization header,
// auth-aware Supabase client so RLS enforces that only the owning user can read.
// No service-role key in this path.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Missing assessment id' }, { status: 400 })
    }

    const token = bearerFrom(req)
    const { supabase } = await getAuthedClient(token)

    const { data, error } = await supabase
      .from('materiality_assessments')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      // RLS will return "no rows" rather than a permission error for someone
      // else's assessment, which we surface as 404 to avoid leaking existence.
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    return NextResponse.json({ assessment: data })

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Materiality GET error:', error)
    return NextResponse.json({ error: 'Failed to load assessment' }, { status: 500 })
  }
}
