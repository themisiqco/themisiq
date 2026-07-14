// app/api/materiality/reference/route.ts
// ThemisIQ — public reference data for the climate-risk / materiality wizard.
//
// The wizard is a CLIENT component; it cannot read the mr_* tables directly under RLS the way the
// server-side scoring routes do. This GET route hands it the lists it needs to build its dropdowns
// from the DB — so the geography (and other option lists) live in ONE place (the database), not
// hardcoded in the component where they silently drift from the model.
//
// All four tables are PUBLIC reference data (anon SELECT already granted), so this needs no auth —
// an anon client is sufficient and keeps it callable before the client's session is fully hydrated.
//
// Route Handlers are not cached by default (Next 16), so each request reflects the current DB.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET() {
  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const [regionsRes, industriesRes, jurisdictionsRes, scenariosRes] = await Promise.all([
      supabase.from('mr_regions')
        .select('code, label, continent, sort_order')
        .eq('active', true)
        .order('sort_order'),
      supabase.from('mr_industries').select('code, label, carbon_exposure').order('label'),
      supabase.from('mr_jurisdictions').select('code, label, policy_intensity').order('label'),
      supabase.from('mr_scenarios').select('code, label, framework, descriptor, physical_mult, transition_mult'),
    ])

    const firstErr = [regionsRes, industriesRes, jurisdictionsRes, scenariosRes].find(r => r.error)
    if (firstErr?.error) {
      console.error('Materiality reference-route fetch error:', firstErr.error)
      return NextResponse.json({ error: 'Failed to load reference data' }, { status: 500 })
    }

    return NextResponse.json({
      regions: regionsRes.data ?? [],
      industries: industriesRes.data ?? [],
      jurisdictions: jurisdictionsRes.data ?? [],
      scenarios: scenariosRes.data ?? [],
    })
  } catch (error) {
    console.error('Materiality reference route error:', error)
    return NextResponse.json({ error: 'Failed to load reference data' }, { status: 500 })
  }
}
