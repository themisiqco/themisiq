import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../lib/supabaseAuthed'

export async function POST(req: NextRequest) {
  try {
    const { supabase, userId } = await getAuthedClient(bearerFrom(req))
    const body = await req.json()
    const { name, description, reporting_year, deadline, questionnaire_template } = body
    if (!name) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('supplier_campaigns')
      .insert({ buyer_id: userId, name, description: description || null, reporting_year, deadline: deadline || null, status: 'active', questionnaire_template: questionnaire_template || 'ecovadis'  })
      .select().single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data })
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Unexpected error creating campaign' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, userId } = await getAuthedClient(bearerFrom(req))
    const { data, error } = await supabase
      .from('supplier_campaigns')
      .select('*')
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data })
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Unexpected error loading campaigns' }, { status: 500 })
  }
}