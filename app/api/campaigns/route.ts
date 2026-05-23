import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const { name, description, reporting_year, deadline, buyer_id, questionnaire_template } = body
  if (!name || !buyer_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('supplier_campaigns')
    .insert({ buyer_id, name, description: description || null, reporting_year, deadline: deadline || null, status: 'active', questionnaire_template: questionnaire_template || 'ecovadis'  })
    .select().single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const buyer_id = url.searchParams.get('buyer_id')
  if (!buyer_id) {
    return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('supplier_campaigns')
    .select('*')
    .eq('buyer_id', buyer_id)
    .order('created_at', { ascending: false })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}